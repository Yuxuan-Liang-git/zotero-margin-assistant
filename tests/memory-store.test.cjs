const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../src/memory-store.js');
const { Manager } = fs.existsSync(file) ? require(file) : {};

function fixture() {
  const caches = new Map();
  const records = new Map();
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const scope = { libraryID: 1, attachmentKey: 'BBBB1111' };
  const record = { fingerprint: 'v1', summaryValid: true, metadata: { title: '持续激励与辨识', year: '2025', doi: '' },
    state: { conversations: [{ id: 'old', title: 'B讨论', updatedAt: 1000, history: [
      { role: 'user', content: '持续激励有什么作用？' }, { role: 'assistant', content: '持续激励使信息矩阵正定，参数可辨识。', incomplete: false }
    ] }], readingSummary: { text: '# 文章内容\n\n持续激励是信息条件。', updatedAt: 1000 } } };
  records.set('1-BBBB1111', record);
  let foreground = false;
  let enabled = true;
  const adapter = {
    enabled: () => enabled, foreground: () => foreground, delay: 100000,
    list: async libraryID => [...records.keys()].filter(key => key.startsWith(libraryID + '-')).map(key => ({ libraryID, attachmentKey: key.split('-')[1] })),
    read: async target => copy(records.get(target.libraryID + '-' + target.attachmentKey)),
    readCatalog: async id => copy(caches.get('catalog-' + id)),
    writeCatalog: async (id, value) => { caches.set('catalog-' + id, copy(value)); },
    readDocument: async target => copy(caches.get('document-' + target.libraryID + '-' + target.attachmentKey)),
    writeDocument: async (target, value) => { caches.set('document-' + target.libraryID + '-' + target.attachmentKey, copy(value)); },
    notify: () => {}
  };
  return { caches, records, record, scope, adapter, create: () => new Manager(adapter),
    setForeground: value => { foreground = value; }, setEnabled: value => { enabled = value; } };
}
const target = { libraryID: 1, attachmentKey: 'AAAA1111' };

test('formal note export stays available while background indexing is paused', async () => {
  const f = fixture();
  const manager = f.create();
  try { manager.pause(); assert.match(await manager.export(1), /持续激励是信息条件/); }
  finally { await manager.stop(); }
});

test('backfilled memory is retrieved from another paper and restores from persistent cache', async () => {
  const f = fixture();
  const first = f.create();
  try {
    await first.rebuild(1);
    assert.ok((await first.retrieve(target, '持续激励', { conversationId: 'current' })).length > 0);
    assert.equal(first.status(1).indexed, 1);
  } finally { await first.stop(); }
  const second = f.create();
  try {
    await second.ensure(1);
    assert.equal((await second.retrieve(target, '持续激励'))[0].attachmentKey, 'BBBB1111');
  } finally { await second.stop(); }
});

test('deleted or altered source content is excluded before it can reach a model', async () => {
  const f = fixture();
  const manager = f.create();
  try {
    await manager.rebuild(1);
    f.record.state.conversations[0].history[1].content = '修改后只讨论其他内容。';
    f.record.state.readingSummary.text = '摘要已经被替换。';
    f.record.fingerprint = 'v2';
    assert.equal((await manager.retrieve(target, '持续激励')).length, 0);
    f.records.clear();
    assert.equal((await manager.retrieve(target, '持续激励')).length, 0);
  } finally { await manager.stop(); }
});

test('a manually edited summary is excluded while completed dialogue remains available', async () => {
  const f = fixture();
  const manager = f.create();
  try {
    await manager.rebuild(1);
    f.record.summaryValid = false;
    const sources = await manager.retrieve(target, '持续激励');
    assert.ok(sources.some(s => s.kind === 'dialogue'));
    assert.equal(sources.some(s => s.kind === 'summary'), false);
    assert.doesNotMatch(await manager.export(1), /持续激励是信息条件/);
  } finally { await manager.stop(); }
});

test('disabling memory prevents retrieval and a damaged catalog rebuilds from authoritative records', async () => {
  const f = fixture();
  f.caches.set('catalog-1', { version: 99, entries: 'bad' });
  const manager = f.create();
  try {
    await manager.rebuild(1);
    f.setEnabled(false);
    assert.equal((await manager.retrieve(target, '持续激励')).length, 0);
    f.setEnabled(true);
    assert.ok((await manager.retrieve(target, '持续激励')).length > 0);
  } finally { await manager.stop(); }
});

test('foreground work pauses indexing and stopping cancels a pending build', async () => {
  const f = fixture();
  const manager = f.create();
  try {
    f.setForeground(true);
    await manager.rebuild(1);
    assert.equal(f.caches.has('document-1-BBBB1111'), false);
    f.setForeground(false);
    await manager.resume();
    assert.ok((await manager.retrieve(target, '持续激励')).length > 0);
  } finally { await manager.stop(); }
  assert.equal(manager.status(1).phase, 'stopped');
});

test('a newer scheduled revision wins when an old read finishes late', async () => {
  const f = fixture();
  const manager = f.create();
  const original = f.adapter.read;
  let release;
  let waiting;
  const started = new Promise(resolve => { waiting = resolve; });
  f.adapter.read = async scope => {
    const snapshot = await original(scope);
    if (!release) { await new Promise(resolve => { release = resolve; waiting(); }); }
    return snapshot;
  };
  try {
    const rebuilding = manager.rebuild(1);
    await started;
    f.record.state.conversations[0].history[1].content = '新的持续激励结论要求满秩。';
    f.record.fingerprint = 'v2';
    manager.schedule(f.scope);
    release();
    await rebuilding;
    await manager.resume();
    const sources = await manager.retrieve(target, '持续激励满秩');
    assert.ok(sources.some(s => s.text.includes('新的持续激励结论')));
  } finally { await manager.stop(); }
});

test('formal note export includes a note whose large formula exceeds retrieval fragment limits', async () => {
  const f = fixture();
  f.record.state.conversations = [];
  f.record.state.readingSummary.text = '\\[' + 'x+'.repeat(1000) + '0\\]';
  const manager = f.create();
  try {
    const text = await manager.export(1);
    assert.ok(text.includes(f.record.state.readingSummary.text));
  } finally { await manager.stop(); }
});

test('candidate validation yields responsively for many fragments from one very long answer', async () => {
  const f = fixture();
  f.record.state.readingSummary.text = '';
  f.record.state.conversations[0].history[1].content = '持续激励使信息矩阵正定。'.repeat(100000);
  const manager = f.create();
  try {
    await manager.rebuild(1);
    let maximum = 0;
    let previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maximum = Math.max(maximum, now - previous); previous = now; }, 5);
    try {
      const sources = await manager.retrieve(target, '持续激励');
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(sources.length > 0);
      assert.ok(maximum < 180, 'heartbeat delay ' + maximum + ' ms');
    } finally { clearInterval(timer); }
  } finally { await manager.stop(); }
});

test('an indexing job paused during document persistence is retried after foreground work', async () => {
  const f = fixture();
  const manager = f.create();
  const write = f.adapter.writeDocument;
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  let first = true;
  f.adapter.writeDocument = async (...args) => {
    await write(...args);
    if (first) { first = false; await new Promise(resolve => { release = resolve; started(); }); }
  };
  try {
    const initial = manager.rebuild(1);
    await waiting;
    manager.pause();
    release();
    await initial;
    await manager.resume();
    assert.equal(manager.status(1).indexed, 1);
    assert.ok((await manager.retrieve(target, '持续激励')).length > 0);
  } finally { await manager.stop(); }
});

test('catalog cleanup and source updates commit serially with the latest deletion retained', async () => {
  const f = fixture();
  f.records.set('1-CCCC1111', JSON.parse(JSON.stringify(f.record)));
  const manager = f.create();
  try {
    await manager.rebuild(1);
    const write = f.adapter.writeCatalog;
    let concurrent = 0;
    let maximum = 0;
    let release;
    let started;
    const waiting = new Promise(resolve => { started = resolve; });
    let first = true;
    f.adapter.writeCatalog = async (...args) => {
      concurrent++; maximum = Math.max(maximum, concurrent);
      if (first) { first = false; await new Promise(resolve => { release = resolve; started(); }); }
      await write(...args);
      concurrent--;
    };
    f.record.fingerprint = 'updated';
    manager.schedule(f.scope);
    const updating = manager.resume();
    await waiting;
    f.records.delete('1-CCCC1111');
    const cleanup = manager.scan(1);
    await new Promise(resolve => setTimeout(resolve, 10));
    release();
    await Promise.all([updating, cleanup]);
    await manager.resume();
    assert.equal(maximum, 1);
    assert.deepEqual(f.caches.get('catalog-1').entries.map(entry => entry.attachmentKey), ['BBBB1111']);
  } finally { await manager.stop(); }
});
