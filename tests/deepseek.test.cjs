const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const D=fs.existsSync(__dirname+'/../src/deepseek.js')?require('../src/deepseek.js'):{};
const image=n=>({dataURL:'data:image/png;base64,YQ==',text:'formula '+n,source:{number:n,pageLabel:'60'}});
test('joint question includes two images and grounded instruction separate from sources',()=>{
  assert.equal(typeof D.buildMessages,'function');
  const messages=D.buildMessages([],'解释关系',[image('7.41'),image('6.30')]);
  assert.equal(messages[0].role,'system');
  assert.equal(messages[1].content.filter(c=>c.type==='image_url').length,2);
  assert.ok(messages[1].content[0].text.includes('解释关系'));
  assert.throws(()=>D.buildMessages([],'问题',Array(9).fill(image('1'))),/8/);
  assert.throws(()=>D.buildMessages([],'问题',[{...image('1'),dataURL:'https://example.org/a.png'}]),/图片/);
});
test('automatic formula screenshots share the attachment cap and disclose only actually submitted image pages',()=>{
 const page=n=>({...image(''),source:{fullPage:true,pageIndex:n-1,pageLabel:String(n)}}),auto=[page(1),page(7),page(9)],context={title:'Mixed PDF',mode:'full-text',totalPages:12,pages:[1,7],text:'Some extracted prose',materials:auto};
 const files=Array.from({length:6},(_,i)=>({name:i+'.png',mime:'image/png',dataURL:'data:image/png;base64,YQ=='}));
 const selected=D.contextMaterials([page(1)],context,files);assert.deepEqual(selected.map(m=>m.source.pageIndex),[0,6]);
 const parts=D.buildMessages([],'Explain',[page(1)],context,'',files).at(-1).content;assert.equal(parts.filter(p=>p.type==='image_url').length,8);const description=parts.at(-1).text;assert.match(description,/页面图片.*1、7/);assert.doesNotMatch(description,/图片.*9/);assert.match(description,/公式.*文字层/);
});
test('stream handles UTF8 splits and multiline network chunks',async()=>{
  assert.equal(typeof D.DeepSeekClient,'function');
  const raw='data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"解释"}}]}\n\ndata: [DONE]\n\n';
  const bytes=new TextEncoder().encode(raw);const chunks=[];for(let i=0;i<bytes.length;i+=3)chunks.push(bytes.slice(i,i+3));
  let request;const client=new D.DeepSeekClient({getKey:()=> 'secret',fetch:async(url,options)=>{request={url,options};return new Response(new ReadableStream({start(c){chunks.forEach(x=>c.enqueue(x));c.close();}}));}});
  let seen='';const result=await client.generate(D.buildMessages([],'问',[image('6.30')]),{onDelta:s=>seen+=s});
  assert.equal(result,'中文解释');assert.equal(seen,'中文解释');
  assert.equal(request.url,'https://api.deepseek.com/chat/completions');
  assert.equal(JSON.parse(request.options.body).model,'deepseek-flash');
  assert.equal(JSON.parse(request.options.body).max_tokens,65536,'ordinary answers should have the current thinking-mode output allowance');
});
test('completed and partial answers remain available for a follow-up, with a saved recap',()=>{
  const messages=D.buildMessages([{role:'user',content:'介绍方法',materials:[]},{role:'assistant',content:'第一段未完的推导',materials:[],incomplete:true}],'请继续',[],undefined,'较早的对话讨论了定义 A');
  assert.match(messages[1].content,/较早的对话/);
  assert.equal(messages[3].content,'第一段未完的推导');
});
test('summary request uses a small non-thinking budget and rejects truncated recaps',async()=>{
  let body;
  const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async(_url,options)=>{body=JSON.parse(options.body);return new Response('data: {"choices":[{"delta":{"content":"已定义 A，并推导出 B。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}});
  const summary=await client.summarize('旧摘要',[{role:'user',content:'新的问题'},{role:'assistant',content:'新的回答'}]);
  assert.match(summary,/推导出 B/);
  assert.equal(body.thinking.type,'disabled');
  assert.ok(body.max_tokens<=4096);
  assert.ok(body.messages.at(-1).content.includes('新的问题'));
});
test('oversized old dialogue is summarized in bounded pieces',async()=>{
  const requests=[];
  const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return new Response('data: {"choices":[{"delta":{"content":"承接前面的摘要。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}});
  await client.summarize('',[{role:'user',content:'问题'},{role:'assistant',content:'内容'.repeat(15000)}]);
  assert.ok(requests.length>=2);
  assert.ok(requests.every(r=>JSON.stringify(r.messages).length<30000));
});
test('HTTP errors are actionable and do not include keys or server echo',async()=>{
  assert.equal(typeof D.DeepSeekClient,'function');
  for(const [status,expected] of [[401,/API Key/],[429,/限流/],[402,/余额/],[500,/服务/]]){
    const client=new D.DeepSeekClient({getKey:()=> 'private-secret',fetch:async()=>new Response('echo private-secret',{status})});
    await assert.rejects(client.generate([]),e=>expected.test(e.message)&&!e.message.includes('private-secret'));
  }
});
test('interrupted streams retain partial answer and are never marked complete',async()=>{
  assert.equal(typeof D.DeepSeekClient,'function');
  const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')});
  await assert.rejects(client.generate([]),e=>e.partial==='partial'&&e.incomplete===true);
  const controller=new AbortController();controller.abort();
  await assert.rejects(client.generate([],{signal:controller.signal}),e=>e.incomplete===true);
});
test('cancel after the first streamed content preserves partial answer',async()=>{
  const controller=new AbortController();
  const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async()=>new Response('data: {"choices":[{"delta":{"content":"first"}}]}\n\ndata: [DONE]\n\n')});
  await assert.rejects(client.generate([],{signal:controller.signal,onDelta:()=>controller.abort()}),e=>e.partial==='first'&&e.incomplete);
});
test('generation length limit is incomplete even if the SSE protocol ends normally',async()=>{
  const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async()=>new Response('data: {"choices":[{"delta":{"content":"truncated"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n')});
  await assert.rejects(client.generate([]),e=>e.partial==='truncated'&&e.incomplete&&/长度/.test(e.message));
});
