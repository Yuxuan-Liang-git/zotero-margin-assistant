const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
async function setup(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.setContent('<style>body{margin:0;overflow:hidden}#split-view{position:fixed;left:0;right:0;top:40px;bottom:0;background:#eee}.zmc-card{position:absolute;right:10px;top:100px;width:264px;background:white;padding:8px;box-sizing:border-box}</style><div id="split-view"><article class="zmc-card" data-annotation-key="CURRENT2"><div class="zmc-card-preview"></div><footer></footer></article></div>');
  for(const name of ['core','capture','references','deepseek','settings','panel','margin-references','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
  await page.evaluate(css=>{
    const source={libraryID:1,attachmentKey:'ABCD1234',annotationKey:'FORM0630',id:'source1',type:'公式',number:'6.30',pageIndex:60,pageLabel:'60',rects:[[10,20,90,50]],fingerprint:'v1'};
    const state=ZMACore.emptyState();state.sources=[source];const link=ZMACore.sourceLink(source);state.references=[{annotationKey:'CURRENT2',sourceID:source.id,link}];
    const card=document.querySelector('.zmc-card'),preview=card.querySelector('.zmc-card-preview');ZMAReferences.render(preview,ZMACore.storedLink(source));
    const runtime={card,preview,annotation:{key:'CURRENT2',readOnly:false,position:{pageIndex:3}},currentValue:ZMACore.storedLink(source),anchor:{side:'right'},measuredHeights:new Map()};
    const reader={itemID:1,type:'pdf',_iframeWindow:window};const session={reader,adapter:{document:()=>document},cardRuntimes:()=>[runtime],persist:async()=>{},refresh:async()=>{},invalidateRuntimeHeight:()=>{},relayoutRuntime:()=>{},activeKey:'CURRENT2'};
    const annotation={id:2,key:'FORM0630',parentID:1,libraryID:1,isAnnotation:()=>true,annotationType:'image',isEditable:()=>true};const attachment={libraryID:1,key:'ABCD1234',isEditable:()=>true};
    const Z={DataDirectory:{dir:'/data'},File:{getContentsFromURL:()=>css},Items:{get:()=>attachment,getByLibraryAndKey:()=>annotation},Libraries:{get:()=>({libraryType:'user'})}};
    const host=new ZMAHost.Host({bridge:{renderMathPreview:(n,v)=>n.textContent=v,installMathResources:()=>()=>{}},controller:{ensureSession:async()=>session}},{Zotero:Z,IOUtils:{},PathUtils:{join:(...a)=>a.join('/')},window});
    host.running=true;host.load=async()=>state;host.save=async()=>{};host.resolveSource=async()=>source;
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee';ctx.fillRect(0,0,600,160);ctx.fillStyle='#111';ctx.font='28px serif';ctx.fillText('Formula (6.30): x = a + b',15,75);
    host.capture=async()=>({source,dataURL:canvas.toDataURL(),width:600,height:160,text:''});
    globalThis.fixture={source,state,reader,runtime,session,host};
  },fs.readFileSync(path.resolve(__dirname,'../src/assistant.css'),'utf8'));
  return {browser,page};
}
test('references render automatically inside the corresponding margin card without opening chat',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>fixture.host.attachCard(fixture.session,fixture.runtime));
    await page.waitForTimeout(80);
    const result=await page.evaluate(()=>{const ref=document.querySelector('.zma-inline-reference'),img=ref?.querySelector('img');return {inline:!!ref?.closest('.zmc-card'),image:!!img,cardWidth:fixture.runtime.card.getBoundingClientRect().width,refWidth:ref?.getBoundingClientRect().width,chat:!!document.querySelector('.zma-panel')};});
    assert.ok(result.inline,'reference must sit below its margin comment');assert.ok(result.image);assert.ok(result.refWidth<=result.cardWidth);assert.equal(result.chat,false);
    await page.locator('.zmc-card-preview a').click();assert.equal(await page.locator('.zma-inline-reference').count(),1);assert.equal(await page.locator('.zma-panel').count(),0);
  }finally{await browser.close();}
});
test('question sidebar opens before capture finishes and reserves document space',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{fixture.host.capture=()=>new Promise(r=>globalThis.finishCapture=r);fixture.host.onMenu({reader:fixture.reader,params:{ids:['FORM0630']},append:m=>{if(m.label==='向 DeepSeek 提问')m.onCommand();}});});
    await page.waitForTimeout(80);
    const result=await page.evaluate(()=>{const side=document.querySelector('.zma-panel'),view=document.getElementById('split-view');return {open:!!side&&!side.hidden,position:side&&getComputedStyle(side).position,side:side?.getBoundingClientRect().toJSON(),view:view.getBoundingClientRect().toJSON(),viewport:innerWidth};});
    assert.ok(result.open,'sidebar must open before screenshot or API errors');assert.equal(result.position,'fixed');assert.ok(result.view.right<=result.side.left+1,'sidebar must not cover the PDF');assert.ok(result.side.right<=result.viewport+1);
    await page.locator('.zma-panel header button').last().click();const width=await page.locator('#split-view').evaluate(n=>n.getBoundingClientRect().width);assert.equal(width,1440);
  }finally{await browser.close();}
});
test('docked sidebar can resize while maintaining a visible document viewport',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{const panel=await fixture.host.panel(fixture.reader);panel.showChat();});
    assert.equal(await page.locator('.zma-resizer').count(),1);
    const box=await page.locator('.zma-resizer').boundingBox();await page.mouse.move(box.x+2,box.y+50);await page.mouse.down();await page.mouse.move(box.x-120,box.y+50);await page.mouse.up();
    const geometry=await page.evaluate(()=>({side:document.querySelector('.zma-panel').getBoundingClientRect().width,view:document.querySelector('#split-view').getBoundingClientRect().width}));assert.ok(geometry.side>=500);assert.ok(geometry.view>=400);
  }finally{await browser.close();}
});
test('concurrent reference refreshes cannot discard the pending screenshot',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{const original=fixture.host.capture;globalThis.pendingCaptures=[];fixture.host.capture=(...args)=>new Promise(resolve=>pendingCaptures.push(()=>original(...args).then(resolve)));fixture.host.attachCard(fixture.session,fixture.runtime);});
    await page.waitForTimeout(40);await page.evaluate(()=>fixture.host.syncReferences(fixture.session,fixture.runtime));await page.waitForTimeout(40);await page.evaluate(async()=>{await Promise.all(pendingCaptures.map(f=>f()));});await page.waitForTimeout(80);
    assert.equal(await page.locator('.zma-inline-reference img').count(),1);
  }finally{await browser.close();}
});
test('toolbar activation decorates margin cards already created before assistant startup',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>fixture.host.onToolbar({reader:fixture.reader,doc:document,append:b=>document.body.append(b)}));await page.waitForTimeout(80);
    assert.equal(await page.locator('.zma-inline-reference img').count(),1);assert.equal(await page.locator('.zma-insert-reference').count(),1);
  }finally{await browser.close();}
});

test('reopening a deleted reference removes the stale screenshot',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>fixture.host.attachCard(fixture.session,fixture.runtime));await page.waitForTimeout(80);
    assert.equal(await page.locator('.zma-inline-reference img').count(),1);
    await page.evaluate(async()=>{fixture.host.resolveSource=async()=>{throw new Error('来源已删除，需要重新定位');};await fixture.host.previewReference(fixture.reader,fixture.source,{annotationKey:'CURRENT2'});});
    assert.equal(await page.locator('.zma-inline-reference img').count(),0);assert.match(await page.locator('.zma-reference-stack').innerText(),/来源已删除/);
  }finally{await browser.close();}
});

test('unchanged reference links still validate source before reusing a screenshot',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>fixture.host.attachCard(fixture.session,fixture.runtime));await page.waitForTimeout(80);
    await page.evaluate(async()=>{fixture.host.resolveSource=fixture.host.capture=async()=>{throw new Error('来源已删除，需要重新定位');};await ZMAMarginReferences.sync(fixture.host,fixture.session,fixture.runtime);});
    assert.equal(await page.locator('.zma-inline-reference img').count(),0);assert.match(await page.locator('.zma-reference-stack').innerText(),/来源已删除/);
  }finally{await browser.close();}
});

test('send waits for pending material capture rather than silently omitting it',async()=>{
  const {browser,page}=await setup();try{
    const result=await page.evaluate(async()=>{
      const panel=await fixture.host.panel(fixture.reader);let finish,requests=0;const original=fixture.host.capture;
      fixture.host.client.generate=async()=>{requests++;return 'answer';};fixture.host.capture=(...args)=>new Promise(resolve=>{finish=()=>original(...args).then(resolve);});
      const adding=panel.addMaterial(fixture.source);panel.question.value='解释此公式';const disabled=panel.sendButton.disabled;let error='';try{await panel.send();}catch(e){error=e.message;}
      await finish();await adding;return {disabled,error,requests,materials:panel.materials.length,enabled:!panel.sendButton.disabled};
    });
    assert.equal(result.disabled,true);assert.match(result.error,/读取/);assert.equal(result.requests,0);assert.equal(result.materials,1);assert.equal(result.enabled,true);
  }finally{await browser.close();}
});

test('region menu also blocks sending while native source identity is resolving',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{await fixture.host.panel(fixture.reader);fixture.host.resolveSource=()=>new Promise(resolve=>{globalThis.finishIdentity=()=>resolve(fixture.source);});fixture.host.onMenu({reader:fixture.reader,params:{ids:['FORM0630']},append:m=>{if(m.label==='向 DeepSeek 提问')m.onCommand();}});});
    await page.waitForTimeout(40);assert.equal(await page.locator('[data-zma="send"]').isDisabled(),true);
    await page.evaluate(()=>finishIdentity());await page.waitForTimeout(40);assert.equal(await page.locator('[data-zma="send"]').isEnabled(),true);
  }finally{await browser.close();}
});
