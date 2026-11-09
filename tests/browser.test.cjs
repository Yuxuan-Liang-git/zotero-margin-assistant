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
    await page.waitForFunction(()=>panel1.conversation().history.length===2);
    assert.equal(await page.evaluate(()=>sends[0].at(-1).content.filter(x=>x.type==='image_url').length),2);
    assert.equal(await page.evaluate(()=>panel2.conversation().history.length),0);
    assert.equal(await page.evaluate(()=>panel1.conversation().history.at(-1).incomplete),false);
    await page.evaluate(()=>{panel1.host.client.generate=async()=>{const e=new Error('限流');e.partial='部分';throw e;};});
    await page.locator('[data-zma="question"]').first().fill('追问');await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>panel1.conversation().history.at(-1).incomplete);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'追问');
    assert.equal(await page.evaluate(()=>panel1.conversation().history.at(-1).content),'部分');
    await page.evaluate(()=>{panel1.host.client.generate=()=>new Promise(resolve=>globalThis.finishAnswer=resolve);});
    await page.locator('[data-zma="question"]').first().fill('提交的问题');await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>!!globalThis.finishAnswer);
    await page.locator('[data-zma="question"]').first().fill('新输入但尚未发送的追问');await page.evaluate(()=>finishAnswer('完成'));
    await page.waitForFunction(()=>!panel1.busy);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'新输入但尚未发送的追问');
    assert.equal(await page.evaluate(()=>panel1.conversation().draft),'新输入但尚未发送的追问');
    await page.locator('.zma-panel').first().getByRole('button',{name:'对话记录'}).click();
    await page.locator('.zma-panel').first().locator('.zma-conversations').getByRole('button',{name:'新会话'}).click();
    await page.waitForFunction(()=>panel1.state.conversations.length===2);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'');
    await page.evaluate(()=>{panel1.host.client.generate=async()=> '第二段答案';});
    await page.locator('[data-zma="question"]').first().fill('第二段独立提问');
    await page.locator('[data-zma="send"]').first().click();
    await page.waitForFunction(()=>panel1.conversation().history.length===2&&!panel1.busy);
    assert.equal(await page.evaluate(()=>panel1.state.conversations[0].history.length),6);
    await page.locator('.zma-panel').first().getByRole('button',{name:'对话记录'}).click();
    await page.locator('.zma-panel').first().locator('.zma-conversations').getByRole('button',{name:'为什么使用前文公式？'}).click();
    await page.waitForFunction(()=>panel1.conversation().history.length===6);
    assert.equal(await page.locator('[data-zma="question"]').first().inputValue(),'新输入但尚未发送的追问');
    const restored=await page.evaluate(async()=>{const p=new ZMAPanel.Panel(panel1.host,{itemID:1},document);await p.init();return {count:p.state.conversations.length,title:p.conversation().title,history:p.conversation().history.length};});
    assert.deepEqual(restored,{count:2,title:'为什么使用前文公式？',history:6});
  }finally{await browser.close();}
});

test('long PDF chat compacts older turns without losing raw history and streams without repeated Markdown work',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<main>Current PDF</main>');
    for(const name of ['core','deepseek','panel'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    const result=await page.evaluate(async()=>{
      const state=ZMACore.emptyState(),chat=ZMACore.activeConversation(state);
      for(let i=0;i<10;i++){chat.history.push({role:'user',content:`问题 ${i} `+'甲'.repeat(800),materials:[]},{role:'assistant',content:`回答 ${i} `+'乙'.repeat(800),materials:[],incomplete:false});}
      let summaries=0,sent,renderCalls=0,saved;
      const host={addon:{bridge:{renderMathPreview:(node,text)=>node.textContent=text}},load:async()=>state,save:async(_r,s)=>{saved=structuredClone(s);},capture:async()=>{throw new Error('no selected materials')},client:{summarize:async(previous,messages)=>{summaries++;return `摘要 ${summaries}：${messages.length} 条消息，前文定义 A。`;},generate:async(messages,{onDelta})=>{sent=messages;for(let i=0;i<120;i++)onDelta('x');return 'x'.repeat(120);}},newAbortController:()=>new AbortController()};
      const panel=new ZMAPanel.Panel(host,{itemID:1},document);await panel.init();const original=panel.renderAnswer.bind(panel);panel.renderAnswer=(...args)=>{renderCalls++;return original(...args);};
      panel.question.value='请继续解释';await panel.send();
      return {summaries,renderCalls,raw:saved.conversations[0].history.length,checkpoint:saved.conversations[0].compactedThrough,summary:saved.conversations[0].summary,transmitted:sent.length,hasSummary:JSON.stringify(sent).includes('前文定义 A'),answer:saved.conversations[0].history.at(-1).content};
    });
    assert.ok(result.summaries>=1,result);
    assert.ok(result.renderCalls<=3,result);
    assert.equal(result.raw,22);
    assert.ok(result.checkpoint>=2,result);
    assert.match(result.summary,/前文定义 A/);
    assert.ok(result.hasSummary);
    assert.equal(result.answer,'x'.repeat(120));
  }finally{await browser.close();}
});

test('reader assistant loads math stylesheet alongside its own styles',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div/>');for(const name of ['core','deepseek','capture','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    const links=await page.evaluate(()=>{ZMAHost.Host.prototype.installStyles(document);return [...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.getAttribute('href'));});
    assert.ok(links.includes('chrome://margincomments/content/vendor/katex/katex.min.css'));
  }finally{await browser.close();}
});

test('native Zotero region renderer is used without entering PDF page proxies',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div/>');for(const name of ['core','deepseek','capture','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    const result=await page.evaluate(async()=>{
      const source={libraryID:1,attachmentKey:'ABCD1234',annotationKey:'FORM0630',pageIndex:4,pageLabel:'3',rects:[[10,20,30,40]],fingerprint:'1'};
      const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;canvas.getContext('2d').fillRect(0,0,40,20);
      let converted;const calls=[];const renderer={renderRegionCrops:async(...args)=>{if(args[1]!==converted)throw new Error('Permission denied: coordinates must belong to reader realm');calls.push(args);return [canvas.toDataURL()];}};
      const host=new ZMAHost.Host({controller:{ensureSession:async()=>({adapter:{primaryView:{_pdfRenderer:renderer},pdfWindow:{PDFViewerApplication:{pdfDocument:{getPage:()=>{throw new Error('page proxy must not be touched');}}}},document:()=>document}})}},{Zotero:{DataDirectory:{dir:'/data'}},IOUtils:{},PathUtils:{join:(...p)=>p.join('/')},window,cloneInto:(value,target)=>{if(target!==renderer)throw new Error('Wrong destination realm');return converted=structuredClone(value);}});
      host.resolveSource=async()=>source;const m=await host.capture({itemID:1},source);return {calls,width:m.width,height:m.height,data:m.dataURL};
    });assert.equal(result.calls[0][0],4);assert.deepEqual(result.calls[0][1],[[10,20,30,40]]);assert.equal(result.width,40);assert.equal(result.height,20);assert.ok(result.data.startsWith('data:image/png;base64,'));
  }finally{await browser.close();}
});

test('Zotero preferences save an encrypted API key and restore it after restart',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();
    const prefs=require('node:fs').readFileSync(path.resolve(__dirname,'../build/content/preferences.xhtml'),'utf8');
    await page.setContent(prefs.replace(/html:/g,''));
    for(const name of ['core','deepseek','capture','credentials','settings','host']){const file=path.resolve(__dirname,'../src/'+name+'.js');if(require('node:fs').existsSync(file))await page.addScriptTag({path:file});}
    const available=await page.evaluate(()=>{
      if(!document.querySelector('#zma-api-key')||!ZMAHost.Host.prototype.bindPreferencePaneWindow)return false;
      globalThis.savedPrefs=new Map();globalThis.fakeZotero={DataDirectory:{dir:'/data'},Prefs:{get:name=>savedPrefs.get(name),set:(name,value)=>savedPrefs.set(name,value),clear:name=>savedPrefs.delete(name)},OSKeyStore:{encrypt:async value=>'oskv1:'+btoa(value),decrypt:async value=>atob(value.slice(6))}};
      globalThis.preferenceHost=new ZMAHost.Host({controller:{}},{Zotero:fakeZotero,IOUtils:{},PathUtils:{join:(...p)=>p.join('/')},window});
      preferenceHost.bindPreferencePaneWindow(window);return true;
    });assert.ok(available,'API settings should exist directly in the preference pane');
    assert.equal(await page.locator('#zma-api-key').getAttribute('type'),'password');await page.locator('#zma-api-key').fill('test-secret');await page.locator('#zma-api-apply').click();
    await page.waitForFunction(()=>preferenceHost.key==='test-secret');
    assert.equal(await page.evaluate(()=>preferenceHost.key),'test-secret');assert.equal(await page.locator('#zma-api-key').inputValue(),'');
    assert.equal(await page.evaluate(()=>savedPrefs.get('margincomments.deepseekKey')),'oskv1:dGVzdC1zZWNyZXQ=');
    assert.equal(await page.evaluate(()=>JSON.stringify([...savedPrefs]).includes('test-secret')),false);
    assert.equal(await page.evaluate(async()=>{const restarted=new ZMAHost.Host({controller:{}},{Zotero:fakeZotero,IOUtils:{},PathUtils:{join:(...p)=>p.join('/')},window});await restarted.restoreCredentials();return restarted.key;}),'test-secret');
    await page.locator('#zma-api-clear').click();await page.waitForFunction(()=>preferenceHost.key==='');
    assert.equal(await page.evaluate(()=>savedPrefs.has('margincomments.deepseekKey')),false);
  }finally{await browser.close();}
});

test('answers render Markdown blocks and math without interpreting HTML or code as active content',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div id="answer"></div>');await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
    for(const name of ['core','references','markdown']){const file=path.resolve(__dirname,'../src/'+name+'.js');if(require('node:fs').existsSync(file))await page.addScriptTag({path:file});}
    const vendor=path.resolve(__dirname,'../content/vendor/marked/marked.umd.js');if(require('node:fs').existsSync(vendor))await page.addScriptTag({path:vendor});await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});
    const result=await page.evaluate(()=>{const answer=document.getElementById('answer'),md='## 三段式结构\n\n**关键结论**：\\(I_a<I_{thr}\\)\n\n---\n\n- 第一项\n- 第二项\n\n| 参数 | 定义 |\n| --- | --- |\n| x | 状态 |\n\n\\[x_1^2=\\frac{a}{b}\\]\n\n```js\n**literal** \\(x^2\\)\n```\n\n<img src="https://example.com/private" onerror="alert(1)">\n\n[危险链接](javascript:alert(1))';if(!globalThis.ZMAMarkdown)return {missing:true};ZMAMarkdown.render(answer,md,Zotero.MarginComments.bridge.renderMathPreview);return {heading:answer.querySelector('h2')?.textContent,strong:answer.querySelector('strong')?.textContent,list:answer.querySelectorAll('li').length,table:!!answer.querySelector('table'),math:answer.querySelectorAll('math').length,code:answer.querySelector('pre code')?.textContent,codeMath:!!answer.querySelector('pre math'),active:answer.querySelectorAll('script,img,[onerror],a[href^="javascript:"]').length,hr:!!answer.querySelector('hr')};});
    assert.ok(!result.missing,'Markdown renderer must exist');assert.equal(result.heading,'三段式结构');assert.equal(result.strong,'关键结论');assert.equal(result.list,2);assert.ok(result.table);assert.equal(result.math,2);assert.ok(result.hr);assert.match(result.code,/\*\*literal\*\*/);assert.equal(result.codeMath,false);assert.equal(result.active,0);
  }finally{await browser.close();}
});

test('Markdown resolves its parser when script-loader context differs from the global object',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{const page=await browser.newPage();await page.setContent('<div id="answer"></div>');await page.addScriptTag({path:path.resolve(__dirname,'../content/vendor/marked/marked.umd.js')});await page.evaluate(()=>{globalThis._globalThis={};});await page.addScriptTag({path:path.resolve(__dirname,'../src/markdown.js')});const heading=await page.evaluate(()=>{_globalThis.ZMAMarkdown.render(document.getElementById('answer'),'## 原生作用域测试',(n,t)=>n.textContent=t);return document.querySelector('h2')?.textContent;});assert.equal(heading,'原生作用域测试');}finally{await browser.close();}
});

test('display math with a plain LaTeX line break renders as two MathML rows',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{const page=await browser.newPage();await page.setContent('<div id="answer"></div>');await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});for(const name of ['core','references','math']){const file=path.resolve(__dirname,'../src/'+name+'.js');if(require('node:fs').existsSync(file))await page.addScriptTag({path:file});}await page.addScriptTag({path:path.resolve(__dirname,'../build/content/scripts/margincomments.js')});const rows=await page.evaluate(()=>{Zotero.MarginComments.bridge.renderMathPreview(document.getElementById('answer'),'$$\n\\frac{\\partial e}{\\partial\\theta}=-\\frac{\\partial H}{\\partial\\theta}u \\\\\n\\frac{\\partial H}{\\partial\\theta}u\n$$');return document.querySelectorAll('math mtable mtr').length;});assert.equal(rows,2);}finally{await browser.close();}
});

test('margin image button imports into PDF state and shows the saved image after card recreation',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent('<div id="card"><footer></footer></div>');
    for(const name of ['core','deepseek','capture','panel','margin-references','host'])await page.addScriptTag({path:path.resolve(__dirname,'../src/'+name+'.js')});
    const available=await page.evaluate(async()=>{
      const host=new ZMAHost.Host({controller:{}},{Zotero:{DataDirectory:{dir:'/data'}},IOUtils:{},PathUtils:{join:(...p)=>p.join('/')},window,chooseImage:async()=>'/chosen/photo.png'});
      let state=ZMACore.emptyState();globalThis.imageImportCalls=[];globalThis.noteCalls=[];
      host.load=async()=>state;host.save=async(_r,value)=>{state=ZMACore.cleanState(JSON.parse(JSON.stringify(value)));};host.bindReferences=()=>{};host.openImageNote=(_r,record)=>noteCalls.push(record.noteKey);
      host.imageManager={importImage:async(_r,key,path,s,commit)=>{imageImportCalls.push({key,path});const record={id:'a'.repeat(32),annotationKey:key,fileName:'margin-comment-'+ 'a'.repeat(32)+'.png',mime:'image/png',noteKey:'NOTEPDF1',noteImageKey:'IMAGE234'};s.images=[record];s.imageNoteKey=record.noteKey;await commit(record);return record;},readImage:async()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5FYAAAAASUVORK5CYII='};
      const runtime={card:document.getElementById('card'),annotation:{key:'FORM0630'},currentValue:'图片说明'};
      const session={reader:{itemID:1},persist:async()=>{},invalidateRuntimeHeight:()=>{},relayoutRuntime:()=>{}};
      host.attachCard(session,runtime);globalThis.imageRuntime=runtime;globalThis.imageSession=session;globalThis.imageHost=host;
      return !!runtime.card.querySelector('.zma-insert-image');
    });assert.ok(available,'image insertion must be available inside each margin comment');
    await page.locator('.zma-insert-image').click();await page.waitForFunction(()=>document.querySelector('.zma-inline-image img')?.complete);
    assert.deepEqual(await page.evaluate(()=>imageImportCalls),[{key:'FORM0630',path:'/chosen/photo.png'}]);
    await page.evaluate(async()=>{imageRuntime.card.remove();const card=document.createElement('div');card.innerHTML='<footer></footer>';document.body.append(card);globalThis.recreated={card,annotation:{key:'FORM0630'},currentValue:'图片说明'};imageHost.attachCard(imageSession,recreated);});
    await page.waitForFunction(()=>document.querySelector('.zma-inline-image img')?.naturalWidth===1);
    await page.getByRole('button',{name:'打开图片笔记'}).click();assert.deepEqual(await page.evaluate(()=>noteCalls),['NOTEPDF1']);
  }finally{await browser.close();}
});
