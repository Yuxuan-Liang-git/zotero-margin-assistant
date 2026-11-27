const test=require('node:test'),assert=require('node:assert/strict');
const {GeminiClient}=require('../src/gemini.js');
const {ChatGPTClient}=require('../src/chatgpt.js');
const {CredentialStore}=require('../src/credentials.js');

test('Gemini sends PDF, screenshots, instructions and history; streams only answer text',async()=>{
  const request=[];const encoder=new TextEncoder();
  const response='data: '+JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'private'},{text:'答案'}]}}]})+'\r\n\r\ndata: '+JSON.stringify({candidates:[{content:{parts:[{text:'完成'}]},finishReason:'STOP'}]});
  const client=new GeminiClient({getKey:()=>'fake-key',getModel:()=>'gemini-fixture',fetch:async(url,options)=>{request.push({url,options});const bytes=encoder.encode(response);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}}));}});
  const deltas=[];
  assert.equal(await client.generate([{role:'system',content:'解释论文'},{role:'user',content:'旧问题'},{role:'assistant',content:'旧回答'},{role:'user',content:[{type:'text',text:'请解释公式'},{type:'file',file:{file_data:'data:application/pdf;base64,YQ=='}},{type:'image_url',image_url:{url:'data:image/png;base64,Yg=='}}]}],{onDelta:value=>deltas.push(value)}),'答案完成');
  assert.deepEqual(deltas,['答案','完成']);
  const {url,options}=request[0];assert.match(url,/\/gemini-fixture:streamGenerateContent\?alt=sse$/);assert.equal(options.headers['x-goog-api-key'],'fake-key');assert.equal(options.redirect,'error');assert.doesNotMatch(url,/fake-key/);
  const body=JSON.parse(options.body);assert.deepEqual(body.systemInstruction,{parts:[{text:'解释论文'}]});assert.deepEqual(body.contents.map(m=>m.role),['user','model','user']);assert.deepEqual(body.contents.at(-1).parts.slice(1),[{inlineData:{mimeType:'application/pdf',data:'YQ=='}},{inlineData:{mimeType:'image/png',data:'Yg=='}}]);
});

test('Gemini reads successive catalog pages and rejects incomplete streaming replies',async()=>{
  let calls=0;
  const client=new GeminiClient({getKey:()=>'fake-key',getModel:()=>'gemini-example',fetch:async url=>{
    calls++;if(calls===1)return Response.json({models:[{name:'models/gemini-a',supportedGenerationMethods:['embedContent']}],nextPageToken:'a+b'});
    if(calls===2){assert.match(url,/pageToken=a%2Bb/);return Response.json({models:[{name:'models/gemini-example',displayName:'Example',supportedGenerationMethods:['generateContent']}]});}
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}\n\n');
  }});
  assert.deepEqual(await client.models(),[{slug:'gemini-example',displayName:'Example'}]);
  await assert.rejects(client.generate([{role:'user',content:'question'}]),e=>e.incomplete&&e.partial==='partial');
});

test('Gemini credentials restore without touching DeepSeek settings',async()=>{
  const entries=new Map();const adapter={get:k=>entries.get(k),set:(k,v)=>entries.set(k,v),clear:k=>entries.delete(k),encrypt:async v=>'oskv1:'+Buffer.from(v).toString('base64'),decrypt:async v=>Buffer.from(v.slice(6),'base64').toString()};
  const config={keyPref:'margincomments.geminiKey',modelPref:'margincomments.geminiModel',defaultModel:'',label:'Gemini'};
  await new CredentialStore(adapter).save('deepseek-test','deepseek-flash');
  const gemini=new CredentialStore(adapter,config);await gemini.save('gemini-test','');await gemini.save('','gemini-example');
  assert.deepEqual(await new CredentialStore(adapter,config).load(),{key:'gemini-test',model:'gemini-example'});
  assert.notEqual(entries.get(config.keyPref),'gemini-test');await gemini.clear();assert.equal((await new CredentialStore(adapter).load()).key,'deepseek-test');
});

test('ChatGPT only offers list-visible models and distinguishes hidden, absent and available Sol',async()=>{
  let catalog,stored;const auth={state:{activeID:'test'},accessToken:async()=>'fake-token',setModels:async(id,models)=>{assert.equal(id,'test');stored=models;}};
  const prior={slug:'gpt-6.1-sol',visibility:'list'},sol={slug:'gpt-6.2-sol',display_name:'GPT-6.2 Sol'};
  for(const [entries,status,count] of [[[prior,{...sol,visibility:'hide'}],'not-listed',1],[[prior],'absent',1],[[prior,{...sol,visibility:'list'}],'available',2]]){
    const client=new ChatGPTClient({auth,fetch:async()=>Response.json({models:entries})});await client.models(info=>{catalog=info;});
    assert.deepEqual(catalog,{count,sol:status});assert.equal(stored.some(m=>m.slug===sol.slug),status==='available');
  }
});
