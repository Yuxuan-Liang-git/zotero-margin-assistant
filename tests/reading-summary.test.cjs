const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const modulePath='../src/reading-summary.js';
function api(){return require(modulePath);}
function pair(state,q='为什么需要正则性？',a='正则性用于保证极限与求导的交换，需要结合原文的具体条件。') {const c=C.activeConversation(state);c.history.push({role:'user',content:q,materials:[]},{role:'assistant',content:a,materials:[],incomplete:false});}
function fixture(){const S=api(),state=C.emptyState(),writes=[],published=[],events=[];let generation=async()=>JSON.stringify({changed:true,text:'### 正则性的作用\n\n这里整理已经澄清的条件，公式为 \\(y=Hu+e\\)。'});const manager=new S.Manager({key:r=>r.key,load:async()=>state,save:async(_r,s)=>{writes.push(JSON.parse(JSON.stringify(s)));},publish:async(_r,text,record,force)=>{published.push({text,force});return {noteKey:'NOTE0001',noteHTML:'stored HTML'};},client:()=>({generate:(...args)=>generation(...args)}),notify:(r,v)=>events.push(v),enabled:()=>true,foreground:()=>false,delay:20000});return {S,state,manager,writes,published,events,reader:{key:'1-ABCD1234'},generate:f=>{generation=f;}};}
test('reading summary collects complete pairs across PDF conversations and never includes attachment bytes',()=>{
 const S=api(),state=C.emptyState();pair(state);state.conversations[0].history[0].attachments=[{dataURL:'SECRET_IMAGE_BYTES'}];C.createConversation(state,'next');pair(state,'为什么公式(6.30)可用于(7.41)？','由式(6.30)的假设可得结论。');pair(state,'未回答问题','');state.conversations[1].history.at(-1).incomplete=true;const turns=S.collect(state);assert.equal(turns.length,2);assert.match(turns[1].text,/6\.30/);assert.doesNotMatch(JSON.stringify(turns),/SECRET_IMAGE_BYTES/);assert.notEqual(turns[0].id,turns[1].id);
});
test('summary round trip is optional for old states and validates progress without changing chat compaction',()=>{
 const S=api(),state=C.emptyState();pair(state);state.readingSummary=S.clean({text:'公式 \\(x=1\\)',processed:[S.collect(state)[0].id],noteKey:'NOTE0001'});const restored=C.cleanState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.readingSummary,state.readingSummary);assert.equal(restored.conversations[0].summary,'');assert.equal(C.cleanState(C.emptyState()).readingSummary,undefined);
});
test('long complete answers are split without omitting text and result parsing rejects incomplete note updates',()=>{
 const S=api(),state=C.emptyState(),answer='推导与条件。'.repeat(6000);pair(state,'问题',answer);const entries=S.collect(state);assert.ok(entries.length>2);assert.ok(entries.every(e=>e.text.length<=12000));assert.equal(entries.map(e=>e.text).join('').includes(answer),true);assert.throws(()=>S.parseResult('{"changed":true,"text":""}'),/摘要/);assert.deepEqual(S.parseResult('```json\n{"changed":false}\n```'),{changed:false,text:''});
});
test('an incremental summary is independently persisted and unchanged input makes no extra request',async()=>{
 const f=fixture();pair(f.state);let calls=0;f.generate(async messages=>{calls++;assert.match(messages[0].content,/完整段落/);assert.doesNotMatch(JSON.stringify(messages),/base64/);return JSON.stringify({changed:true,text:'### 难点\n\n保留 \\(x=1\\) 的解释。'});});await f.manager.update(f.reader);assert.equal(f.published.length,1);assert.match(f.state.readingSummary.text,/难点/);assert.equal(f.state.readingSummary.processed.length,1);assert.ok(f.writes.length>=2);await f.manager.update(f.reader);assert.equal(calls,1);assert.equal(f.state.conversations[0].history.length,2);await f.manager.stop();
});
test('a no-change decision advances the checkpoint without rewriting the saved note',async()=>{
 const f=fixture();pair(f.state);f.state.readingSummary=f.S.clean({text:'已有理解',noteKey:'NOTE0001',noteHTML:'old'});f.generate(async()=>'{"changed":false}');await f.manager.update(f.reader);assert.equal(f.state.readingSummary.text,'已有理解');assert.equal(f.state.readingSummary.processed.length,1);assert.equal(f.published.length,0);await f.manager.stop();
});
test('failed or cancelled background generation preserves the previous note and unfinished checkpoint',async()=>{
 const f=fixture();pair(f.state);f.state.readingSummary=f.S.clean({text:'已有理解'});f.generate(async()=>{throw Error('HTTP400');});await f.manager.update(f.reader);assert.equal(f.state.readingSummary.text,'已有理解');assert.equal(f.state.readingSummary.processed.length,0);assert.match(f.state.readingSummary.error,/HTTP400/);let resolve;f.generate(()=>new Promise(r=>resolve=r));const run=f.manager.update(f.reader);while(!resolve)await new Promise(r=>setTimeout(r,0));f.manager.pause();resolve('{"changed":true,"text":"过期结果"}');await run;assert.equal(f.state.readingSummary.text,'已有理解');assert.equal(f.published.length,0);await f.manager.stop();
});
test('manual edits create a pending note and applying it keeps the original through a new note version',async()=>{
 const f=fixture();pair(f.state);f.state.readingSummary=f.S.clean({text:'旧版',noteKey:'NOTE0001',noteHTML:'old'});f.manager.adapter.publish=async(_r,text,record,force)=>force?{noteKey:'NOTE0002',noteHTML:'new'}:{conflict:'manual-edit'};await f.manager.update(f.reader);assert.equal(f.state.readingSummary.text,'旧版');assert.ok(f.state.readingSummary.pendingText);assert.equal(f.state.readingSummary.pendingReason,'manual-edit');await f.manager.apply(f.reader);assert.equal(f.state.readingSummary.noteKey,'NOTE0002');assert.equal(f.state.readingSummary.pendingText,'');await f.manager.stop();
});
test('summary HTML uses Zotero math nodes and makes document HTML inert',()=>{
 const S=api(),html=S.noteHTML('### 难点\n\n符号 \\(x_1\\) 与推导。\n\n\\[y=Hu+e\\]\n\n<script>bad()</script>','阅读摘要','zma-summary://1/ABCD1234');assert.match(html,/<span class="math">\$x_1\$/);assert.match(html,/<pre class="math">\$\$y=Hu\+e\$\$/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('a stalled summary times out without trapping the manager or replacing the last note',async()=>{
 const f=fixture();f.manager.adapter.timeout=15;pair(f.state);f.state.readingSummary=f.S.clean({text:'已有笔记'});f.generate(()=>new Promise(()=>{}));await f.manager.update(f.reader);assert.match(f.state.readingSummary.error,/超时/);assert.equal(f.state.readingSummary.text,'已有笔记');assert.equal(f.manager.active,null);await f.manager.stop();
});
test('explicit pending-note publication is serialized across repeated clicks',async()=>{
 const f=fixture();f.state.readingSummary=f.S.clean({pendingText:'待合并摘要',pendingReason:'manual-edit'});let release,calls=0;f.manager.adapter.publish=async()=>{calls++;await new Promise(r=>release=r);return {noteKey:'NOTE0002',noteHTML:'new'};};const first=f.manager.apply(f.reader);await assert.rejects(f.manager.apply(f.reader),/等待/);release();await first;assert.equal(calls,1);await f.manager.stop();
});
test('manual bounded batches retain a visible remaining count when automatic updates are disabled',async()=>{
 const f=fixture();f.manager.adapter.enabled=()=>false;pair(f.state,'问题一','解释一');pair(f.state,'问题二','解释二');C.createConversation(f.state,'third');pair(f.state,'问题三','解释三');await f.manager.update(f.reader);assert.equal(f.state.readingSummary.remaining,1);assert.equal(f.manager.status(f.reader),'idle');await f.manager.update(f.reader);assert.equal(f.state.readingSummary.remaining,0);assert.equal(f.state.readingSummary.processed.length,3);await f.manager.stop();
});
test('disabling automatic work removes waiting state as well as timers',async()=>{
 const f=fixture();f.manager.schedule(f.reader);assert.equal(f.manager.status(f.reader),'waiting');f.manager.cancelAutomatic();assert.equal(f.manager.status(f.reader),'idle');assert.equal(f.manager.timers.size,0);await f.manager.stop();
});
