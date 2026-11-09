const test=require('node:test');
const assert=require('node:assert/strict');

globalThis.ZMACore={scopeKey:scope=>`${scope.libraryID}/${scope.attachmentKey}`};
const {Host}=require('../src/host.js');

test('state saves wait for transfer synchronization without refreshing every reference card',async()=>{
  const host=Object.create(Host.prototype);let release;
  const transfer=new Promise(resolve=>{release=resolve;});
  let saved=0,refreshed=0;
  host.transferTasks=new Map([['1/ABCDEFGH',transfer]]);
  transfer.then(()=>host.transferTasks.delete('1/ABCDEFGH'));
  const state={sources:[],references:[],images:[],draft:'answer'};
  host.referenceSignatures=new Map([['1/ABCDEFGH',host.referenceStateSignature(state)]]);
  host.scope=()=>({libraryID:1,attachmentKey:'ABCDEFGH'});
  host.store={save:async()=>{saved++;}};
  host.refreshReferenceCards=()=>{refreshed++;};
  const saving=host.save({itemID:9},state);
  await Promise.resolve();
  assert.equal(saved,0,'save must remain serialized behind an import transfer');
  release();await saving;
  assert.equal(saved,1);
  assert.equal(refreshed,0,'unchanged state saves must not trigger full reference validation');
});

test('source index changes still refresh reference cards after save',async()=>{
  const host=Object.create(Host.prototype),state={sources:[{id:'one'}],references:[],images:[]};let refreshed=0;
  host.referenceSignatures=new Map([['1/ABCDEFGH',JSON.stringify({sources:[],references:[],images:[]})]]);
  host.scope=()=>({libraryID:1,attachmentKey:'ABCDEFGH'});host.transferTasks=new Map();host.store={save:async()=>{}};
  host.refreshReferenceCards=()=>{refreshed++;};
  await host.save({itemID:9},state);
  assert.equal(refreshed,1,'changed source and reference indexes must invalidate displayed cards');
});

test('toolbar observer ignores unrelated mutations and coalesces recovery checks',()=>{
  const host=Object.create(Host.prototype);host.toolbarObservers=new Map();host.closedReaders=new WeakSet();host.running=true;
  const observers=[];let currentToolbar,checks=0;
  const parent={};
  const makeToolbar=()=>({parentElement:parent,matches:selector=>selector==='.toolbar',querySelector:()=>null});
  currentToolbar=makeToolbar();
  const body={};
  const doc={body,defaultView:{MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(node,options){this.node=node;this.options=options;}disconnect(){this.disconnected=true;}}},querySelectorAll:()=>[],querySelector:selector=>selector==='.toolbar'?currentToolbar:null};
  host.ensureToolbar=()=>{checks++;};
  host.watchToolbar({itemID:9},doc);
  assert.equal(observers[0].node,currentToolbar,'watcher must attach to the toolbar subtree, not the streaming document body');
  assert.deepEqual(observers[0].options,{childList:true,subtree:true});
  const unrelated={matches:()=>false,closest:()=>null};
  observers[0].callback([{target:unrelated,addedNodes:[],removedNodes:[]}]);
  return Promise.resolve().then(()=>{
    assert.equal(checks,0,'unrelated mutations must not run toolbar recovery');
    const sections={matches:selector=>selector==='.custom-sections',closest:()=>sections};
    observers[0].callback([{target:sections,addedNodes:[],removedNodes:[]}]);
    observers[0].callback([{target:sections,addedNodes:[],removedNodes:[]}]);
    return Promise.resolve().then(()=>assert.equal(checks,1,'multiple toolbar mutations in one turn must coalesce'));
  });
});

test('toolbar watcher rebinds after toolbar replacement',()=>{
  const host=Object.create(Host.prototype);host.toolbarObservers=new Map();host.closedReaders=new WeakSet();host.running=true;
  const observers=[],parent={};let toolbar={parentElement:parent,matches:selector=>selector==='.toolbar',querySelector:()=>null},checks=0;
  const doc={body:{},defaultView:{MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(node,options){this.node=node;this.options=options;}disconnect(){this.disconnected=true;}}},querySelector:()=>toolbar};
  host.ensureToolbar=()=>{checks++;host.watchToolbar(reader,doc);};const reader={itemID:9};
  host.watchToolbar(reader,doc);const old=toolbar;toolbar={parentElement:parent,matches:selector=>selector==='.toolbar',querySelector:()=>null};
  observers.find(observer=>observer.node===parent).callback([{target:parent,addedNodes:[toolbar],removedNodes:[old]}]);
  return Promise.resolve().then(()=>assert.equal(observers.some(observer=>observer.node===toolbar),true,'replacement toolbar must receive a new observer'));
});

test('toolbar discovery stops observing the document when the late toolbar mounts',async()=>{
  const host=Object.create(Host.prototype);host.toolbarObservers=new Map();host.closedReaders=new WeakSet();host.cleanups=new Map();host.panels=new Map();host.running=true;
  const observers=[],body={},reader={itemID:9};let toolbar=null,checks=0;
  const doc={body,defaultView:{MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(node,options){this.node=node;this.options=options;}disconnect(){this.disconnected=true;}}},querySelector:()=>toolbar};
  host.ensureToolbar=()=>{checks++;};host.watchToolbar(reader,doc);
  const discovery=observers[0];assert.equal(discovery.node,body);assert.equal(discovery.options.subtree,true);
  discovery.callback([{target:body,addedNodes:[],removedNodes:[]}]);await Promise.resolve();assert.equal(checks,0,'unrelated mutations must not run recovery during discovery');
  toolbar={parentElement:body,matches:selector=>selector==='.toolbar',querySelector:()=>null};
  discovery.callback([{target:body,addedNodes:[toolbar],removedNodes:[]}]);await Promise.resolve();
  assert.equal(checks,1);assert.equal(discovery.disconnected,true,'document discovery observer must stop once toolbar is found');
  assert.ok(observers.some(observer=>observer.node===toolbar),'toolbar-local observer must take over');
  await host.closeReader(reader);assert.ok(observers.filter(observer=>observer.node!==body).every(observer=>observer.disconnected),'reader close must disconnect scoped observers');
});

test('item invalidation refreshes only affected readers and keeps delete invalidation broad',()=>{
  const host=Object.create(Host.prototype);let refreshes=[];
  const readerA={itemID:10},readerB={itemID:20};
  host.Z={Reader:{_readers:[readerA,readerB]},Items:{get:id=>id===101?{id:101,parentID:10}:id===201?{id:201,parentID:20}:null}};
  host.refreshReferenceCards=reader=>refreshes.push(reader?.itemID??'all');
  host.onItemChange('modify',['999']);
  assert.deepEqual(refreshes,[],'unrelated item changes should not refresh readers');
  host.onItemChange('modify',['101']);
  assert.deepEqual(refreshes,[10],'source annotation changes should refresh only their PDF');
  host.onItemChange('delete',['101']);
  assert.deepEqual(refreshes,[10,'all'],'deletion must retain conservative source invalidation');
});
