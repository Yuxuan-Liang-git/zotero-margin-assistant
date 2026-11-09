(function (root) {
  'use strict';
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const MAX_PDF_BYTES = 64 * 1024 * 1024;
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
  const cancelled = () => new Error('文献索引操作已取消或过期');

  class Manager {
    constructor(adapter) {
      this.adapter = adapter;
      this.index = adapter.index;
      this.jobs = new Map();
      this.epoch = 0;
      this.scanNeeded = true;
      this.force = false;
      this.paused = false;
      this.stopped = false;
      this.work = null;
      this.loading = null;
      this.active = null;
      this.timer = null;
      this.priority = new Set();
      this.coverage = { total: 0, metadata: 0, counts: {} };
      this.phase = 'idle';
      this.error = '';
    }

    status() {
      return { ...this.coverage, phase: this.stopped ? 'stopped' : this.paused || this.adapter.userPaused?.() ? 'paused' : this.phase,
        pending: this.jobs.size + (this.active?.unit ? 1 : 0), error: this.error };
    }

    async notify() {
      this.coverage = await this.index.status();
      this.adapter.notify?.();
    }

    ensure() {
      if (!this.loading) this.loading = this.index.open().then(() => this.notify());
      return this.loading;
    }

    async start() {
      if (this.stopped) return;
      await this.ensure();
      this.schedule();
    }

    schedule() {
      if (this.stopped) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; void this.run().catch(error => this.adapter.report?.(error)); }, this.adapter.delay ?? 1800);
    }

    refresh(force = false) {
      this.scanNeeded = true;
      this.force ||= force;
      this.epoch++;
      this.active?.controller.abort();
      this.schedule();
    }

    prioritize(sourceKey) {
      if (sourceKey) this.priority.add(sourceKey);
      this.schedule();
    }

    runnable() {
      return !this.stopped && !this.paused && !this.adapter.userPaused?.() && this.adapter.enabled() && !this.adapter.foreground();
    }

    async scan(controller, valid) {
      this.scanNeeded = false;
      this.phase = 'scanning';
      const force = this.force;
      const keys = new Set();
      let processed = 0;
      for await (const record of this.adapter.discover(controller.signal)) {
        if (!valid()) throw cancelled();
        const { paper, units } = record;
        if (paper.libraryID !== this.adapter.libraryID || keys.has(paper.key)) continue;
        keys.add(paper.key);
        await this.index.replacePaper(paper, valid);
        const previous = new Map((await this.index.units(paper.key)).map(unit => [unit.key, unit]));
        for (const unit of units) {
          if (!valid()) throw cancelled();
          const old = previous.get(unit.key);
          if (!force && old?.fingerprint === unit.fingerprint && old.generation && old.status !== 'processing') continue;
          if (unit.kind === 'pdf') {
            if (['missing', 'failed'].includes(unit.status)) await this.mark(unit, unit.status, valid, unit.reason);
            else this.jobs.set(unit.key, { unit, stage: 'cache' });
          } else {
            await this.publish(unit, { pages: (async function* () { yield { text: unit.text, ...(unit.pageIndex !== undefined ? { pageIndex: unit.pageIndex } : {}) }; })() }, valid);
          }
        }
        const keep = new Set(units.map(unit => unit.key));
        for (const [key, job] of this.jobs) if (job.unit.paperKey === paper.key && !keep.has(key)) this.jobs.delete(key);
        await this.index.removeUnits(paper.key, keep, valid);
        if (++processed % 32 === 0) await this.notify();
        await yieldControl();
      }
      if (!valid()) throw cancelled();
      await this.index.prune(keys, valid);
      for (const [key, job] of this.jobs) if (!keys.has(job.unit.paperKey)) this.jobs.delete(key);
      this.force = false;
      await this.notify();
    }

    async publish(unit, result, valid) {
      const pending = { ...unit, status: 'processing' };
      delete pending.text;
      const generation = await this.index.beginUnit(pending, valid);
      let part = 0, textPages = 0, emptyPages = 0, partial = result.status === 'partial';
      for await (const page of result.pages) {
        if (!valid()) throw cancelled();
        const text = String(page.text || '').trim();
        if (!text) { emptyPages++; continue; }
        // A pathological single page is reported as partial instead of building
        // a multi-megabyte token array on the reader's main thread.
        if (text.length > 2 * 1024 * 1024) { partial = true; continue; }
        textPages++;
        const parts = M.splitText(text);
        partial ||= parts.partial;
        for (let at = 0; at < parts.chunks.length; at += 16) {
          const chunks = parts.chunks.slice(at, at + 16).map(text => ({ text, part: part++, ...(page.pageIndex !== undefined ? { pageIndex: page.pageIndex } : {}) }));
          await this.index.append(pending, generation, chunks, valid);
          await yieldControl();
          if (!valid()) throw cancelled();
        }
      }
      if (!await this.adapter.valid(unit) || !valid()) { this.scanNeeded = true; throw cancelled(); }
      const status = unit.kind !== 'pdf' ? 'ready' : result.status === 'password' || result.status === 'failed' ? result.status
        : !textPages ? 'ocr' : partial || emptyPages > 0 ? 'partial' : 'ready';
      await this.index.commitUnit({ ...pending, status, textPages, emptyPages, reason: result.reason || '' }, generation, valid);
      return status;
    }

    async mark(unit, status, valid, reason = '') {
      const previous = (await this.index.units(unit.paperKey)).find(value => value.key === unit.key);
      const retained = previous?.generation && previous.fingerprint === unit.fingerprint && ['partial', 'ready'].includes(previous.status);
      const value = { ...unit, status: retained ? previous.status : status, reason };
      delete value.text;
      const generation = await this.index.beginUnit(value, valid);
      if (!retained) await this.index.commitUnit(value, generation, valid);
    }

    nextJob() {
      const jobs = [...this.jobs.values()];
      return jobs.find(job => job.stage === 'cache' && this.priority.has(job.unit.sourceKey))
        || jobs.find(job => job.stage === 'cache') || jobs.find(job => this.priority.has(job.unit.sourceKey)) || jobs[0];
    }

    run() {
      if (this.work) return this.work;
      if (!this.runnable()) return Promise.resolve();
      clearTimeout(this.timer);
      this.timer = null;
      this.work = this.drain().finally(() => { this.work = null; });
      return this.work;
    }

    async drain() {
      await this.ensure();
      while (this.runnable() && (this.scanNeeded || this.jobs.size)) {
        const controller = this.adapter.controller?.() || new AbortController();
        const epoch = this.epoch;
        const valid = () => this.runnable() && !controller.signal.aborted && epoch === this.epoch;
        this.active = { controller, unit: null };
        let job;
        try {
          if (this.scanNeeded) await this.scan(controller, valid);
          else {
            job = this.nextJob();
            const { unit, stage } = job;
            this.jobs.delete(unit.key);
            this.active.unit = unit;
            this.phase = 'indexing';
            this.adapter.notify?.();
            if (!await this.adapter.valid(unit)) { this.scanNeeded = true; continue; }
            const result = await this.adapter.readPDF(unit, { cacheOnly: stage === 'cache', signal: controller.signal });
            if (!valid()) throw cancelled();
            if (result) {
              const status = await this.publish(unit, result, valid);
              if (stage === 'cache' && status === 'partial' && unit.size <= MAX_PDF_BYTES) this.jobs.set(unit.key, { unit, stage: 'extract' });
            } else if (stage === 'cache' && unit.size <= MAX_PDF_BYTES) this.jobs.set(unit.key, { unit, stage: 'extract' });
            else await this.mark(unit, unit.size > MAX_PDF_BYTES ? 'large' : 'failed', valid);
            this.priority.delete(unit.sourceKey);
          }
          this.error = '';
        } catch (error) {
          if (controller.signal.aborted || !valid()) {
            if (job && !this.stopped && !this.jobs.has(job.unit.key)) this.jobs.set(job.unit.key, job);
            if (!job) this.scanNeeded = true;
          } else {
            this.error = String(error.message).slice(0, 300);
            if (job) await this.mark(job.unit, 'failed', valid, this.error);
            else { this.scanNeeded = true; break; }
          }
        } finally {
          this.active = null;
        }
        await this.notify();
        await yieldControl();
      }
      this.phase = this.error ? 'error' : 'ready';
      await this.notify();
    }

    pause() {
      this.paused = true;
      this.active?.controller.abort();
      this.adapter.notify?.();
    }

    async resume() {
      this.paused = false;
      if (this.work) await this.work;
      return this.run();
    }

    async rebuild() {
      this.refresh(true);
      if (this.work) await this.work;
      return this.run();
    }

    async retrieve(scope, query, options = {}) {
      if (this.stopped || !this.adapter.enabled() || scope.libraryID !== this.adapter.libraryID) return [];
      await this.ensure();
      const sources = await this.index.search(query, { ...options, attachmentKey: scope.attachmentKey });
      const selected = [];
      const checked = new Map();
      for (const source of sources) {
        if (options.signal?.aborted) throw cancelled();
        if (await this.adapter.validateSource(source, checked)) selected.push(source);
        else this.refresh();
      }
      return M.mergeSources(selected, query);
    }

    async stop() {
      if (this.stopped) return;
      this.stopped = true;
      clearTimeout(this.timer);
      this.active?.controller.abort();
      this.jobs.clear();
      if (this.work) await this.work.catch(() => {});
      if (this.loading) { await this.loading.catch(() => {}); await this.index.close(); }
    }
  }

  root.ZMALibraryStore = { Manager, MAX_PDF_BYTES };
  if (typeof module !== 'undefined') module.exports = root.ZMALibraryStore;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
