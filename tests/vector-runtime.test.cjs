const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const runtimePath = path.resolve(__dirname, '../src/vector-runtime.js');
const { Runtime } = fs.existsSync(runtimePath) ? require(runtimePath) : {};
// Only the host messaging/importScripts boundary is adapted. Every search executes the shipped Worker.
function adapter(options = {}) {
  const thread = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    globalThis.self = globalThis;
    globalThis.importScripts = url => {
      if (url !== 'scripts/vector-core.js') throw new Error('unexpected script URL: ' + url);
      vm.runInThisContext(fs.readFileSync(path.join(workerData.root, 'src/vector-core.js'), 'utf8'));
    };
    globalThis.postMessage = data => setTimeout(() => parentPort.postMessage(data), workerData.delay || 0);
    vm.runInThisContext(fs.readFileSync(path.join(workerData.root, 'content/rag-vector-worker.js'), 'utf8'));
    parentPort.on('message', data => { if (data.crash) throw new Error('controlled worker crash'); globalThis.onmessage({ data }); });
  `, { eval: true, workerData: { root: path.resolve(__dirname, '..'), ...options } });
  const boundary = { onmessage: null, onerror: null, postMessage: data => thread.postMessage(data), terminate: () => thread.terminate(), fail: () => thread.postMessage({ crash: true }), thread };
  thread.on('message', data => boundary.onmessage?.({ data }));
  thread.on('error', error => boundary.onerror?.(error));
  return boundary;
}
function row(id, vector, patch = {}) {
  const bytes = Buffer.alloc(vector.length * 4);
  vector.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  return { id, paperKey: 'P' + id, attachmentKey: 'A' + id, kind: 'pdf', conversationId: '', encoded: bytes.toString('base64'), compact: '', norm: 1, dimensions: vector.length, ...patch };
}
const pageRows = (data, calls = []) => async (after, limit) => { calls.push(after); return data.filter(r => r.id > after).slice(0, limit); };
const request = (rows, patch = {}) => ({ namespace: 'library1:endpoint:model:2', revision: 1, dimensions: 2, vector: [5, 0], rows, ...patch });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('real worker scans overflow pages exactly and reuses only budgeted prefix cache', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter(), { maxCacheBytes: 900, batchSize: 2 });
  const data = [row(1, [0, 1]), row(2, [-1, 0]), row(3, [0.6, 0.8]), row(4, [1, 0])];
  const calls = [];
  try {
    assert.deepEqual(await runtime.search(request(pageRows(data, calls), { limit: 1 })), [{ id: 4, score: 1 }]);
    assert.ok(runtime.stats.cacheBytes <= 900);
    assert.equal(runtime.stats.scannedRows, 4);
    assert.ok(runtime.stats.cachedRows < 4);
    const second = [];
    assert.deepEqual(await runtime.search(request(pageRows(data, second), { limit: 1 })), [{ id: 4, score: 1 }]);
    assert.equal(second[0], runtime.stats.cachedRows);
    assert.ok(calls.includes(2));
  } finally { runtime.destroy(); }
});

test('worker applies active conversation exclusion and paper diversity before top limit', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter(), { batchSize: 2 });
  const data = [row(1, [1, 0], { paperKey: 'P', kind: 'dialogue', attachmentKey: 'CURRENT', conversationId: 'active' }), row(2, [1, 0], { paperKey: 'P' }), row(3, [0.99, 0.1], { paperKey: 'P' }), row(4, [0.8, 0.6]), row(5, [-1, 0])];
  try {
    const result = await runtime.search(request(pageRows(data), { scope: { attachmentKey: 'CURRENT' }, conversationId: 'active', limit: 2, perPaper: 1 }));
    assert.deepEqual(result.map(r => r.id), [2, 4]);
    assert.equal(result[0].score, 1);
  } finally { runtime.destroy(); }
});

test('namespace and revision changes discard cached vectors and reject superseded work', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter());
  try {
    assert.equal((await runtime.search(request(pageRows([row(1, [1, 0])]))))[0].score, 1);
    assert.equal((await runtime.search(request(pageRows([row(1, [0, 1])]), { revision: 2 })))[0].score, 0);
    assert.equal((await runtime.search(request(pageRows([row(1, [-1, 0])]), { namespace: 'different' })))[0].score, -1);
    runtime.invalidate();
    assert.equal((await runtime.search(request(pageRows([row(2, [1, 0])]))))[0].id, 2);
  } finally { runtime.destroy(); }
});

test('abort releases an unresolved row provider immediately and ignores its late completion', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter());
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const signal = new AbortController();
  try {
    const pending = runtime.search(request(async () => { entered(); return new Promise(resolve => { release = resolve; }); }, { signal: signal.signal }));
    await ready;
    const start = performance.now(); signal.abort();
    await assert.rejects(pending, /cancel|abort/i);
    assert.ok(performance.now() - start < 100);
    release([row(999, [1, 0])]);
    assert.deepEqual(await runtime.search(request(pageRows([row(2, [0, 1])]))), [{ id: 2, score: 0 }]);
  } finally { runtime.destroy(); }
});

test('invalidation rejects delayed worker replies and a later search is independent', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter({ delay: 60 }));
  try {
    const old = runtime.search(request(pageRows([row(99, [1, 0])])));
    await sleep(15); runtime.invalidate();
    await assert.rejects(old, /cancel|invalid/i);
    assert.deepEqual(await runtime.search(request(pageRows([row(2, [0, 1])]))), [{ id: 2, score: 0 }]);
  } finally { runtime.destroy(); }
});

test('cancelled cache fill resumes from the safely cached prefix without losing overflow', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter(), { batchSize: 2 });
  const signal = new AbortController();
  const data = [row(1, [0, 1]), row(2, [0, 1]), row(3, [1, 0])];
  let calls = 0;
  try {
    await assert.rejects(runtime.search(request(async (after, limit) => { if (++calls === 2) signal.abort(); return data.filter(r => r.id > after).slice(0, limit); }, { signal: signal.signal })), /cancel|abort/i);
    const resumed = [];
    assert.deepEqual(await runtime.search(request(pageRows(data, resumed), { limit: 1 })), [{ id: 3, score: 1 }]);
    assert.equal(resumed[0], 2);
  } finally { runtime.destroy(); }
});

test('worker failure and destroy settle outstanding waits and release worker handles', async () => {
  assert.equal(typeof Runtime, 'function');
  let worker;
  const runtime = new Runtime(() => (worker = adapter()));
  try {
    const pending = runtime.search(request(async () => new Promise(() => {})));
    await sleep(60); worker.fail();
    await assert.rejects(pending, /worker|crash/i);
    assert.deepEqual(await runtime.search(request(pageRows([row(3, [1, 0])]))), [{ id: 3, score: 1 }]);
    const pendingClose = runtime.search(request(async () => new Promise(() => {})));
    runtime.destroy();
    await assert.rejects(pendingClose, /destroy|closed|cancel/i);
    await assert.rejects(runtime.search(request(pageRows([]))), /destroy|closed/i);
  } finally { runtime.destroy(); }
});

test('malformed pages or vectors fail explicitly without poisoning the cache', async () => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter(), { batchSize: 2 });
  try {
    await assert.rejects(runtime.search(request(pageRows([row(1, [0, 0])]))), /vector|norm/i);
    await assert.rejects(runtime.search(request(async () => [row(2, [1, 0]), row(1, [1, 0])], { revision: 2 })), /order|page/i);
    assert.deepEqual(await runtime.search(request(pageRows([row(1, [1, 0])]), { revision: 3 })), [{ id: 1, score: 1 }]);
    await assert.rejects(runtime.search(request(pageRows([]), { vector: [0, 0] })), /vector|norm/i);
  } finally { runtime.destroy(); }
});

test('bounded real worker records deterministic timing and heap evidence on 4096 rows', async t => {
  assert.equal(typeof Runtime, 'function');
  const runtime = new Runtime(() => adapter(), { maxCacheBytes: 32768, batchSize: 128 });
  const data = Array.from({ length: 4096 }, (_, i) => row(i + 1, i === 4095 ? [1, 0] : [0, 1]));
  const heap = process.memoryUsage().heapUsed, start = performance.now();
  try {
    assert.deepEqual(await runtime.search(request(pageRows(data), { limit: 1 })), [{ id: 4096, score: 1 }]);
    assert.equal(runtime.stats.scannedRows, 4096);
    assert.ok(runtime.stats.cacheBytes <= 32768);
    t.diagnostic(JSON.stringify({ datasetRows: 4096, dimensions: 2, elapsedMs: Math.round(performance.now() - start), mainHeapDeltaBytes: process.memoryUsage().heapUsed - heap, ...runtime.stats }));
  } finally { runtime.destroy(); }
});
