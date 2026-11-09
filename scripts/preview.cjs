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
  fs.writeFileSync(path.join(evidence,'scan-crop.png'),Buffer.from(materials[0].dataURL.split(',')[1],'base64'));await task.destroy();
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const tab=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
    await tab.setContent('<html lang="zh-CN"><head></head><body style="background:#e8eaee;margin:0;font:16px system-ui"><div style="padding:16px;background:white;border-bottom:1px solid #bbb">Zotero 阅读器界面检查 · 使用扫描件局部 · 模拟回答，未调用 DeepSeek</div><main style="margin:45px;width:780px;padding:20px;background:white"><h2>当前页阅读</h2><p>圈选当前公式，在旁边展开已标记的前文来源。</p><img id="page" style="width:750px"/><p>页边批注：依据前文 <a href="#">段落（示例 A）</a> 继续推导。</p></main></body></html>');
    await tab.addStyleTag({path:path.join(project,'src/assistant.css')});
    await tab.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    for(const name of ['core','references','deepseek','panel'])await tab.addScriptTag({path:path.join(project,'src/'+name+'.js')});
    await tab.addScriptTag({path:path.join(project,'build/content/scripts/margincomments.js')});
    await tab.evaluate(async({materials,sources})=>{
      document.getElementById('page').src=materials[1].dataURL;
      const state=ZMACore.emptyState();state.sources=sources;
      const host={addon:Zotero.MarginComments,scope:()=>({libraryID:1,attachmentKey:'ABCD1234'}),load:async()=>state,save:async()=>{},capture:async(_r,s)=>materials.find(m=>m.source.annotationKey===s.annotationKey),newAbortController:()=>new AbortController(),copy:()=>{},settings:()=>{},currentPage:async()=>sources[1]};
      const panel=await new ZMAPanel.Panel(host,{itemID:1},document).init();panel.open();await panel.addMaterial(sources[1]);await panel.preview(sources[0]);
      panel.question.value='这段推导如何使用前面的结论？';
    },{materials,sources});
    await tab.screenshot({path:path.join(evidence,'assistant-preview.png'),fullPage:true});
  }finally{await browser.close();}
  process.stdout.write('Local scan crop and assistant preview saved; no network/API requests.\n');
})().catch(e=>{process.stderr.write(e.stack+'\n');process.exit(1);});
