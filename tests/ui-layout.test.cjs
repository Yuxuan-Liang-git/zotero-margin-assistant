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

test('reader focus navigation leaves composer caret, selection, multiline editing and IME to the browser',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{
      globalThis.readerMoves=0;globalThis.sent=0;
      // Zotero 10 FocusManager's capture-phase guard omits textarea.
      window.addEventListener('keydown',event=>{
        if(event.key.startsWith('Arrow')&&!event.target.closest('[contenteditable], input[type="text"], .preview-popup')){
          event.preventDefault();readerMoves++;
        }
      },true);
      globalThis.caretPanel=await fixture.host.panel(fixture.reader);caretPanel.showChat();caretPanel.send=async()=>{sent++;};
    });
    const input=page.getByRole('textbox',{name:'问题',exact:true});await input.fill('甲🙂乙\nabc def');
    const selection=()=>input.evaluate(node=>({start:node.selectionStart,end:node.selectionEnd}));
    await input.evaluate(node=>node.setSelectionRange(4,4));
    await input.press('ArrowLeft');assert.deepEqual(await selection(),{start:3,end:3});
    await input.press('ArrowLeft');assert.deepEqual(await selection(),{start:1,end:1},'native editing must skip a whole emoji');
    await input.press('Shift+ArrowRight');assert.deepEqual(await selection(),{start:1,end:3});
    await input.press('Shift+ArrowLeft');assert.deepEqual(await selection(),{start:1,end:1});
    await input.press('ArrowRight');assert.deepEqual(await selection(),{start:3,end:3});
    await input.press('Control+End');await input.press('Home');assert.deepEqual(await selection(),{start:5,end:5});
    await input.press('End');assert.deepEqual(await selection(),{start:12,end:12});
    await input.press('ArrowUp');assert.ok((await selection()).start<5);
    await input.press('ArrowDown');assert.ok((await selection()).start>=5);
    await input.press('Control+End');await input.press('Control+Shift+ArrowLeft');assert.deepEqual(await selection(),{start:9,end:12});
    assert.equal(await page.evaluate(()=>readerMoves),0,'editing arrows must not trigger PDF focus navigation');
    await input.press('Control+End');await input.press('Shift+Enter');assert.equal(await input.inputValue(),'甲🙂乙\nabc def\n');
    await input.evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));
    assert.equal(await page.evaluate(()=>sent),0);await input.press('Enter');assert.equal(await page.evaluate(()=>sent),1);
    await page.evaluate(()=>document.getElementById('split-view').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
    assert.equal(await page.evaluate(()=>readerMoves),1,'reader shortcuts outside the composer still work');
  }finally{await browser.close();}
});
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

test('toolbar reopens the sidebar after the reader detaches its previously mounted node',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{fixture.host.onToolbar({reader:fixture.reader,doc:document,append:b=>document.body.append(b)});const panel=await fixture.host.panel(fixture.reader);panel.showChat();panel.question.value='保留的追问';panel.close();panel.node.remove();});
    await page.locator('.zma-toolbar').click();await page.waitForTimeout(40);assert.equal(await page.locator('.zma-panel').count(),1);assert.ok(await page.locator('.zma-panel').isVisible());assert.equal(await page.locator('[data-zma="question"]').inputValue(),'保留的追问');
  }finally{await browser.close();}
});

test('text references render their actual passage in the margin card without a screenshot',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{fixture.source.kind='text';fixture.source.text='前文定义：\\(x^2=a+b\\)';fixture.host.capture=async()=>({source:fixture.source,text:fixture.source.text,width:0,height:0});fixture.host.attachCard(fixture.session,fixture.runtime);});await page.waitForTimeout(80);
    assert.match(await page.locator('.zma-inline-reference').innerText(),/前文定义/);assert.equal(await page.locator('.zma-inline-reference img').count(),0);
  }finally{await browser.close();}
});

test('Enter sends automatic PDF context without manually adding material; Shift Enter only adds a line',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{const panel=await fixture.host.panel(fixture.reader);panel.showChat();fixture.host.documentContext=async()=>({mode:'full-text',text:'PMSM paper abstract and conclusion from all 12 pages.',pages:[1,12],totalPages:12,title:'Current PDF'});fixture.host.client.generate=async messages=>{globalThis.actualMessages=messages;return 'document summary';};});
    await page.locator('[data-zma="question"]').fill('当前这篇论文讲了什么');await page.locator('[data-zma="question"]').press('Shift+Enter');assert.match(await page.locator('[data-zma="question"]').inputValue(),/\n$/);assert.equal(await page.evaluate(()=>!!globalThis.actualMessages),false);
    await page.locator('[data-zma="question"]').press('Enter');await page.waitForTimeout(80);const sent=await page.evaluate(()=>globalThis.actualMessages);assert.ok(sent,'Enter must send');assert.ok(sent.at(-1).content.some(p=>p.type==='text'&&p.text.includes('all 12 pages')));
  }finally{await browser.close();}
});

test('Enter while Chinese IME is composing does not send the question',async()=>{
  const {browser,page}=await setup();try{await page.evaluate(async()=>{const panel=await fixture.host.panel(fixture.reader);panel.showChat();panel.question.value='输入中的中文';fixture.host.client.generate=async()=>{globalThis.sentIME=true;return 'answer';};panel.question.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));});await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>!!globalThis.sentIME),false);}finally{await browser.close();}
});

test('restored reader gets its toolbar even when the PDF session is still loading and the toolbar mounts late',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{const host=fixture.host;host.running=false;host.Z.Reader={_readers:[fixture.reader],registerEventListener:()=>{},_unregisterEventListenerByPluginID:()=>{}};host.Z.Notifier={registerObserver:()=>1,unregisterObserver:()=>{}};host.addon.controller.ensureSession=()=>new Promise(()=>{});host.start();});
    await page.evaluate(()=>{const toolbar=document.createElement('div');toolbar.className='toolbar';toolbar.innerHTML='<div class="end"><div class="custom-sections"></div></div>';document.body.append(toolbar);});await page.waitForTimeout(80);assert.equal(await page.locator('.zma-toolbar').count(),1);
  }finally{await browser.close();}
});

test('reader toolbar replacement restores one functional DeepSeek button',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{const host=fixture.host;host.running=false;host.Z.Reader={_readers:[fixture.reader],registerEventListener:()=>{},_unregisterEventListenerByPluginID:()=>{}};host.Z.Notifier={registerObserver:()=>1,unregisterObserver:()=>{}};document.body.insertAdjacentHTML('beforeend','<div class="toolbar"><div class="end"><div class="custom-sections"></div></div></div>');host.start();});await page.waitForTimeout(80);
    await page.evaluate(()=>document.querySelector('.custom-sections').replaceChildren());await page.waitForTimeout(80);assert.equal(await page.locator('.zma-toolbar').count(),1);await page.locator('.zma-toolbar').click();assert.ok(await page.locator('.zma-panel').isVisible());
  }finally{await browser.close();}
});

test('a missing main window during send does not leave the panel busy or the PDF locked',async()=>{
  const {browser,page}=await setup();try{
    const result=await page.evaluate(async()=>{const panel=await fixture.host.panel(fixture.reader);panel.question.value='保留问题';fixture.host.newAbortController=()=>{throw new Error('主窗口正在关闭');};let error;try{await panel.send();}catch(e){error=e.message;}return {error,busy:panel.busy,disabled:panel.sendButton.disabled,locks:fixture.host.activeRequests.size,draft:panel.question.value};});assert.match(result.error,/主窗口/);assert.equal(result.busy,false);assert.equal(result.disabled,false);assert.equal(result.locks,0);assert.equal(result.draft,'保留问题');
  }finally{await browser.close();}
});
