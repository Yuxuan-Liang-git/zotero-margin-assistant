const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const {chromium}=require('playwright');
async function setup(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),page=await browser.newPage();
  await page.setContent('<div id="pdf">PDF selection</div><aside class="zma-panel" id="panel"><div class="zma-answer" tabindex="0"><p>前文 <span class="katex"><math display="block" data-zma-latex="\\[\\frac{a}{b}\\]"><semantics><mfrac><mi>a</mi><mi>b</mi></mfrac><annotation encoding="application/x-tex">\\frac{a}{b}</annotation></semantics></math></span> 后文</p></div><textarea aria-label="问题">old text</textarea></aside>');
  if(fs.existsSync(path.resolve(__dirname,'../src/clipboard.js')))await page.addScriptTag({path:path.resolve(__dirname,'../src/clipboard.js')});
  await page.evaluate(()=>{globalThis.writes=[];globalThis.inputEvents=0;globalThis.readText='\\(x^2\\)';globalThis.panel=document.getElementById('panel');globalThis.input=panel.querySelector('textarea');input.addEventListener('input',()=>inputEvents++);if(globalThis.ZMAClipboard)globalThis.dispose=ZMAClipboard.install(panel,{copy:text=>writes.push(text),read:()=>readText,onError:e=>{globalThis.clipboardError=e.message;}});});
  return {browser,page};
}
test('copy a partially selected rendered formula as one complete LaTeX expression, overriding the reader clipboard',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{
    const text=document.querySelector('mi').firstChild,range=document.createRange();range.selectNodeContents(text);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const data=new DataTransfer();window.addEventListener('copy',e=>{e.clipboardData.setData('text/plain','wrong PDF annotation');e.preventDefault();},{capture:true,once:true});
    const event=new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data});text.parentElement.dispatchEvent(event);
    return {text:data.getData('text/plain'),writes,prevented:event.defaultPrevented};
  });assert.equal(r.text,'\\[\\frac{a}{b}\\]');assert.deepEqual(r.writes,['\\[\\frac{a}{b}\\]']);assert.ok(r.prevented);}finally{await browser.close();}
});
test('copy mixed paragraphs preserves text and LaTeX once, without MathML annotations leaking',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{const answer=panel.querySelector('.zma-answer');answer.focus();const range=document.createRange();range.selectNodeContents(answer);getSelection().removeAllRanges();getSelection().addRange(range);answer.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true}));return writes;});assert.equal(r.length,1);assert.match(r[0],/前文 \\\[\\frac\{a\}\{b\}\\\] 后文/);assert.equal(r[0].split('frac').length,2);}finally{await browser.close();}
});
test('copy still handles sidebar text when Gecko sends the event to the document body',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(panel.querySelector('math'));getSelection().removeAllRanges();getSelection().addRange(range);const data=new DataTransfer();data.setData('text/plain','wrong PDF annotation');document.body.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return {text:data.getData('text/plain'),writes};});assert.equal(r.text,'\\[\\frac{a}{b}\\]');assert.deepEqual(r.writes,['\\[\\frac{a}{b}\\]']);}finally{await browser.close();}
});
test('Ctrl V replaces the input selection and dispatches input even when reader shortcuts prevented default',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{input.focus();input.setSelectionRange(4,8);window.addEventListener('keydown',e=>e.preventDefault(),{capture:true,once:true});input.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true}));return {value:input.value,inputEvents};});assert.equal(r.value,'old \\(x^2\\)');assert.equal(r.inputEvents,1);}finally{await browser.close();}
});
test('native paste and cut stay within the composer and keep LaTeX literal',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{input.focus();input.select();const data=new DataTransfer();data.setData('text/plain','\\[x_1+x_2\\]');input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));const afterPaste=input.value;input.setSelectionRange(2,9);input.dispatchEvent(new KeyboardEvent('keydown',{key:'x',ctrlKey:true,bubbles:true,cancelable:true}));return {afterPaste,value:input.value,writes,inputEvents};});assert.equal(r.afterPaste,'\\[x_1+x_2\\]');assert.deepEqual(r.writes,['x_1+x_2']);assert.equal(r.value,'\\[\\]');assert.equal(r.inputEvents,2);}finally{await browser.close();}
});
test('formula context menu copies LaTeX, and input context menu can paste',async()=>{
  const {browser,page}=await setup();try{
    await page.locator('math').click({button:'right'});await page.getByRole('button',{name:'复制公式 LaTeX',exact:true}).click();assert.deepEqual(await page.evaluate(()=>writes),['\\[\\frac{a}{b}\\]']);
    await page.locator('textarea').fill('');await page.locator('textarea').click({button:'right'});await page.getByRole('button',{name:'粘贴',exact:true}).click();assert.equal(await page.locator('textarea').inputValue(),'\\(x^2\\)');
  }finally{await browser.close();}
});
test('outside PDF selections are untouched, and clipboard listeners are disposed',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{const pdf=document.getElementById('pdf');const range=document.createRange();range.selectNodeContents(pdf);getSelection().removeAllRanges();getSelection().addRange(range);pdf.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()}));const before=writes.length;globalThis.dispose?.();input.focus();input.select();input.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true}));return {before,after:writes.length,installed:!!globalThis.ZMAClipboard};});assert.ok(r.installed);assert.equal(r.before,0);assert.equal(r.after,0);}finally{await browser.close();}
});
test('a closed sidebar cannot replace PDF clipboard data from a stale text selection',async()=>{
  const {browser,page}=await setup();try{const r=await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(panel.querySelector('math'));getSelection().removeAllRanges();getSelection().addRange(range);panel.hidden=true;const data=new DataTransfer();data.setData('text/plain','PDF annotation');document.body.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return {text:data.getData('text/plain'),writes};});assert.equal(r.text,'PDF annotation');assert.deepEqual(r.writes,[]);}finally{await browser.close();}
});
test('native MathML renderer retains the exact original LaTeX delimiters and line breaks',async()=>{
  const {browser,page}=await setup();try{
    await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    for(const name of ['core','references','math'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});
    const r=await page.evaluate(()=>{const node=document.querySelector('.zma-answer'),source='\\[a=b \\\\ c=d\\]';Zotero.MarginComments.bridge.renderMathPreview(node,source);return {source,raw:node.querySelector('math')?.getAttribute('data-zma-latex'),copied:ZMAClipboard?.formulaText(node.querySelector('math'))};});
    assert.equal(r.raw,r.source);assert.equal(r.copied,r.source);
  }finally{await browser.close();}
});
