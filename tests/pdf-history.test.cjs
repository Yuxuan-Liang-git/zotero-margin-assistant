const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const {Host}=require('../src/host.js');

function fixture(){
  const files=new Map(),notes=[];
  const parent={id:2,isRegularItem:()=>true,getNotes:()=>notes.map(n=>n.id)};
  const attachment={id:1,libraryID:1,key:'ABCD1234',parentID:2,isPDFAttachment:()=>true,isEditable:()=>true,getFilePathAsync:async()=>'/data/storage/ABCD1234/book.pdf'};
  const items=new Map([[1,attachment],[2,parent]]);
  const reader={itemID:1,type:'pdf',_initPromise:Promise.resolve()};
  const pane={viewItems:async items=>items};
  const win={ZoteroPane:pane,fetch:async()=>{},TextDecoder,AbortController};
  const Z={DataDirectory:{dir:'/data'},Items:{get:id=>items.get(id),getByLibraryAndKey:(_lib,key)=>[...items.values()].find(i=>i.key===key)},
    Item:class{constructor(type){assert.equal(type,'note');this.id=3;this.key='HISTORY1';this.isNote=()=>true;this.setNote=s=>{this.html=s;};this.getNote=()=>this.html;this.saveTx=async()=>{items.set(this.id,this);if(!notes.includes(this))notes.push(this);};}},
    Reader:{_readers:[],open:async()=>reader,registerEventListener:()=>{},_unregisterEventListenerByPluginID:()=>{}},
    Notifier:{registerObserver:()=>1,unregisterObserver:()=>{}},Libraries:{get:()=>({libraryType:'user'})},getMainWindow:()=>win,getMainWindows:()=>[win]};
  const IO={exists:async p=>files.has(p),readUTF8:async p=>files.get(p),writeUTF8:async(p,s)=>{files.set(p,s);},makeDirectory:async()=>{}};
  const P={join:(...parts)=>parts.join('/'),parent:p=>p.slice(0,p.lastIndexOf('/'))};
  const host=new Host({controller:{sessions:new Map()}},{Zotero:Z,IOUtils:IO,PathUtils:P,window:win});
  return {host,files,notes,attachment,reader,pane,win};
}

test('old dialogue is copied byte-for-byte beside the PDF before loading, leaving the original intact',async()=>{
  const {host,files,reader,notes}=fixture();
  const original=JSON.stringify(C.emptyState());
  files.set('/data/margin-comments-assistant/1-ABCD1234.json',original);
  const state=await host.load(reader);
  assert.equal(state.version,2);
  assert.equal(files.get('/data/storage/ABCD1234/margin-comments-assistant-1-ABCD1234.json'),original);
  assert.equal(files.get('/data/margin-comments-assistant/1-ABCD1234.json'),original);
  assert.equal(notes.length,1);
  assert.match(notes[0].getNote(),/DeepSeek 对话历史/);
});

test('existing PDF-side history wins over older central data and saves to PDF folder',async()=>{
  const {host,files,reader}=fixture();
  const old=C.emptyState(),local=C.emptyState();
  C.activeConversation(old).draft='old';C.activeConversation(local).draft='local';
  const central='/data/margin-comments-assistant/1-ABCD1234.json';
  const sidecar='/data/storage/ABCD1234/margin-comments-assistant-1-ABCD1234.json';
  files.set(central,JSON.stringify(old));files.set(sidecar,JSON.stringify(local));
  const state=await host.load(reader);assert.equal(C.activeConversation(state).draft,'local');
  C.activeConversation(state).draft='updated';await host.save(reader,state);
  assert.equal(C.activeConversation(JSON.parse(files.get(sidecar))).draft,'updated');
  assert.equal(C.activeConversation(JSON.parse(files.get(central))).draft,'old');
});

test('history child row opens matching PDF conversation list and unhooks on shutdown',async()=>{
  const {host,reader,notes,pane}=fixture();
  await host.load(reader);const original=pane.viewItems;
  let shown=0;host.panel=async()=>({showConversations:()=>{shown++;}});
  await host.start();assert.notEqual(pane.viewItems,original);
  await pane.viewItems([notes[0]]);assert.equal(shown,1);
  await host.stop();assert.equal(pane.viewItems,original);
});
