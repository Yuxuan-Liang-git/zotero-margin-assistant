const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = fs.existsSync(__dirname + '/../src/core.js') ? require('../src/core.js') : {};
const source = { libraryID: 1, attachmentKey: 'ABCD1234', annotationKey: 'FORM0630', pageIndex: 65, pageLabel: '60', rects: [[10,20,90,50]], fingerprint: 'v1' };

test('quote comments and exact LaTeX survive JSON round trips per conversation without changing old histories',()=>{
 const state=C.emptyState(),first=C.activeConversation(state);first.history=[{role:'assistant',content:'原回答',materials:[]}];first.draftQuotes=[{id:'quote-1',text:'公式 \\(x=1\\)',comment:'为何成立？',messageIndex:0,start:2,end:7}];const second=C.createConversation(state);second.draft='另一会话';const restored=C.cleanState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.conversations[0].draftQuotes,first.draftQuotes);assert.equal(restored.conversations[1].draftQuotes,undefined);assert.equal(restored.conversations[0].history[0].content,'原回答');const legacy=C.emptyState();assert.equal(C.cleanState(legacy).conversations[0].draftQuotes,undefined);
 const corrupt=JSON.parse(JSON.stringify(state));corrupt.conversations[0].draftQuotes[0].messageIndex=900;assert.throws(()=>C.cleanState(corrupt),/批注草稿/);
});
test('number aliases find the same source but respect type and attachment', () => {
  assert.equal(typeof C.normalizeNumber, 'function');
  for (const value of ['6.30', '(6.30)', '公式（6.30）', ' 公式 ( 6.30 ) ']) assert.equal(C.normalizeNumber(value), '6.30');
  const idx = new C.ReferenceIndex([]);
  idx.add({ ...source, type: '公式', number: '(6.30)' });
  assert.equal(idx.find(source, '公式(6.30)').length, 1);
  assert.equal(idx.find({ ...source, attachmentKey: 'OTHERPDF' }, '6.30').length, 0);
  assert.equal(idx.find(source, '6.30', '图').length, 0);
});
test('duplicate numbering yields candidates and deleting index preserves another source', () => {
  assert.equal(typeof C.ReferenceIndex, 'function');
  const idx = new C.ReferenceIndex([]);
  const one = idx.add({...source, type:'公式',number:'6.30'});
  idx.add({...source, annotationKey:'FORMNEW2',pageIndex:70,type:'公式',number:'6.30'});
  assert.equal(idx.find(source,'6.30').length,2);
  idx.remove(one.id);
  assert.equal(idx.find(source,'6.30')[0].annotationKey,'FORMNEW2');
  assert.throws(() => idx.add({...source,rects:[[NaN,1,2,3]],type:'公式',number:'3'}));
});
test('source links allow only native PDF locations and encode actual page index', () => {
  assert.equal(typeof C.sourceLink, 'function');
  const link=C.sourceLink(source);
  assert.equal(link,'zotero://open-pdf/library/items/ABCD1234?page=66&annotation=FORM0630');
  assert.equal(C.parseSourceLink(link).pageIndex,65);
  assert.equal(C.sourceLink(source,42),'zotero://open-pdf/groups/42/items/ABCD1234?page=66&annotation=FORM0630');
  for(const s of ['javascript:alert(1)','https://api.deepseek.com','zotero://open-pdf/library/items/ABCD1234?page=0&annotation=FORM0630',link+'" onclick="evil']) assert.equal(C.parseSourceLink(s),null);
});
test('serialized storage isolates scopes, snapshots writes, and excludes credentials', async () => {
  assert.equal(typeof C.LocalStore, 'function');
  const files=new Map();
  const adapter={exists:async p=>files.has(p),read:async p=>files.get(p),writeAtomic:async(p,text)=>{await new Promise(r=>setTimeout(r,5));files.set(p,text);}};
  const store=new C.LocalStore(adapter);
  const state=await store.load(source);
  state.sources.push({...source,id:'one',type:'公式',number:'6.30'});state.apiKey='SECRET';
  const first=store.save(source,state);C.activeConversation(state).draft='changed';const second=store.save(source,state);
  await Promise.all([first,second]);
  const loaded=await new C.LocalStore(adapter).load(source);
  assert.equal(C.activeConversation(loaded).draft,'changed');assert.equal(loaded.sources.length,1);
  assert.ok(![...files.values()].join('').includes('SECRET'));
  assert.equal((await store.load({...source,attachmentKey:'OTHERPDF'})).sources.length,0);
});
test('corrupt disk state is reported and cannot be overwritten', async()=>{
  assert.equal(typeof C.LocalStore,'function');
  let writes=0;const store=new C.LocalStore({exists:async()=>true,read:async()=>'{broken',writeAtomic:async()=>{writes++;}});
  await assert.rejects(store.load(source),/损坏/);
  await assert.rejects(store.save(source,{sources:[]}),/损坏/);assert.equal(writes,0);
});
test('relinking keeps stable reference identity across restart',()=>{
  const old={...source,id:'stable-source',type:'公式',number:'6.30'};
  const state=C.emptyState();state.sources.push({...old,annotationKey:'RELINK01'});
  const loaded=C.cleanState(state);assert.equal(loaded.sources[0].id,'stable-source');assert.equal(loaded.sources[0].annotationKey,'RELINK01');
});
test('explicit whole-page material retains its identity and native page-only link',()=>{
  const s={...source,fullPage:true};
  assert.equal(C.pickSource(s).fullPage,true);
  assert.equal(C.sourceLink(s),'zotero://open-pdf/library/items/ABCD1234?page=66');
  assert.equal(C.parseSourceLink('zotero://open-pdf/library/items/ABCD1234?page=66').fullPage,true);
});

test('highlight passage survives index and dialogue storage instead of becoming an image-only source',()=>{
  const state=C.emptyState(),textSource={...source,kind:'text',text:'定义 x 为系统状态',type:'段落',number:'定义1'};new C.ReferenceIndex(state.sources).add(textSource);C.activeConversation(state).history=[{role:'user',content:'解释定义',materials:[textSource]}];const loaded=C.cleanState(state);assert.equal(loaded.sources[0].kind,'text');assert.equal(loaded.sources[0].text,'定义 x 为系统状态');assert.equal(C.activeConversation(loaded).history[0].materials[0].text,'定义 x 为系统状态');
});

test('PDF image records survive save/reload and older states remain compatible',()=>{
  const old={version:1,sources:[],references:[],history:[],draft:'旧草稿'};
  assert.deepEqual(C.cleanState(old).images,[]);
  const state=C.emptyState();state.imageNoteKey='NOTEPDF1';
  state.images=[{id:'a'.repeat(32),annotationKey:'FORM0630',fileName:'margin-comment-'+ 'a'.repeat(32)+'.png',mime:'image/png',noteKey:'NOTEPDF1',noteImageKey:'IMAGE234',absolutePath:'C:/private',apiKey:'SECRET'}];
  const restored=C.cleanState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.imageNoteKey,'NOTEPDF1');assert.equal(restored.images.length,1);
  assert.equal(restored.images[0].noteImageKey,'IMAGE234');assert.equal(restored.images[0].absolutePath,undefined);assert.equal(restored.images[0].apiKey,undefined);
  assert.throws(()=>C.cleanState({...state,images:[{...state.images[0],fileName:'../secret.png'}]}),/图片/);
});
