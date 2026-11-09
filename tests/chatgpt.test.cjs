const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
function api(){assert.ok(fs.existsSync(__dirname+'/../src/chatgpt.js'),'ChatGPT provider must exist');return require('../src/chatgpt.js');}
const event=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
function fixture(parts){const A=api(),calls=[],auth={state:{activeID:'account'},active:()=>({id:'account',model:'available-model'}),accessToken:async()=> 'subscription-secret',setModels:async(_id,models)=>{auth.models=models;}};const client=new A.ChatGPTClient({auth,fetch:async(url,options)=>{calls.push({url,options});return new Response(parts.join(''));}});return {client,calls,auth,A};}
test('Responses uses account token, explicit local history/images and instructions without unsupported fields',async()=>{
  const f=fixture([event({type:'response.output_text.delta',delta:'你好'}),event({type:'response.completed'})]),deltas=[];
  assert.equal(await f.client.generate([{role:'system',content:'academic'},{role:'assistant',content:'old answer'},{role:'user',content:[{type:'text',text:'current PDF'},{type:'image_url',image_url:{url:'data:image/png;base64,AAA='}}]}],{maxTokens:65536,thinking:{type:'disabled'},onDelta:d=>deltas.push(d)}),'你好');
  const {url,options}=f.calls[0],body=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer subscription-secret');assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.instructions,'academic');assert.equal(body.input[0].content[0].type,'output_text');assert.equal(body.input[1].content[1].type,'input_image');assert.deepEqual(deltas,['你好']);for(const key of ['max_output_tokens','thinking','previous_response_id','conversation','temperature'])assert.equal(key in body,false);
});
test('partial stream and subscription limit error remain incomplete with safe recovery details',async()=>{
  const f=fixture([event({type:'response.output_text.delta',delta:'partial'}),event({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded',message:'DO NOT LEAK '+ 'subscription-secret'}}})]);
  await assert.rejects(f.client.generate([{role:'user',content:'PDF private'}]),e=>{assert.equal(e.partial,'partial');assert.equal(e.incomplete,true);assert.equal(e.usageLimit,true);assert.match(e.message,/额度/);assert.doesNotMatch(e.message,/subscription-secret|DO NOT LEAK/);return true;});
});
test('DONE alone and interrupted/incomplete SSE never masquerade as completed answers',async()=>{
  for(const terminal of ['data: [DONE]\n\n',event({type:'response.incomplete'})]){
    const f=fixture([event({type:'response.output_text.delta',delta:'部分'}),terminal]);await assert.rejects(f.client.generate([{role:'user',content:'q'}]),e=>e.partial==='部分'&&e.incomplete===true);
  }
});
test('model choices preserve server order and display labels and exclude non-list entries',async()=>{
  const f=fixture([]);f.client.fetch=async()=>Response.json({models:[{slug:'a',display_name:'Model A',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'b',display_name:'Model B',visibility:'list'}]});assert.deepEqual(await f.client.models(),[{slug:'a',displayName:'Model A'},{slug:'b',displayName:'Model B'}]);
});
test('401 retries only once after refreshing this registration, never after partial output',async()=>{
  const f=fixture([]),tokens=[];let count=0;f.auth.accessToken=async(id,force)=>{tokens.push({id,force});return 'secret';};f.client.fetch=async()=>++count===1?new Response('{}',{status:401}):new Response(event({type:'response.completed'}));await f.client.generate([{role:'user',content:'q'}]);assert.equal(count,2);assert.deepEqual(tokens.map(t=>!!t.force),[false,true]);assert.ok(tokens.every(t=>t.id==='account'));
});

test('refusal streams display their text once instead of returning an empty successful answer',async()=>{
  for(const parts of [[event({type:'response.refusal.delta',delta:'无法回答'}),event({type:'response.refusal.done',refusal:'无法回答'})],[event({type:'response.refusal.done',refusal:'无法回答'})]]){
    const f=fixture([...parts,event({type:'response.completed'})]),deltas=[];assert.equal(await f.client.generate([{role:'user',content:'q'}],{onDelta:d=>deltas.push(d)}),'无法回答');assert.equal(deltas.join(''),'无法回答');
  }
});

test('selected reasoning effort reaches Responses and account model capabilities filter unsupported levels',async()=>{
  const f=fixture([event({type:'response.completed'})]);f.auth.active=()=>({id:'account',model:'gpt-6.1-sol',reasoningEffort:'high',models:[{slug:'gpt-6.1-sol',reasoningEfforts:['low','medium','high']}]});await f.client.generate([{role:'user',content:'derive'}]);assert.deepEqual(JSON.parse(f.calls[0].options.body).reasoning,{effort:'high'});
  f.client.fetch=async()=>Response.json({models:[{slug:'gpt-6.1-sol',display_name:'Sol',visibility:'list',supported_reasoning_levels:[{effort:'low'},{effort:'high'},{effort:'unknown'}]}]});assert.deepEqual((await f.client.models())[0].reasoningEfforts,['low','high']);
});
