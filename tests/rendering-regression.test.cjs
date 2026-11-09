const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
async function fixture(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();await page.setContent('<div id="answer"></div>');await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
 for(const file of ['src/core.js','src/references.js','src/math.js','src/markdown.js','src/streaming.js','content/vendor/marked/marked.umd.js','build/content/scripts/margincomments.js'])await page.addScriptTag({path:path.resolve(__dirname,'../'+file)});
 return {browser,page};
}
test('Chinese punctuation in display math renders without changing the original LaTeX or accepting invalid commands',async()=>{
 const {browser,page}=await fixture();try{
  const r=await page.evaluate(()=>{const source='\\[\n\\text{注入位置偏移方波}\\;\\longrightarrow\\;\\text{检测 }q\\text{ 轴电压波动}\\;\\longrightarrow\\;\\text{调整 }L_s、R\\;\\longrightarrow\\;\\text{根据反电动势估计 }\\psi_m.\n\\]';ZMAMarkdown.render(answer,source,Zotero.MarginComments.bridge.renderMathPreview);const math=answer.querySelector('math'),valid={count:answer.querySelectorAll('math').length,latex:math?.getAttribute('data-zma-latex'),source,text:math?.textContent};ZMAMarkdown.render(answer,'\\[\\invalidCommand{a}\\]',Zotero.MarginComments.bridge.renderMathPreview);return {...valid,invalidCount:answer.querySelectorAll('math').length,invalidText:answer.textContent};});
  assert.equal(r.count,1);assert.equal(r.latex,r.source);assert.match(r.text,/、/);assert.equal(r.invalidCount,0);assert.equal(r.invalidText,'\\[\\invalidCommand{a}\\]');
 }finally{await browser.close();}
});
test('Chinese bold closing punctuation followed by prose renders while code and escaped markers remain literal',async()=>{
 const {browser,page}=await fixture();try{
  const r=await page.evaluate(()=>{const source='铺垫：**为什么参数不准会造成误差。**完整算法在后文。\n\n直观理解：**坐标轴沿 \\(q\\) 轴。**因此有投影。\n\n`**代码。**原样` 与 \\*\\*文字。\\*\\*原样\n\n```text\n**代码块。**原样\n```\n\n**普通 English** 仍然有效。';ZMAMarkdown.render(answer,source,Zotero.MarginComments.bridge.renderMathPreview);return {strong:[...answer.querySelectorAll('strong')].map(n=>n.textContent),math:answer.querySelectorAll('strong math').length,code:[...answer.querySelectorAll('code')].map(n=>n.textContent),text:answer.textContent};});
  assert.ok(r.strong.includes('为什么参数不准会造成误差。'));assert.equal(r.strong.length,3);assert.equal(r.math,1);assert.deepEqual(r.code,['**代码。**原样','**代码块。**原样']);assert.match(r.text,/\*\*文字。\*\*原样/);
 }finally{await browser.close();}
});
test('streamed Chinese math and punctuation-adjacent bold render before completion and match reopened history',async()=>{
 const {browser,page}=await fixture();try{
  await page.evaluate(()=>{globalThis.source='直观理解：**误差会传递。**因此需要反馈。\n\n\\[\\text{调整 }L_s、R\\]\n\n后续解释。';globalThis.live=new ZMAStreaming.LiveRenderer(answer,(node,text)=>ZMAMarkdown.render(node,text,Zotero.MarginComments.bridge.renderMathPreview),{interval:10});for(let i=0;i<source.length;i+=3)live.append(source.slice(i,i+3));});
  await page.waitForTimeout(100);assert.equal(await page.locator('#answer math').count(),1);assert.equal(await page.locator('#answer strong').innerText(),'误差会传递。');
  const r=await page.evaluate(()=>{const first=answer.querySelector('math');live.append('继续');live.flush();const retained=first.isConnected;live.finish();ZMAMarkdown.render(answer,source,Zotero.MarginComments.bridge.renderMathPreview);return {retained,math:answer.querySelectorAll('math').length,bold:answer.querySelector('strong')?.textContent};});assert.ok(r.retained);assert.equal(r.math,1);assert.equal(r.bold,'误差会传递。');
 }finally{await browser.close();}
});
