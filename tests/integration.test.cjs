const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const H=fs.existsSync(__dirname+'/../src/host.js')?require('../src/host.js'):{};
globalThis.ZMAPanel={Panel:class{constructor(){this.node={};}async init(){if(globalThis.waitInit)await globalThis.waitInit;return this;}async destroy(){globalThis.destroyedPending=true;}}};
function fixture(overrides={}){
  const attachment={id:1,libraryID:1,key:'ABCD1234',getFilePathAsync:async()=> '/book.pdf',isPDFAttachment:()=>true,isEditable:()=>true};
  const annotation={id:2,key:'FORM0630',libraryID:1,parentID:1,isAnnotation:()=>true,annotationType:'image',annotationPageLabel:'60',annotationPosition:JSON.stringify({pageIndex:65,rects:[[10,20,90,50]]}),annotationComment:'已有评论',isEditable:()=>true,saveTx:async()=>{}};
  const events=new Map();const Z={Items:{get:id=>id===1?attachment:annotation,getByLibraryAndKey:(lib,key)=>key===attachment.key?attachment:key===annotation.key?annotation:null},Reader:{_readers:[],registerEventListener:(name,fn)=>events.set(name,fn),_unregisterEventListenerByPluginID:()=>events.clear()},Libraries:{get:()=>({libraryType:'user'})},Notifier:{registerObserver:()=>1,unregisterObserver:()=>{}},DataDirectory:{dir:'/data'},...overrides};
  const files=new Map();const IO={exists:async p=>files.has(p),readUTF8:async p=>files.get(p),writeUTF8:async(p,s)=>files.set(p,s),makeDirectory:async()=>{},stat:async()=>({size:123,lastModified:9})};
  const host=new H.Host({controller:{}},{Zotero:Z,IOUtils:IO,PathUtils:{join:(...p)=>p.join('/'),parent:p=>p.slice(0,p.lastIndexOf('/'))},window:{fetch:async()=>{},TextDecoder,AbortController}});
  return {host,Z,annotation,attachment,events,files};
}

test('automatic context captures text-bearing formula pages, respects capacity and reports skipped images',async()=>{
 const {host}=fixture(),captured=[];host.addon.controller.ensureSession=async()=>({adapter:{currentPageIndex:()=>0,pdfWindow:{PDFViewerApplication:{pdfDocument:{numPages:2,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:[{str:'Formula prose'}]})})}}},pdfViewer:{}}});
 host.capture=async(_r,source)=>{captured.push(source.pageIndex);return {source,dataURL:'data:image/png;base64,YQ==',width:600,height:800};};
 const context=await host.documentContext({itemID:1},'Explain formula',{imageLimit:2,imageBudget:1000});assert.deepEqual(captured,[0,1]);assert.deepEqual(context.materials.map(m=>m.source.pageIndex),[0,1]);assert.match(context.text,/Formula prose/);
 captured.length=0;const limited=await host.documentContext({itemID:1},'Explain formula',{imageLimit:1,imageBudget:1000});assert.deepEqual(captured,[0]);assert.equal(limited.materials.length,1);assert.match(limited.imageWarning,/上限/);
 const noRoom=await host.documentContext({itemID:1},'Explain formula',{imageLimit:2,imageBudget:1});assert.equal(noRoom.materials.length,0);assert.match(noRoom.imageWarning,/大小/);
});
test('stopping page vision prevents further captures and unreadable images cannot masquerade as a read scan',async()=>{
 const {host}=fixture(),controller=new AbortController();host.addon.controller.ensureSession=async()=>({adapter:{currentPageIndex:()=>0,pdfWindow:{PDFViewerApplication:{pdfDocument:{numPages:10,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:[]})})}}},pdfViewer:{}}});let calls=0;host.capture=async()=>{calls++;controller.abort();return {source:{pageIndex:0},dataURL:'data:image/png;base64,YQ=='};};await assert.rejects(host.documentContext({itemID:1},'解释',{signal:controller.signal}),/停止/);assert.equal(calls,1);
 host.capture=async()=>{throw new Error('render failed');};await assert.rejects(host.documentContext({itemID:1},'解释'),/图片.*失败/);
});
test('provider selection persists and a request snapshots the ChatGPT account; switches cannot race generation',async()=>{
  const prefs=new Map(),{host}=fixture({Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)}});
  host.auth={state:{activeID:'registered-account'},active:()=>({accessToken:'private'})};host.chatgpt={forAccount:id=>({provider:'chatgpt',id})};
  assert.equal(typeof host.setProvider,'function');await host.setProvider('chatgpt');assert.equal(prefs.get('margincomments.provider'),'chatgpt');assert.deepEqual(host.selectedClient(),{provider:'chatgpt',id:'registered-account'});
  host.claimRequest({itemID:1});await assert.rejects(host.setProvider('deepseek'),/生成/);host.releaseRequest({itemID:1});await host.setProvider('deepseek');assert.equal(host.selectedClient(),host.client);
});
test('source identity is taken from native image annotation and changes invalidate it',async()=>{
  assert.equal(typeof H.Host,'function');const {host,annotation}=fixture();
  const s=await host.resolveSource({itemID:1},'FORM0630');assert.equal(s.pageIndex,65);assert.equal(s.pageLabel,'60');assert.equal(s.fingerprint,'123:9');
  assert.equal((await host.resolveSource({itemID:1},s)).annotationKey,'FORM0630');
  annotation.annotationPosition=JSON.stringify({pageIndex:2,rects:[[10,20,90,50]]});
  await assert.rejects(host.resolveSource({itemID:1},s),e=>e.code==='SOURCE_STALE'&&/重新定位/.test(e.message));
  annotation.deleted=true;await assert.rejects(host.resolveSource({itemID:1},s),e=>e.code==='SOURCE_MISSING');
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
  require('../src/core.js').activeConversation(first).draft='from first reader';await host.save({itemID:1},first);assert.equal(require('../src/core.js').activeConversation(second).draft,'from first reader');
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
  const reader={itemID:1,_iframeWindow:{document:{}}};host.addon.controller.ensureSession=async()=>({adapter:{document:()=>({})},cardRuntimes:()=>[]});host.addon.bridge={installMathResources:()=>()=>{}};host.installStyles=()=>{};host.bindReferences=()=>{};
  const pending=host.panel(reader);await new Promise(r=>setTimeout(r,0));await host.closeReader(reader);finish();await assert.rejects(pending,/关闭/);assert.equal(host.panels.size,0);globalThis.waitInit=null;
});
test('DeepSeek settings command opens its native Zotero preferences without a separate dialog',()=>{
  const {host,Z}=fixture();let pane;Z.Utilities={Internal:{openPreferences:id=>{pane=id;}}};host.settings();assert.equal(pane,'margin-comments-preferences');
});

test('host restores a locally encrypted DeepSeek key and model after restart',async()=>{
  const prefs=new Map();
  const adapter={
    Prefs:{get:name=>prefs.get(name),set:(name,value)=>prefs.set(name,value),clear:name=>prefs.delete(name)},
    OSKeyStore:{encrypt:async value=>'oskv1:'+Buffer.from(value).toString('base64'),decrypt:async value=>Buffer.from(value.slice(6),'base64').toString()},
  };
  const {host:old,Z}=fixture(adapter);
  await old.start();await old.settingsAPI().apply('sk-persisted','deepseek-chat');await old.stop();
  assert.ok(!JSON.stringify([...prefs]).includes('sk-persisted'));
  const restored=new H.Host(old.addon,{Zotero:Z,IOUtils:old.IO,PathUtils:old.P,window:old.win});
  await restored.start();
  assert.equal(restored.key,'sk-persisted');assert.equal(restored.model,'deepseek-chat');
  await restored.settingsAPI().clear();assert.equal(restored.key,'');assert.equal(prefs.has('margincomments.deepseekKey'),false);
  await restored.stop();
});

test('highlight sources use the selected native passage and reject changed text',async()=>{
  const {host,annotation}=fixture();annotation.annotationType='highlight';annotation.annotationText='引用的前文定义';const source=await host.resolveSource({itemID:1},annotation.key);assert.equal(source.kind,'text');assert.equal(source.text,'引用的前文定义');const material=await host.capture({itemID:1},source);assert.equal(material.text,'引用的前文定义');assert.equal(material.dataURL,undefined);annotation.annotationText='改变后的定义';await assert.rejects(host.resolveSource({itemID:1},source),/重新定位/);
});

test('selected PDF text adds a right-click reference action with a stable selection snapshot',async()=>{
  const {host,Z,events,attachment}=fixture();await host.start();assert.equal(typeof events.get('createViewContextMenu'),'function');
  const selection={type:'highlight',text:'引用时选中的定义',pageLabel:'60',sortIndex:'00065|000020|00000',position:{pageIndex:65,rects:[[10,20,90,50]]}};
  const reader={itemID:1,type:'pdf',_internalReader:{_lastView:{_selectionPopup:{annotation:selection}}}},menu=[];let saved;
  Z.DataObjectUtilities={generateKey:()=> 'SELECT23'};Z.Annotations={saveFromJSON:async(a,json)=>{assert.equal(a,attachment);saved=json;return {key:json.key};}};
  host.resolveSource=async(_r,key)=>({annotationKey:key});let marked;host.panel=async()=>({markSource:async(s,direct)=>{marked={s,direct};}});
  events.get('createViewContextMenu')({reader,params:{},append:m=>menu.push(m)});const action=menu.find(m=>m.label==='引用选中文字到页边批注');assert.ok(action&&!action.disabled);selection.text='稍后选择已改变';action.onCommand();await new Promise(r=>setTimeout(r,15));assert.equal(saved.text,'引用时选中的定义');assert.equal(marked.direct,true);
});
