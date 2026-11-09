const {test}=require('node:test'),assert=require('node:assert/strict');
test('default prose preferences accept empty overrides and preserve paragraphs without mutating the request',()=>{
 const I=require('../src/instructions.js');assert.match(I.DEFAULT,/清晰、流畅的散文/);assert.match(I.DEFAULT,/避免使用加粗或斜体/);assert.equal(I.clean(''),'');assert.throws(()=>I.clean('a'.repeat(12001)),/12000/);
 for(const value of [false,42,'a'.repeat(12001)])assert.equal(I.restore(value),I.DEFAULT);assert.equal(I.restore(''),'');
 const messages=[{role:'system',content:'文档来源规则'},{role:'user',content:'问题'}],applied=I.apply(messages,'第一段\r\n\r\n第二段');assert.match(applied[0].content,/文档来源规则/);assert.match(applied[0].content,/第一段\n\n第二段/);assert.equal(messages[0].content,'文档来源规则');assert.deepEqual(I.apply(messages,''),messages);
});
test('custom instructions persist independently of credentials and are restored by a new Host',async()=>{
 const {Host}=require('../src/host.js'),I=require('../src/instructions.js'),prefs=new Map(),Z={DataDirectory:{dir:'/data'},Items:{get:()=>({libraryID:1,key:'ABCD1234'})},Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)}};
 const make=()=>new Host({bridge:{},controller:{}},{Zotero:Z,IOUtils:{},PathUtils:{join:(...x)=>x.join('/')},window:{}}),host=make();assert.equal(host.promptAPI().state().text,I.DEFAULT);await host.promptAPI().save('只用完整段落解释。');const restored=make();assert.equal(restored.promptAPI().state().text,'只用完整段落解释。');assert.match(restored.prepareMessages([{role:'system',content:'原规则'}])[0].content,/只用完整段落/);assert.equal(prefs.size,1);await restored.promptAPI().reset();assert.equal(restored.promptAPI().state().text,I.DEFAULT);
});
test('reading summary requests use the same custom instructions as document questions',async()=>{
 const S=require('../src/reading-summary.js'),C=require('../src/core.js'),I=require('../src/instructions.js'),state=C.emptyState();C.activeConversation(state).history=[{role:'user',content:'问题',materials:[]},{role:'assistant',content:'解释',materials:[]}];let called=0;
 const manager=new S.Manager({key:()=> 'pdf',load:async()=>state,save:async()=>{},publish:async()=>{},enabled:()=>false,foreground:()=>false,prepareMessages:messages=>I.apply(messages,'请按连贯散文展开。'),client:()=>({generate:async messages=>{called++;assert.match(messages[0].content,/请按连贯散文展开/);assert.match(messages[0].content,/# 文章内容/);return '<!-- zma-note:unchanged -->';}})});
 await manager.update({});await manager.stop();assert.equal(called,1);assert.equal(state.readingSummary.error,'');
});
