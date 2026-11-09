const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const H=fs.existsSync(__dirname+'/../src/host.js')?require('../src/host.js'):{};
globalThis.ZMAPanel={Panel:class{constructor(){this.node={};}async init(){if(globalThis.waitInit)await globalThis.waitInit;return this;}async destroy(){globalThis.destroyedPending=true;}}};
function fixture(){
  const attachment={id:1,libraryID:1,key:'ABCD1234',getFilePathAsync:async()=> '/book.pdf',isEditable:()=>true};
  const annotation={id:2,key:'FORM0630',libraryID:1,parentID:1,isAnnotation:()=>true,annotationType:'image',annotationPageLabel:'60',annotationPosition:JSON.stringify({pageIndex:65,rects:[[10,20,90,50]]}),annotationComment:'已有评论',isEditable:()=>true,saveTx:async()=>{}};
  const events=new Map();const Z={Items:{get:id=>id===1?attachment:annotation,getByLibraryAndKey:(lib,key)=>key===attachment.key?attachment:key===annotation.key?annotation:null},Reader:{_readers:[],registerEventListener:(name,fn)=>events.set(name,fn),_unregisterEventListenerByPluginID:()=>events.clear()},Libraries:{get:()=>({libraryType:'user'})},Notifier:{registerObserver:()=>1,unregisterObserver:()=>{}},DataDirectory:{dir:'/data'}};
  const files=new Map();const IO={exists:async p=>files.has(p),readUTF8:async p=>files.get(p),writeUTF8:async(p,s)=>files.set(p,s),makeDirectory:async()=>{},stat:async()=>({size:123,lastModified:9})};
  const host=new H.Host({controller:{}},{Zotero:Z,IOUtils:IO,PathUtils:{join:(...p)=>p.join('/')},window:{fetch:async()=>{},TextDecoder,AbortController}});
  return {host,Z,annotation,attachment,events,files};
}
test('source identity is taken from native image annotation and changes invalidate it',async()=>{
  assert.equal(typeof H.Host,'function');const {host,annotation}=fixture();
  const s=await host.resolveSource({itemID:1},'FORM0630');assert.equal(s.pageIndex,65);assert.equal(s.pageLabel,'60');assert.equal(s.fingerprint,'123:9');
  assert.equal((await host.resolveSource({itemID:1},s)).annotationKey,'FORM0630');
  annotation.annotationPosition=JSON.stringify({pageIndex:2,rects:[[10,20,90,50]]});
  await assert.rejects(host.resolveSource({itemID:1},s),/重新定位/);
});
test('readonly comments cannot change; explicit save appends without overwriting prior text',async()=>{
  assert.equal(typeof H.Host,'function');const {host,annotation}=fixture();
  const s=await host.resolveSource({itemID:1},'FORM0630');
  annotation.isEditable=()=>false;await assert.rejects(host.saveComment({itemID:1},s,'回答'),/只读/);assert.equal(annotation.annotationComment,'已有评论');
  annotation.isEditable=()=>true;await host.saveComment({itemID:1},s,'回答');assert.ok(annotation.annotationComment.startsWith('已有评论\n'));assert.ok(annotation.annotationComment.includes('回答'));
});
test('region menus constrain attachment/type and lifecycle removes registered callbacks',async()=>{
  assert.equal(typeof H.Host,'function');const {host,events,annotation}=fixture();await host.start();
  const menu=[];events.get('createAnnotationContextMenu')({reader:{itemID:1,type:'pdf'},params:{ids:['FORM0630']},append:x=>menu.push(x)});
  assert.equal(menu.length,3);assert.ok(menu.some(x=>x.label==='向 DeepSeek 提问'&&!x.disabled));
  annotation.annotationType='highlight';const other=[];events.get('createAnnotationContextMenu')({reader:{itemID:1,type:'pdf'},params:{ids:['FORM0630']},append:x=>other.push(x)});
  assert.ok(other.find(x=>x.label==='标记为引用来源').disabled);
  await host.stop();assert.equal(events.size,0);assert.equal(host.key,'');
});
test('two readers for one attachment share index state instead of overwriting additions',async()=>{
  const {host}=fixture();const first=await host.load({itemID:1});const second=await host.load({itemID:1});
  first.draft='from first reader';await host.save({itemID:1},first);assert.equal(second.draft,'from first reader');
});
test('same attachment cannot generate concurrently through two reader panels',()=>{
  const {host}=fixture();assert.equal(typeof host.claimRequest,'function');host.claimRequest({itemID:1});assert.throws(()=>host.claimRequest({itemID:1}),/正在生成/);host.releaseRequest({itemID:1});host.claimRequest({itemID:1});
});
test('closing an external reader immediately destroys its panel without a tab event',async()=>{
  const {host}=fixture();let destroyed=false;const reader={itemID:1};host.panels.set(reader,{destroy:async()=>{destroyed=true;}});
  const win=new EventTarget(),doc=new EventTarget();doc.defaultView=win;doc.getElementById=()=>true;
  host.bindReferences(reader,doc);win.dispatchEvent(new Event('unload'));await new Promise(r=>setTimeout(r,0));assert.equal(destroyed,true);assert.equal(host.panels.has(reader),false);
});
test('reader closed during assistant initialization cannot publish a stale panel',async()=>{
  const {host}=fixture();host.running=true;let finish;globalThis.waitInit=new Promise(resolve=>{finish=resolve;});
  const reader={itemID:1,_iframeWindow:{document:{}}};host.addon.controller.ensureSession=async()=>({adapter:{document:()=>({})}});host.addon.bridge={installMathResources:()=>()=>{}};host.installStyles=()=>{};host.bindReferences=()=>{};
  const pending=host.panel(reader);await new Promise(r=>setTimeout(r,0));await host.closeReader(reader);finish();await assert.rejects(pending,/关闭/);assert.equal(host.panels.size,0);globalThis.waitInit=null;
});
test('DeepSeek settings command opens its native Zotero preferences without a separate dialog',()=>{
  const {host,Z}=fixture();let pane;Z.Utilities={Internal:{openPreferences:id=>{pane=id;}}};host.settings();assert.equal(pane,'margin-comments-preferences');
});
