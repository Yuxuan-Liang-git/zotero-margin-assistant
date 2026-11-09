const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../src/core.js');
const path=require('node:path');
const modulePath=path.join(__dirname,'../src/transfer.js');
const T=fs.existsSync(modulePath)?require(modulePath):{};
const msg=(role,text,extra={})=>({author:{role},content:{content_type:'text',parts:[text]},...extra});
const node=(parent,message)=>({parent,message});
function web(){return [{title:'论文 \\(x\\)',create_time:1,update_time:2,current_node:'a2',mapping:{root:node(null,null),u:node('root',msg('user','解释公式')),a:node('u',msg('assistant','旧分支')),a2:node('u',msg('assistant','答案 \\[\\frac{a}{b}\\]')),hidden:node('a2',msg('assistant','private',{channel:'analysis'}))}}];}

test('portable JSON round trip keeps LaTeX, Unicode, draft and incomplete marker without paths or secrets',()=>{
 assert.equal(typeof T.exportJSON,'function','transfer codec not implemented');
 const s=C.emptyState(),c=C.activeConversation(s);c.title='公式 📚';c.draft='继续';c.history=[{role:'user',content:'问题 \\(y\\)',materials:[]},{role:'assistant',content:'\\[a\\\\b\\]',incomplete:true,materials:[],provider:'chatgpt',secret:'token'}];c.draftAttachments=[{path:'C:/private'}];
 const raw=T.exportJSON(c);assert.ok(!raw.includes('token'));assert.ok(!raw.includes('C:/'));const parsed=T.prepare(T.parseJSON(raw)[0]);assert.equal(parsed.title,c.title);assert.equal(parsed.draft,c.draft);assert.deepEqual(parsed.history.map(m=>[m.role,m.content,!!m.incomplete]),c.history.map(m=>[m.role,m.content,!!m.incomplete]));assert.match(parsed.warnings.join(' '),/附件|材料/);assert.match(T.exportMarkdown(c),/\\\[a/);
});
test('official mapping follows selected branch, excludes system and hidden messages',()=>{
 assert.equal(typeof T.parseJSON,'function','transfer codec not implemented');const w=web();w[0].mapping.root.message=msg('system','SYSTEM SECRET');const list=T.parseJSON(JSON.stringify(w));assert.equal(list.length,1);const p=T.prepare(list[0]);assert.deepEqual(p.history.map(m=>m.content),['解释公式','答案 \\[\\frac{a}{b}\\]']);assert.ok(!JSON.stringify(p).includes('SYSTEM SECRET'));assert.ok(!JSON.stringify(p).includes('旧分支'));
 delete w[0].current_node;assert.equal(T.parseJSON(JSON.stringify(w)).length,2);
});
test('media is explicitly missing; hidden and tool output do not become user content',()=>{
 assert.equal(typeof T.prepare,'function','transfer codec not implemented');const w=web();w[0].mapping.a2.message.content={content_type:'multimodal_text',parts:['公式如下',{content_type:'image_asset_pointer',asset_pointer:'file-service://private'}]};w[0].mapping.u.message.metadata={attachments:[{id:'file1'}]};const p=T.prepare(T.parseJSON(JSON.stringify(w))[0]);assert.match(p.warnings.join(' '),/附件|图片/);assert.equal(p.history[1].content,'公式如下');assert.ok(!JSON.stringify(p).includes('file-service:'));
});
test('paste roles and code fences preserve formulas, adjacent roles merge, final question becomes draft',()=>{
 assert.equal(typeof T.parseText,'function','transfer codec not implemented');const p=T.parseText('You:\n解释 \\(x\\)\nChatGPT:\n```text\nYou:\nnot a role\n```\n\\[x=1\\]\nChatGPT:\n补充\n用户：\n接着解释','标题');assert.equal(p.history.length,2);assert.match(p.history[1].content,/You:\nnot a role/);assert.match(p.history[1].content,/补充/);assert.equal(p.draft,'接着解释');assert.match(p.warnings.join(' '),/草稿/);assert.throws(()=>T.parseText('一段没有角色的文字'),/角色/);
});
test('malformed, unknown, cyclic and oversized input fails without changing state',()=>{
 assert.equal(typeof T.parseJSON,'function','transfer codec not implemented');assert.throws(()=>T.parseJSON('{'),/JSON/);assert.throws(()=>T.parseJSON(JSON.stringify({format:'zma-conversation',version:999})),/版本/);const w=web();w[0].mapping.u.parent='a2';assert.throws(()=>T.prepare(T.parseJSON(JSON.stringify(w))[0]),/循环/);assert.throws(()=>T.parseText('用户：\n'+'x'.repeat(100001)),/超过/);assert.throws(()=>T.parseText('助手：\n回答'),/用户|提问/);const s=C.emptyState(),before=JSON.stringify(s);assert.throws(()=>T.importState(s,{title:'bad',history:[{role:'system',content:'bad'}]}));assert.equal(JSON.stringify(s),before);
});
test('import uses fresh IDs, leaves references and old sessions intact, and persists standard core schema',()=>{
 assert.equal(typeof T.importState,'function','transfer codec not implemented');const s=C.emptyState();C.activeConversation(s).draft='original';const p=T.parseText('用户：\n问题\n助手：\n回答','导入');const a=T.importState(s,p),b=T.importState(a,p);assert.equal(s.conversations.length,1);assert.equal(a.conversations.length,2);assert.equal(b.conversations.length,3);assert.notEqual(a.activeConversationId,b.activeConversationId);assert.equal(C.activeConversation(s).draft,'original');assert.equal(C.cleanState(b).conversations.length,3);
});
test('web copied role labels and a sole unanswered question can be imported and exported again',()=>{
 const p=T.parseText('你说：\n这段公式？\nChatGPT 说：\n\\(a+b\\)\n你说：\n后面呢');assert.equal(p.history.length,2);assert.equal(p.draft,'后面呢');
 const lone=T.parseText('用户：\n尚未回答');const s=T.importState(C.emptyState(),lone);assert.equal(C.activeConversation(s).history.length,0);assert.equal(T.prepare(T.parseJSON(T.exportJSON(C.activeConversation(s)))[0]).draft,'尚未回答');
});
test('export does not impose the import message cap on an existing long local conversation',()=>{
 const c=C.activeConversation(C.emptyState());c.history=Array.from({length:202},(_,i)=>({role:i%2?'assistant':'user',content:String(i),materials:[]}));const data=JSON.parse(T.exportJSON(c));assert.equal(data.conversation.history.length,202);assert.throws(()=>T.prepare(T.parseJSON(JSON.stringify(data))[0]),/200/);assert.match(T.exportMarkdown(c),/201/);
});
test('empty unfinished native answers round trip without dropping the pair or duplicating the retry draft',()=>{
 const c=C.activeConversation(C.emptyState());c.history=[{role:'user',content:'Explain equation 6.30',materials:[]},{role:'assistant',content:'',incomplete:true,materials:[]}];c.draft='Explain equation 6.30';const p=T.prepare(T.parseJSON(T.exportJSON(c))[0]);assert.deepEqual(p.history.map(m=>[m.role,m.content,!!m.incomplete]),c.history.map(m=>[m.role,m.content,!!m.incomplete]));assert.equal(p.draft,c.draft);const state=T.importState(C.emptyState(),p);assert.equal(C.activeConversation(state).history.length,2);
});
