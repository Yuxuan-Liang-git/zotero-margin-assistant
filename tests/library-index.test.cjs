const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const M = require('../src/memory-core.js');
const file = require('node:path').resolve(__dirname, '../src/library-index.js');
const API = fs.existsSync(file) ? require(file) : {};

function connection(name = ':memory:') {
  const db = new DatabaseSync(name);
  return {
    queryAsync: async (sql, params = []) => { if (/\bLIKE\s*'/i.test(sql)) throw Error('Please enter a LIKE clause with bindings'); return /^\s*(SELECT|PRAGMA)/i.test(sql) ? db.prepare(sql).all(...params) : db.prepare(sql).run(...params); },
    executeTransaction: async action => { db.exec('BEGIN IMMEDIATE'); try { const value = await action(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } },
    closeDatabase: async () => db.close()
  };
}
async function fixture() {
  assert.equal(typeof API.Index, 'function', 'paper-text index must exist');
  const index = new API.Index(connection(), 1);
  await index.open();
  return index;
}
const paper = key => ({ key, title: 'Persistent excitation ' + key, year: '2025', doi: '', libraryID: 1 });
const unit = (paperKey, key = 'PDF00001', fingerprint = '1111111122222222') => ({
  key: 'pdf-' + key, paperKey, sourceKey: key, attachmentKey: key, kind: 'pdf', fingerprint,
  title: 'Persistent excitation ' + paperKey, year: '2025', doi: '', libraryID: 1, status: 'ready', updatedAt: 0
});
test('coverage works with the native SQLite requirement for bound LIKE operands', async () => {
  const index = await fixture();
  try { assert.equal((await index.status()).total, 0); }
  finally { await index.close(); }
});
async function put(index, value, text, pageIndex = 0) {
  const generation = await index.beginUnit(value);
  await index.append(value, generation, [{ text, pageIndex, part: 0 }]);
  await index.commitUnit(value, generation);
}

test('paper index retrieves rare words on the last page and never exposes a staging generation', async () => {
  const index = await fixture();
  try {
    await index.replacePaper(paper('PAPER001'));
    const value = unit('PAPER001');
    const generation = await index.beginUnit(value);
    for (let i = 0; i < 180; i++) await index.append(value, generation, [{ text: 'Ordinary observer text '.repeat(70), pageIndex: i, part: 0 }]);
    await index.append(value, generation, [{ text: 'Tailonlyquasar guarantees excitation.', pageIndex: 180, part: 0 }]);
    assert.deepEqual(await index.search('tailonlyquasar'), []);
    await index.commitUnit(value, generation);
    const sources = await index.search('tailonlyquasar');
    assert.equal(sources.length, 1);
    assert.equal(sources[0].pageIndex, 180);
    assert.match(sources[0].text, /Tailonlyquasar/);
    assert.equal(M.cleanSources(sources)[0].sourceKey, 'PDF00001');
    assert.equal((await index.search('tailonlyquasar\nCurrent paper identifiability question'))[0]?.pageIndex, 180);
  } finally { await index.close(); }
});

test('metadata-only discovery covers over 2000 papers without collection duplicates', async () => {
  const index = await fixture();
  try {
    for (let i = 0; i < 2005; i++) await index.replacePaper(paper('P' + String(i).padStart(7, '0')));
    await index.replacePaper(paper('P0002004'));
    const value = { ...unit('P0002004'), key: 'metadata-P0002004', sourceKey: 'P0002004', attachmentKey: '', kind: 'metadata' };
    await put(index, value, 'A rare bibliographic abstract about finalcatalogtail.');
    assert.equal((await index.status()).total, 2005);
    assert.equal((await index.search('finalcatalogtail'))[0].paperKey, 'P0002004');
    await index.prune(new Set(['P0002004']));
    assert.equal((await index.status()).total, 1);
  } finally { await index.close(); }
});

test('replacement, cancellation, unit removal and restart cleanup preserve authority', async () => {
  const index = await fixture();
  try {
    await index.replacePaper(paper('PAPER001'));
    const value = unit('PAPER001');
    await put(index, value, 'Original authoritative excitation.');
    const changed = { ...value, fingerprint: '2222222233333333' };
    const generation = await index.beginUnit(changed);
    await index.append(changed, generation, [{ text: 'Replacement excitation.', part: 0 }]);
    assert.equal((await index.search('authoritative')).length, 0, 'changed files invalidate old content before extraction completes');
    await assert.rejects(index.commitUnit(changed, generation, () => false), /取消|过期/);
    assert.equal((await index.search('replacement')).length, 0);
    await index.open();
    assert.equal((await index.search('replacement')).length, 0);
    await put(index, changed, 'Replacement excitation.');
    assert.equal((await index.search('replacement')).length, 1);
    await index.removeUnits('PAPER001', new Set());
    assert.equal((await index.search('replacement')).length, 0);
  } finally { await index.close(); }
});

test('a rare question keyword survives more than 96 repeated current-context distractors', async () => {
  const index = await fixture();
  try {
    await index.replacePaper(paper('PAPER001')); await index.replacePaper(paper('PAPER002'));
    const noise = unit('PAPER001');
    const generation = await index.beginUnit(noise);
    for (let i = 0; i < 100; i++) await index.append(noise, generation, [{ text: 'Observer excitation '.repeat(8), part: i, pageIndex: i }]);
    await index.commitUnit(noise, generation);
    await put(index, unit('PAPER002', 'PDF00002'), 'Tailonlyquasar result.', 900);
    const sources = await index.search('Tailonlyquasar\nObserver excitation', { question: 'Tailonlyquasar' });
    assert.ok(sources.some(source => source.paperKey === 'PAPER002' && source.pageIndex === 900));
  } finally { await index.close(); }
});

module.exports = { connection, paper, unit, put };

test('committed source enumeration is paged and hides staging rows',async()=>{const index=await fixture();try{await index.replacePaper(paper('PAPER001'));const u=unit('PAPER001');const generation=await index.beginUnit(u);await index.append(u,generation,[{text:'First committed source',part:0,pageIndex:0},{text:'Second committed source',part:1,pageIndex:1}]);assert.equal(typeof index.sourcesPage,'function','committed source page API must exist');assert.deepEqual((await index.sourcesPage({limit:1})).sources,[]);await index.commitUnit(u,generation);const first=await index.sourcesPage({limit:1});assert.equal(first.sources[0].source.text,'First committed source');assert.equal(first.sources[0].phase,'library');const second=await index.sourcesPage({afterId:first.cursor,limit:1});assert.equal(second.sources[0].source.pageIndex,1);assert.equal((await index.sourcesPage({afterId:second.cursor,limit:1})).sources.length,0);}finally{await index.close();}});
