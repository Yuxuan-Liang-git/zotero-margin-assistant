const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {chromium}=require('playwright');
test('reference links survive editing while script URLs and attributes are rejected',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div id="root" contenteditable="true"></div>');
    await page.addScriptTag({path:path.resolve(__dirname,'../src/core.js')});
    // Missing reference renderer is a behavioral RED, not an import error.
    const fs=require('node:fs');if(fs.existsSync(__dirname+'/../src/references.js'))await page.addScriptTag({path:path.resolve(__dirname,'../src/references.js')});
    const result=await page.evaluate(()=>{
      if(!globalThis.ZMAReferences)return {missing:true};
      const r=document.getElementById('root');const text='前文 <b>推导</b> <a href="zotero://open-pdf/library/items/ABCD1234?page=66&annotation=FORM0630">公式 (6.30)</a>';
      ZMAReferences.render(r,text);r.append(document.createTextNode(' 补充'));
      const stored=ZMAReferences.serializeLinks(r);
      ZMAReferences.render(r,stored);const href=r.querySelector('a')?.getAttribute('href');
      const unsafe=document.createElement('a');unsafe.href='javascript:alert(1)';unsafe.textContent='evil';r.append(unsafe);
      const safe=ZMAReferences.serializeLinks(r);
      return {stored,href,safe,onclick:r.querySelector('a')?.getAttribute('onclick')};
    });assert.ok(!result.missing,'reference renderer must exist');
    assert.ok(result.stored.includes('<a href="zotero://'));assert.ok(result.stored.endsWith(' 补充'));
    assert.equal(result.href,'zotero://open-pdf/library/items/ABCD1234?page=66&annotation=FORM0630');
    assert.ok(!result.safe.includes('javascript:'));assert.equal(result.onclick,null);
  }finally{await browser.close();}
});

test('patched original editor preserves source anchors, formatting, math and rejects pasted scripts',async()=>{
  assert.ok(require('node:fs').existsSync(__dirname+'/../build/content/scripts/margincomments.js'),'integrated bundle must exist');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div id="editor"></div><div id="preview"></div>');
    await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    for(const name of ['core','references'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});
    const result=await page.evaluate(()=>{
      const bridge=Zotero.MarginComments.bridge;const editor=document.getElementById('editor'),preview=document.getElementById('preview');
      const original='前文 <b>说明</b> <a href="zotero://open-pdf/library/items/ABCD1234?page=66&annotation=FORM0630">公式 (6.30)</a> \\(x^2\\)';
      bridge.renderStoredComment(editor,original);
      editor.querySelector('a').setAttribute('onclick','alert(1)');editor.append(document.createTextNode(' 补充'));
      const unsafe=document.createElement('a');unsafe.href='javascript:alert(1)';unsafe.textContent='bad';editor.append(unsafe);
      const stored=bridge.readStoredComment(editor);bridge.renderStoredComment(editor,stored);bridge.renderMathPreview(preview,stored);
      return {stored,href:editor.querySelector('a').getAttribute('href'),onclick:editor.querySelector('a').getAttribute('onclick'),bold:editor.querySelector('b').textContent,math:!!preview.querySelector('math'),safe:!stored.includes('javascript:')};
    });assert.equal(result.bold,'说明');assert.ok(result.math);assert.ok(result.safe);assert.equal(result.onclick,null);assert.ok(result.stored.includes('<a href="zotero://'));assert.equal(result.href,'zotero://open-pdf/library/items/ABCD1234?page=66&annotation=FORM0630');
  }finally{await browser.close();}
});

test('question panel explicitly sends two regions, restores failure, and separates PDF sessions',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage({viewport:{width:1400,height:900}});await page.setContent('<main>PDF 当前页：公式 (7.41)</main>');
    for(const name of ['core','deepseek','panel']){const file=path.resolve(__dirname,'../src/'+name+'.js');if(require('node:fs').existsSync(file))await page.addScriptTag({path:file});}
    const initial=await page.evaluate(async()=>{
      if(!globalThis.ZMAPanel)return false;
      const scope={libraryID:1,attachmentKey:'ABCD1234'};const states=new Map();globalThis.sends=[];
      const host={addon:{bridge:{renderMathPreview:(node,text)=>node.textContent=text}},scope:()=>scope,load:async r=>states.get(r.itemID)||ZMACore.emptyState(),save:async(r,s)=>states.set(r.itemID,structuredClone(s)),capture:async(_r,s)=>({source:s,dataURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5FYAAAAASUVORK5CYII=',text:'',width:1,height:1}),resolveSource:async(_r,s)=>s,client:{generate:async(messages,{onDelta})=>{sends.push(messages);onDelta('推导答案');return '推导答案';}},newAbortController:()=>new AbortController(),settings:()=>{},groupID:()=>undefined,saveNote:async()=>{},saveComment:async()=>{},notify:()=>{},sourceLink:ZMACore.sourceLink};
      globalThis.panel1=new ZMAPanel.Panel(host,{itemID:1},document);await panel1.init();panel1.open();
      for(const [number,key,pageIndex]of [['7.41','FORM0741',70],['6.30','FORM0630',60]])await panel1.addMaterial({libraryID:1,attachmentKey:'ABCD1234',annotationKey:key,pageIndex,pageLabel:String(pageIndex),rects:[[1,1,10,10]],fingerprint:'x',type:'公式',number});
      globalThis.panel2=new ZMAPanel.Panel(host,{itemID:3},document);await panel2.init();
      return true;
    });assert.ok(initial,'question panel must exist');
    assert.equal(await page.evaluate(()=>sends.length),0);
    await page.locator('[data-zma="question"]').first().fill('为什么使用前文公式？');
    await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>panel1.state.history.length===2);
    assert.equal(await page.evaluate(()=>sends[0].at(-1).content.filter(x=>x.type==='image_url').length),2);
    assert.equal(await page.evaluate(()=>panel2.state.history.length),0);
    assert.equal(await page.evaluate(()=>panel1.state.history.at(-1).incomplete),false);
    await page.evaluate(()=>{panel1.host.client.generate=async()=>{const e=new Error('限流');e.partial='部分';throw e;};});
    await page.locator('[data-zma="question"]').first().fill('追问');await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>panel1.state.history.at(-1).incomplete);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'追问');
    assert.equal(await page.evaluate(()=>panel1.state.history.at(-1).content),'部分');
    await page.evaluate(()=>{panel1.host.client.generate=()=>new Promise(resolve=>globalThis.finishAnswer=resolve);});
    await page.locator('[data-zma="question"]').first().fill('提交的问题');await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>!!globalThis.finishAnswer);
    await page.locator('[data-zma="question"]').first().fill('新输入但尚未发送的追问');await page.evaluate(()=>finishAnswer('完成'));
    await page.waitForFunction(()=>!panel1.busy);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'新输入但尚未发送的追问');
    assert.equal(await page.evaluate(()=>panel1.state.draft),'新输入但尚未发送的追问');
  }finally{await browser.close();}
});

test('reader assistant loads math stylesheet alongside its own styles',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div/>');for(const name of ['core','deepseek','capture','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    const links=await page.evaluate(()=>{ZMAHost.Host.prototype.installStyles(document);return [...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.getAttribute('href'));});
    assert.ok(links.includes('chrome://margincomments/content/vendor/katex/katex.min.css'));
  }finally{await browser.close();}
});
