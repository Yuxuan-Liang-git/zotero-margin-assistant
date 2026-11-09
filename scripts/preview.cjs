// Local visual QA only. Never makes API requests or modifies Zotero libraries.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),{createCanvas}=require('@napi-rs/canvas');const R=require('../src/capture.js');
(async()=>{
  const project=path.resolve(__dirname,'..'),evidence=path.join(project,'evidence');fs.mkdirSync(evidence,{recursive:true});
  const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(evidence,'scanned-page-100.pdf'))),disableFontFace:true});const pdf=await task.promise;
  const page=await pdf.getPage(1),[x1,y1,x2,y2]=page.view;
  const base={libraryID:1,attachmentKey:'ABCD1234',pageIndex:0,pageLabel:'PDF 100（演示）',fingerprint:'demo',type:'段落'};
  const sources=[{...base,annotationKey:'SOURCE01',number:'示例A',id:'sourceA',rects:[[x1+20,(y1+y2)/2,x2-20,y2-35]],description:'取自用户扫描件的局部截图，仅用于本机界面检查。'},{...base,annotationKey:'SOURCE02',number:'示例B',id:'sourceB',rects:[[x1+20,y1+50,x2-20,(y1+y2)/2]]}];
  const materials=[];for(const s of sources)materials.push(await R.captureRegion(pdf,s,{createElement:()=>createCanvas(1,1)}));
  const textSource={...base,annotationKey:'TEXTDEMO',number:'定义1',id:'textDemo',rects:[[30,30,400,50]],kind:'text',text:'演示文字（不来自扫描页）：状态定义为 \\(x_1(t)\\)，且 \\[x_1^2=a+b\\]'};sources.push(textSource);materials.push({source:textSource,text:textSource.text,width:0,height:0});
  fs.writeFileSync(path.join(evidence,'scan-crop.png'),Buffer.from(materials[0].dataURL.split(',')[1],'base64'));await task.destroy();
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const tab=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
    await tab.setContent('<html lang="zh-CN"><head><style>body{background:#e8eaee;margin:0;font:15px system-ui;overflow:hidden}#split-view{position:fixed;left:0;right:0;top:40px;bottom:0;overflow:auto}main{margin:24px;width:730px;padding:20px;background:white}.zmc-card{position:absolute;right:12px;top:210px;width:290px;padding:12px;background:white;border:1px solid #2ea8e5;border-radius:5px;box-sizing:border-box}.zmc-card footer{margin-top:10px}</style></head><body><div style="height:40px;padding:8px;box-sizing:border-box;background:white">本机界面示例 · 扫描页局部 · 模拟回答，未调用 DeepSeek</div><div id="split-view"><main><h2>当前页阅读</h2><p>框选当前内容，引用前文后直接在页边对照。</p><img id="page" style="width:720px"/></main><article class="zmc-card" data-annotation-key="CURRENT2"><div class="zmc-card-preview"></div><footer></footer></article></div></body></html>');
    await tab.addStyleTag({path:path.join(project,'src/assistant.css')});
    await tab.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    await tab.addScriptTag({path:path.join(project,'content/vendor/marked/marked.umd.js')});
    for(const name of ['core','references','deepseek','markdown','panel','margin-references'])await tab.addScriptTag({path:path.join(project,'src/'+name+'.js')});
    await tab.addScriptTag({path:path.join(project,'build/content/scripts/margincomments.js')});
    await tab.evaluate(async({materials,sources})=>{
      document.getElementById('page').src=materials[1].dataURL;
      const state=ZMACore.emptyState();state.sources=sources;const source=sources[0];state.references=[source,sources[2]].map(s=>({annotationKey:'CURRENT2',sourceID:s.id,link:ZMACore.sourceLink(s)}));
      const card=document.querySelector('.zmc-card'),preview=card.querySelector('.zmc-card-preview'),runtime={card,preview,currentValue:ZMACore.storedLink(source)+'\n'+ZMACore.storedLink(sources[2]),annotation:{key:'CURRENT2'},referenceRoot:document.createElement('div')};runtime.referenceRoot.className='zma-reference-stack';card.insertBefore(runtime.referenceRoot,card.querySelector('footer'));ZMAReferences.render(preview,runtime.currentValue);
      const session={reader:{itemID:1},invalidateRuntimeHeight:()=>{},relayoutRuntime:()=>{}};
      const host={addon:Zotero.MarginComments,scope:()=>({libraryID:1,attachmentKey:'ABCD1234'}),load:async()=>state,save:async()=>{},capture:async(_r,s)=>materials.find(m=>m.source.annotationKey===s.annotationKey),resolveSource:async(_r,s)=>s,sourceLink:ZMACore.sourceLink,newAbortController:()=>new AbortController(),copy:()=>{},settings:()=>{},currentPage:async()=>sources[1]};
      const panel=await new ZMAPanel.Panel(host,session.reader,document).init();await panel.addMaterial(sources[1]);await ZMAMarginReferences.sync(host,session,runtime);
      state.history=[{role:'user',content:'这段推导如何使用前面的结论？',materials:[sources[1]]},{role:'assistant',content:'## 推导与前文定义\n\n**这是模拟回答，用于检查 Markdown 显示。**\n\n- 引用原图保留扫描件内容。\n- 文字段与公式直接显示在页边批注中。\n\n演示公式：\\[x_1^2=a+b\\]\n\n| 操作 | 作用 |\n| --- | --- |\n| 引用选中文字 | 保存可定位的高亮来源 |\n| 加入提问 | 联合解释当前页与前文 |\n\n点击上方工具栏可以再次打开侧栏。'}];panel.renderMessages();panel.question.value='继续解释这里的符号定义。';
    },{materials,sources});
    await tab.screenshot({path:path.join(evidence,'assistant-preview.png'),fullPage:true});
  }finally{await browser.close();}
  process.stdout.write('Local scan crop and assistant preview saved; no network/API requests.\n');
})().catch(e=>{process.stderr.write(e.stack+'\n');process.exit(1);});
