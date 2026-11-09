const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const modulePath='../src/reading-summary.js';
function api(){return require(modulePath);}
function note(body='公式和条件的解释。'){return '# 文章内容\n\n文章研究线性回归中的参数估计，观测量与回归量已知。\n\n# 关键公式解释\n\n'+body+'\n\n# 补充讨论\n\n极限结论需要结合辨识条件核实。';}
function pair(state,q='为什么需要正则性？',a='正则性用于保证极限与求导的交换，需要结合原文的具体条件。') {const c=C.activeConversation(state);c.history.push({role:'user',content:q,materials:[]},{role:'assistant',content:a,materials:[],incomplete:false});}
function fixture(){const S=api(),state=C.emptyState(),writes=[],published=[],events=[];let generation=async()=>JSON.stringify({changed:true,text:note('这里整理已经澄清的条件，公式为 \\(y=Hu+e\\)。')});const manager=new S.Manager({key:r=>r.key,load:async()=>state,save:async(_r,s)=>{writes.push(JSON.parse(JSON.stringify(s)));},publish:async(_r,text,record,force)=>{published.push({text,force});return {noteKey:'NOTE0001',noteHTML:'stored HTML'};},client:()=>({generate:(...args)=>generation(...args)}),notify:(r,v)=>events.push(v),enabled:()=>true,foreground:()=>false,delay:20000});return {S,state,manager,writes,published,events,reader:{key:'1-ABCD1234'},generate:f=>{generation=f;}};}
test('reading summary collects complete pairs across PDF conversations and never includes attachment bytes',()=>{
 const S=api(),state=C.emptyState();pair(state);state.conversations[0].history[0].attachments=[{dataURL:'SECRET_IMAGE_BYTES'}];C.createConversation(state,'next');pair(state,'为什么公式(6.30)可用于(7.41)？','由式(6.30)的假设可得结论。');pair(state,'未回答问题','');state.conversations[1].history.at(-1).incomplete=true;const turns=S.collect(state);assert.equal(turns.length,2);assert.match(turns[1].text,/6\.30/);assert.doesNotMatch(JSON.stringify(turns),/SECRET_IMAGE_BYTES/);assert.notEqual(turns[0].id,turns[1].id);
});
test('summary round trip is optional for old states and validates progress without changing chat compaction',()=>{
 const S=api(),state=C.emptyState();pair(state);state.readingSummary=S.clean({text:'公式 \\(x=1\\)',processed:[S.collect(state)[0].id],noteKey:'NOTE0001'});const restored=C.cleanState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.readingSummary,state.readingSummary);assert.equal(restored.conversations[0].summary,'');assert.equal(C.cleanState(C.emptyState()).readingSummary,undefined);
});
test('long complete answers are split without omitting text and result parsing rejects incomplete note updates',()=>{
 const S=api(),state=C.emptyState(),answer='推导与条件。'.repeat(6000);pair(state,'问题',answer);const entries=S.collect(state);assert.ok(entries.length>2);assert.ok(entries.every(e=>e.text.length<=12000));assert.equal(entries.map(e=>e.text).join('').includes(answer),true);assert.throws(()=>S.parseResult('{"changed":true,"text":""}'),/笔记/);assert.deepEqual(S.parseResult('```json\n{"changed":false}\n```'),{changed:false,text:''});
});
test('an incremental summary is independently persisted and unchanged input makes no extra request',async()=>{
 const f=fixture();pair(f.state);let calls=0;f.generate(async messages=>{calls++;assert.match(messages[0].content,/完整段落/);assert.doesNotMatch(JSON.stringify(messages),/base64/);return JSON.stringify({changed:true,text:note('保留难点及 \\(x=1\\) 的解释。')});});await f.manager.update(f.reader);assert.equal(f.published.length,1);assert.match(f.state.readingSummary.text,/难点/);assert.equal(f.state.readingSummary.processed.length,1);assert.ok(f.writes.length>=2);await f.manager.update(f.reader);assert.equal(calls,1);assert.equal(f.state.conversations[0].history.length,2);await f.manager.stop();
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

test('direct Markdown notes preserve LaTeX without a JSON escape layer and reject partial documents',()=>{
 const S=api(),text=note('定义 \\(\\Gamma^{-1}\\) 为逆矩阵。\n\n\\[\\frac{d}{dt}\\Gamma^{-1}=\\zeta\\varphi^{\\mathsf T}.\\]');
 assert.deepEqual(S.parseResult(text),{changed:true,text});assert.deepEqual(S.parseResult('\uFEFF```markdown\n'+text+'\n```'),{changed:true,text});assert.deepEqual(S.parseResult('<!-- zma-note:unchanged -->'),{changed:false,text:''});
 assert.deepEqual(S.parseResult(JSON.stringify({changed:true,text})),{changed:true,text});assert.throws(()=>S.parseResult('# 文章内容\n\n未完成的段落'),/章节|完整/);assert.throws(()=>S.parseResult('正文之前<!-- zma-note:unchanged -->'),/格式|章节/);assert.throws(()=>S.parseResult('{"changed":true,"text":"\\Gamma"}'),/格式/);
});

test('editor prompt requests a standalone thematic note with selective in-place revision and article metadata',()=>{
 const S=api(),messages=S.prompt(note('旧的公式解释'),{text:'用户问题：C1是什么意思？\n助手解释：条件C1要求A可逆。'},{article:{title:'IV辨识论文',year:'2021'},reorganize:true}),system=messages[0].content,data=JSON.parse(messages[1].content);
 for(const heading of ['# 文章内容','# 关键公式解释','# 补充讨论'])assert.ok(system.includes(heading));
 for(const phrase of ['独立阅读','对应章节','重复','符号','对话过程','无需更新','Markdown'])assert.ok(system.includes(phrase),phrase);
 assert.doesNotMatch(system,/只返回JSON/);assert.equal(data.article.title,'IV辨识论文');assert.equal(data.reorganize,true);assert.match(data.existingSummary,/旧的公式解释/);assert.match(data.newDialogue,/C1/);
});

test('legacy processed summaries are reorganized even when no new question exists and progress survives a round trip',async()=>{
 const f=fixture();pair(f.state,'条件C1是什么意思？','条件C1要求信息矩阵可逆。');const ids=f.S.collect(f.state).map(e=>e.id);f.state.readingSummary=f.S.clean({version:1,text:'新增问答C1的讨论。',processed:ids,noteKey:'NOTE0001',noteHTML:'old'});assert.equal(f.state.readingSummary.formatVersion,1);
 let calls=0;f.generate(async messages=>{calls++;assert.equal(JSON.parse(messages[1].content).reorganize,true);return note('条件C1要求信息矩阵可逆，保证估计值有定义。');});await f.manager.update(f.reader);
 assert.equal(calls,1);assert.equal(f.state.readingSummary.formatVersion,2);assert.equal(f.published.length,1);assert.deepEqual(f.state.readingSummary.processed,ids);assert.equal(C.cleanState(JSON.parse(JSON.stringify(f.state))).readingSummary.formatVersion,2);await f.manager.update(f.reader);assert.equal(calls,1);await f.manager.stop();
});

test('reorganization cannot consume legacy progress after a no-change reply, format error or cancellation',async()=>{
 const f=fixture();pair(f.state);const ids=f.S.collect(f.state).map(e=>e.id);f.state.readingSummary=f.S.clean({version:1,text:'旧的会话摘录',processed:ids});
 for(const response of ['<!-- zma-note:unchanged -->','# 文章内容\n\n截断内容']){f.generate(async()=>response);await f.manager.update(f.reader);assert.ok(f.state.readingSummary.error);assert.equal(f.state.readingSummary.text,'旧的会话摘录');assert.deepEqual(f.state.readingSummary.processed,ids);assert.equal(f.state.readingSummary.formatVersion,1);}
 assert.equal(f.published.length,0);await f.manager.stop();
});

test('legacy notes can be reorganized without surviving chats while an empty PDF does not request invented content',async()=>{
 const f=fixture();f.state.readingSummary=f.S.clean({version:1,text:'旧笔记已有回归方程及适用条件。',processed:['old@1:abc~0']});let calls=0;
 f.generate(async messages=>{calls++;assert.match(JSON.parse(messages[1].content).existingSummary,/回归方程/);return note();});await f.manager.update(f.reader);assert.equal(calls,1);assert.equal(f.state.readingSummary.formatVersion,2);await f.manager.stop();
 const empty=fixture();empty.generate(async()=>{throw Error('没有资料不应调用');});await empty.manager.update(empty.reader);assert.equal(empty.state.readingSummary.error,'');assert.equal(empty.published.length,0);await empty.manager.stop();
});

test('legacy pending publications are reorganized before publication and manual originals stay protected',async()=>{
 const f=fixture();pair(f.state);f.state.readingSummary=f.S.clean({version:1,text:'旧笔记',pendingText:'旧的待发布问答摘录',pendingReason:'publish'});f.generate(async()=>note());await f.manager.update(f.reader);assert.ok(f.published.length);assert.ok(f.published.every(p=>p.text.startsWith('# 文章内容')));await f.manager.stop();
 const edited=fixture();pair(edited.state);edited.state.readingSummary=edited.S.clean({version:1,text:'人工版本基线',pendingText:'旧候选',pendingReason:'manual-edit'});edited.generate(async()=>note());await edited.manager.update(edited.reader);assert.equal(edited.state.readingSummary.text,'人工版本基线');assert.equal(edited.state.readingSummary.pendingReason,'manual-edit');assert.match(edited.state.readingSummary.pendingText,/^# 文章内容/);assert.equal(edited.published.length,0);await edited.manager.stop();
});

test('summary generation carries bounded bibliographic context and a sufficient output budget',async()=>{
 const f=fixture();pair(f.state);f.manager.adapter.context=()=>({title:'论文标题',year:'2020'});f.generate(async(messages,options)=>{assert.equal(JSON.parse(messages[1].content).article.title,'论文标题');assert.ok(options.maxTokens>=8192);return note();});await f.manager.update(f.reader);assert.equal(f.state.readingSummary.error,'');assert.equal(f.published.length,1);await f.manager.stop();
});

test('cancelling legacy reorganization leaves the previous format and consumed progress intact',async()=>{
 const f=fixture();pair(f.state);const ids=f.S.collect(f.state).map(e=>e.id);f.state.readingSummary=f.S.clean({version:1,text:'旧笔记',processed:ids});let finish;f.generate(()=>new Promise(r=>finish=r));const pending=f.manager.update(f.reader);while(!finish)await new Promise(r=>setTimeout(r,0));f.manager.pause();finish(note());await pending;assert.equal(f.state.readingSummary.formatVersion,1);assert.deepEqual(f.state.readingSummary.processed,ids);assert.equal(f.state.readingSummary.text,'旧笔记');assert.equal(f.published.length,0);await f.manager.stop();
});

test('legacy progress at the old limit can be replaced by the new editorial checkpoint',async()=>{
 const f=fixture();pair(f.state);f.state.readingSummary=f.S.clean({version:1,text:'旧笔记',processed:Array.from({length:40000},(_,i)=>'old'+i)});f.generate(async()=>note());await f.manager.update(f.reader);assert.equal(f.state.readingSummary.error,'');assert.equal(f.state.readingSummary.formatVersion,2);assert.equal(f.state.readingSummary.processed.length,1);await f.manager.stop();
});

test('Windows line endings are accepted in a complete note and in Markdown or legacy JSON fences',()=>{
 const S=api(),text=note();for(const value of [text,'```markdown\n'+text+'\n```','```json\n'+JSON.stringify({changed:true,text})+'\n```'])assert.deepEqual(S.parseResult(value.replace(/\n/g,'\r\n')),{changed:true,text});
});

test('aligned formula line spacing is preserved without being mistaken for a display delimiter',()=>{
 const S=api(),text=note('定义e为误差，H为模型，u为输入，参数为theta。\n\n\\[\\begin{aligned} e &= y-Hu \\\\[4pt] \\frac{\\partial e}{\\partial\\theta}&=-\\frac{\\partial H}{\\partial\\theta}u.\\end{aligned}\\]');assert.deepEqual(S.parseResult(text),{changed:true,text});assert.throws(()=>S.parseResult(note('公式未结束 \\[x=1')),/公式不完整/);
});
