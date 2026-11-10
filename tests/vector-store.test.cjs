const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const M = require('../src/memory-core.js');
const V = require('../src/vector-core.js');
const file = path.resolve(__dirname, '../src/vector-store.js');
const API = fs.existsSync(file) ? require(file) : {};

// Real SQL adapter: mirrors Zotero async bindings and transaction rollback.
function connection(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  return {
    queryAsync: async (sql, params = []) => {
      assert.ok(params.every(p => p !== undefined && (p === null || ['string', 'number'].includes(typeof p))), 'SQLite bindings must be scalar');
      return /^\s*(SELECT|PRAGMA)/i.test(sql) ? db.prepare(sql).all(...params) : db.prepare(sql).run(...params);
    },
    executeTransaction: async action => {
      db.exec('BEGIN IMMEDIATE');
      try { const value = await action(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    closeDatabase: async () => db.close()
  };
}
const space = (namespace = 'library-1:model:2') => ({ namespace, libraryID: 1, dimensions: 2, model: 'test-embedding' });
const source = (n = 1, text = 'Authoritative source.') => ({ version: 2, label: '阅读1', libraryID: 1,
  paperKey: 'PAPER00' + n, sourceKey: 'SOURCE0' + n, attachmentKey: 'PDF0000' + n, title: 'Observer ' + n,
  year: '2025', doi: '', kind: 'pdf', conversationId: '', messageIndex: 0, part: 0,
  signature: M.signature(text), fingerprint: '1111111122222222', updatedAt: 0, text, pageIndex: 42 });
const segment = input => ({ key: createHash('sha256').update(input).digest('hex'), input });
async function fixture(t, filename) {
  assert.equal(typeof API.Store, 'function', 'resumable vector Store must exist');
  const store = new API.Store(connection(filename));
  t.after(() => store.close());
  await store.open(); await store.configure(space());
  return store;
}
const ns = space().namespace;

test('configure rejects space drift and source library mismatch without disturbing valid namespaces', async t => {
  const s = await fixture(t);
  await assert.rejects(s.configure({ ...space(), dimensions: 3 }), /space|dimension/i);
  await assert.rejects(s.sync(ns, { ...source(), libraryID: 2 }, [segment('a')], 's1'), /library|source/i);
  await s.configure(space('other'));
  await s.sync(ns, source(), [segment('a')], 's1');
  assert.equal((await s.stats('other')).pending, 0);
  assert.equal((await s.stats(ns)).pending, 1);
});

test('partial embedding readiness counts complete sources separately and bounds unique pending work', async t => {
  const s = await fixture(t), a = segment('first'), b = segment('second');
  await s.sync(ns, source(), [a, b], 's1');
  assert.deepEqual(await s.pending(ns, 1), [a]);
  await s.commit(ns, [{ key: a.key, vector: [2, 0] }]);
  let stats = await s.stats(ns);
  assert.equal(stats.readySegments, 1); assert.equal(stats.readySources, 0); assert.equal(stats.pending, 1); assert.equal(stats.failed, 0);
  await s.commit(ns, [{ key: b.key, vector: [0, 3] }]);
  stats = await s.stats(ns);
  assert.equal(stats.readySegments, 2); assert.equal(stats.readySources, 1); assert.equal(stats.pending, 0);
  assert.equal((await s.vectors(ns)).length, 2);
});

test('identical scan touches preserve revision and reuse completed input vectors across sources', async t => {
  const s = await fixture(t), a = segment('identical');
  await s.sync(ns, source(), [a], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  const initial = await s.vectors(ns), revision = (await s.stats(ns)).revision;
  await s.sync(ns, source(), [a], 's2');
  assert.equal((await s.stats(ns)).revision, revision);
  assert.deepEqual(await s.vectors(ns), initial);
  await s.sync(ns, source(2), [a], 's2');
  assert.deepEqual(await s.pending(ns), []);
  assert.equal((await s.stats(ns)).readySources, 2);
  assert.equal((await s.vectors(ns)).length, 2);
});

test('source changes immediately invalidate old IDs and stale embedding responses cannot resurrect them', async t => {
  const s = await fixture(t), old = segment('old'), fresh = segment('new');
  await s.sync(ns, source(), [old], 's1'); await s.commit(ns, [{ key: old.key, vector: [1, 0] }]);
  const [{ id }] = await s.vectors(ns), rev = (await s.stats(ns)).revision;
  await s.sync(ns, { ...source(1, 'Changed source.'), fingerprint: '3333333344444444' }, [fresh], 's2');
  assert.deepEqual(await s.sources(ns, [id]), []); assert.deepEqual(await s.vectors(ns), []);
  await s.commit(ns, [{ key: old.key, vector: [1, 0] }]);
  assert.deepEqual(await s.vectors(ns), []);
  await s.commit(ns, [{ key: fresh.key, vector: [0, 1] }]);
  assert.ok((await s.vectors(ns))[0].id > id);
  assert.ok((await s.stats(ns)).revision > rev);
});

test('a fingerprint-only update and input-key replacement both allocate fresh association IDs', async t => {
  const s = await fixture(t), a = segment('a'), b = segment('b');
  await s.sync(ns, source(), [a], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  const id = (await s.vectors(ns))[0].id;
  await s.sync(ns, { ...source(), fingerprint: '3333333344444444' }, [a], 's2');
  const next = (await s.vectors(ns))[0].id; assert.ok(next > id);
  await s.sync(ns, { ...source(), fingerprint: '3333333344444444' }, [b], 's2');
  assert.deepEqual(await s.sources(ns, [next]), []);
});

test('invalid dimensions or cancellation rolls back the entire embedding batch and preserves unrelated completed rows', async t => {
  const s = await fixture(t), a = segment('a'), b = segment('b'), c = segment('c');
  await s.sync(ns, source(), [a], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  await s.sync(ns, source(2), [b, c], 's1');
  const before = await s.stats(ns);
  await assert.rejects(s.commit(ns, [{ key: b.key, vector: [0, 1] }, { key: c.key, vector: [1, 2, 3] }]), /dimension/i);
  assert.deepEqual(await s.stats(ns), before);
  let checks = 0;
  await assert.rejects(s.commit(ns, [{ key: b.key, vector: [0, 1] }], () => ++checks < 2), /cancel|stale|过期|取消/i);
  assert.deepEqual(await s.stats(ns), before);
  assert.equal((await s.vectors(ns)).length, 1);
  await s.commit(ns, [{ key: b.key, vector: [0, 1] }]);
  assert.equal((await s.vectors(ns)).length, 2);
});

test('paged vectors have the exact worker contract while source hydration preserves page provenance', async t => {
  const s = await fixture(t), a = segment('a'), b = segment('b');
  await s.sync(ns, source(), [a, b], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }, { key: b.key, vector: [0, 1] }]);
  const first = await s.vectors(ns, { limit: 1 });
  assert.equal(first.length, 1);
  assert.deepEqual(Object.keys(first[0]).sort(), ['id', 'paperKey', 'attachmentKey', 'kind', 'conversationId', 'encoded', 'dimensions', 'compact', 'norm'].sort());
  assert.equal(first[0].encoded, 'AACAPwAAAAA='); assert.deepEqual([...V.unpack(first[0].encoded, 2)], [1, 0]);
  const next = await s.vectors(ns, { afterId: first[0].id, limit: 1 });
  assert.equal(next.length, 1); assert.ok(next[0].id > first[0].id);
  assert.deepEqual(await s.vectors(ns, { afterId: next[0].id, limit: 1 }), []);
  assert.deepEqual(await s.sources(ns, [first[0].id]), [{ id: first[0].id, source: source(), encoded: 'AACAPwAAAAA=', dimensions: 2 }]);
  await assert.rejects(s.vectors(ns, { limit: 100000 }), /limit|page/i);
});

test('namespace clear never reuses association IDs and does not erase another namespace', async t => {
  const s = await fixture(t), a = segment('a');
  await s.configure(space('other')); await s.sync('other', source(2), [a], 's1'); await s.commit('other', [{ key: a.key, vector: [0, 1] }]);
  await s.sync(ns, source(), [a], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  const id = (await s.vectors(ns))[0].id, rev = (await s.stats(ns)).revision;
  await s.clear(ns);
  assert.ok((await s.stats(ns)).revision > rev);
  await s.sync(ns, source(), [a], 's2'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  assert.ok((await s.vectors(ns))[0].id > id);
  assert.equal((await s.vectors('other')).length, 1);
});

test('real file reopen restores safe pause control, pending work and completed vectors', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zma-vectors-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'vectors-v1.sqlite');
  assert.equal(typeof API.Store, 'function', 'resumable vector Store must exist');
  const a = segment('a'), b = segment('b');
  let s = new API.Store(connection(filename));
  try {
    await s.open(); await s.configure(space()); await s.sync(ns, source(), [a, b], 's1');
    await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
    await s.setControl(ns, { mode: 'full', paused: true, cursor: 'PAPER001', scanID: 's1', apiKey: 'secret', nested: { Key: 'secret' } });
  } finally { await s.close(); }
  s = new API.Store(connection(filename));
  try {
    await s.open(); await s.configure(space());
    assert.deepEqual(await s.control(ns), { mode: 'full', paused: true, cursor: 'PAPER001', scanID: 's1', completed: false });
    assert.deepEqual(await s.pending(ns), [b]); assert.equal((await s.vectors(ns)).length, 1);
  } finally { await s.close(); }
});

test('interrupted scans preserve untouched rows and only valid completed full-scan pruning removes them', async t => {
  const s = await fixture(t), a = segment('a');
  await s.sync(ns, source(), [a], 's1'); await s.sync(ns, source(2), [a], 's1'); await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  await s.sync(ns, source(), [a], 's2');
  await s.setControl(ns, { mode: 'full', paused: true, cursor: 'PAPER001', scanID: 's2' });
  await assert.rejects(s.prune(ns, 's2'), /scan|paused|complete/i);
  assert.equal((await s.vectors(ns)).length, 2);
  await s.setControl(ns, { mode: 'pilot', paused: false, cursor: '', scanID: 's2' });
  await assert.rejects(s.prune(ns, 's2'), /scan|full/i);
  await s.setControl(ns, { mode: 'full', paused: false, cursor: '', scanID: 's2' });
  await assert.rejects(s.prune(ns, 's2'), /scan|complete/i);
  await s.setControl(ns, { mode: 'full', paused: false, cursor: '', scanID: 's2', completed: true });
  let checks = 0;
  await assert.rejects(s.prune(ns, 's2', () => ++checks < 2), /cancel|stale|过期|取消/i);
  assert.equal((await s.vectors(ns)).length, 2);
  await s.prune(ns, 's2'); assert.equal((await s.vectors(ns)).length, 1);
  assert.equal((await s.sources(ns, [(await s.vectors(ns))[0].id]))[0].source.paperKey, 'PAPER001');
});


test('repeated identical segments share one embedding request while preserving distinct association positions', async t => {
  const s = await fixture(t), a = segment('repeated');
  await s.sync(ns, source(), [a, a], 's1');
  assert.deepEqual(await s.pending(ns), [a]);
  await s.commit(ns, [{ key: a.key, vector: [1, 0] }]);
  const rows = await s.vectors(ns);
  assert.equal(rows.length, 2); assert.notEqual(rows[0].id, rows[1].id);
  assert.equal((await s.stats(ns)).readySources, 1);
});

test('a future cancelled write cannot overlap a paused read or expose vectors that never commit', async t => {
  const db = connection(), s = new API.Store(db), a = segment('isolation');
  t.after(() => s.close());
  await s.open(); await s.configure(space()); await s.sync(ns, source(), [a], 's1');
  const before = await s.stats(ns);
  let releaseRead, signalRead, releaseWrite;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const readEntered = new Promise(resolve => { signalRead = resolve; });
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const query = db.queryAsync;
  let heldRead = false, wroteVector = false;
  db.queryAsync = async (sql, params) => {
    const result = await query(sql, params);
    if (!heldRead && /^SELECT libraryID,dimensions,model,revision,control FROM rag_spaces/.test(sql)) {
      heldRead = true;
      signalRead();
      await readGate;
    }
    if (/^UPDATE rag_vectors SET encoded=/.test(sql)) {
      wroteVector = true;
      await writeGate;
    }
    return result;
  };
  const read = s.vectors(ns);
  let rejectedWrite, rows, overlapped;
  try {
    await readEntered;
    let checks = 0;
    rejectedWrite = assert.rejects(s.commit(ns, [{ key: a.key, vector: [1, 0] }], () => ++checks < 2), /cancel|stale/i);
    // Flush runnable work without awaiting the UPDATE gate: on the fixed queue
    // that UPDATE must remain unreachable until this paused read completes.
    await new Promise(resolve => setImmediate(resolve));
    overlapped = wroteVector;
    releaseRead();
    rows = await read;
  } finally {
    releaseRead();
    releaseWrite();
    await Promise.allSettled([read, rejectedWrite]);
  }
  await rejectedWrite;
  assert.deepEqual(rows, [], 'a read must not publish a vector from a transaction that will roll back');
  assert.equal(overlapped, false, 'a future write must wait for the whole earlier read');
  assert.deepEqual(await s.vectors(ns), []);
  assert.deepEqual(await s.stats(ns), before, 'rollback must preserve the committed revision and counts');
  await s.commit(ns, [{ key: a.key, vector: [0, 1] }]);
  assert.equal((await s.vectors(ns)).length, 1, 'a rejected queued write must not poison later operations');
});
