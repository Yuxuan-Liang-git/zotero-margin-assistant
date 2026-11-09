const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
function api(){assert.ok(fs.existsSync(__dirname+'/../src/chatgpt.js'),'ChatGPT provider must exist');return require('../src/chatgpt.js');}
const event=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
function fixture(parts){const A=api(),calls=[],auth={state:{activeID:'account'},active:()=>({id:'account',model:'available-model'}),accessToken:async()=> 'subscription-secret',setModels:async(_id,models)=>{auth.models=models;}};const client=new A.ChatGPTClient({auth,fetch:async(url,options)=>{calls.push({url,options});return new Response(parts.join(''));}});return {client,calls,auth,A};}

test('optional web search streams citations and sourced images; summaries do not search',async()=>{
 const f=fixture([event({type:'response.web_search_call.searching'}),event({type:'response.output_text.delta',delta:'论文解释。'}),event({type:'response.output_text.annotation.added',annotation:{type:'url_citation',url:'https://paper.example/a',title:'Paper',start_index:0,end_index:5}}),event({type:'response.output_item.done',item:{type:'web_search_call',results:[{type:'image_result',image_url:'https://cdn.example/fig.png',source_website_url:'https://paper.example/a',caption:'Figure'}]}}),event({type:'response.completed',response:{service_tier:'default'}})]),updates=[];f.client.getWebOptions=()=>({mode:'auto',images:true});await f.client.generate([{role:'user',content:'请查资料并配图解释'}],{onWebUpdate:value=>updates.push(value)});const body=JSON.parse(f.calls[0].options.body);assert.equal(body.tools[0].type,'web_search');assert.deepEqual(body.tools[0].search_content_types,['text','image']);assert.equal(body.tool_choice,'auto');assert.ok(body.include.includes('web_search_call.results'));assert.ok(updates.some(v=>v.used));assert.equal(updates.at(-1).citations[0].url,'https://paper.example/a');assert.equal(updates.at(-1).images[0].caption,'Figure');
 await f.client.generate([{role:'user',content:'summarize'}],{thinking:{type:'disabled'}});assert.equal(JSON.parse(f.calls.at(-1).options.body).tools,undefined);
});
test('web tool rejection is explicit and never silently repeats a subscription request',async()=>{
 const f=fixture([]);let calls=0;f.client.getWebOptions=()=>({mode:'auto',images:true});f.client.fetch=async()=>{calls++;return Response.json({error:{code:'unsupported_parameter',param:'tools',message:'web_search not supported; PRIVATE'}},{status:400});};await assert.rejects(f.client.generate([{role:'user',content:'lookup'}]),e=>e.webRejected&&/联网/.test(e.message)&&!e.message.includes('PRIVATE'));assert.equal(calls,1);
});
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
  const f=fixture([]);f.client.fetch=async()=>Response.json({models:[{slug:'a',display_name:'Model A',visibility:'list'},{slug:'hidden',visibility:'hide'},{slug:'b',display_name:'Model B',visibility:'list'}]});assert.deepEqual(await f.client.models(),[{slug:'a',displayName:'Model A',speedTiers:['default'],capabilitiesVersion:2},{slug:'b',displayName:'Model B',speedTiers:['default'],capabilitiesVersion:2}]);
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
const common=['low','medium','high','xhigh','max'];
test('current Sol capabilities include Extra High and Max while Ultra orchestration is not sent as reasoning',()=>{
 const A=api();assert.deepEqual(A.reasoningEfforts({slug:'gpt-6.1-sol'}),common);
 assert.deepEqual(A.reasoningEfforts({slug:'gpt-6.1-sol',reasoningEfforts:['low','medium','high']}),common);
 assert.deepEqual(A.reasoningEfforts({slug:'gpt-6.1-sol',supported_reasoning_levels:[{effort:'high'},{effort:'max'},{effort:'ultra'}]}),['high','max']);
 assert.deepEqual(A.reasoningEfforts({slug:'gpt-6.1-sol',capabilitiesVersion:2,reasoningEfforts:['low','high']}),['low','high']);
});
test('speed requests are independent of reasoning and report the confirmed tier including downgrade',async()=>{
 for(const speed of ['default','fast','ultrafast']){
  const f=fixture([event({type:'response.completed',response:{service_tier:'default'}})]),confirmed=[];
  f.auth.active=()=>({id:'account',model:'gpt-6.1-sol',reasoningEffort:'max',speed,models:[{slug:'gpt-6.1-sol'}]});
  await f.client.generate([{role:'user',content:'q'}],{onServiceTier:info=>confirmed.push(info)});
  const body=JSON.parse(f.calls[0].options.body);assert.equal(body.reasoning.effort,'max');assert.equal(body.service_tier,speed==='fast'?'priority':speed);assert.deepEqual(confirmed,[{requested:speed,actual:'default'}]);
 }
});
test('account catalog speed restrictions are respected and unsupported selected tiers do not trigger inference',async()=>{
 const f=fixture([event({type:'response.completed'})]);f.auth.active=()=>({id:'account',model:'custom',speed:'ultrafast',models:[{slug:'custom',speedTiers:['default','fast']}]});
 await assert.rejects(f.client.generate([{role:'user',content:'q'}]),/速度|档位/);assert.equal(f.calls.length,0);
 f.client.fetch=async()=>Response.json({models:[{slug:'gpt-6.1-sol',visibility:'list',service_tiers:[{id:'priority'},{id:'ultrafast'}],supported_reasoning_levels:[{effort:'max'},{effort:'ultra'}]}]});
 const model=(await f.client.models())[0];assert.deepEqual(model.speedTiers,['default','fast','ultrafast']);assert.deepEqual(model.reasoningEfforts,['max']);
});
test('a rejected speed tier exposes safe parameter diagnostics without leaking server echoes or retrying',async()=>{
 const f=fixture([]);f.auth.active=()=>({id:'account',model:'gpt-6.1-sol',reasoningEffort:'high',speed:'fast',models:[{slug:'gpt-6.1-sol'}]});
 f.client.fetch=async(url,options)=>{f.calls.push({url,options});return Response.json({error:{code:null,type:'invalid_request_error',param:'service_tier',message:'Invalid service_tier: subscription-secret PDF private'}},{status:400});};
 await assert.rejects(f.client.generate([{role:'user',content:'PDF private'}]),e=>{assert.equal(e.speedRejected,true);assert.match(e.message,/标准/);assert.match(e.message,/400/);assert.match(e.message,/service_tier/);assert.doesNotMatch(e.message,/subscription-secret|PDF private/);return true;});assert.equal(f.calls.length,1);assert.equal(JSON.parse(f.calls[0].options.body).service_tier,'priority');
});
test('unknown HTTP input errors retain safe HTTP diagnostics and are not mistaken for a speed rejection',async()=>{
 const f=fixture([]);f.client.fetch=async()=>Response.json({error:{code:'arbitrary-secret-code',param:'input',message:'PDF private'}},{status:400});
 await assert.rejects(f.client.generate([{role:'user',content:'q'}]),e=>{assert.equal(e.speedRejected,false);assert.match(e.message,/400/);assert.match(e.message,/input/);assert.doesNotMatch(e.message,/arbitrary-secret|PDF private/);return true;});
});
test('SSE speed rejection preserves partial answer and exposes the same actionable reason',async()=>{
 const f=fixture([event({type:'response.output_text.delta',delta:'partial'}),event({type:'response.failed',response:{error:{code:'invalid_request_error',param:'service_tier',message:'service_tier is not allowed'}}})]);
 await assert.rejects(f.client.generate([{role:'user',content:'q'}]),e=>e.speedRejected===true&&e.partial==='partial'&&e.incomplete===true);
});
test('PDF attachment content maps to Responses input_file and DeepSeek rejects PDFs before network',async()=>{
 const D=require('../src/deepseek.js'),record={name:'notes.pdf',mime:'application/pdf',dataURL:'data:application/pdf;base64,JVBERi0xLjc='};
 const messages=D.buildMessages([],'解释附件',[],undefined,'',[record]);const body=api().requestBody(messages,'gpt-6.1-sol');assert.equal(body.input[0].content.find(p=>p.type==='input_file').filename,'notes.pdf');assert.equal(body.input[0].content.find(p=>p.type==='input_file').file_data,record.dataURL);
 let calls=0;const client=new D.DeepSeekClient({getKey:()=> 'key',fetch:async()=>{calls++;throw Error();}});await assert.rejects(client.generate(messages),/PDF.*ChatGPT/);assert.equal(calls,0);
});
