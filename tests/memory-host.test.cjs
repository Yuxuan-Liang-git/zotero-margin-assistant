const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/core.js');
const MC = require('../src/memory-core.js');
const file = path.resolve(__dirname, '../src/memory-host.js');
const MH = fs.existsSync(file) ? require(file) : {};

function fixture() {
  const files = new Map();
  const preferences = new Map();
  const writes = [];
  const item = { id: 2, libraryID: 1, key: 'BBBB1111', parentID: 10, isPDFAttachment: () => true, getFilePathAsync: async () => '/pdf/B/paper.pdf' };
  const note = { deleted: false, libraryID: 1, parentID: 10, isNote: () => true, getNote: () => 'original note' };
  const state = C.emptyState();
  state.conversations[0].history = [{ role: 'user', content: '持续激励' }, { role: 'assistant', content: '持续激励使信息矩阵正定。' }];
  files.set('/data/margin-comments-assistant/1-BBBB1111.json', JSON.stringify(state));
  const host = {
    directory: '/data/margin-comments-assistant', panels: new Map(), activeRequests: new Set(), transferTasks: new Map(), running: true,
    Z: { Libraries: { userLibraryID: 1 }, Prefs: { get: key => preferences.get(key), set: (key, value) => preferences.set(key, value) },
      Search: class { addCondition(field, operator, value) { assert.deepEqual([field, operator, value], ['itemType', 'is', 'attachment']); } async search() { return [2]; } },
      Items: { get: id => id === 10 ? { getField: field => ({ title: 'B论文的激励条件', date: '2025', DOI: '10.2/B' })[field] || '' } : item,
        getAsync: async ids => ids.map(() => item), getByLibraryAndKey: (_id, key) => key === 'NOTE1111' ? note : key === item.key ? item : null } },
    IO: { exists: async name => files.has(name), stat: async name => ({ size: Buffer.byteLength(files.get(name) || ''), lastModified: 1 }),
      readUTF8: async name => { if (!files.has(name)) throw Error('missing'); return files.get(name); }, makeDirectory: async () => {},
      writeUTF8: async (name, text, options) => { writes.push({ name, options }); files.set(name, text); } },
    P: { join: (...parts) => parts.join('/'), parent: name => path.posix.dirname(name) },
    load: async () => { throw Error('indexing must use a read-only path'); },
    newAbortController: () => new AbortController(), scope: reader => ({ libraryID: 1, attachmentKey: reader.itemID === 2 ? 'BBBB1111' : 'AAAA1111' }),
    readingSummaryContext: () => ({ title: 'B论文的激励条件', year: '2025', doi: '10.2/B' }),
    writeConversationFile: async (text, extension, title) => { files.set('/export/' + title + '.' + extension, text); return true; }
  };
  return { host, files, writes, preferences, item, note, state };
}

test('Zotero memory enumerates attachments and reads legacy histories without writes or UI load side effects', async () => {
  const f = fixture();
  const memory = MH.create(f.host);
  try {
    const scopes = await memory.adapter.list(1);
    assert.deepEqual(scopes, [{ libraryID: 1, attachmentKey: 'BBBB1111' }]);
    const record = await memory.adapter.read(scopes[0]);
    assert.equal(record.metadata.title, 'B论文的激励条件');
    assert.match(record.state.conversations[0].history[1].content, /信息矩阵/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.files.has('/pdf/B/margin-comments-assistant-1-BBBB1111.json'), false);
  } finally { await memory.stop(); }
});

test('sidecar authority and manual summary edit detection are checked against actual Zotero items', async () => {
  const f = fixture();
  f.state.readingSummary = { version: 1, formatVersion: 2, text: '正式摘要', noteKey: 'NOTE1111', noteHTML: 'original note' };
  const sidecar = '/pdf/B/margin-comments-assistant-1-BBBB1111.json';
  f.files.set(sidecar, JSON.stringify(f.state));
  const memory = MH.create(f.host);
  try {
    assert.equal((await memory.adapter.read({ libraryID: 1, attachmentKey: 'BBBB1111' })).summaryValid, true);
    f.note.getNote = () => 'manually rewritten note';
    assert.equal((await memory.adapter.read({ libraryID: 1, attachmentKey: 'BBBB1111' })).summaryValid, false);
    f.item.deleted = true;
    assert.equal(await memory.adapter.read({ libraryID: 1, attachmentKey: 'BBBB1111' }), null);
  } finally { await memory.stop(); }
});

test('oversized input is rejected before parsing and cache writes use a controlled atomic path', async () => {
  const f = fixture();
  const memory = MH.create(f.host);
  try {
    f.host.IO.stat = async () => ({ size: 17 * 1024 * 1024, lastModified: 1 });
    await assert.rejects(memory.adapter.read({ libraryID: 1, attachmentKey: 'BBBB1111' }), /16 MiB/);
    const doc = await MC.buildDocument({ libraryID: 1, attachmentKey: 'BBBB1111' }, f.state, { title: 'B' });
    await memory.adapter.writeDocument({ libraryID: 1, attachmentKey: 'BBBB1111' }, doc);
    assert.equal(f.writes[0].name, '/data/margin-comments-assistant/research-memory/1/BBBB1111.json');
    assert.equal(f.writes[0].options.tmpPath, f.writes[0].name + '.tmp');
    await assert.rejects(memory.adapter.writeDocument({ libraryID: 1, attachmentKey: '../oops' }, doc), /标识|来源/);
  } finally { await memory.stop(); }
});

test('memory preference persists independently of credentials', async () => {
  const f = fixture();
  const memory = MH.create(f.host);
  try { await memory.settingsAPI().set(false); } finally { await memory.stop(); }
  const restored = MH.create(f.host);
  try {
    assert.equal(restored.settingsAPI().state().enabled, false);
    assert.equal(f.preferences.size, 1);
  } finally { await restored.stop(); }
});

test('enabling after a disabled startup backfills other papers without a manual rebuild', async () => {
  const f = fixture();
  f.preferences.set('margincomments.researchMemory', false);
  const memory = MH.create(f.host);
  try {
    await memory.ensure(1);
    memory.forReader({ itemID: 1 });
    await Promise.resolve();
    await memory.settingsAPI().set(true);
    await memory.resume();
    const sources = await memory.retrieve({ libraryID: 1, attachmentKey: 'AAAA1111' }, '持续激励');
    assert.ok(sources.some(source => source.attachmentKey === 'BBBB1111'));
  } finally { await memory.stop(); }
});

test('a generic current-PDF question skips cross-paper lookup even when the expanded query contains a paper title', async () => {
  const f = fixture();
  f.state.conversations[0].history[0].content = '这篇论文讲了啥？';
  f.state.conversations[0].history[1].content = '持续激励条件要求信息矩阵正定。';
  f.files.set('/data/margin-comments-assistant/1-BBBB1111.json', JSON.stringify(f.state));
  const memory = MH.create(f.host);
  try {
    await memory.rebuild(1);
    const sources = await memory.retrieve({ libraryID: 1, attachmentKey: 'AAAA1111' },
      '这篇论文讲了啥？\nB论文的激励条件', { question: '这篇论文讲了啥？', conversationId: 'default' });
    assert.deepEqual(sources, []);
    const topical = await memory.retrieve({ libraryID: 1, attachmentKey: 'AAAA1111' },
      '激励条件', { question: '激励条件', conversationId: 'default' });
    assert.ok(topical.some(source => source.attachmentKey === 'BBBB1111'));
  } finally { await memory.stop(); }
});

test('memory host carries dense-only committed PDF into final request without lexical reranking',async()=>{const{connection,worker}=require('./rag-fixture.cjs');const{webcrypto}=require('node:crypto');const f=fixture();f.state.conversations[0].history=[];f.files.set('/data/margin-comments-assistant/1-BBBB1111.json',JSON.stringify(f.state));f.item.parentID=0;f.item.getField=name=>({title:'Observer body',date:'2025'})[name]||'';f.files.set('/pdf/B/paper.pdf','PDF body placeholder');const sent=[];f.host.Z.DBConnection=class{constructor(){Object.assign(this,connection());}};f.host.Z.OSKeyStore={encrypt:async()=> 'oskv1:fixturecipher',decrypt:async()=> 'fixture-key'};f.host.runtimeWindow=()=>({crypto:webcrypto,Worker:function(){},TextEncoder,TextDecoder,URL,fetch:async(_url,init)=>{const body=JSON.parse(init.body);sent.push(body.input);return new Response(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[1,0]}))}));}});f.host.createRAGWorker=worker;const memory=MH.create(f.host);try{await memory.start();assert.ok(memory.embedding,'optional RAG manager should be wired on capable platform');await memory.papers.ensure();let record;for await(const entry of memory.papers.adapter.discover(new AbortController().signal)){record=entry;break;}const unit=record.units.find(u=>u.kind==='pdf');await memory.papers.index.replacePaper(record.paper);const gen=await memory.papers.index.beginUnit(unit);await memory.papers.index.append(unit,gen,[{text:'Persistent excitation guarantees information.',part:0,pageIndex:12}]);await memory.papers.index.commitUnit(unit,gen);const api=memory.embedding.settingsAPI();await api.apply({key:'fixture-key'});await api.test();await api.setEnabled(true);assert.equal(sent.length,1);await api.build();await memory.embedding.work;memory.pause();const sources=await memory.retrieve({libraryID:1,attachmentKey:'AAAA1111'},'持续激励保证辨识吗？',{question:'持续激励保证辨识吗？',conversationId:'default'});assert.equal(sources.length,1);assert.equal(sources[0].kind,'pdf');assert.equal(sources[0].pageIndex,12);assert.equal(sources[0].attachmentKey,'BBBB1111');assert.match(MC.appendContext([{role:'user',content:'Question'}],sources).messages[0].content,/Persistent excitation/);}finally{await memory.stop();}});
