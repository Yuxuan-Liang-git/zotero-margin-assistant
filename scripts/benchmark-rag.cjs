// Synthetic full-corpus performance acceptance; no papers, secrets or cloud requests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { Worker } = require('node:worker_threads');
const { Runtime } = require('../src/vector-runtime.js');
const root = path.resolve(__dirname, '..');
const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/i.test(name)) throw Error('Use a fresh simple evidence run name');
const work = path.join(root, 'evidence', name);
if (fs.existsSync(work)) throw Error('Evidence already exists; use a fresh name');
fs.mkdirSync(work, { recursive: true });
const count = 69240, dimensions = 1024, budget = 128 * 1024 * 1024;
const db = new DatabaseSync(path.join(work, 'synthetic-vectors.sqlite'));
db.exec('PRAGMA journal_mode=OFF; CREATE TABLE vectors (id INTEGER PRIMARY KEY, encoded TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO vectors VALUES (?,?)');
const bytes = Buffer.alloc(dimensions * 4), values = new Float32Array(dimensions);
const began = performance.now();
db.exec('BEGIN');
for (let id = 1; id <= count; id++) {
  let seed = id, squared = 0;
  for (let j = 0; j < dimensions; j++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = id === count ? Number(j === 0) : ((seed >>> 8) / 8388608 - 1);
    values[j] = value; squared += value * value;
  }
  const norm = Math.sqrt(squared);
  for (let j = 0; j < dimensions; j++) bytes.writeFloatLE(values[j] / norm, j * 4);
  insert.run(id, bytes.toString('base64'));
}
db.exec('COMMIT');
const setupMs = Math.round(performance.now() - began);
const query = db.prepare('SELECT id,encoded FROM vectors WHERE id>? ORDER BY id LIMIT ?');
function workerBoundary() {
  const thread = new Worker(`
    const {parentPort,workerData} = require('node:worker_threads');
    const vm = require('node:vm'),fs = require('node:fs'),path = require('node:path');
    globalThis.self=globalThis;
    globalThis.importScripts=url=>{
      if(url!=='scripts/vector-core.js')throw Error('Unexpected dependency');
      vm.runInThisContext(fs.readFileSync(path.join(workerData.root,'src/vector-core.js'),'utf8'));
    };
    globalThis.postMessage=data=>parentPort.postMessage(data);
    vm.runInThisContext(fs.readFileSync(path.join(workerData.root,'content/rag-vector-worker.js'),'utf8'));
    parentPort.on('message',data=>globalThis.onmessage({data}));
  `, { eval: true, workerData: { root } });
  const boundary = { onmessage: null, onerror: null, postMessage: data => thread.postMessage(data), terminate: () => thread.terminate() };
  thread.on('message', data => boundary.onmessage?.({ data }));
  thread.on('error', error => boundary.onerror?.(error));
  return boundary;
}
async function measure(runtime, label) {
  let ticks = 0, last = performance.now(), maxHeartbeatGapMs = 0, peakRss = process.memoryUsage().rss, pages = 0, maxPageBytes = 0;
  const startRss = peakRss;
  const ticker = setInterval(() => {
    const now = performance.now(); maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - last); last = now; ticks++;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 20);
  const control = new AbortController(), deadline = setTimeout(() => control.abort(), 8000);
  const started = performance.now(); let result, timeout = false;
  try {
    const vector = Array(dimensions).fill(0); vector[0] = 1;
    result = await runtime.search({ namespace: 'synthetic:1024', revision: 1, dimensions, vector, signal: control.signal, limit: 96,
      rows: async (after, limit) => {
        const found = query.all(after, limit); pages++;
        maxPageBytes = Math.max(maxPageBytes, found.reduce((sum, row) => sum + row.encoded.length * 2 + 256, 0));
        return found.map(row => ({ ...row, paperKey: 'P' + String(Math.ceil(row.id / 90)).padStart(7, '0'), attachmentKey: 'A' + String(Math.ceil(row.id / 90)).padStart(7, '0'), kind: 'pdf', conversationId: '', compact: '', norm: 1, dimensions }));
      }
    });
    assert.equal(result[0]?.id, count, 'The correct winner must be found in the uncached tail');
    assert.equal(runtime.stats.scannedRows, count);
    assert.ok(runtime.stats.cacheBytes <= runtime.maxCacheBytes);
    assert.ok(runtime.stats.cachedRows < count, 'Fixture must overflow the cache');
  } catch (error) {
    if (!control.signal.aborted) throw error;
    timeout = true; assert.match(String(error), /abort|cancel/i);
  } finally { clearInterval(ticker); clearTimeout(deadline); }
  const report = { label, pageSize: runtime.batchSize, candidateLimit: 96, elapsedMs: Math.round(performance.now() - started), queryBudgetMs: 8000, timeout, winner: result?.[0] || null, pages,
    heartbeatTicks: ticks, maxHeartbeatGapMs: Math.round(maxHeartbeatGapMs), startRssBytes: startRss, peakObservedRssBytes: peakRss,
    maxMainPageEstimatedBytes: maxPageBytes, ...runtime.stats };
  console.log(JSON.stringify(report));
  return report;
}
(async () => {
  const runtime = new Runtime(workerBoundary, { maxCacheBytes: budget, batchSize: 512 });
  const tiny = new Runtime(workerBoundary, { maxCacheBytes: 32768, batchSize: 512 });
  try {
    const results = [];
    results.push(await measure(runtime, 'cold-128MiB'));
    results.push(await measure(runtime, 'warm-128MiB'));
    runtime.destroy();
    results.push(await measure(tiny, 'overflow-32KiB'));
    const report = { mode: 'controlled synthetic vectors; actual shipped Worker; real SQLite paging; no cloud or personal library',
      node: process.version, datasetRows: count, dimensions, setupMs, databaseBytes: fs.statSync(path.join(work, 'synthetic-vectors.sqlite')).size,
      processMaxRssBytes: process.resourceUsage().maxRSS * 1024, cacheBudgetBytes: budget, results,
      limits: 'Node boundary only, no Gecko/cloud latency claim. RSS includes main thread, Worker, SQLite and fixture preparation. Page estimate uses UTF-16 strings plus metadata, excludes engine overhead. Coordinator fallback verified separately.' };
    fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (results.some(r => r.timeout)) process.exitCode = 2;
  } finally { runtime.destroy(); tiny.destroy(); db.close(); }
})().catch(error => { console.error(error); db.close(); process.exitCode = 1; });
