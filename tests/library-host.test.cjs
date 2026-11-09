const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const file = path.resolve(__dirname, '../src/library-host.js');
const API = fs.existsSync(file) ? require(file) : {};

function fixture() {
  assert.equal(typeof API.create, 'function', 'personal-library Zotero adapter must exist');
  const files = new Map([['/pdf/b.pdf', { text: 'binary PDF', size: 100, lastModified: 100 }], ['/pdf/c.pdf', { text: 'binary PDF', size: 100, lastModified: 100 }]]);
  const item = (id, key, fields = {}) => ({ id, key, libraryID: 1, deleted: false, isRegularItem: () => true,
    getField: field => fields[field] || '', getCreators: () => [{ firstName: 'Jane', lastName: 'Doe' }], getTags: () => [{ tag: 'observer' }], getNotes: () => [], getAttachments: () => [] });
  const parent = item(10, 'PAPER001', { title: 'Persistent Excitation', date: '2025-06', DOI: '10.2/test', abstractNote: 'Rare metadataabstract excitation condition.' });
  const standalone = item(20, 'PAPER002', { title: 'Metadata only', abstractNote: 'Onlyabstract observer evidence.' });
  const pdf = { ...item(2, 'PDF00001'), parentID: 10, isRegularItem: () => false, isPDFAttachment: () => true, getFilePathAsync: async () => '/pdf/b.pdf', getAnnotations: () => [annotation] };
  const pdf2 = { ...pdf, id: 3, key: 'PDF00002', getAnnotations: () => [], getFilePathAsync: async () => '/pdf/c.pdf' };
  const note = { ...item(4, 'NOTE0001'), parentID: 10, isRegularItem: () => false, isNote: () => true, getNote: () => '<p>Notebookrare excitation proof &amp; formula \\(J>0\\).</p>' };
  const shortcut = { ...note, id: 5, key: 'SHORT001', getNote: () => '<p>zma-history://1/PDF00001</p>' };
  const annotation = { ...item(6, 'ANNOT001'), parentID: 2, isRegularItem: () => false, isAnnotation: () => true,
    annotationType: 'highlight', annotationText: 'Markedrare excitation condition.', annotationComment: 'My margin explanation.', annotationPosition: JSON.stringify({ pageIndex: 4, rects: [[1, 2, 30, 40]] }) };
  parent.getNotes = () => [4, 5]; parent.getAttachments = () => [2, 3];
  const items = new Map([parent, standalone, pdf, pdf2, note, shortcut, annotation].map(value => [value.id, value]));
  const opened = [], workers = [];
  const Z = {
    Libraries: { userLibraryID: 1 },
    DBConnection: class {
      constructor() { this.db = new DatabaseSync(':memory:'); }
      async queryAsync(sql, params = []) { return /^\s*(SELECT|PRAGMA)/i.test(sql) ? this.db.prepare(sql).all(...params) : this.db.prepare(sql).run(...params); }
      async executeTransaction(action) { this.db.exec('BEGIN'); try { const value = await action(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
      async closeDatabase() { this.db.close(); }
    },
    Items: { getAll: async libraryID => { assert.equal(libraryID, 1); return [...items.keys(), 10]; }, getAsync: async ids => Array.isArray(ids) ? ids.map(id => items.get(id)) : items.get(ids), get: id => items.get(id), getByLibraryAndKey: (libraryID, key) => [...items.values()].find(value => value.libraryID === libraryID && value.key === key) },
    Fulltext: { getItemCacheFile: attachment => ({ path: '/cache/' + attachment.key }), getPages: async () => ({ indexedPages: 1, total: 2 }) },
    SDT: { getPack: async id => { workers.push(id); return { ok: true }; }, getReader: async () => ({ getCatalog: async () => ({ pages: [{}, {}] }), getPageBlocks: async pageIndex => [{ type: 'paragraph', content: [{ text: pageIndex === 0 ? 'Structuredrare excitation text.' : 'Lastpageunique result.' }] }] }) },
    Reader: { open: async (id, location) => { opened.push({ id, location }); return { _initPromise: Promise.resolve() }; } },
    getMainWindow: () => ({ ZoteroPane: { selectItem: async id => opened.push({ item: id }), openNote: async id => opened.push({ note: id }) } }),
    logError: error => { throw error; }
  };
  const host = { Z, running: true, directory: '/data/margin-comments-assistant', activeRequests: new Set(), transferTasks: new Map(), newAbortController: () => new AbortController(),
    IO: { exists: async name => files.has(name), stat: async name => { const value = files.get(name); if (!value) throw Error('missing file'); return { size: value.size, lastModified: value.lastModified }; },
      readUTF8: async name => files.get(name).text, makeDirectory: async () => {} }, P: { join: (...parts) => parts.join('/'), parent: path.posix.dirname } };
  host.openPDF = (attachment, location) => require('../src/host.js').Host.prototype.openPDF.call(host, attachment, location);
  const options = { enabled: () => true };
  const manager = API.create(host, options);
  manager.adapter.delay = 100000;
  return { host, manager, options, Z, files, items, parent, pdf, pdf2, note, annotation, opened, workers };
}

test('unreadable PDFs and damaged history pointers do not block the rest of the library', async () => {
  const f = fixture();
  try {
    const stat = f.host.IO.stat;
    f.host.IO.stat = async name => { if (name === '/pdf/b.pdf') throw Error('File access denied'); return stat(name); };
    f.options.canonicalSummary = async () => { throw Error('Damaged old history'); };
    await f.manager.start(); await f.manager.run();
    assert.equal(f.manager.status().total, 2);
    assert.equal(f.manager.status().counts.failed, 1);
    assert.equal(f.manager.status().counts.ready, 1);
    assert.ok((await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'notebookrare')).some(s => s.kind === 'note'));
  } finally { await f.manager.stop(); }
});

test('all personal collections yield distinct papers, versions, real notes and annotations without history shortcuts', async () => {
  const f = fixture();
  try {
    const records = [];
    for await (const record of f.manager.adapter.discover()) records.push(record);
    assert.equal(records.length, 2);
    assert.equal(records[0].units.filter(unit => unit.kind === 'pdf').length, 2);
    assert.equal(records[0].units.filter(unit => unit.kind === 'note').length, 1);
    assert.match(records[0].units.find(unit => unit.kind === 'note').text, /J>0/);
    assert.match(records[0].units.find(unit => unit.kind === 'annotation').text, /My margin explanation/);
    assert.match(records[0].units.find(unit => unit.kind === 'metadata').text, /Jane Doe.*2025/s);
    assert.equal(records[0].units.some(unit => unit.sourceKey === 'SHORT001'), false);
  } finally { await f.manager.stop(); }
});

test('native structured pages work without opening a reader and source buttons target PDF, note and item', async () => {
  const f = fixture();
  try {
    await f.manager.start(); await f.manager.run();
    const scope = { libraryID: 1, attachmentKey: 'CURRENT1' };
    const pdf = (await f.manager.retrieve(scope, 'lastpageunique'))[0];
    assert.equal(pdf.pageIndex, 1);
    assert.equal(f.opened.length, 0);
    await f.manager.openSource(pdf);
    assert.equal(f.opened[0].location.pageIndex, 1);
    await f.manager.openSource((await f.manager.retrieve(scope, 'notebookrare'))[0]);
    assert.equal(f.opened.at(-1).note, 4);
    await f.manager.openSource((await f.manager.retrieve(scope, 'onlyabstract'))[0]);
    assert.equal(f.opened.at(-1).item, 20);
  } finally { await f.manager.stop(); }
});

test('annotation sources retain reliable page numbers and PDF navigation waits for reader readiness', async () => {
  const f = fixture();
  let release;
  try {
    await f.manager.start(); await f.manager.run();
    const scope = { libraryID: 1, attachmentKey: 'CURRENT1' };
    const annotation = (await f.manager.retrieve(scope, 'markedrare'))[0];
    assert.equal(annotation.pageIndex, 4);
    const pdf = (await f.manager.retrieve(scope, 'lastpageunique'))[0];
    const ready = new Promise(resolve => { release = resolve; });
    let entered, settled = false;
    const opened = new Promise(resolve => { entered = resolve; });
    f.Z.Reader.open = async () => { entered(); return { _initPromise: ready }; };
    const navigation = f.manager.openSource(pdf).then(() => { settled = true; });
    await opened; await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(settled, false);
    release(); await navigation; assert.equal(settled, true);
  } finally { release?.(); await f.manager.stop(); }
});

test('cold-restored unloaded PDF tabs may return no reader until asynchronous restoration completes', async () => {
  const f = fixture();
  try {
    await f.manager.start(); await f.manager.run();
    const source = (await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'lastpageunique'))[0];
    const attachment = f.items.get(source.sourceKey === 'PDF00001' ? 2 : 3);
    let ready = false;
    f.Z.Reader._readers = [];
    f.Z.Reader.open = async () => { setTimeout(() => { f.Z.Reader._readers.push({ itemID: attachment.id, _initPromise: Promise.resolve().then(() => { ready = true; }) }); }, 20); return undefined; };
    await f.manager.openSource(source);
    assert.equal(ready, true);
    assert.equal(f.Z.Reader._readers.length, 1);
  } finally { await f.manager.stop(); }
});

test('file and note edits invalidate saved sources and forged excerpts never navigate', async () => {
  const f = fixture();
  try {
    await f.manager.start(); await f.manager.run();
    const scope = { libraryID: 1, attachmentKey: 'CURRENT1' };
    const pdf = (await f.manager.retrieve(scope, 'lastpageunique'))[0];
    f.files.get(pdf.sourceKey === 'PDF00001' ? '/pdf/b.pdf' : '/pdf/c.pdf').lastModified++;
    await assert.rejects(f.manager.openSource(pdf), /变更|重新/);
    const source = (await f.manager.retrieve(scope, 'notebookrare'))[0];
    await assert.rejects(f.manager.openSource({ ...source, text: 'invented', signature: require('../src/memory-core.js').signature('invented') }), /变更|重新/);
    f.note.getNote = () => '<p>Changed notebook</p>';
    await assert.rejects(f.manager.openSource(source), /变更|重新/);
    assert.equal(f.opened.length, 0);
  } finally { await f.manager.stop(); }
});

test('large files reuse valid partial caches and remain outside native worker extraction', async () => {
  const f = fixture();
  try {
    f.files.get('/pdf/b.pdf').size = 65 * 1024 * 1024;
    f.files.set('/cache/PDF00001', { text: 'Existingcachedrare excitation.', size: 32, lastModified: 101 });
    f.files.get('/pdf/c.pdf').size = 65 * 1024 * 1024;
    await f.manager.start(); await f.manager.run();
    assert.equal(f.workers.length, 0);
    assert.equal(f.manager.status().counts.partial, 1);
    assert.equal(f.manager.status().counts.large, 1);
    const source = (await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'existingcachedrare'))[0];
    assert.equal(source.pageIndex, undefined, 'native plain cache has no reliable page boundaries');
  } finally { await f.manager.stop(); }
});

test('a native full-text cache with matching form-feed page boundaries preserves the last-page location', async () => {
  const f = fixture();
  try {
    f.files.set('/cache/PDF00001', { text: 'Opening cached page.\fSecond cached page.\fCachedtailneedle excitation.', size: 73, lastModified: 101 });
    f.Z.Fulltext.getPages = async () => ({ indexedPages: 3, total: 3 });
    await f.manager.start(); await f.manager.run();
    const source = (await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'cachedtailneedle'))[0];
    assert.equal(source.pageIndex, 2);
    assert.equal(source.text, 'Cachedtailneedle excitation.');
    assert.equal(f.workers.includes(2), false);
  } finally { await f.manager.stop(); }
});

test('native cache edits invalidate old provenance and refresh the actual indexed text', async () => {
  const f = fixture();
  try {
    f.files.get('/pdf/b.pdf').size = 65 * 1024 * 1024;
    f.files.set('/cache/PDF00001', { text: 'Cacheoriginalunique excitation.', size: 32, lastModified: 101 });
    await f.manager.start(); await f.manager.run();
    const scope = { libraryID: 1, attachmentKey: 'CURRENT1' };
    const original = (await f.manager.retrieve(scope, 'cacheoriginalunique'))[0];
    f.files.set('/cache/PDF00001', { text: 'Cachechangedunique excitation.', size: 31, lastModified: 102 });
    assert.equal(await f.manager.adapter.validateSource(original), false);
    f.manager.refresh(); await f.manager.run();
    assert.equal((await f.manager.retrieve(scope, 'cachechangedunique'))[0]?.sourceKey, 'PDF00001');
  } finally { await f.manager.stop(); }
});

test('finishing or failing conversation transfer wakes foreground-preempted library jobs', async () => {
  const { Host } = require('../src/host.js');
  const C = require('../src/core.js'), T = require('../src/transfer.js');
  for (const fail of [false, true]) {
    const f = fixture(); let releaseRead, releaseSave;
    try {
      let enteredRead, enteredSave;
      const readStarted = new Promise(resolve => { enteredRead = resolve; });
      const saveStarted = new Promise(resolve => { enteredSave = resolve; });
      const read = f.manager.adapter.readPDF;
      f.manager.adapter.readPDF = async (unit, options) => { if (!options.cacheOnly && !releaseRead) { enteredRead(); await new Promise(resolve => { releaseRead = resolve; }); } return read(unit, options); };
      f.host.scope = () => ({ libraryID: 1, attachmentKey: 'CURRENT1' });
      const state = C.emptyState(); f.host.load = async () => state;
      f.host.store = { save: async () => { enteredSave(); await new Promise(resolve => { releaseSave = resolve; }); if (fail) throw Error('Transfer save failed'); } };
      f.host.memory = { schedule() {}, resume: () => f.manager.resume() };
      await f.manager.start(); const work = f.manager.run(); await readStarted;
      const transfer = Host.prototype.importConversation.call(f.host, { itemID: 2 }, T.parseText('用户：问题\n助手：解释'));
      const outcome = transfer.catch(() => {}); await saveStarted;
      releaseRead(); await work;
      assert.ok(f.manager.status().pending > 0);
      releaseSave(); await outcome;
      for (let i = 0; i < 80 && f.manager.status().pending; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(f.manager.status().pending, 0, 'indexing must resume after the final import settles');
      assert.ok((await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'lastpageunique')).length);
    } finally { releaseRead?.(); releaseSave?.(); await f.manager.stop(); }
  }
});

test('stale caches are excluded and password-required native responses get their own status', async () => {
  const f = fixture();
  try {
    f.files.set('/cache/PDF00001', { text: 'Stalecacheword excitation.', size: 32, lastModified: 1 });
    f.Z.SDT.getPack = async () => ({ ok: false, reason: 'password-required' });
    await f.manager.start(); await f.manager.run();
    assert.equal(f.manager.status().counts.password, 2);
    assert.equal((await f.manager.retrieve({ libraryID: 1, attachmentKey: 'CURRENT1' }, 'stalecacheword')).length, 0);
  } finally { await f.manager.stop(); }
});
