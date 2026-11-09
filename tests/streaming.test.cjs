const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{chromium}=require('playwright');
test('live answer renders closed math before completion, preserves partial delimiters, and leaves committed blocks untouched',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div id="answer"></div>');await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    for(const name of ['core','references','math','markdown'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../content/vendor/marked/marked.umd.js')});await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});
    if(fs.existsSync(__dirname+'/../src/streaming.js'))await page.addScriptTag({path:path.resolve(__dirname,'../src/streaming.js')});
    assert.ok(await page.evaluate(()=>!!globalThis.ZMAStreaming),'live renderer must exist');
    await page.evaluate(()=>{globalThis.rendered=[];globalThis.live=new ZMAStreaming.LiveRenderer(document.getElementById('answer'),(node,text)=>{rendered.push(text);ZMAMarkdown.render(node,text,Zotero.MarginComments.bridge.renderMathPreview);},{interval:25});live.append('## 推导\n\n\\[x=1\\]\n\n下一式 \\[y=');});
    await page.waitForTimeout(90);assert.equal(await page.locator('#answer math').count(),1);assert.match(await page.locator('#answer').innerText(),/下一式/);assert.equal(await page.locator('#answer').evaluate(node=>node.lastElementChild.textContent),'\\[y=');
    await page.evaluate(()=>{globalThis.firstMath=document.querySelector('math');live.append('2\\]\n\n结论');});await page.waitForTimeout(90);
    assert.equal(await page.locator('#answer math').count(),2);assert.ok(await page.evaluate(()=>firstMath.isConnected),'completed math must not be rerendered for later tokens');
    const r=await page.evaluate(()=>{for(let i=0;i<100;i++)live.append('字');live.finish();return {count:rendered.length,source:live.source};});assert.ok(r.count<12,r);assert.match(r.source,/字{100}$/);
  }finally{await browser.close();}
});
const {analyze}=require('../src/streaming.js');
test('stream boundaries keep fenced math literal and defer unfinished math',()=>{
  const fenced='```latex\n\\[x=1\\]\n\n```\n\n尾部';
  assert.equal(analyze(fenced).cut,fenced.indexOf('尾部'));
  assert.equal(analyze('正文 \\[x=').safe,3);
  assert.equal(analyze('正文 \\(x=1\\)').safe,'正文 \\(x=1\\)'.length);
  const long='词 '.repeat(5000);assert.ok(analyze(long).cut<=4098);
});
