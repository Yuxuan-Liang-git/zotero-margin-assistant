const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
async function setup(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.setContent('<style>body{margin:0;overflow:hidden}#split-view{position:fixed;left:0;right:0;top:40px;bottom:0;background:#eee}.zmc-card{position:absolute;right:10px;top:100px;width:264px;background:white;padding:8px;box-sizing:border-box}</style><div id="split-view"><article class="zmc-card" data-annotation-key="CURRENT2"><div class="zmc-card-preview"></div><footer></footer></article></div>');
  for(const name of ['web','instructions','notion','reading-summary','core','capture','references','deepseek','settings','attachments','clipboard','docks','panel','image-viewer','margin-references','reference-preview','host']){const file=path.resolve(__dirname,'../src/'+name+'.js');if(fs.existsSync(file))await page.addScriptTag({path:file});}
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

async function dockCommand(page,name,notion=false){
 const command=page.getByRole('button',{name,exact:true});
 if(!await command.isVisible())await page.getByRole('button',{name:notion?'Notion 栏操作':'文档助手操作',exact:true}).click();
 await command.click();
}
async function enableSummaryRendering(page){
 await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
 for(const file of ['src/math.js','src/markdown.js','content/vendor/marked/marked.umd.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
 await page.evaluate(()=>{fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;});
}
test('reading summary opens a saved local note without inference and preserves the conversation draft',async()=>{
 const {browser,page}=await setup();try{await enableSummaryRendering(page);await page.evaluate(async()=>{fixture.state.readingSummary=ZMAReadingSummary.clean({text:'### 正则性的作用\n\n这里解释公式 \\(x=1\\) 的条件。',updatedAt:1700000000000,noteKey:'NOTE0001'});globalThis.summaryPanel=await fixture.host.panel(fixture.reader);summaryPanel.open();summaryPanel.question.value='保留我的问题';globalThis.summaryCalls=0;fixture.host.selectedClient=()=>({generate:async()=>{summaryCalls++;throw Error('不应调用');}});});assert.ok(await page.locator('.zma-reading-view').isVisible());assert.match(await page.locator('.zma-reading-view').innerText(),/正则性的作用/);assert.equal(await page.evaluate(()=>summaryCalls),0);assert.equal(await page.locator('.zma-reading-note h3').count(),1);assert.equal(await page.locator('.zma-reading-view math').count(),1);await page.getByRole('button',{name:'返回对话',exact:true}).click();assert.equal(await page.locator('.zma-reading-view').isVisible(),false);assert.equal(await page.getByRole('textbox',{name:'问题',exact:true}).inputValue(),'保留我的问题');await page.evaluate(()=>{summaryPanel.close();summaryPanel.showChat();});assert.equal(await page.locator('.zma-reading-view').isVisible(),false);await page.evaluate(()=>{summaryPanel.close();summaryPanel.open();});assert.ok(await page.locator('.zma-reading-view').isVisible());assert.equal(await page.evaluate(()=>summaryCalls),0);}finally{await browser.close();}
});
test('reading summary can manually update and expose a protected pending version without losing the old note',async()=>{
 const {browser,page}=await setup();try{await enableSummaryRendering(page);await page.evaluate(async()=>{const {host,reader}=fixture;globalThis.summaryPanel=await host.panel(reader);summaryPanel.showChat();summaryPanel.conversation().history=[{role:'user',content:'解释难点',materials:[]},{role:'assistant',content:'回答已经澄清了需要验证的条件。',materials:[],incomplete:false}];globalThis.summaryPublishes=0;host.publishReadingSummary=async()=>({conflict:'manual-edit'});host.selectedClient=()=>({generate:async()=>['# 文章内容','研究参数估计。','# 关键公式解释','新的解释需要原文条件。','# 补充讨论','条件仍需核实。'].join('\n\n')});});await dockCommand(page,'阅读摘要');await page.getByRole('button',{name:'更新摘要',exact:true}).click();await page.waitForFunction(()=>summaryPanel.state.readingSummary?.pendingReason==='manual-edit');assert.match(await page.locator('.zma-reading-view').innerText(),/新的解释/);assert.ok(await page.getByRole('button',{name:'保存摘要新版本',exact:true}).isVisible());assert.equal(await page.evaluate(()=>summaryPanel.state.readingSummary.text),'');
 const evidence=path.resolve(__dirname,'../evidence/ui-0141');fs.mkdirSync(evidence,{recursive:true});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.evaluate(s=>document.documentElement.style.colorScheme=s,scheme);await page.locator('.zma-panel').screenshot({path:path.join(evidence,'reading-summary-'+scheme+'.png')});}
 }finally{await browser.close();}
});
test('an already processed old summary offers reorganization and becomes a standalone local note',async()=>{
 const {browser,page}=await setup();try{
  await enableSummaryRendering(page);await page.setViewportSize({width:1440,height:1500});
  await page.evaluate(async text=>{const {host,reader,state}=fixture;const c=state.conversations[0];c.history=[{role:'user',content:'如何理解C1和矩阵可逆？',materials:[]},{role:'assistant',content:'可逆性与收敛条件需要区分。',materials:[]}];state.readingSummary=ZMAReadingSummary.clean({version:1,text:'新增问答C1～C3的讨论，需要回头再找符号。',processed:ZMAReadingSummary.collect(state).map(e=>e.id),noteKey:'NOTE0001',noteHTML:'old'});globalThis.noteCalls=0;host.publishReadingSummary=async()=>({noteKey:'NOTE0001',noteHTML:'new'});host.selectedClient=()=>({generate:async()=>{noteCalls++;return text;}});globalThis.notePanel=await host.panel(reader);notePanel.open();document.documentElement.style.setProperty('--zma-assistant-user-width','640px');},fs.readFileSync(path.resolve(__dirname,'fixtures/reading-note.md'),'utf8'));
  await page.getByRole('button',{name:'重新整理',exact:true}).click();await page.waitForFunction(()=>notePanel.state.readingSummary?.formatVersion===2&&!notePanel.state.readingSummary.pendingText);
  assert.equal(await page.evaluate(()=>noteCalls),1);assert.deepEqual(await page.locator('.zma-reading-note h1').allTextContents(),['文章内容','关键公式解释','补充讨论']);assert.ok(await page.locator('.zma-reading-note math').count()>=10);assert.doesNotMatch(await page.locator('.zma-reading-note').innerText(),/新增问答|C1～C3/);
  const evidence=path.resolve(__dirname,'../evidence/ui-0141');fs.mkdirSync(evidence,{recursive:true});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.evaluate(v=>document.documentElement.style.colorScheme=v,scheme);await page.locator('.zma-panel').screenshot({path:path.join(evidence,'reading-note-'+scheme+'.png')});}
  await page.evaluate(()=>{notePanel.close();notePanel.open();});assert.equal(await page.evaluate(()=>noteCalls),1);assert.ok(await page.locator('.zma-reading-note').isVisible());
 }finally{await browser.close();}
});

test('Notion sidebar reuses the paper association and preserves its page across chat, close and reopen',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const {host,reader}=fixture;globalThis.notionLoads=[];globalThis.notionVisibility=[];globalThis.notionDestroyed=0;host.notionLinks=async()=>[{id:5,title:'Notion',url:'https://www.notion.so/Paper-0123456789abcdef0123456789abcdef'}];host.createNotionBrowser=(_reader,anchor,onState)=>{const field=document.createElement('textarea');field.setAttribute('aria-label','模拟Notion正文');field.value='论文笔记';anchor.append(field);return {load:async url=>{notionLoads.push(url);onState({loading:false});},setVisible:v=>notionVisibility.push(v),destroy:()=>notionDestroyed++};};globalThis.notionPanel=await host.panel(reader);notionPanel.showChat();notionPanel.question.value='保留聊天草稿';});
  await dockCommand(page,'Notion 笔记');await page.getByRole('textbox',{name:'模拟Notion正文'}).fill('未丢失的网页输入');assert.equal(await page.locator('.zma-notion-view').isVisible(),true);assert.equal(await page.evaluate(()=>notionLoads.length),1);
  await dockCommand(page,'打开助手',true);assert.equal(await page.getByRole('textbox',{name:'问题',exact:true}).inputValue(),'保留聊天草稿');assert.equal(await page.evaluate(()=>notionVisibility.at(-1)),true);
  await page.evaluate(()=>{notionPanel.close();notionPanel.open();});await page.getByRole('textbox',{name:'模拟Notion正文'}).waitFor();assert.equal(await page.evaluate(()=>notionLoads.length),1);assert.equal(await page.getByRole('textbox',{name:'模拟Notion正文'}).inputValue(),'未丢失的网页输入');
  const evidence=path.resolve(__dirname,'../evidence/ui-0150');fs.mkdirSync(evidence,{recursive:true});await page.locator('.zma-panel').screenshot({path:path.join(evidence,'notion-sidebar.png')});
  await page.evaluate(async()=>notionPanel.destroy());assert.equal(await page.evaluate(()=>notionDestroyed),1);
 }finally{await browser.close();}
});

test('a late Notion lookup cannot reopen a hidden pane and missing associations keep chat available',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const {host,reader}=fixture;host.notionLinks=()=>new Promise(resolve=>globalThis.finishNotion=resolve);globalThis.nativeCreated=0;host.createNotionBrowser=()=>{nativeCreated++;throw Error('should not create');};globalThis.notionPanel=await host.panel(reader);notionPanel.showChat();void notionPanel.showNotion();});await page.waitForFunction(()=>!!globalThis.finishNotion,{timeout:1500});await page.evaluate(()=>{notionPanel.notion.hide();notionPanel.showChat();finishNotion([{id:5,title:'Notion',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'}]);});await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>nativeCreated),0);assert.equal(await page.locator('.zma-chat').isVisible(),true);
  await page.evaluate(async()=>{fixture.host.notionLinks=async()=>[];await notionPanel.showNotion();});assert.match(await page.locator('.zma-notion-view').innerText(),/没有找到 Notion 链接/);await page.getByRole('button',{name:'Notion 栏操作',exact:true}).click();assert.equal(await page.getByRole('button',{name:'在浏览器打开',exact:true}).isDisabled(),true);
 }finally{await browser.close();}
});

test('Notion page selection, explicit refresh and external opening use validated associated URLs',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const {host,reader}=fixture;globalThis.notionLoads=[];globalThis.externalURL='';host.notionLinks=async()=>[{id:5,title:'Notion甲',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'},{id:6,title:'Notion乙',url:'https://app.notion.com/fedcba9876543210fedcba9876543210'}];host.openExternal=url=>externalURL=url;host.createNotionBrowser=()=>({load:url=>notionLoads.push(url),setVisible:()=>{},destroy:()=>{}});globalThis.notionPanel=await host.panel(reader);await notionPanel.showNotion();});
  await page.getByRole('button',{name:'Notion 栏操作',exact:true}).click();await page.getByRole('combobox',{name:'关联的 Notion 页面'}).selectOption('6');await page.waitForFunction(()=>notionLoads.length===2);await dockCommand(page,'在浏览器打开',true);assert.match(await page.evaluate(()=>externalURL),/fedcba/);await dockCommand(page,'重新检测 / 刷新',true);await page.waitForFunction(()=>notionLoads.length===3);
  await page.evaluate(async()=>{fixture.host.notionLinks=async()=>[{id:7,title:'错误链接',url:'javascript:alert(1)'}];await notionPanel.notion.show(true);});assert.equal(await page.evaluate(()=>notionLoads.length),3);assert.match(await page.locator('.zma-notion-status').innerText(),/有效的 Notion/);
 }finally{await browser.close();}
});

test('the image viewer temporarily suspends the native Notion browser and restores its current page',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const {host,reader,source}=fixture;globalThis.visibility=[];globalThis.loads=0;host.notionLinks=async()=>[{id:5,title:'Notion',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'}];host.createNotionBrowser=()=>({load:async()=>{loads++;},setVisible:value=>visibility.push(value),destroy:()=>{}});host.imageManager={readImage:async()=>(await host.capture(reader,source)).dataURL};globalThis.viewerPanel=await host.panel(reader);await viewerPanel.showNotion();await host.viewImage(reader,{id:'a'.repeat(32)},document.querySelector('.zmc-card'));});
  assert.equal(await page.evaluate(()=>visibility.at(-1)),false);
  assert.equal(await page.evaluate(()=>viewerPanel.notion.visible),true);
  await page.getByRole('dialog',{name:'图片查看器'}).getByRole('button',{name:'关闭',exact:true}).click();
  assert.equal(await page.evaluate(()=>visibility.at(-1)),true);assert.equal(await page.evaluate(()=>loads),1);
  await page.evaluate(async()=>{const {host,reader}=fixture;let finish;host.notionLinks=()=>new Promise(resolve=>{finish=resolve;});const opening=viewerPanel.notion.show(true);await host.viewImage(reader,{id:'a'.repeat(32)},document.querySelector('.zmc-card'));finish([{id:5,title:'Notion',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'}]);await opening;});
  assert.equal(await page.evaluate(()=>visibility.at(-1)),false);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>visibility.at(-1)),true);
 }finally{await browser.close();}
});

test('export progress stays above Notion until both export and image viewing have finished',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{
    const {host,reader,source}=fixture;globalThis.visibility=[];
    host.notionLinks=async()=>[{id:5,title:'Notion',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'}];
    host.createNotionBrowser=()=>({load:async()=>{},setVisible:value=>visibility.push(value),destroy:()=>{}});
    host.imageManager={readImage:async()=>(await host.capture(reader,source)).dataURL};
    host.chooseConversationFile=async()=>'/exports/paper.pdf';
    globalThis.ZMAPageImageExport={snapshot:async()=>({}),exportPDF:async()=>new Promise(resolve=>globalThis.finishExport=()=>resolve('/exports/paper.pdf'))};
    globalThis.viewerPanel=await host.panel(reader);await viewerPanel.showNotion();
    globalThis.exportTask=host.exportPageImages(reader);
  });
  await page.getByRole('button',{name:'取消导出',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>visibility.at(-1)),false);
  await page.evaluate(async()=>{const {host,reader}=fixture;await host.viewImage(reader,{id:'a'.repeat(32)},document.querySelector('.zmc-card'));});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>visibility.at(-1)),false);
  await page.evaluate(async()=>{finishExport();await exportTask;});assert.equal(await page.evaluate(()=>visibility.at(-1)),true);
  await page.evaluate(async()=>{const {host,reader}=fixture;await host.viewImage(reader,{id:'a'.repeat(32)},document.querySelector('.zmc-card'));globalThis.exportTask=host.exportPageImages(reader);});
  await page.getByRole('button',{name:'取消导出',exact:true}).waitFor();
  await page.evaluate(async()=>{finishExport();await exportTask;});assert.equal(await page.evaluate(()=>visibility.at(-1)),false);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>visibility.at(-1)),true);
 }finally{await browser.close();}
});

test('hovering a stored source link opens a bounded image preview without jumping and allows moving into it',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis.jumps=0;fixture.host.jump=()=>jumps++;fixture.host.attachCard(fixture.session,fixture.runtime);});
  const link=page.locator('.zmc-card-preview a');await link.hover();await page.locator('.zma-reference-popover img').waitFor({timeout:1500});await page.waitForFunction(()=>document.querySelector('.zma-reference-popover img')?.naturalWidth===600);
  assert.equal(await page.evaluate(()=>jumps),0);assert.equal(await page.locator('.zma-panel').count(),0);
  const r=await page.locator('.zma-reference-popover').boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1440&&r.y+r.height<=960);await page.locator('.zma-reference-popover img').hover();await page.waitForTimeout(250);assert.ok(await page.locator('.zma-reference-popover').isVisible());
  const evidence=path.resolve(__dirname,'../evidence/ui-0132');fs.mkdirSync(evidence,{recursive:true});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.evaluate(v=>document.documentElement.style.colorScheme=v,scheme);await page.screenshot({path:path.join(evidence,'reference-hover-'+scheme+'.png')});}
  await page.mouse.move(20,50);await page.waitForFunction(()=>!document.querySelector('.zma-reference-popover')||document.querySelector('.zma-reference-popover').hidden);await link.focus();await page.locator('.zma-reference-popover img').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.zma-reference-popover:visible').count(),0);
 }finally{await browser.close();}
});

test('native annotation popup displays a safe reference link while leaving its original editable comment untouched',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{fixture.host.bindReferences(fixture.reader,document);globalThis.commentRaw='已有批注\n'+ZMACore.storedLink(fixture.source);const popup=document.createElement('div');popup.className='annotation-popup';popup.style.cssText='position:absolute;left:200px;top:220px;width:300px;background:Canvas';popup.innerHTML='<div class="preview"><div class="comment"><div class="editor"><div class="content" id="CURRENT2" contenteditable="true" tabindex="0"></div></div></div></div>';popup.querySelector('.content').textContent=commentRaw;document.body.append(popup);});
  const read=page.locator('.zma-native-reference');await read.locator('a').waitFor({timeout:1500});assert.equal(await page.locator('.annotation-popup .content').textContent(),await page.evaluate(()=>commentRaw));assert.equal(await page.locator('.annotation-popup .editor').isVisible(),false);assert.equal(await read.locator('script,img,[onerror]').count(),0);
  await read.locator('a').hover();await page.locator('.zma-reference-popover img').waitFor();await page.mouse.move(20,50);await read.getByRole('button',{name:'编辑批注',exact:true}).click();assert.ok(await page.locator('.annotation-popup .editor').isVisible());await page.locator('.annotation-popup .content').press('Control+End');await page.keyboard.type('追加内容');await page.mouse.click(20,50);await read.locator('a').waitFor({timeout:1500});assert.match(await page.locator('.annotation-popup .content').textContent(),/追加内容/);
  await page.evaluate(async()=>{document.querySelector('.annotation-popup').remove();await Promise.resolve();await fixture.host.closeReader(fixture.reader);});assert.equal(await page.locator('.zma-reference-popover,.zma-native-reference').count(),0);
 }finally{await browser.close();}
});

test('a stale hovered source reports the validation error and late capture cannot reopen a dismissed preview',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{fixture.host.bindReferences(fixture.reader,document);fixture.host.capture=async()=>{throw new Error('来源已经改变，请重新关联');};});await page.locator('.zmc-card-preview a').hover();await page.getByText('来源已经改变，请重新关联',{exact:false}).waitFor({timeout:1500});assert.equal(await page.locator('.zma-reference-popover img').count(),0);
  await page.mouse.move(20,50);await page.waitForTimeout(250);await page.evaluate(()=>{fixture.host.capture=()=>new Promise(resolve=>globalThis.finishHoverCapture=resolve);});await page.locator('.zmc-card-preview a').hover();await page.waitForFunction(()=>!!globalThis.finishHoverCapture);await page.mouse.move(20,50);await page.waitForTimeout(250);await page.evaluate(()=>finishHoverCapture({dataURL:'data:image/png;base64,YQ=='}));await page.waitForTimeout(60);assert.equal(await page.locator('.zma-reference-popover:visible').count(),0);
 }finally{await browser.close();}
});

test('hovered text references render their LaTeX and never fetch an unrelated PDF link',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});for(const file of ['src/math.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
  await page.evaluate(()=>{fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;fixture.source.kind='text';fixture.source.text='前文定义 \\(e=y-Hu\\)';globalThis.hoverCaptures=0;fixture.host.capture=async()=>{hoverCaptures++;return {text:fixture.source.text};};fixture.host.bindReferences(fixture.reader,document);});await page.locator('.zmc-card-preview a').hover();await page.locator('.zma-reference-popover math').waitFor({timeout:1500});assert.equal(await page.locator('.zma-reference-popover img').count(),0);
  await page.mouse.move(20,50);await page.waitForTimeout(250);await page.evaluate(()=>{document.querySelector('.zmc-card-preview a').setAttribute('href','zotero://open-pdf/library/items/OTHERPDF?page=1&annotation=FORM0630');});await page.locator('.zmc-card-preview a').hover();await page.getByText('该链接不属于当前 PDF',{exact:false}).waitFor({timeout:1500});assert.equal(await page.evaluate(()=>hoverCaptures),1);
 }finally{await browser.close();}
});

test('binding the nested PDF document also decorates native annotation popups in the outer reader document',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{const frame=document.createElement('iframe');frame.srcdoc='<main>PDF page</main>';await new Promise(resolve=>{frame.onload=resolve;document.body.append(frame);});fixture.host.bindReferences(fixture.reader,frame.contentDocument);const popup=document.createElement('div');popup.className='annotation-popup';popup.style.cssText='position:fixed;left:180px;top:160px;z-index:200;background:Canvas';popup.innerHTML='<div class="comment"><div class="editor"><div class="content" id="CURRENT2" contenteditable="true"></div></div></div>';popup.querySelector('.content').textContent=ZMACore.storedLink(fixture.source);document.body.append(popup);});await page.locator('.annotation-popup .zma-native-reference a').waitFor({timeout:1500});await page.locator('.annotation-popup .zma-native-reference a').hover();await page.locator('.zma-reference-popover img').waitFor({timeout:1500});
 }finally{await browser.close();}
});

test('reference preview uses page-side whitespace instead of covering the PDF page',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{const paper=document.createElement('div');paper.className='page';paper.dataset.pageNumber='1';paper.style.cssText='position:absolute;left:120px;top:50px;width:1000px;height:850px;background:white';document.querySelector('#split-view').prepend(paper);fixture.host.bindReferences(fixture.reader,document);});await page.locator('.zmc-card-preview a').hover();await page.locator('.zma-reference-popover img').waitFor({timeout:1500});
  const geometry=await page.evaluate(()=>({paper:document.querySelector('.page').getBoundingClientRect().toJSON(),popup:document.querySelector('.zma-reference-popover').getBoundingClientRect().toJSON()}));assert.ok(geometry.popup.left>=geometry.paper.right+8,JSON.stringify(geometry));assert.ok(geometry.popup.right<=1440,JSON.stringify(geometry));assert.ok(geometry.popup.width>=240);
  const evidence=path.resolve(__dirname,'../evidence/ui-0133');fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'page-side-preview.png')});
  await page.mouse.move(20,50);await page.waitForTimeout(250);await page.evaluate(()=>{document.querySelector('.page').style.width='400px';fixture.runtime.card.style.cssText='left:250px;right:auto;top:250px;width:264px';});await page.locator('.zmc-card-preview a').hover();await page.locator('.zma-reference-popover img').waitFor();const wide=await page.evaluate(()=>({pageRight:document.querySelector('.page').getBoundingClientRect().right,left:document.querySelector('.zma-reference-popover').getBoundingClientRect().left}));assert.ok(wide.left>=wide.pageRight+8,JSON.stringify(wide));
 }finally{await browser.close();}
});

test('when page-side space is narrow the preview stays above or below the current annotation',async()=>{
 const {browser,page}=await setup();try{
  await page.setViewportSize({width:900,height:700});await page.evaluate(()=>{const paper=document.createElement('div');paper.className='page';paper.dataset.pageNumber='1';paper.style.cssText='position:absolute;left:12px;top:0;width:876px;height:900px;background:white';document.querySelector('#split-view').prepend(paper);fixture.runtime.card.style.cssText='left:200px;right:auto;top:240px;width:400px;height:150px';fixture.host.bindReferences(fixture.reader,document);});await page.locator('.zmc-card-preview a').hover();await page.locator('.zma-reference-popover img').waitFor({timeout:1500});
  const geometry=await page.evaluate(()=>({current:fixture.runtime.card.getBoundingClientRect().toJSON(),popup:document.querySelector('.zma-reference-popover').getBoundingClientRect().toJSON()}));assert.ok(geometry.popup.top>=geometry.current.bottom+8||geometry.popup.bottom<=geometry.current.top-8,JSON.stringify(geometry));assert.ok(geometry.popup.bottom<=700&&geometry.popup.left>=0&&geometry.popup.right<=900,JSON.stringify(geometry));
 }finally{await browser.close();}
});

test('preview avoids the current PDF formula mapped from a nested iframe into the native popup document',async()=>{
 const {browser,page}=await setup();try{
  await page.setViewportSize({width:1000,height:720});await page.evaluate(async()=>{const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:20px;top:50px;width:900px;height:650px;border:0';frame.srcdoc='<style>body{margin:0}</style><div class="page" data-page-number="1" style="width:880px;height:900px;background:white"></div>';await new Promise(resolve=>{frame.onload=resolve;document.querySelector('#split-view').prepend(frame);});fixture.runtime.card.style.cssText='position:fixed;left:400px;right:auto;top:300px;width:400px;height:80px';const adapter=fixture.session.adapter;adapter.document=()=>frame.contentDocument;adapter.page=()=>({element:frame.contentDocument.querySelector('.page'),viewport:{width:880,height:900,convertToViewportPoint:(x,y)=>[x,900-y]}});fixture.host.nativeAnnotation=()=>({annotationPosition:JSON.stringify({pageIndex:0,rects:[[80,300,720,420]]})});fixture.host.bindReferences(fixture.reader,document);});await page.locator('.zmc-card-preview a').hover();await page.locator('.zma-reference-popover img').waitFor({timeout:1500});
  const popup=await page.locator('.zma-reference-popover').boundingBox();assert.ok(popup.y+popup.height<=530-8||popup.y>=650+8,JSON.stringify(popup));assert.ok(popup.x>=0&&popup.x+popup.width<=1000&&popup.y>=0&&popup.y+popup.height<=720);
 }finally{await browser.close();}
});

test('conversation layout fits narrow and wide docks with readable math at every supported font size',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
  for(const name of ['markdown'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
  await page.addScriptTag({path:path.resolve(__dirname,'../content/vendor/marked/marked.umd.js')});
  await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});
  await page.evaluate(async()=>{fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;globalThis.visualPanel=await fixture.host.panel(fixture.reader);const chat=visualPanel.conversation();chat.title='公式与参数辨识';chat.history=[{role:'user',content:'怎样理解信息矩阵与参数收敛的关系？',materials:[]},{role:'assistant',content:'## 信息矩阵与收敛\n\n信息矩阵衡量观测数据对参数的约束。**不同方向都得到激励**时，参数才能被区分。\n\n\\[J=\\mathbb E\\!\\left[\\psi(t)\\psi(t)^{\\mathsf T}\\right]\\]\n\n- 特征值较小：对应方向的信息较少。\n- 矩阵正定：所有参数方向都有信息。\n\n可以结合前文的公式继续核对推导。',materials:[]}];visualPanel.renderMessages();visualPanel.showChat();visualPanel.question.value='结合公式继续解释';});
  const evidence=path.resolve(__dirname,'../evidence/ui-0125');fs.mkdirSync(evidence,{recursive:true});
  for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.evaluate(value=>document.documentElement.style.colorScheme=value,scheme);
   for(const width of [320,420,540])for(const size of [14,20,24]){
    await page.evaluate(async({width,size})=>{document.documentElement.style.setProperty('--zma-assistant-user-width',width+'px');await fixture.host.setFontSize(size);visualPanel.messages.scrollTop=0;},{width,size});
    const g=await page.evaluate(()=>{const node=visualPanel.node,input=visualPanel.question.getBoundingClientRect(),r=node.getBoundingClientRect();return {overflow:node.scrollWidth-node.clientWidth,messages:visualPanel.messages.clientHeight,visible:input.bottom<=r.bottom&&input.left>=r.left,math:visualPanel.messages.querySelectorAll('math').length};});assert.ok(g.overflow<=1,JSON.stringify({scheme,width,size,g}));assert.ok(g.messages>200,JSON.stringify(g));assert.ok(g.visible,JSON.stringify(g));assert.equal(g.math,1);
    if(width===420||size===24)await page.locator('.zma-panel').screenshot({path:path.join(evidence,`${scheme}-${width}-${size}.png`)});
   }
  }
 }finally{await browser.close();}
});

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

test('chat keeps model/account/reasoning/speed configuration in settings and font changes preserve the draft caret',async()=>{
 const {browser,page}=await setup();try{const before=await page.evaluate(async()=>{globalThis.cleanPanel=await fixture.host.panel(fixture.reader);cleanPanel.showChat();cleanPanel.question.value='保留这段草稿';cleanPanel.question.focus();cleanPanel.question.setSelectionRange(2,4);return {selects:cleanPanel.node.querySelectorAll('.zma-chat select,.zma-provider-bar select').length,loginButtons:[...cleanPanel.node.querySelectorAll('button')].filter(b=>/登录|用量/.test(b.textContent)).length};});assert.equal(before.selects,0);assert.equal(before.loginButtons,0);await page.evaluate(()=>fixture.host.setFontSize(20));const after=await page.evaluate(()=>({font:getComputedStyle(cleanPanel.question).fontSize,messages:getComputedStyle(cleanPanel.messages).fontSize,text:cleanPanel.question.value,start:cleanPanel.question.selectionStart,end:cleanPanel.question.selectionEnd}));assert.equal(after.font,'20px');assert.equal(after.messages,'20px');assert.equal(after.text,'保留这段草稿');assert.equal(after.start,2);assert.equal(after.end,4);await page.getByRole('button',{name:'文档助手操作',exact:true}).click();assert.equal(await page.getByRole('button',{name:'设置',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'对话记录',exact:true}).count(),1);}finally{await browser.close();}
});
test('provider changes through settings refresh the model badge and route document context to the selected client',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{
      const host=fixture.host;host.provider='deepseek';host.providerState=()=>({provider:host.provider,label:host.provider==='chatgpt'?'ChatGPT':'DeepSeek',signedIn:true,model:'qa-model',models:[{slug:'qa-model',displayName:'QA Model'}],accountLabel:'QA Account'});
      host.setProvider=async value=>{host.provider=value;host.providersChanged();};host.selectedClient=()=>host.provider==='chatgpt'?{generate:async messages=>{globalThis.chatgptInput=messages;return 'ChatGPT 文档答案';},summarize:async()=> 'summary'}:host.client;
      host.documentContext=async()=>({mode:'full-text',text:'current PDF facts',pages:[1],totalPages:1,title:'PDF QA'});
      globalThis.providerPanel=await host.panel(fixture.reader);providerPanel.showChat();
    });
    assert.equal(await page.getByRole('combobox',{name:'AI 服务',exact:true}).count(),0);await page.evaluate(()=>fixture.host.setProvider('chatgpt'));
    assert.match(await page.locator('.zma-model-badge').innerText(),/ChatGPT.*QA Model/);
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
test('native class-based split view keeps Ctrl F search visible during assistant open, resize, close and reopen',async()=>{
 const {browser,page}=await setup();try{
  await page.addStyleTag({content:'.split-view{position:fixed;inset:40px 0 0;display:flex}.primary-view{position:relative;flex:1;overflow:hidden}.find-popup{position:absolute;right:15px;top:15px;width:310px;height:110px;z-index:70;background:white}'});
  await page.evaluate(async()=>{const view=document.getElementById('split-view');view.removeAttribute('id');view.className='split-view';view.innerHTML='<div class="primary-view"><div class="find-popup"><input aria-label="PDF search" value="formula"></div></div>';globalThis.findPanel=await fixture.host.panel(fixture.reader);findPanel.showChat();});
  const visible=async()=>page.evaluate(()=>{const view=document.querySelector('.split-view').getBoundingClientRect(),popup=document.querySelector('.find-popup'),search=popup.getBoundingClientRect(),panel=findPanel.node.getBoundingClientRect(),hit=document.elementFromPoint(search.left+25,search.top+20);return {viewRight:view.right,searchRight:search.right,sideLeft:panel.left,width:view.width,inputVisible:popup.contains(hit),value:popup.querySelector('input').value};});
  let geometry=await visible();assert.ok(geometry.viewRight<=geometry.sideLeft+1,JSON.stringify(geometry));assert.ok(geometry.searchRight<=geometry.sideLeft,JSON.stringify(geometry));assert.ok(geometry.inputVisible);await page.getByRole('textbox',{name:'PDF search',exact:true}).fill('new query');
  await page.evaluate(()=>document.documentElement.style.setProperty('--zma-assistant-user-width','540px'));geometry=await visible();assert.ok(geometry.viewRight<=geometry.sideLeft+1);assert.ok(geometry.inputVisible);assert.equal(geometry.value,'new query');
  await page.evaluate(()=>findPanel.close());assert.equal((await visible()).width,1440);await page.evaluate(()=>findPanel.open());geometry=await visible();assert.ok(geometry.inputVisible);assert.ok(geometry.viewRight<=geometry.sideLeft+1);assert.equal(geometry.value,'new query');
 }finally{await browser.close();}
});
test('docked sidebar can resize while maintaining a visible document viewport',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(async()=>{const panel=await fixture.host.panel(fixture.reader);panel.showChat();});
    const handle=page.getByRole('separator',{name:'调整文档助手宽度',exact:true});
    assert.equal(await handle.count(),1);
    const box=await handle.boundingBox();await page.mouse.move(box.x+2,box.y+50);await page.mouse.down();await page.mouse.move(box.x-120,box.y+50);await page.mouse.up();
    const geometry=await page.evaluate(()=>({side:document.querySelector('.zma-panel').getBoundingClientRect().width,view:document.querySelector('#split-view').getBoundingClientRect().width}));assert.ok(geometry.side>=500);assert.ok(geometry.view>=400);
  }finally{await browser.close();}
});

test('disabling and re-enabling the plugin replaces both reader toolbar callbacks', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(async () => {
      const { host, reader } = fixture;
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.innerHTML = '<div class="end"><div class="custom-sections"></div></div>';
      document.body.append(toolbar);
      host.Z.Reader = { _readers: [reader] };
      host.ensureToolbar(reader, document);
      await host.stop();
      const replacement = new ZMAHost.Host(host.addon, {
        Zotero: host.Z, IOUtils: host.IO, PathUtils: host.P, window
      });
      replacement.running = true;
      replacement.load = async () => fixture.state;
      replacement.save = async () => {};
      replacement.ensureToolbar(reader, document);
      fixture.host = replacement;
    });
    assert.equal(await page.locator('.zma-reader-dock-button').count(), 2);
    await page.getByRole('button', { name: '打开 Notion 笔记栏', exact: true }).click();
    await page.waitForFunction(() => fixture.host.panels.get(fixture.reader)?.notion?.visible, null, { timeout: 1500 });
    assert.equal(await page.locator('.zma-notion-dock').isVisible(), true);
    assert.equal(await page.locator('.zma-panel').isVisible(), false);
  } finally {
    await browser.close();
  }
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
test('closing and reopening the assistant preserves the conversation and includes fresh PDF context in the next request',async()=>{
 const {browser,page}=await setup();try{const result=await page.evaluate(async()=>{const {host,reader}=fixture;let round=0;const sent=[];host.documentContext=async()=>({mode:'full-text',title:'Reopened PDF',totalPages:2,pages:[1,2],text:'PDF context snapshot '+(++round)});host.client.generate=async messages=>{sent.push(messages);return 'Answer '+sent.length;};const panel=await host.panel(reader);panel.showChat();const id=panel.conversation().id;panel.question.value='First question';await panel.send();const savedBefore=JSON.stringify(ZMACore.cleanState(panel.state));panel.question.value='Unsent draft';panel.question.dispatchEvent(new Event('input',{bubbles:true}));panel.close();const closedHistory=panel.conversation().history.length;panel.showChat();const reopenedDraft=panel.question.value,reopenedId=panel.conversation().id,reopenedHistory=panel.conversation().history.length;panel.question.value='Follow-up after reopening';await panel.send();return {id,reopenedId,closedHistory,reopenedHistory,reopenedDraft,requestCount:sent.length,contextCalls:round,historyAfter:panel.conversation().history.length,secondRequest:sent[1],firstHistoryRetained:JSON.stringify(ZMACore.cleanState(panel.state)).includes('First question'),hadSavedHistory:savedBefore.includes('Answer 1')};});assert.equal(result.closedHistory,2);assert.equal(result.reopenedHistory,2);assert.equal(result.id,result.reopenedId);assert.equal(result.reopenedDraft,'Unsent draft');assert.equal(result.requestCount,2);assert.equal(result.contextCalls,2);assert.equal(result.historyAfter,4);assert.ok(result.firstHistoryRetained&&result.hadSavedHistory);assert.ok(result.secondRequest.some(m=>m.role==='assistant'&&m.content==='Answer 1'));assert.ok(result.secondRequest.at(-1).content.some(p=>p.type==='text'&&p.text.includes('PDF context snapshot 2')));}finally{await browser.close();}
});
test('ChatGPT automatically resends the whole short PDF after reopen and records only safe coverage metadata',async()=>{
 const {browser,page}=await setup();try{const result=await page.evaluate(async()=>{const {host,reader}=fixture;host.provider='chatgpt';host.selectedClient=()=>host.client;const sent=[],flags=[];host.documentContext=async(_r,_q,options)=>{flags.push(options.preferPDFFile);return {mode:'full-pdf',title:'Whole paper',totalPages:8,pages:[1,2,3,4,5,6,7,8],file:{name:'paper.pdf',mime:'application/pdf',size:100,dataURL:'data:application/pdf;base64,JVBERi0='},text:''};};host.client.generate=async messages=>{sent.push(messages);return 'Answer with full paper';};const panel=await host.panel(reader);panel.showChat();panel.question.value='Equation 26';await panel.send();panel.close();panel.showChat();panel.question.value='Continue equation 26';await panel.send();const saved=ZMACore.cleanState(panel.state);return {flags,counts:sent.map(m=>m.flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(p=>p.type==='file').length),history:panel.conversation().history.length,badge:panel.contextInfo.textContent,record:saved.conversations[0].history.at(-2).pdfContext,noBase64:!JSON.stringify(saved).includes('base64')};});assert.deepEqual(result.flags,[true,true]);assert.deepEqual(result.counts,[1,1]);assert.equal(result.history,4);assert.match(result.badge,/已附带完整 PDF 文件/);assert.equal(result.record.totalPages,8);assert.equal(result.record.fileSize,100);assert.ok(result.noBase64);}finally{await browser.close();}
});
test('large automatic page PNGs use a smaller JPEG without shrinking page pixels or altering explicit crops',async()=>{
 const {browser,page}=await setup();try{const r=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1600;const ctx=canvas.getContext('2d'),data=ctx.createImageData(1200,1600);let seed=19;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;data.data[i]=seed&255;data.data[i+1]=(seed>>>8)&255;data.data[i+2]=(seed>>>16)&255;data.data[i+3]=255;}ctx.putImageData(data,0,0);ctx.fillStyle='white';ctx.fillRect(0,0,1200,150);ctx.fillStyle='black';ctx.fillRect(20,20,80,80);const material={source:{automaticPage:true},dataURL:canvas.toDataURL(),width:1200,height:1600},out=await ZMACapture.compactAutomaticPage(material,document),manual={...material,source:{}},unchanged=await ZMACapture.compactAutomaticPage(manual,document),image=new Image();image.src=out.dataURL;await image.decode();ctx.drawImage(image,0,0);return {before:material.dataURL.length,after:out.dataURL.length,jpeg:out.dataURL.startsWith('data:image/jpeg;base64,'),width:out.width,height:out.height,black:[...ctx.getImageData(60,60,1,1).data],white:[...ctx.getImageData(200,60,1,1).data],manualUnchanged:unchanged===manual};});assert.ok(r.jpeg);assert.ok(r.after<r.before);assert.equal(r.width,1200);assert.equal(r.height,1600);assert.ok(r.black.slice(0,3).every(x=>x<30));assert.ok(r.white.slice(0,3).every(x=>x>240));assert.ok(r.manualUnchanged);}finally{await browser.close();}
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

test('stale historical and current references do not block chat or replace source content; omissions remain explicit and saved',async()=>{
 const {browser,page}=await setup();try{const result=await page.evaluate(async()=>{const {host,reader,source}=fixture,panel=await host.panel(reader);panel.showChat();const old={...source};panel.conversation().history=[{role:'user',content:'原问题',materials:[old]},{role:'assistant',content:'原回答',materials:[]}];panel.materials=[{source:old,dataURL:'data:image/png;base64,YQ==',text:''}];const oldJSON=JSON.stringify(old);host.capture=async()=>{throw Object.assign(new Error('来源需要重新定位：PDF 文件、文字或区域已经改变'),{code:'SOURCE_STALE'});};host.documentContext=async()=>({mode:'full-text',title:'PDF',totalPages:1,pages:[1],text:'Current document text'});let sent;host.client.generate=async messages=>{sent=messages;return '继续回答';};panel.question.value='继续解释';await panel.send();const history=panel.conversation().history,saved=ZMACore.cleanState(panel.state);return {complete:!history.at(-1).incomplete,count:history.length,sourceUnchanged:JSON.stringify(history[0].materials[0])===oldJSON,requests:sent,status:panel.status.textContent,materialText:panel.materialList.textContent,warningSaved:saved.conversations[0].history.at(-2).sourceWarnings?.length};});assert.ok(result.complete,result.status);assert.equal(result.count,4);assert.ok(result.sourceUnchanged);assert.equal(result.warningSaved,1);assert.match(result.materialText,/本轮未发送/);assert.match(result.status,/失效/);assert.ok(result.requests.some(m=>m.role==='assistant'&&m.content==='原回答'));assert.ok(result.requests.filter(m=>m.role==='user').every(m=>m.content.some(p=>p.type==='text'&&/本轮未.*(?:读取|发送)/.test(p.text))));assert.equal(result.requests.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length,0);}finally{await browser.close();}
});
test('unclassified material failures still stop sending and preserve the draft and history',async()=>{
 const {browser,page}=await setup();try{const result=await page.evaluate(async()=>{const {host,reader,source}=fixture,panel=await host.panel(reader);panel.conversation().history=[{role:'user',content:'Old',materials:[source]},{role:'assistant',content:'Answer',materials:[]}];host.capture=async()=>{throw new Error('Unexpected renderer failure');};let sent=false;host.client.generate=async()=>{sent=true;return 'Wrong';};panel.question.value='Keep draft';await panel.send();return {sent,history:panel.conversation().history.length,draft:panel.question.value,status:panel.status.textContent,busy:panel.busy};});assert.equal(result.sent,false);assert.equal(result.history,2);assert.equal(result.draft,'Keep draft');assert.match(result.status,/Unexpected renderer/);assert.equal(result.busy,false);}finally{await browser.close();}
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
test('reasoning rejection offers an explicit default retry and copies private-data-free diagnostics',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{globalThis.reasoningPanel=await fixture.host.panel(fixture.reader);reasoningPanel.showChat();globalThis.reasoningCalls=0;globalThis.reasoningValue='high';globalThis.copiedDiagnostic='';fixture.host.copy=text=>{copiedDiagnostic=text;};fixture.host.setChatGPTReasoning=async value=>{reasoningValue=value;};fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF facts',pages:[1],totalPages:1});fixture.host.client.generate=async()=>{reasoningCalls++;if(reasoningValue!=='default')throw Object.assign(new Error('思考强度被拒绝，请使用模型默认。'),{safe:true,reasoningRejected:true,diagnosticText:'{"status":400,"param":"reasoning.effort","requestID":"req_qa"}'});return '默认模式答案';};reasoningPanel.question.value='正则性要求具体是什么';await reasoningPanel.send();});
  assert.equal(await page.evaluate(()=>reasoningCalls),1);assert.equal(await page.getByRole('button',{name:'使用默认思考强度重试',exact:true}).count(),1);await page.getByRole('button',{name:'复制错误诊断',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(copiedDiagnostic).requestID),'req_qa');assert.equal(await page.evaluate(()=>reasoningPanel.question.value),'正则性要求具体是什么');
  await page.getByRole('button',{name:'使用默认思考强度重试',exact:true}).click();await page.waitForFunction(()=>!reasoningPanel.busy&&reasoningCalls===2);assert.equal(await page.evaluate(()=>reasoningValue),'default');assert.equal(await page.evaluate(()=>reasoningPanel.conversation().history.length),2);assert.match(await page.locator('.zma-messages').innerText(),/默认模式答案/);
 }finally{await browser.close();}
});
test('an unknown rejection keeps draft and materials and exposes diagnostics without changing options',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{globalThis.unknownPanel=await fixture.host.panel(fixture.reader);unknownPanel.showChat();globalThis.unknownCalls=0;fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});fixture.host.client.generate=async()=>{unknownCalls++;throw Object.assign(new Error('请求被拒绝，请复制错误诊断。'),{safe:true,diagnosticText:'{"status":400,"responseShape":"non-json"}'});};unknownPanel.question.value='保留问题';unknownPanel.materials=[await fixture.host.capture()];await unknownPanel.send();});assert.equal(await page.evaluate(()=>unknownCalls),1);assert.equal(await page.evaluate(()=>unknownPanel.materials.length),1);assert.equal(await page.evaluate(()=>unknownPanel.question.value),'保留问题');assert.equal(await page.getByRole('button',{name:'复制错误诊断',exact:true}).count(),1);assert.equal(await page.locator('.zma-retry-standard,.zma-retry-reasoning,.zma-retry-web').count(),0);
 const evidence=path.resolve(__dirname,'../evidence/ui-01310');fs.mkdirSync(evidence,{recursive:true});await page.locator('.zma-panel').screenshot({path:path.join(evidence,'http400-diagnostics.png')});
 }finally{await browser.close();}
});
test('opaque HTTP400 shows literal server detail and offers an explicit standard offline retry with document context intact',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{globalThis.opaquePanel=await fixture.host.panel(fixture.reader);opaquePanel.showChat();globalThis.opaqueCalls=[];globalThis.opaqueSpeed='fast';globalThis.opaqueReasoning='high';globalThis.opaqueWeb='auto';fixture.host.provider='chatgpt';fixture.host.setChatGPTSpeed=async v=>{opaqueSpeed=v;};fixture.host.setChatGPTReasoning=async v=>{opaqueReasoning=v;};fixture.host.setWebMode=async v=>{opaqueWeb=v;};fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF facts retained',pages:[1],totalPages:1});fixture.host.selectedClient=()=>({generate:async messages=>{opaqueCalls.push(messages);if(opaqueCalls.length===1)throw Object.assign(new Error('请求被拒绝'),{safe:true,status:400,diagnostic:{request:{serviceTier:'priority',webSearch:true}},diagnosticText:'{"serverDetail":"Admission failed <img src=x onerror=alert(1)>"}',serverDetail:'Admission failed <img src=x onerror=alert(1)>'});return '恢复回答';}});opaquePanel.question.value='正则性要求具体是什么';opaquePanel.materials=[await fixture.host.capture()];await opaquePanel.send();});
  assert.equal(await page.evaluate(()=>opaqueCalls.length),1);await page.getByText('服务端错误说明',{exact:true}).click();assert.match(await page.locator('.zma-error-details').innerText(),/Admission failed <img/);assert.equal(await page.locator('.zma-error-details img').count(),0);await page.getByRole('button',{name:'以标准模式关闭联网重试',exact:true}).click();await page.waitForFunction(()=>!opaquePanel.busy&&opaqueCalls.length===2);assert.deepEqual(await page.evaluate(()=>[opaqueSpeed,opaqueReasoning,opaqueWeb]),['default','default','off']);assert.equal(await page.evaluate(()=>opaquePanel.conversation().history.length),2);assert.ok(await page.evaluate(()=>JSON.stringify(opaqueCalls[1]).includes('PDF facts retained')));assert.equal(await page.evaluate(()=>opaqueCalls[1].at(-1).content.filter(p=>p.type==='image_url').length),1);
 }finally{await browser.close();}
});
test('composer PDF paste stays local until send, survives draft reload, and is included in follow-up context',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.provider='chatgpt';globalThis.fileBytes=new Map();host.P.parent=p=>p.slice(0,p.lastIndexOf('/'));host.IO.makeDirectory=async()=>{};host.IO.write=async(p,b)=>fileBytes.set(p,b);host.IO.read=async p=>fileBytes.get(p);const original=host.Z.Items.get();original.getFilePathAsync=async()=>'/pdf/current.pdf';host.Z.Items.get=()=>original;host.documentContext=async()=>({mode:'full-text',text:'current',pages:[1],totalPages:1,title:'PDF'});globalThis.sentFiles=[];host.selectedClient=()=>host.client;host.client.generate=async messages=>{sentFiles.push(messages);return '根据附件回答';};globalThis.filePanel=await host.panel(fixture.reader);filePanel.showChat();const data=new DataTransfer();data.items.add(new File(['%PDF-1.7\nfixture'],'extra.pdf',{type:'application/pdf'}));filePanel.question.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
 await page.waitForFunction(()=>filePanel.pendingMaterials.size===0&&filePanel.conversation().draftAttachments?.length===1);assert.equal(await page.evaluate(()=>filePanel.conversation().draftAttachments?.length),1,await page.evaluate(()=>filePanel.status.textContent));assert.equal(await page.evaluate(()=>sentFiles.length),0);assert.equal(await page.getByRole('button',{name:'添加附件',exact:true}).count(),1);
 const result=await page.evaluate(async()=>{const restored=ZMACore.cleanState(filePanel.state);const saved=restored.conversations[0].draftAttachments[0];filePanel.question.value='解释附件';await filePanel.send();filePanel.question.value='继续解释';await filePanel.send();return {saved,requests:sentFiles,history:filePanel.conversation().history.length,draft:filePanel.conversation().draftAttachments||[]};});assert.equal(result.saved.name,'extra.pdf');assert.equal(result.requests.length,2);assert.ok(result.requests.every(r=>JSON.stringify(r).includes('JVBERi0xLjc')));assert.equal(result.history,4);assert.deepEqual(result.draft,[]);
 }finally{await browser.close();}
});
test('quote bubbles dismiss empty comments, collapse edited comments, reopen and submit multiple annotations together',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{globalThis.quotePanel=await fixture.host.panel(fixture.reader);quotePanel.showChat();quotePanel.conversation().history=[{role:'assistant',content:'前文公式 \\(x=1\\) 后文',materials:[]}];quotePanel.renderMessages();const answer=quotePanel.messages.querySelector('.zma-answer'),range=document.createRange();range.selectNodeContents(answer);getSelection().removeAllRanges();getSelection().addRange(range);answer.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:1100,clientY:180}));});
  await page.getByRole('button',{name:'引用并批注提问',exact:true}).click();
  assert.equal(await page.locator('.zma-quote-popover:visible').count(),1);
  await page.getByRole('textbox',{name:'问题',exact:true}).click();assert.equal(await page.locator('.zma-quote-popover:visible').count(),0);assert.equal(await page.locator('.zma-quote-chip').count(),0);
  await page.evaluate(()=>quotePanel.quoteSelection('公式 \\(x=1\\)',{messageIndex:0,start:0,end:4}));
  await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('这里为何成立？');await page.getByRole('textbox',{name:'问题',exact:true}).click();
  assert.equal(await page.locator('.zma-quote-popover:visible').count(),0);assert.equal(await page.locator('.zma-quote-chip').count(),1);assert.equal(await page.getByRole('textbox',{name:'问题',exact:true}).inputValue(),'');
  await page.locator('.zma-quote-chip').click();assert.equal(await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).inputValue(),'这里为何成立？');
  await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('这里为何成立，条件是什么？');
  await page.evaluate(()=>quotePanel.quoteSelection('另一段非线性项',{messageIndex:0,start:5,end:9}));await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('和上一式有什么联系？');
  await page.getByRole('textbox',{name:'问题',exact:true}).fill('请结合两处批注说明');await page.getByRole('textbox',{name:'问题',exact:true}).click();
  const saved=await page.evaluate(()=>ZMACore.cleanState(JSON.parse(JSON.stringify(quotePanel.state))));assert.equal(saved.conversations[0].draftQuotes.length,2);assert.match(saved.conversations[0].draftQuotes[0].text,/\\\(x=1\\\)/);assert.equal(saved.conversations[0].draftQuotes[1].comment,'和上一式有什么联系？');
  await page.evaluate(()=>{fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF QA context',pages:[1],totalPages:1});fixture.host.client.generate=async messages=>{globalThis.bubbleRequests=(globalThis.bubbleRequests||[]).concat([messages]);return '合并解答';};});
  await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>globalThis.bubbleRequests?.length===1&&!quotePanel.busy);
  const result=await page.evaluate(()=>({question:quotePanel.conversation().history.at(-2).content,draft:quotePanel.question.value,quotes:quotePanel.conversation().draftQuotes}));assert.match(result.question,/请结合两处批注说明/);assert.match(result.question,/这里为何成立，条件是什么/);assert.match(result.question,/和上一式有什么联系/);assert.match(result.question,/\\\(x=1\\\)/);assert.equal(result.draft,'');assert.equal(result.quotes.length,0);assert.equal(await page.locator('.zma-quote-chip').count(),0);
 }finally{await browser.close();}
});
test('quote drafts are conversation scoped, restore after panel recreation and survive failed sends',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{globalThis.quotePanel=await fixture.host.panel(fixture.reader);quotePanel.showChat();quotePanel.conversation().history=[{role:'assistant',content:'需要解释的段落',materials:[]}];quotePanel.renderMessages();quotePanel.quoteSelection('需要解释的段落',{messageIndex:0});});
  await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('只批注，不另写问题');await page.getByRole('textbox',{name:'问题',exact:true}).click();
  const result=await page.evaluate(async()=>{const original=quotePanel.conversation().id;await quotePanel.newConversation();const separate=quotePanel.conversation().draftQuotes?.length||0;await quotePanel.switchConversation(original);const restored=ZMACore.cleanState(JSON.parse(JSON.stringify(quotePanel.state)));fixture.host.load=async()=>restored;await quotePanel.destroy();globalThis.quotePanel=await new ZMAPanel.Panel(fixture.host,fixture.reader,document).init();quotePanel.showChat();fixture.host.documentContext=async()=>{throw new Error('offline error');};await quotePanel.send();return {separate,retained:quotePanel.conversation().draftQuotes,history:quotePanel.conversation().history.length,status:quotePanel.status.textContent};});assert.equal(result.separate,0);assert.equal(result.retained.length,1);assert.equal(result.retained[0].comment,'只批注，不另写问题');assert.match(result.status,/offline error/);assert.equal(await page.locator('.zma-quote-chip').count(),1);
 }finally{await browser.close();}
});
test('quote bubble anchors follow rendered math, reopen in place and stay inside narrow docks',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});for(const file of ['src/markdown.js','content/vendor/marked/marked.umd.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
  await page.evaluate(async()=>{fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;globalThis.quotePanel=await fixture.host.panel(fixture.reader);quotePanel.showChat();quotePanel.conversation().history=[{role:'assistant',content:'## 参数估计的条件\n\n将未知参数写为 \\(\\theta\\)，则观测方程为\n\n\\[y(t)=\\varphi^{\\mathsf T}(t)\\theta\\]\n\n持续激励条件保证不同参数方向都有足够信息。\n\n只有局部时间内有激励时，还需要检查历史数据的利用方式。\n\n可进一步比较模型假设和估计器结构。',materials:[]}];quotePanel.renderMessages();const answer=quotePanel.messages.querySelector('.zma-answer'),math=answer.querySelector('math[display="block"]'),r=document.createRange();r.selectNodeContents(math);getSelection().removeAllRanges();getSelection().addRange(r);math.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:1100,clientY:300}));});
  await page.getByRole('button',{name:'引用并批注提问',exact:true}).click();await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('这里的回归向量如何构造？');await page.getByRole('textbox',{name:'问题',exact:true}).click();
  await page.evaluate(()=>quotePanel.quoteSelection('持续激励条件保证不同参数方向都有足够信息。',{messageIndex:0,start:45,end:60}));await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('和有限激励条件有什么区别？');await page.getByRole('textbox',{name:'问题',exact:true}).click();
  const evidence=path.resolve(__dirname,'../evidence/ui-0126');fs.mkdirSync(evidence,{recursive:true});
  for(const scheme of ['light','dark'])for(const width of [320,440]){await page.emulateMedia({colorScheme:scheme});await page.evaluate(async({scheme,width})=>{document.documentElement.style.colorScheme=scheme;document.documentElement.style.setProperty('--zma-assistant-user-width',width+'px');await fixture.host.setFontSize(width===320?20:14);quotePanel.messages.scrollTop=0;},{scheme,width});await page.waitForTimeout(80);await page.locator('.zma-quote-chip').first().click();
   const g=await page.evaluate(()=>{const p=quotePanel.quotes.popover.getBoundingClientRect(),r=quotePanel.node.getBoundingClientRect();return {left:p.left-r.left,right:r.right-p.right,top:p.top-r.top,bottom:r.bottom-p.bottom,latex:quotePanel.conversation().draftQuotes[0].text,formulas:quotePanel.quotes.popover.querySelectorAll('math').length};});assert.ok(g.left>=0&&g.right>=0&&g.top>=0&&g.bottom>=0,JSON.stringify(g));assert.equal(g.formulas,1);assert.match(g.latex,/\\\[/);await page.locator('.zma-panel').screenshot({path:path.join(evidence,`bubble-${scheme}-${width}.png`)});await page.getByRole('button',{name:'收起批注',exact:true}).click();await page.locator('.zma-panel').screenshot({path:path.join(evidence,`collapsed-${scheme}-${width}.png`)});
  }
  await page.locator('.zma-quote-chip').last().click();await page.getByRole('button',{name:'删除批注',exact:true}).click();assert.equal(await page.locator('.zma-quote-chip').count(),1);await page.locator('.zma-quote-chip').click();await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('');await page.getByRole('textbox',{name:'问题',exact:true}).click();assert.equal(await page.locator('.zma-quote-chip').count(),0);
 }finally{await browser.close();}
});
test('clicking inside the PDF frame dismisses the comment bubble and keeps nonempty drafts',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{globalThis.quotePanel=await fixture.host.panel(fixture.reader);quotePanel.showChat();quotePanel.conversation().history=[{role:'assistant',content:'原文片段',materials:[]}];quotePanel.renderMessages();const frame=document.createElement('iframe');frame.id='pdf-quote-frame';frame.srcdoc='<button>PDF 内容</button>';document.querySelector('#split-view').append(frame);});await page.frameLocator('#pdf-quote-frame').getByRole('button').waitFor();await page.evaluate(()=>quotePanel.quoteSelection('原文片段',{messageIndex:0}));await page.frameLocator('#pdf-quote-frame').getByRole('button').click();assert.equal(await page.locator('.zma-quote-popover:visible').count(),0);assert.equal(await page.locator('.zma-quote-chip').count(),0);
  await page.evaluate(()=>quotePanel.quoteSelection('原文片段',{messageIndex:0}));await page.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('保留批注');await page.frameLocator('#pdf-quote-frame').getByRole('button').click();assert.equal(await page.locator('.zma-quote-popover:visible').count(),0);assert.equal(await page.locator('.zma-quote-chip').count(),1);
 }finally{await browser.close();}
});
test('PDF text and region quote bubbles live on the page, retain independent drafts and send source images with comments',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(async()=>{globalThis.pdfQuotePanel=await fixture.host.panel(fixture.reader);pdfQuotePanel.showChat();const frame=document.createElement('iframe');frame.id='quote-pdf';frame.style.cssText='width:100%;height:100%;border:0';frame.srcdoc='<style>body{margin:0}.page{position:relative;margin:40px;width:600px;height:800px;background:white}#view{position:fixed;inset:0;overflow:auto;background:#ddd}</style><div id="view"><div class="page">PDF selected passage and equation</div><div style="height:800px"></div></div>';document.querySelector('#split-view').append(frame);});await page.frameLocator('#quote-pdf').locator('.page').waitFor();
  await page.evaluate(async()=>{const doc=document.querySelector('#quote-pdf').contentDocument,adapter={document:()=>doc,pdfWindow:doc.defaultView,page:()=>({element:doc.querySelector('.page'),viewport:{width:600,height:800,convertToViewportRectangle:r=>r}})};await pdfQuotePanel.quotes.attachPDF(adapter);const crop=document.createElement('canvas');crop.width=420;crop.height=96;const c=crop.getContext('2d');c.fillStyle='white';c.fillRect(0,0,420,96);c.fillStyle='#222';c.font='24px serif';c.fillText('y(t) = phi(t) theta',24,54);fixture.host.capture=async(_r,s)=>s.kind==='text'?{source:s,text:s.text}:{source:s,dataURL:crop.toDataURL(),text:''};globalThis.pdfText={...fixture.source,pageIndex:0,pageLabel:'1',rects:[[70,60,270,85]],selection:true,kind:'text',text:'PDF 里的原始定义'};await pdfQuotePanel.addPDFQuote(pdfText);});
  const pdf=page.frameLocator('#quote-pdf');assert.equal(await pdf.locator('.zma-quote-popover:visible').count(),1);await pdf.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('定义中的参数是什么意思？');await pdf.locator('.page').click({position:{x:10,y:10}});assert.equal(await pdf.locator('.zma-quote-popover:visible').count(),0);assert.equal(await pdf.locator('.zma-pdf-quote-anchor:visible').count(),1);
  await page.evaluate(()=>pdfQuotePanel.addPDFQuote({...pdfText,kind:undefined,text:undefined,selection:undefined,annotationKey:'FORM0630',rects:[[80,140,350,200]]}));await pdf.getByRole('textbox',{name:'对话片段的注释',exact:true}).fill('请解释图中的公式');await pdf.locator('.page').click({position:{x:10,y:10}});
  const saved=await page.evaluate(()=>ZMACore.cleanState(JSON.parse(JSON.stringify(pdfQuotePanel.state))));assert.equal(saved.conversations[0].draftQuotes.length,2);assert.equal(saved.conversations[0].draftQuotes[0].source.selection,true);assert.ok(!JSON.stringify(saved).includes('base64'));
  await page.evaluate(async()=>{const doc=document.querySelector('#quote-pdf').contentDocument;doc.querySelector('#view').scrollTop=0;await new Promise(resolve=>doc.defaultView.requestAnimationFrame(()=>doc.defaultView.requestAnimationFrame(resolve)));});
  const position=await page.evaluate(()=>{const doc=document.querySelector('#quote-pdf').contentDocument,b=doc.querySelector('.zma-pdf-quote-anchor');return b.getBoundingClientRect().top;});await page.evaluate(()=>{document.querySelector('#quote-pdf').contentDocument.querySelector('#view').scrollTop=60;});await page.waitForFunction(expected=>{const n=document.querySelector('#quote-pdf').contentDocument.querySelector('.zma-pdf-quote-anchor');return n&&Math.abs(expected-n.getBoundingClientRect().top-60)<2;},position,{timeout:3000});const scrolled=await page.evaluate(()=>document.querySelector('#quote-pdf').contentDocument.querySelector('.zma-pdf-quote-anchor').getBoundingClientRect().top);assert.ok(Math.abs(position-scrolled-60)<2);await page.evaluate(()=>{document.querySelector('#quote-pdf').contentDocument.querySelector('#view').scrollTop=0;pdfQuotePanel.close();});assert.equal(await pdf.locator('.zma-pdf-quote-anchor:visible').count(),0);await page.evaluate(()=>pdfQuotePanel.showChat());await page.waitForTimeout(80);assert.equal(await pdf.locator('.zma-pdf-quote-anchor:visible').count(),2);
  await page.evaluate(()=>{const doc=document.querySelector('#quote-pdf').contentDocument;doc.querySelector('.page').style.cssText='width:480px;height:640px';doc.defaultView.dispatchEvent(new doc.defaultView.Event('resize'));});await page.waitForTimeout(80);const scaled=await page.evaluate(()=>{const doc=document.querySelector('#quote-pdf').contentDocument,page=doc.querySelector('.page').getBoundingClientRect(),badge=doc.querySelector('.zma-pdf-quote-anchor').getBoundingClientRect();return {x:badge.left,expected:page.left+270*.8+4};});assert.ok(Math.abs(scaled.x-scaled.expected)<2,JSON.stringify(scaled));await page.evaluate(()=>{const doc=document.querySelector('#quote-pdf').contentDocument;doc.querySelector('.page').style.cssText='';doc.defaultView.dispatchEvent(new doc.defaultView.Event('resize'));});await page.waitForTimeout(80);
  fs.mkdirSync(path.resolve(__dirname,'../evidence/ui-0127'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../evidence/ui-0127/pdf-collapsed.png')});
  await page.locator('.zma-quote-chip').first().click();assert.equal(await pdf.getByRole('textbox',{name:'对话片段的注释',exact:true}).inputValue(),'定义中的参数是什么意思？');await pdf.getByRole('button',{name:'收起批注',exact:true}).click();
  await page.locator('.zma-quote-chip').last().click();await pdf.locator('.zma-quote-popover img').waitFor();await page.screenshot({path:path.resolve(__dirname,'../evidence/ui-0127/pdf-region-bubble.png')});await pdf.getByRole('button',{name:'收起批注',exact:true}).click();
  await page.evaluate(()=>{fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF whole context',pages:[1],totalPages:1});fixture.host.client.generate=async messages=>{globalThis.pdfQuoteRequest=messages;return 'PDF quote answer';};});await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>globalThis.pdfQuoteRequest&&!pdfQuotePanel.busy);const result=await page.evaluate(()=>({sent:JSON.stringify(pdfQuoteRequest),history:pdfQuotePanel.conversation().history,quotes:pdfQuotePanel.conversation().draftQuotes}));assert.match(result.sent,/PDF 里的原始定义/);assert.match(result.sent,/定义中的参数是什么意思/);assert.match(result.sent,/请解释图中的公式/);assert.match(result.sent,/data:image\/png/);assert.equal(result.history.at(-2).materials.length,2);assert.equal(result.quotes.length,0);
 }finally{await browser.close();}
});
test('PDF bubble uses a viewport fallback when its source page has not rendered or its anchor is offscreen',async()=>{
 const {browser,page}=await setup();try{
  const result=await page.evaluate(async()=>{const p=await fixture.host.panel(fixture.reader);p.showChat();await p.quotes.attachPDF({document:()=>document,page:()=>undefined});fixture.host.capture=async(_r,source)=>({source,text:source.text});const source={...fixture.source,kind:'text',text:'尚未渲染的 PDF 原文',selection:true,pageIndex:9,pageLabel:'10'};await p.addPDFQuote(source);const id=p.conversation().draftQuotes[0].id,input=p.quotes.popover.querySelector('textarea');input.value='需要解释这段内容';input.dispatchEvent(new Event('input',{bubbles:true}));p.quotes.collapse();p.quotes.open(id);p.quotes.position();const r=p.quotes.popover.getBoundingClientRect();return {open:!p.quotes.popover.hidden,text:p.quotes.popover.querySelector('textarea').value,hidden:p.quotes.pdfLayer.querySelector('button').hidden,rect:{x:r.left,y:r.top,right:r.right,bottom:r.bottom},viewport:{width:innerWidth,height:innerHeight}};});assert.ok(result.open);assert.ok(result.hidden);assert.equal(result.text,'需要解释这段内容');assert.ok(result.rect.x>=0&&result.rect.y>=0&&result.rect.right<=result.viewport.width&&result.rect.bottom<=result.viewport.height,JSON.stringify(result));
 }finally{await browser.close();}
});
test('web-assisted answers show clickable inline citations, sourced images and persisted metadata after reopening',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
  for(const file of ['content/vendor/marked/marked.umd.js','src/markdown.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
  const diagram=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=720;c.height=250;const ctx=c.getContext('2d');ctx.fillStyle='#f1f5fc';ctx.fillRect(0,0,720,250);ctx.strokeStyle='#4d6fc5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(86,195);ctx.lineTo(640,195);ctx.moveTo(86,195);ctx.lineTo(86,30);ctx.stroke();ctx.strokeStyle='#c97636';ctx.beginPath();for(let x=86;x<640;x++){const y=182-115*(1-Math.exp(-(x-86)/120));x===86?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.fillStyle='#20345a';ctx.font='24px sans-serif';ctx.fillText('Information accumulates over time',155,38);ctx.font='20px sans-serif';ctx.fillText('time',617,231);ctx.fillText('Information',12,225);return c.toDataURL().split(',')[1];});
  await page.route('https://cdn.example/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from(diagram,'base64')}));
  await page.evaluate(async()=>{
   fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;fixture.host.providerState=()=>({provider:'chatgpt',signedIn:true,model:'测试模型'});globalThis.webPanel=await fixture.host.panel(fixture.reader);webPanel.showChat();
   fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF original',pages:[1],totalPages:1});fixture.host.openExternal=url=>{globalThis.openedWebURL=url;};
   fixture.host.client.generate=async(_m,{onDelta,onWebUpdate})=>{const text='**信息矩阵描述数据对参数的约束。** 不同方向都得到激励时，参数才容易区分。\n\n\\[J(t)=\\int_0^t\\psi(\\tau)\\psi(\\tau)^T\\,d\\tau\\]\n\n下面的外部配图帮助理解信息积累，不代替原论文的公式与结论。';onDelta(text);onWebUpdate({used:true,citations:[{url:'https://paper.example/a',title:'原始研究 · 信息矩阵与参数辨识',start:0,end:20}],sources:[],images:[{url:'https://cdn.example/a.png',source:'https://paper.example/a',caption:'信息随时间积累的示意（测试配图）'}]});return text;};webPanel.question.value='结合资料和配图解释信息矩阵';await webPanel.send();
  });
  assert.ok(await page.locator('.zma-answer a[href="https://paper.example/a"]').count());assert.equal(await page.locator('.zma-web-result figure').count(),1);assert.equal(await page.locator('.zma-answer math').count(),1);await page.locator('.zma-web-result figure img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>webPanel.node.querySelector('.zma-web-result img')?.naturalWidth===720);await page.locator('.zma-answer a[href="https://paper.example/a"]').first().click();assert.equal(await page.evaluate(()=>openedWebURL),'https://paper.example/a');
  const evidence=path.resolve(__dirname,'../evidence/ui-0130');fs.mkdirSync(evidence,{recursive:true});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.evaluate(value=>{document.documentElement.style.colorScheme=value;webPanel.messages.scrollTop=0;},scheme);await page.locator('.zma-panel').screenshot({path:path.join(evidence,`web-${scheme}.png`)});}
  const saved=await page.evaluate(async()=>{const copy=ZMACore.cleanState(webPanel.state);webPanel.close();webPanel.showChat();webPanel.renderMessages();return copy;});assert.equal(saved.conversations[0].history.at(-1).web.images[0].source,'https://paper.example/a');assert.equal(await page.locator('.zma-web-result figure').count(),1);
 }finally{await browser.close();}
});
test('Chinese formula punctuation and adjacent bold remain readable in the real dock at narrow widths',async()=>{
 const {browser,page}=await setup();try{
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});for(const file of ['src/math.js','src/markdown.js','content/vendor/marked/marked.umd.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
  await page.evaluate(async()=>{fixture.host.addon.bridge.renderMathPreview=Zotero.MarginComments.bridge.renderMathPreview;globalThis.cjkPanel=await fixture.host.panel(fixture.reader);cjkPanel.conversation().history=[{role:'user',content:'解释参数辨识的思路',materials:[]},{role:'assistant',content:'## 核心方法\n\n直观理解：**坐标轴没有对准转子。**因此会出现投影误差。\n\n论文用电压波动作为参数调整的反馈：\n\n\\[\\text{注入位置偏移方波}\\;\\longrightarrow\\;\\text{检测 }q\\text{ 轴电压波动}\\;\\longrightarrow\\;\\text{调整 }L_s、R\\;\\longrightarrow\\;\\text{根据反电动势估计 }\\psi_m.\\]\n\n这一页是在铺垫：**参数不准会影响位置估计。**完整算法在后文展开。\n\n`**代码。**仍按原文显示`',materials:[]}];cjkPanel.renderMessages();cjkPanel.showChat();});
  assert.equal(await page.locator('.zma-answer math').count(),1);assert.equal(await page.locator('.zma-answer strong').count(),2);assert.equal(await page.locator('.zma-answer code').innerText(),'**代码。**仍按原文显示');
  const evidence=path.resolve(__dirname,'../evidence/ui-0131');fs.mkdirSync(evidence,{recursive:true});for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});for(const width of [320,420]){await page.evaluate(({scheme,width})=>{document.documentElement.style.colorScheme=scheme;document.documentElement.style.setProperty('--zma-assistant-user-width',width+'px');cjkPanel.messages.scrollTop=0;},{scheme,width});assert.ok(await page.locator('.zma-panel').evaluate(n=>n.scrollWidth-n.clientWidth<=1));await page.locator('.zma-panel').screenshot({path:path.join(evidence,`cjk-${scheme}-${width}.png`)});}}
 }finally{await browser.close();}
});

test('search rejection offers an explicit offline retry and keeps just one question',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{globalThis.webPanel=await fixture.host.panel(fixture.reader);webPanel.showChat();fixture.host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});globalThis.webAttempts=0;fixture.host.client.generate=async()=>{webAttempts++;if(webAttempts===1)throw Object.assign(new Error('联网搜索不被当前账户接受'),{safe:true,webRejected:true});return '基于PDF回答';};webPanel.question.value='解释原文';await webPanel.send();});assert.equal(await page.getByRole('button',{name:'关闭联网搜索并重试',exact:true}).count(),1);assert.equal(await page.evaluate(()=>webAttempts),1);await page.getByRole('button',{name:'关闭联网搜索并重试',exact:true}).click();await page.waitForFunction(()=>webAttempts===2&&!webPanel.busy);assert.equal(await page.evaluate(()=>webPanel.conversation().history.length),2);assert.equal(await page.evaluate(()=>fixture.host.webState().mode),'off');}finally{await browser.close();}
});
test('completed long answers open at their beginning instead of jumping to the last paragraph',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});host.client.generate=async(_m,{onDelta})=>{const text=Array.from({length:90},(_,i)=>'第 '+i+' 段：解释公式与定义。').join('\n\n');onDelta(text);return text;};globalThis.scrollPanel=await host.panel(fixture.reader);scrollPanel.showChat();scrollPanel.question.value='详细解释';await scrollPanel.send();});const pos=await page.evaluate(()=>{const messages=scrollPanel.messages,answer=messages.lastElementChild;return {offset:answer.getBoundingClientRect().top-messages.getBoundingClientRect().top,height:answer.getBoundingClientRect().height,viewport:messages.clientHeight};});assert.ok(pos.height>pos.viewport,pos);assert.ok(Math.abs(pos.offset)<4,pos);}finally{await browser.close();}
});
test('manual reading during generation preserves position when the answer finishes',async()=>{
 const {browser,page}=await setup();try{await page.evaluate(async()=>{const host=fixture.host;host.documentContext=async()=>({mode:'full-text',text:'PDF',pages:[1],totalPages:1});host.client.generate=(_m,{onDelta})=>new Promise(resolve=>{const text='首段定义\n\n'+'推导过程\n\n'.repeat(150);onDelta(text);globalThis.finishReadingAnswer=()=>resolve(text);});globalThis.readingPanel=await host.panel(fixture.reader);readingPanel.showChat();readingPanel.question.value='解释';globalThis.readingSend=readingPanel.send();});await page.waitForFunction(()=>!!globalThis.finishReadingAnswer);const before=await page.evaluate(()=>{readingPanel.messages.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true}));readingPanel.messages.scrollTop=200;return readingPanel.messages.scrollTop;});await page.evaluate(async()=>{finishReadingAnswer();await readingSend;});assert.ok(Math.abs((await page.evaluate(()=>readingPanel.messages.scrollTop))-before)<3);}finally{await browser.close();}
});

test('Notion browser failure leaves chat usable and is retried after reopening', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(async () => {
      const { host, reader } = fixture;
      globalThis.recoveryLoads = 0;
      host.notionLinks = async () => [{ id: 5, title: 'Notion', url: 'https://www.notion.so/0123456789abcdef0123456789abcdef' }];
      host.createNotionBrowser = (_reader, _anchor, onState) => {
        globalThis.notionBrowserState = onState;
        return { load: async () => { recoveryLoads++; onState({ loading: false }); }, setVisible() {}, destroy() {} };
      };
      globalThis.recoveryPanel = await host.panel(reader);
      recoveryPanel.question.value = 'Keep this unsent question';
      await recoveryPanel.showNotion();
      notionBrowserState({ loading: false, error: true, crashed: true });
      recoveryPanel.showChat();
    });
    assert.equal(await page.locator('.zma-chat').isVisible(), true);
    assert.equal(await page.getByRole('textbox', { name: '问题', exact: true }).inputValue(), 'Keep this unsent question');
    await page.evaluate(async () => { recoveryPanel.notion.hide(); await recoveryPanel.showNotion(); });
    assert.equal(await page.evaluate(() => recoveryLoads), 2);
    assert.equal(await page.locator('.zma-notion-status').isVisible(), false);
  } finally { await browser.close(); }
});
