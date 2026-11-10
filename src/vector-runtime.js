(function (root) {
  'use strict';
  const vectors = root.ZMAVectors || (typeof require === 'function' ? require('./vector-core.js') : null);
  const cancelled = message => new Error(message || 'Vector search cancelled');

  class Runtime {
    constructor(createWorker, { maxCacheBytes = 128 * 1024 * 1024, batchSize = 128 } = {}) {
      if (typeof createWorker !== 'function' || !Number.isSafeInteger(maxCacheBytes) || maxCacheBytes < 0
        || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1024) throw new Error('Invalid vector runtime options');
      this.createWorker = createWorker;
      this.maxCacheBytes = maxCacheBytes; this.batchSize = batchSize;
      this.worker = null; this.pending = new Map(); this.serial = 0; this.active = null; this.closed = false;
      this.stats = { cacheBytes: 0, cachedRows: 0, scannedRows: 0 };
    }

    ensureWorker() {
      if (this.worker) return this.worker;
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = event => {
        if (this.worker !== worker) return;
        const response = event.data, waiter = this.pending.get(response?.requestId);
        if (!waiter) return;
        this.pending.delete(response.requestId);
        if (response.error) waiter.reject(new Error(response.error));
        else waiter.resolve(response.result);
      };
      worker.onerror = event => {
        if (this.worker !== worker) return;
        const error = new Error('Vector worker failed: ' + (event?.message || 'unknown error'));
        this.stopActive(error);
        for (const waiter of this.pending.values()) waiter.reject(error);
        this.pending.clear(); this.worker = null;
        worker.terminate();
      };
      return worker;
    }

    rpc(type, data, session) {
      if (this.closed) return Promise.reject(new Error('Vector runtime closed'));
      if (session !== this.active) return Promise.reject(cancelled());
      const worker = this.ensureWorker(), requestId = ++this.serial;
      return new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject, session });
        try { worker.postMessage({ type, ...data, sessionId: session.id, requestId }); }
        catch (error) { this.pending.delete(requestId); reject(error); }
      });
    }

    stopActive(error = cancelled()) {
      const active = this.active;
      if (!active) return;
      this.active = null;
      active.reject(error);
      for (const [id, waiter] of this.pending) {
        if (waiter.session === active) { this.pending.delete(id); waiter.reject(error); }
      }
      try { this.worker?.postMessage({ type: 'cancel', sessionId: active.id }); } catch { /* The worker may already have failed. */ }
    }

    async search(input) {
      if (this.closed) throw new Error('Vector runtime closed');
      this.stopActive();
      if (input.signal?.aborted) throw cancelled('Vector search aborted');
      if (typeof input.namespace !== 'string' || !input.namespace || !Number.isSafeInteger(input.revision) || input.revision < 0
        || typeof input.rows !== 'function' || !Number.isSafeInteger(input.limit ?? 96) || (input.limit ?? 96) < 1 || (input.limit ?? 96) > 4096
        || !Number.isSafeInteger(input.perPaper ?? 4) || (input.perPaper ?? 4) < 1 || (input.perPaper ?? 4) > 96) throw new Error('Invalid vector search options');
      const query = vectors.pack(input.vector);
      if (query.dimensions !== input.dimensions) throw new Error('Invalid vector dimensions');
      /** @type {(reason: Error) => void} */
      let reject;
      const cancellation = new Promise((_, fail) => { reject = fail; });
      const session = { id: ++this.serial, reject };
      this.active = session;
      const check = () => { if (this.active !== session) throw cancelled(); };
      const abort = () => { if (this.active === session) this.stopActive(cancelled('Vector search aborted')); };
      input.signal?.addEventListener('abort', abort, { once: true });
      const work = async () => {
        const start = await this.rpc('start', { namespace: input.namespace, revision: input.revision, dimensions: input.dimensions,
          vector: query.encoded, scope: input.scope ? { attachmentKey: input.scope.attachmentKey, ...(input.scope.paperKey ? { paperKey: input.scope.paperKey } : {}) } : null,
          conversationId: input.conversationId || '', limit: input.limit ?? 96, perPaper: input.perPaper ?? 4,
          maxCacheBytes: this.maxCacheBytes, batchSize: this.batchSize }, session);
        check();
        let afterId = start.afterId;
        while (true) {
          const page = await input.rows(afterId, this.batchSize);
          check();
          if (!Array.isArray(page) || page.length > this.batchSize) throw new Error('Invalid vector page');
          let previous = afterId;
          for (const row of page) {
            if (!Number.isSafeInteger(row?.id) || row.id <= previous || row.dimensions !== input.dimensions) throw new Error('Invalid vector page order or dimensions');
            previous = row.id;
          }
          if (!page.length) break;
          // Only vector fields cross the worker boundary, even if a row provider has extra metadata.
          const rows = page.map(row => ({ id: row.id, paperKey: row.paperKey, attachmentKey: row.attachmentKey,
            kind: row.kind, conversationId: row.conversationId, encoded: row.encoded, dimensions: row.dimensions }));
          await this.rpc('page', { rows }, session);
          check(); afterId = previous;
        }
        const result = await this.rpc('finish', {}, session);
        check(); this.stats = result.stats;
        return result.hits;
      };
      try { return await Promise.race([work(), cancellation]); }
      finally {
        input.signal?.removeEventListener('abort', abort);
        if (this.active === session) this.stopActive(cancelled('Vector search finished'));
      }
    }

    invalidate() {
      this.stopActive(cancelled('Vector search invalidated'));
      try { this.worker?.postMessage({ type: 'reset' }); } catch { /* Cleared on next start if worker failed. */ }
      this.stats = { cacheBytes: 0, cachedRows: 0, scannedRows: 0 };
    }

    destroy() {
      if (this.closed) return;
      this.closed = true; this.stopActive(cancelled('Vector runtime destroyed'));
      this.worker?.terminate(); this.worker = null;
      this.pending.clear();
    }
  }
  root.ZMAVectorRuntime = { Runtime };
  if (typeof module !== 'undefined') module.exports = { Runtime };
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
