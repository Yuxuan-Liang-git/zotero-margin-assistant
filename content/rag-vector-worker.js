(function (root) {
  'use strict';
  // Relative to the shipped content Worker URL, including chrome/resource or jar URLs.
  root.importScripts('scripts/vector-core.js');
  const vectors = root.ZMAVectors;
  let identity = '', cache = [], cacheBytes = 0, cacheLastId = 0, cacheFull = false, active = null;
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
  const reset = () => { identity = ''; cache = []; cacheBytes = 0; cacheLastId = 0; cacheFull = false; active = null; };
  const current = session => { if (active !== session) throw new Error('Vector search cancelled'); };
  const compare = (a, b) => b.score - a.score || a.id - b.id;

  function consider(session, row) {
    session.scannedRows++;
    if (session.scope?.attachmentKey === row.attachmentKey && (row.kind === 'pdf' || row.kind === 'dialogue' && row.conversationId === session.conversationId)
      || session.scope?.paperKey && session.scope.paperKey === row.paperKey && row.kind === 'metadata') return;
    const candidate = { id: row.id, score: vectors.cosine(session.query, row.vector), paperKey: row.paperKey || row.attachmentKey };
    const same = session.hits.filter(hit => hit.paperKey === candidate.paperKey);
    if (same.length >= session.perPaper) {
      const worst = same[same.length - 1];
      if (compare(candidate, worst) >= 0) return;
      session.hits.splice(session.hits.indexOf(worst), 1);
    }
    session.hits.push(candidate);
    session.hits.sort(compare);
    if (session.hits.length > session.limit) session.hits.pop();
  }

  async function start(message) {
    const key = JSON.stringify([message.namespace, message.revision, message.dimensions, message.maxCacheBytes]);
    if (identity !== key) { reset(); identity = key; }
    const session = { id: message.sessionId, query: vectors.unpack(message.vector, message.dimensions), scope: message.scope,
      conversationId: message.conversationId, perPaper: message.perPaper, limit: message.limit, batchSize: message.batchSize,
      maxCacheBytes: message.maxCacheBytes, dimensions: message.dimensions, hits: [], scannedRows: 0, afterId: cacheLastId };
    active = session;
    for (let i = 0; i < cache.length; i++) {
      current(session); consider(session, cache[i]);
      if ((i + 1) % session.batchSize === 0) { await yieldControl(); current(session); }
    }
    return { afterId: cacheLastId };
  }

  async function page(message, session) {
    for (const input of message.rows) {
      current(session);
      if (!Number.isSafeInteger(input.id) || input.id <= session.afterId || input.dimensions !== session.dimensions
        || !['paperKey', 'attachmentKey', 'kind', 'conversationId'].every(key => typeof input[key] === 'string' && input[key].length <= 256)) throw new Error('Invalid vector row');
      const vector = vectors.unpack(input.encoded, session.dimensions);
      const row = { id: input.id, paperKey: input.paperKey, attachmentKey: input.attachmentKey, kind: input.kind, conversationId: input.conversationId, vector };
      consider(session, row); session.afterId = input.id;
      // Float32 fallback is exact. Reserve 512 bytes per entry for object/array/allocator
      // overhead in addition to backing bytes and worst-case UTF-16 identity strings.
      const bytes = vector.byteLength + 512 + 2 * (row.paperKey.length + row.attachmentKey.length + row.kind.length + row.conversationId.length);
      if (!cacheFull && cacheBytes + bytes <= session.maxCacheBytes) {
        cache.push(row); cacheBytes += bytes; cacheLastId = row.id;
      } else cacheFull = true;
    }
    await yieldControl(); current(session);
    return { afterId: session.afterId };
  }

  root.onmessage = async event => {
    const message = event.data;
    if (message.type === 'reset') { reset(); return; }
    if (message.type === 'cancel') { if (active?.id === message.sessionId) active = null; return; }
    try {
      let result;
      if (message.type === 'start') result = await start(message);
      else {
        const session = active;
        if (!session || session.id !== message.sessionId) return;
        if (message.type === 'page') result = await page(message, session);
        else if (message.type === 'finish') {
          result = { hits: session.hits.map(hit => ({ id: hit.id, score: hit.score })),
            stats: { cacheBytes, cachedRows: cache.length, scannedRows: session.scannedRows } };
          active = null;
        } else throw new Error('Invalid vector worker operation');
      }
      root.postMessage({ requestId: message.requestId, result });
    } catch (error) {
      root.postMessage({ requestId: message.requestId, error: error.message || 'Vector worker failed' });
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
