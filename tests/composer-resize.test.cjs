const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const project=path.resolve(__dirname,'..');
async function setup(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent('<style>body{margin:0;overflow:hidden}#split-view{position:fixed;inset:40px 0 0;background:#ddd}</style><div id="split-view"></div>');
  await page.addStyleTag({path:path.join(project,'src/assistant.css')});
  for(const name of ['core','deepseek','clipboard','panel'])await page.addScriptTag({path:path.join(project,'src',name+'.js')});
  await page.evaluate(async()=>{const state=ZMACore.emptyState();globalThis.host={load:async()=>state,save:async()=>{},addon:{bridge:{renderMathPreview:(node,value)=>node.textContent=value}},copy:async()=>{},appearanceState:()=>({fontSize:14})};globalThis.panel=await new ZMAPanel.Panel(host,{itemID:1},document).init();panel.showChat();panel.question.value='原始草稿 \\(y=Hu+e\\)';panel.question.dispatchEvent(new Event('input',{bubbles:true}));panel.question.focus();panel.question.setSelectionRange(3,3);});
  return {browser,page};
}
async function drag(page,delta){const box=await page.getByRole('separator',{name:'调整输入框高度'}).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+delta,{steps:8});await page.mouse.up();}
test('composer grows upward past the former 180px limit and shrinks while draft, caret and controls remain available',async()=>{
  const {browser,page}=await setup();try{
    const field=page.locator('textarea[data-zma="question"]'),handle=page.getByRole('separator',{name:'调整输入框高度'});
    assert.equal(await handle.count(),1,'bottom composer needs an accessible top-edge resize handle');
    const initial=await field.boundingBox();await drag(page,-220);const grown=await field.boundingBox();assert.ok(grown.height>=260,JSON.stringify({initial,grown}));assert.ok(grown.y<initial.y);
    const retained=await page.evaluate(()=>({value:panel.question.value,draft:panel.conversation().draft,caret:panel.question.selectionStart,active:document.activeElement===panel.question}));assert.match(retained.value,/\\\(y=Hu\+e\\\)/);assert.equal(retained.value,retained.draft);assert.equal(retained.caret,3);assert.ok(retained.active);
    await drag(page,100);const shrunk=await field.boundingBox();assert.ok(shrunk.height<grown.height-70);const height=shrunk.height;
    await page.evaluate(()=>{panel.close();panel.showChat();});assert.ok(Math.abs((await field.boundingBox()).height-height)<2);
    const geometry=await page.evaluate(()=>({messages:panel.messages.getBoundingClientRect().height,send:panel.sendButton.getBoundingClientRect().bottom,bottom:innerHeight}));assert.ok(geometry.messages>=70,JSON.stringify(geometry));assert.ok(geometry.send<=geometry.bottom);
    const evidence=path.join(project,'evidence/ui-0137');fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'composer-resized.png')});
  }finally{await browser.close();}
});
test('composer resize supports keyboard bounds, small windows, cancellation and cleanup without document listeners accumulating',async()=>{
  const {browser,page}=await setup();try{
    const handle=page.getByRole('separator',{name:'调整输入框高度'}),field=page.locator('textarea[data-zma="question"]');assert.equal(await handle.count(),1);
    await handle.focus();const before=(await field.boundingBox()).height;await handle.press('ArrowUp');assert.ok((await field.boundingBox()).height>before);
    await handle.press('End');const enlarged=(await field.boundingBox()).height;assert.ok(enlarged>180);await page.setViewportSize({width:1024,height:480});
    await page.waitForTimeout(60);const g=await page.evaluate(()=>({field:panel.question.getBoundingClientRect().height,send:panel.sendButton.getBoundingClientRect().bottom,messages:panel.messages.getBoundingClientRect().height,max:Number(panel.composerHandle.getAttribute('aria-valuemax')),value:Number(panel.composerHandle.getAttribute('aria-valuenow'))}));assert.ok(g.field<enlarged);assert.ok(g.send<=480,JSON.stringify(g));assert.ok(g.messages>=65,JSON.stringify(g));assert.ok(g.value<=g.max);
    await handle.press('Home');assert.ok((await field.boundingBox()).height<110);
    await page.evaluate(()=>{panel.question.focus();panel.composerHandle.dispatchEvent(new PointerEvent('pointerdown',{pointerId:4,button:0,clientY:220,bubbles:true,cancelable:true}));panel.composerHandle.dispatchEvent(new PointerEvent('pointercancel',{pointerId:4,bubbles:true}));});
    const cancelled=(await field.boundingBox()).height;await page.mouse.move(100,100);assert.equal((await field.boundingBox()).height,cancelled);
    await page.evaluate(async()=>{await panel.destroy();window.dispatchEvent(new Event('resize'));});assert.equal(await page.locator('.zma-panel').count(),0);
  }finally{await browser.close();}
});
