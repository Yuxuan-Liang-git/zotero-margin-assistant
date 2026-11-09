const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
async function setup(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.setContent('<style>body{margin:0;overflow:hidden}#split-view{position:fixed;left:0;right:0;top:40px;bottom:0;background:#eee}.zmc-card{position:absolute;right:10px;top:100px;width:264px;background:white;padding:8px;box-sizing:border-box}</style><div id="split-view"><article class="zmc-card" data-annotation-key="CURRENT2"><div class="zmc-card-preview"></div><footer></footer></article></div>');
  for(const name of ['core','capture','references','deepseek','settings','attachments','clipboard','panel','margin-references','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
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

test('ChatGPT provider/model picker routes PDF context and local history to the selected client',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{
      const host=fixture.host;host.provider='deepseek';host.providerState=()=>({provider:host.provider,label:host.provider==='chatgpt'?'ChatGPT':'DeepSeek',signedIn:true,model:'qa-model',models:[{slug:'qa-model',displayName:'QA Model'}],accountLabel:'QA Account'});
      host.setProvider=async value=>{host.provider=value;host.providersChanged();};host.selectedClient=()=>host.provider==='chatgpt'?{generate:async messages=>{globalThis.chatgptInput=messages;return 'ChatGPT 文档答案';},summarize:async()=> 'summary'}:host.client;
      host.documentContext=async()=>({mode:'full-text',text:'current PDF facts',pages:[1],totalPages:1,title:'PDF QA'});
      globalThis.providerPanel=await host.panel(fixture.reader);providerPanel.showChat();
    });
    const selector=page.getByRole('combobox',{name:'AI 服务',exact:true});assert.equal(await selector.count(),1);await selector.selectOption('chatgpt');
    assert.equal(await page.getByRole('combobox',{name:'ChatGPT 模型',exact:true}).inputValue(),'qa-model');assert.match(await page.locator('.zma-provider-info').innerText(),/Codex.*ChatGPT Work/);
    await page.getByRole('textbox',{name:'问题',exact:true}).fill('解释当前文档');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.waitForFunction(()=>!!globalThis.chatgptInput);assert.match(JSON.stringify(await page.evaluate(()=>chatgptInput)),/current PDF facts/);
    assert.match(await page.locator('.zma-messages').innerText(),/ChatGPT 文档答案/);assert.equal(await page.evaluate(()=>providerPanel.conversation().history.at(-1).provider),'chatgpt');
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

test('mixed PDF sends automatic images alongside prose, persists page sources and refreshes them without duplicating past images',async()=>{
 const {browser,page}=await setup();try{const result=await page.evaluate(async()=>{const {host,reader,source}=fixture,panel=await host.panel(reader);panel.showChat();const dataURL='data:image/png;base64,YQ==',materials=[0,6].map(pageIndex=>({source:{...source,annotationKey:'PAGE000'+pageIndex,pageIndex,fullPage:true,automaticPage:true},dataURL,text:''}));host.documentContext=async()=>({mode:'full-text',text:'Prose with missing raster equations',pages:[1,7],totalPages:7,title:'Mixed paper',materials});const sent=[];host.client.generate=async m=>{sent.push(m);return 'Formula explanation';};host.capture=async()=>{throw new Error('Old automatic screenshot must not be rendered again');};panel.question.value='解释公式';await panel.send();const first=ZMACore.cleanState(panel.state);panel.question.value='继续解释';await panel.send();return {counts:sent.map(m=>m.flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(x=>x.type==='image_url').length),savedSources:panel.conversation().history[0].materials.map(s=>s.automaticPage),badge:panel.contextInfo.textContent,complete:!panel.conversation().history.at(-1).incomplete,serialized:JSON.stringify(first).includes('automaticPage')};});assert.deepEqual(result.counts,[2,2]);assert.deepEqual(result.savedSources,[true,true]);assert.ok(result.serialized);assert.ok(result.complete);assert.match(result.badge,/页面图片：PDF 第 1、7 页/);}finally{await browser.close();}
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
test('speed rejection offers an explicit Standard retry without duplicating the failed question',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const host=fixture.host;host.provider='chatgpt';globalThis.requestCount=0;globalThis.speed='fast';host.providerState=()=>({provider:'chatgpt',signedIn:true,model:'qa',models:[{slug:'qa',displayName:'QA'}],speed,speedTiers:['default','fast']});host.documentContext=async()=>({mode:'full-text',text:'PDF facts',pages:[1],totalPages:1,title:'QA'});host.setChatGPTSpeed=async value=>{speed=value;};host.selectedClient=()=>({generate:async()=>{requestCount++;if(speed==='fast')throw Object.assign(new Error('速度档位被拒绝，请使用标准模式。'),{safe:true,speedRejected:true});return '标准模式答案';}});globalThis.speedPanel=await host.panel(fixture.reader);speedPanel.showChat();speedPanel.question.value='解释 left-kernel';await speedPanel.send();});
  assert.equal(await page.evaluate(()=>requestCount),1);assert.equal(await page.getByRole('button',{name:'以标准模式重试',exact:true}).count(),1);await page.getByRole('button',{name:'以标准模式重试',exact:true}).click();await page.waitForFunction(()=>!speedPanel.busy&&requestCount===2);
  assert.equal(await page.evaluate(()=>speed),'default');assert.equal(await page.evaluate(()=>speedPanel.conversation().history.filter(m=>m.role==='user'&&m.content==='解释 left-kernel').length),1);assert.match(await page.locator('.zma-messages').innerText(),/标准模式答案/);
 }finally{await browser.close();}
});
test('composer PDF paste stays local until send, survives draft reload, and is included in follow-up context',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.provider='chatgpt';globalThis.fileBytes=new Map();host.P.parent=p=>p.slice(0,p.lastIndexOf('/'));host.IO.makeDirectory=async()=>{};host.IO.write=async(p,b)=>fileBytes.set(p,b);host.IO.read=async p=>fileBytes.get(p);const original=host.Z.Items.get();original.getFilePathAsync=async()=>'/pdf/current.pdf';host.Z.Items.get=()=>original;host.documentContext=async()=>({mode:'full-text',text:'current',pages:[1],totalPages:1,title:'PDF'});globalThis.sentFiles=[];host.selectedClient=()=>host.client;host.client.generate=async messages=>{sentFiles.push(messages);return '根据附件回答';};globalThis.filePanel=await host.panel(fixture.reader);filePanel.showChat();const data=new DataTransfer();data.items.add(new File(['%PDF-1.7\nfixture'],'extra.pdf',{type:'application/pdf'}));filePanel.question.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await page.waitForFunction(()=>filePanel.pendingMaterials.size===0&&filePanel.conversation().draftAttachments?.length===1);assert.equal(await page.evaluate(()=>filePanel.conversation().draftAttachments?.length),1,await page.evaluate(()=>filePanel.status.textContent));assert.equal(await page.evaluate(()=>sentFiles.length),0);assert.equal(await page.getByRole('button',{name:'添加附件',exact:true}).count(),1);
 const result=await page.evaluate(async()=>{const restored=ZMACore.cleanState(filePanel.state);const saved=restored.conversations[0].draftAttachments[0];filePanel.question.value='解释附件';await filePanel.send();filePanel.question.value='继续解释';await filePanel.send();return {saved,requests:sentFiles,history:filePanel.conversation().history.length,draft:filePanel.conversation().draftAttachments||[]};});assert.equal(result.saved.name,'extra.pdf');assert.equal(result.requests.length,2);assert.ok(result.requests.every(r=>JSON.stringify(r).includes('JVBERi0xLjc')));assert.equal(result.history,4);assert.deepEqual(result.draft,[]);
 }finally{await browser.close();}
});
test('selected answer can be quoted with a comment into the draft without sending',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{globalThis.quotePanel=await fixture.host.panel(fixture.reader);quotePanel.showChat();quotePanel.conversation().history=[{role:'assistant',content:'前文公式 \\(x=1\\) 后文',materials:[]}];quotePanel.renderMessages();const answer=quotePanel.messages.querySelector('.zma-answer'),range=document.createRange();range.selectNodeContents(answer);getSelection().removeAllRanges();getSelection().addRange(range);answer.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:40}));});assert.equal(await page.getByRole('button',{name:'引用并批注提问',exact:true}).count(),1);await page.getByRole('button',{name:'引用并批注提问',exact:true}).click();await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('这里为何成立？');await page.getByRole('button',{name:'加入问题',exact:true}).click();const draft=await page.getByRole('textbox',{name:'问题',exact:true}).inputValue();assert.match(draft,/前文公式/);assert.match(draft,/\\\(x=1\\\)/);assert.match(draft,/这里为何成立/);assert.equal(await page.evaluate(()=>quotePanel.conversation().history.length),1);
 }finally{await browser.close();}
});
test('completed long answers open at their beginning instead of jumping to the last paragraph',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});host.client.generate=async(_m,{onDelta})=>{const text=Array.from({length:90},(_,i)=>'第 '+i+' 段：解释公式与定义。').join('\n\n');onDelta(text);return text;};globalThis.scrollPanel=await host.panel(fixture.reader);scrollPanel.showChat();scrollPanel.question.value='详细解释';await scrollPanel.send();});const pos=await page.evaluate(()=>{const messages=scrollPanel.messages,answer=messages.lastElementChild;return {offset:answer.getBoundingClientRect().top-messages.getBoundingClientRect().top,height:answer.getBoundingClientRect().height,viewport:messages.clientHeight};});assert.ok(pos.height>pos.viewport,pos);assert.ok(Math.abs(pos.offset)<4,pos);}finally{await browser.close();}
});
test('manual reading during generation preserves position when the answer finishes',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});host.client.generate=(_m,{onDelta})=>new Promise(resolve=>{const text='首段定义\n\n'+'推导过程\n\n'.repeat(150);onDelta(text);globalThis.finishReadingAnswer=()=>resolve(text);});globalThis.readingPanel=await host.panel(fixture.reader);readingPanel.showChat();readingPanel.question.value='解释';globalThis.readingSend=readingPanel.send();});await page.waitForFunction(()=>!!globalThis.finishReadingAnswer);const before=await page.evaluate(()=>{readingPanel.messages.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true}));readingPanel.messages.scrollTop=200;return readingPanel.messages.scrollTop;});await page.evaluate(async()=>{finishReadingAnswer();await readingSend;});assert.ok(Math.abs((await page.evaluate(()=>readingPanel.messages.scrollTop))-before)<3);}finally{await browser.close();}
});
