(function (root) {
  'use strict';
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const keyOf = scope => scope.libraryID + '-' + scope.attachmentKey;
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));

  function catalogEntry(doc, fingerprint) {
    const terms = Object.create(null);
    const titleWords = new Set(M.tokens(doc.title + ' ' + doc.doi));
    const sorted = Object.entries(doc.terms).sort((a, b) => Number(titleWords.has(b[0])) - Number(titleWords.has(a[0])) || b[1] - a[1]);
    for (const [word, count] of sorted.slice(0, 256)) terms[word] = count;
    return { libraryID: doc.libraryID, attachmentKey: doc.attachmentKey, title: doc.title, year: doc.year, doi: doc.doi,
      signature: doc.signature, updatedAt: doc.updatedAt, partial: doc.partial, length: doc.length, terms, fingerprint };
  }

  function cleanEntry(value, libraryID) {
    if (value?.libraryID !== libraryID || !/^[A-Z0-9]{8}$/.test(value.attachmentKey) || typeof value.title !== 'string' || value.title.length > 500
      || typeof value.year !== 'string' || value.year.length > 20 || typeof value.doi !== 'string' || value.doi.length > 250
      || !/^[a-f0-9]{16}$/.test(value.signature) || typeof value.fingerprint !== 'string' || value.fingerprint.length > 500
      || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || !Number.isSafeInteger(value.length) || value.length < 0
      || !value.terms || typeof value.terms !== 'object' || Object.keys(value.terms).length > 256) throw new Error('研究记忆目录需要重建');
    const terms = Object.create(null);
    for (const [word, count] of Object.entries(value.terms)) {
      if (word.length > 100 || !Number.isSafeInteger(count) || count < 1 || count > 1000000) throw new Error('研究记忆词项无效');
      terms[word] = count;
    }
    return { ...value, terms };
  }

  function cleanDocument(doc, entry) {
    if (doc?.version !== 1 || doc.libraryID !== entry.libraryID || doc.attachmentKey !== entry.attachmentKey || doc.signature !== entry.signature
      || !Array.isArray(doc.chunks) || doc.chunks.length > 512 || typeof doc.summary !== 'string' || doc.summary.length > 16000) throw new Error('研究记忆缓存需要重建');
    let length = 0;
    for (const chunk of doc.chunks) {
      M.cleanSources([{ ...entry, ...chunk, label: '阅读1' }]);
      length += chunk.text.length;
    }
    if (length > M.MAX_TEXT) throw new Error('研究记忆缓存超过上限');
    return { ...doc, ...entry, chunks: doc.chunks };
  }

  class Manager {
    constructor(adapter) {
      this.adapter = adapter;
      this.libraries = new Map();
      this.loads = new Map();
      this.jobs = new Map();
      this.versions = new Map();
      this.cache = new Map();
      this.scans = new Map();
      this.catalogWrites = new Map();
      this.forced = new Set();
      this.timer = null;
      this.work = null;
      this.active = null;
      this.paused = false;
      this.stopped = false;
    }

    status(libraryID) {
      const state = this.libraries.get(libraryID);
      return { phase: this.stopped ? 'stopped' : state?.phase || 'idle', indexed: state?.entries.size || 0,
        scanned: state?.scanned || 0, pending: [...this.jobs.values()].filter(scope => scope.libraryID === libraryID).length,
        skipped: state?.errors.size || 0, errors: [...(state?.errors.values() || [])].slice(-3),
        partial: [...(state?.entries.values() || [])].filter(entry => entry.partial).length };
    }

    notify(libraryID, phase) {
      const state = this.libraries.get(libraryID);
      if (state && phase) state.phase = phase;
      if (!this.stopped) this.adapter.notify?.(libraryID, this.status(libraryID));
    }

    async ensure(libraryID) {
      if (this.loads.has(libraryID)) return this.loads.get(libraryID);
      const load = (async () => {
        const state = { entries: new Map(), errors: new Map(), phase: 'idle', scanned: 0, backfillStarted: false };
        this.libraries.set(libraryID, state);
        try {
          const stored = await this.adapter.readCatalog(libraryID);
          if (stored) {
            if (stored.version !== 1 || !Array.isArray(stored.entries) || stored.entries.length > 2000) throw new Error('研究记忆目录需要重建');
            for (const value of stored.entries) {
              const entry = cleanEntry(value, libraryID);
              state.entries.set(entry.attachmentKey, entry);
            }
          }
        } catch (error) { state.entries.clear(); state.errors.set('catalog', String(error.message)); }
        if (!this.stopped && this.adapter.enabled()) {
          void this.scan(libraryID).catch(error => { state.errors.set('scan', String(error.message)); this.notify(libraryID, 'error'); });
        }
        return state;
      })();
      this.loads.set(libraryID, load);
      return load;
    }

    scan(libraryID, force = false) {
      if (this.scans.has(libraryID)) return this.scans.get(libraryID);
      this.libraries.get(libraryID).backfillStarted = true;
      const task = (async () => {
        this.notify(libraryID, 'scanning');
        const scopes = await this.adapter.list(libraryID);
        const available = new Set();
        for (const [index, scope] of scopes.entries()) {
          if (this.stopped) return;
          if (scope.libraryID !== libraryID || !/^[A-Z0-9]{8}$/.test(scope.attachmentKey)) continue;
          available.add(scope.attachmentKey);
          this.schedule(scope, force);
          if (index % 32 === 0) await yieldControl();
        }
        const state = this.libraries.get(libraryID);
        let removed = false;
        for (const key of state.entries.keys()) {
          if (!available.has(key)) { state.entries.delete(key); this.cache.delete(libraryID + '-' + key); removed = true; }
        }
        if (removed && !this.stopped) await this.persist(libraryID);
        state.errors.delete('scan');
      })().catch(error => {
        const state = this.libraries.get(libraryID);
        state.backfillStarted = false;
        state.errors.set('scan', String(error.message));
        this.notify(libraryID, 'error');
        throw error;
      }).finally(() => this.scans.delete(libraryID));
      this.scans.set(libraryID, task);
      return task;
    }

    schedule(scope, force = false) {
      if (this.stopped || !this.adapter.enabled()) return;
      const key = keyOf(scope);
      this.versions.set(key, (this.versions.get(key) || 0) + 1);
      this.jobs.set(key, { libraryID: scope.libraryID, attachmentKey: scope.attachmentKey });
      if (force) this.forced.add(key);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; void this.run(); }, this.adapter.delay ?? 1500);
    }

    persist(libraryID) {
      const previous = this.catalogWrites.get(libraryID) || Promise.resolve();
      const write = previous.catch(() => {}).then(async () => {
        if (this.stopped) return;
        const state = this.libraries.get(libraryID);
        const catalog = { version: 1, entries: [...state.entries.values()] };
        if (JSON.stringify(catalog).length > 2000000) throw new Error('研究记忆目录已达缓存上限，部分论文暂未纳入');
        await this.adapter.writeCatalog(libraryID, catalog);
      });
      this.catalogWrites.set(libraryID, write);
      return write;
    }

    remember(scope, doc) {
      const key = keyOf(scope);
      this.cache.delete(key);
      this.cache.set(key, doc);
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    }

    async update(scope, version, controller) {
      const key = keyOf(scope);
      const state = await this.ensure(scope.libraryID);
      const valid = () => !this.stopped && !controller.signal.aborted && this.versions.get(key) === version;
      const data = await this.adapter.read(scope, controller.signal);
      if (!valid()) return;
      const old = state.entries.get(scope.attachmentKey);
      if (!data) {
        if (old) { state.entries.delete(scope.attachmentKey); this.cache.delete(key); await this.persist(scope.libraryID); }
        state.errors.delete(key);
        return;
      }
      if (old?.fingerprint === data.fingerprint && !this.forced.has(key)) return;
      const doc = await M.buildDocument(scope, data.state, data.metadata, { summaryValid: data.summaryValid, signal: controller.signal, yieldControl });
      if (!valid()) return;
      if (!old && state.entries.size >= 2000) throw new Error('研究记忆已达2000篇索引上限');
      await this.adapter.writeDocument(scope, doc);
      if (!valid()) return;
      if (doc.chunks.length) state.entries.set(scope.attachmentKey, catalogEntry(doc, data.fingerprint));
      else state.entries.delete(scope.attachmentKey);
      try { await this.persist(scope.libraryID); }
      catch (error) { if (old) state.entries.set(scope.attachmentKey, old); else state.entries.delete(scope.attachmentKey); throw error; }
      if (!valid()) return;
      this.remember(scope, doc);
      this.forced.delete(key);
      state.errors.delete(key);
      state.errors.delete('catalog');
    }

    run() {
      if (this.work) return this.work;
      if (this.stopped || this.paused || this.adapter.foreground() || !this.adapter.enabled()) return Promise.resolve();
      clearTimeout(this.timer);
      this.timer = null;
      this.work = this.drain().finally(() => { this.work = null; });
      return this.work;
    }

    async drain() {
      while (this.jobs.size && !this.stopped && !this.paused && !this.adapter.foreground() && this.adapter.enabled()) {
        const [key, scope] = this.jobs.entries().next().value;
        this.jobs.delete(key);
        const version = this.versions.get(key);
        const controller = this.adapter.controller?.() || new AbortController();
        this.active = { scope, controller };
        this.notify(scope.libraryID, 'indexing');
        try { await this.update(scope, version, controller); }
        catch (error) {
          if (!controller.signal.aborted && !this.stopped) this.libraries.get(scope.libraryID)?.errors.set(key, String(error.message).slice(0, 300));
        }
        if (controller.signal.aborted && !this.stopped && !this.jobs.has(key)) this.jobs.set(key, scope);
        this.active = null;
        const state = this.libraries.get(scope.libraryID);
        if (state) state.scanned++;
        this.notify(scope.libraryID, this.jobs.size ? 'indexing' : 'ready');
        await yieldControl();
      }
    }

    pause() {
      this.paused = true;
      this.active?.controller.abort();
    }

    async resume() {
      this.paused = false;
      if (this.stopped || !this.adapter.enabled() || this.adapter.foreground()) return;
      for (const [libraryID, state] of this.libraries) {
        if (!state.backfillStarted) await this.scan(libraryID);
      }
      if (this.work) await this.work;
      return this.run();
    }

    async rebuild(libraryID) {
      await this.ensure(libraryID);
      if (this.scans.has(libraryID)) await this.scans.get(libraryID);
      await this.scan(libraryID, true);
      if (this.work) await this.work;
      await this.run();
    }

    async retrieve(scope, query, options = {}) {
      if (this.stopped || !this.adapter.enabled()) return [];
      const state = await this.ensure(scope.libraryID);
      const documents = [];
      const candidates = M.rankDocuments([...state.entries.values()], query).slice(0, 8);
      for (const entry of candidates) {
        if (options.signal?.aborted) throw new Error('研究记忆检索已取消');
        const target = { libraryID: entry.libraryID, attachmentKey: entry.attachmentKey };
        try {
          let doc = this.cache.get(keyOf(target));
          if (!doc || doc.signature !== entry.signature) doc = cleanDocument(await this.adapter.readDocument(target), entry);
          this.remember(target, doc);
          const current = await this.adapter.read(target, options.signal);
          if (!current) { this.schedule(target, true); continue; }
          const checked = new Map();
          const chunks = doc.chunks.filter(chunk => (chunk.kind !== 'summary' || current.summaryValid !== false) && M.sourceCurrent(chunk, current.state, checked));
          if (chunks.length !== doc.chunks.length || entry.fingerprint !== current.fingerprint) this.schedule(target, true);
          documents.push({ ...doc, chunks });
        } catch (error) {
          if (options.signal?.aborted) throw error;
          state.errors.set(keyOf(target), String(error.message).slice(0, 300));
          this.schedule(target, true);
        }
        await yieldControl();
      }
      return M.selectSources(documents, query, { scope, conversationId: options.conversationId });
    }

    async export(libraryID) {
      await this.rebuild(libraryID);
      if ([...this.jobs.values()].some(scope => scope.libraryID === libraryID)) throw new Error('研究记忆正在等待空闲，请稍后导出');
      const documents = [];
      for (const scope of await this.adapter.list(libraryID)) {
        if (this.stopped) throw new Error('研究笔记导出已取消');
        const current = await this.adapter.read(scope);
        if (current?.summaryValid !== false && current?.state.readingSummary?.text) {
          documents.push(await M.buildDocument(scope, { conversations: [], readingSummary: current.state.readingSummary }, current.metadata));
        }
        await yieldControl();
      }
      if (this.stopped) throw new Error('研究笔记导出已取消');
      return M.exportNotes(documents);
    }

    async stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      this.timer = null;
      this.active?.controller.abort();
      this.jobs.clear();
      await Promise.allSettled([...this.scans.values(), ...this.catalogWrites.values(), ...(this.work ? [this.work] : [])]);
      this.cache.clear();
    }
  }

  root.ZMAMemoryStore = { Manager };
  if (typeof module !== 'undefined') module.exports = root.ZMAMemoryStore;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
