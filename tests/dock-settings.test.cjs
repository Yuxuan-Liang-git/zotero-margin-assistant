const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Host}=require('../src/host.js');

test('dock preferences restore across Host instances and update existing reader layouts',()=>{
  const preferences=new Map();
  const Zotero={DataDirectory:{dir:'/data'},Prefs:{get:key=>preferences.get(key),set:(key,value)=>preferences.set(key,value)}};
  const create=()=>new Host({bridge:{},controller:{}},{Zotero,IOUtils:{},PathUtils:{join:(...parts)=>parts.join('/')},window:{}});
  const host=create();
  let received;
  host.panels.set({}, {docks:{setState:value=>{received=value;}}});
  host.dockLayoutAPI().save({assistantSide:'left',assistantWidth:390,notionWidth:350});
  assert.deepEqual(create().dockLayoutAPI().state(),{assistantSide:'left',assistantWidth:390,notionWidth:350});
  assert.equal(received.assistantSide,'left');
  assert.equal(preferences.size,1);
  preferences.set('margincomments.dockLayout','invalid json');
  assert.deepEqual(create().dockLayoutAPI().state(),{assistantSide:'right',assistantWidth:420,notionWidth:380});
});
