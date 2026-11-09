const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { Index } = require('../src/library-index.js');
const M = require('../src/memory-core.js');
const file = require('node:path').resolve(__dirname, '../src/library-store.js');
const API = fs.existsSync(file) ? require(file) : {};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture() {
  assert.equal(typeof API.Manager, 'function', 'personal-library background manager must exist');
  const db = new DatabaseSync(':memory:');
  const index = new Index({
    queryAsync: async (sql, params = []) => /^\s*(SELECT|PRAGMA)/i.test(sql) ? db.prepare(sql).all(...params) : db.prepare(sql).run(...params),
    executeTransaction: async action => { db.exec('BEGIN'); try { const value = await action(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } },
    closeDatabase: async () => db.close()
  }, 1);
  let enabled = true, foreground = false;
  const paper = { key: 'PAPER001', libraryID: 1, title: 'Excitation', year: '', doi: '' };
  const base = { libraryID: 1, paperKey: paper.key, title: paper.title, year: '', doi: '', updatedAt: 0, fingerprint: M.signature('same') };
  const metadata = { ...base, key: 'metadata-PAPER001', sourceKey: 'PAPER001', attachmentKey: '', kind: 'metadata', text: 'An excitation abstract.' };
  const pdf = { ...base, key: 'pdf-PDF00001', sourceKey: 'PDF00001', attachmentKey: 'PDF00001', kind: 'pdf', size: 100, status: 'pending' };
  const records = [{ paper, units: [metadata, pdf] }];
  const calls = [];
  const adapter = {
    index, libraryID: 1, delay: 100000, enabled: () => enabled, foreground: () => foreground,
    discover: async function* () { for (const record of records) yield record; },
    valid: async value => value.fingerprint === base.fingerprint,
    validateSource: async source => source.fingerprint === base.fingerprint,
    readPDF: async (unit, options) => { calls.push(options.cacheOnly ? 'cache' : 'extract'); if (options.cacheOnly) return null; return { pages: (async function* () { yield { pageIndex: 2, text: 'Rare excitation evidence without previous dialogue.' }; })() }; }
  };
  const manager = new API.Manager(adapter);
  return { manager, adapter, index, records, paper, metadata, pdf, base, calls, setEnabled: value => { enabled = value; }, setForeground: value => { foreground = value; } };
}

test('background discovers metadata before any extraction and indexes papers without conversations', async () => {
  const f = fixture();
  try {
    f.adapter.readPDF = async (_unit, options) => {
      assert.equal((await f.index.status()).metadata, 2);
      if (options.cacheOnly) return null;
      return { pages: (async function* () { yield { pageIndex: 8, text: 'Unreaddoc excitation evidence.' }; })() };
    };
    f.records.push({ paper: { ...f.paper, key: 'PAPER002' }, units: [{ ...f.metadata, key: 'metadata-PAPER002', paperKey: 'PAPER002', sourceKey: 'PAPER002' }] });
    await f.manager.start(); await f.manager.run();
    const sources = await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'unreaddoc');
    assert.equal(sources[0].kind, 'pdf');
    assert.equal(sources[0].pageIndex, 8);
    assert.equal(f.manager.status().total, 2);
    assert.equal(f.manager.status().counts.ready, 1);
    assert.equal((await f.manager.retrieve({ libraryID: 2, attachmentKey: 'CURRENT1' }, 'unreaddoc')).length, 0);
  } finally { await f.manager.stop(); }
});

test('existing caches are processed before missing PDFs and big files never enter the worker', async () => {
  const f = fixture();
  const order = [];
  try {
    const big = { ...f.pdf, key: 'pdf-BIG00001', sourceKey: 'BIG00001', attachmentKey: 'BIG00001', size: 65 * 1024 * 1024 };
    f.records[0].units.push(big);
    f.adapter.readPDF = async (unit, options) => { order.push([unit.sourceKey, options.cacheOnly]); return null; };
    await f.manager.start(); await f.manager.run();
    assert.deepEqual(order, [['PDF00001', true], ['BIG00001', true], ['PDF00001', false]]);
    assert.equal(f.manager.status().counts.large, 1);
    assert.equal(f.manager.status().counts.failed, 1);
  } finally { await f.manager.stop(); }
});

test('a running worker may finish after pause but cannot publish and resume retries it', async () => {
  const f = fixture();
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  try {
    f.adapter.readPDF = async (_unit, options) => {
      if (options.cacheOnly) return null;
      entered(); await new Promise(resolve => { release = resolve; });
      return { pages: (async function* () { yield { pageIndex: 0, text: 'Cancelledtail excitation.' }; })() };
    };
    await f.manager.start(); const work = f.manager.run(); await enteredPromise;
    f.manager.pause(); release(); await work;
    assert.equal((await f.index.search('cancelledtail')).length, 0);
    assert.equal(f.manager.status().pending, 1);
    f.adapter.readPDF = async () => ({ pages: (async function* () { yield { pageIndex: 0, text: 'Resumedtail excitation.' }; })() });
    await f.manager.resume();
    assert.equal((await f.index.search('resumedtail')).length, 1);
  } finally { release?.(); await f.manager.stop(); }
});

test('edited sources are excluded immediately and only unchanged files commit', async () => {
  const f = fixture();
  try {
    await f.manager.start(); await f.manager.run();
    assert.equal((await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'rare excitation')).length > 0, true);
    f.adapter.validateSource = async () => false;
    assert.deepEqual(await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'rare excitation'), []);
    await f.manager.stop();
  } finally { if (!f.manager.stopped) await f.manager.stop(); }
});

test('scan, partial cache, missing and password states remain explicit after recovery', async () => {
  const f = fixture();
  try {
    f.records[0].units.push(...['SCAN0001', 'PART0001', 'MISS0001', 'PASS0001'].map(key => ({ ...f.pdf, key: 'pdf-' + key, sourceKey: key, attachmentKey: key, ...(key === 'MISS0001' ? { status: 'missing' } : {}) })));
    f.adapter.readPDF = async (unit, options) => {
      if (options.cacheOnly) return null;
      if (unit.sourceKey === 'PASS0001') return { status: 'password', pages: (async function* () {})() };
      return { pages: (async function* () { yield { pageIndex: 0, text: unit.sourceKey === 'SCAN0001' ? '' : 'Readable excitation text.' }; if (unit.sourceKey === 'PART0001') yield { pageIndex: 1, text: '' }; })() };
    };
    await f.manager.start(); await f.manager.run();
    assert.deepEqual(f.manager.status().counts, { ready: 1, ocr: 1, partial: 1, missing: 1, password: 1 });
    f.manager.refresh(); await tick(); await f.manager.run();
    assert.equal(f.manager.status().counts.password, 1);
  } finally { await f.manager.stop(); }
});

test('failed structured extraction preserves the previously committed partial text cache', async () => {
  const f = fixture();
  try {
    f.adapter.readPDF = async (_unit, options) => options.cacheOnly
      ? { status: 'partial', pages: (async function* () { yield { text: 'Validpartialunique excitation.' }; })() }
      : { pages: (async function* () { yield { pageIndex: 0, text: 'Uncommitted intermediate page.' }; throw Error('Page one extraction failed'); })() };
    await f.manager.start(); await f.manager.run();
    assert.equal(f.manager.status().counts.partial, 1);
    assert.equal((await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'validpartialunique')).length, 1);
    assert.equal((await f.index.search('uncommitted')).length, 0);
  } finally { await f.manager.stop(); }
});
