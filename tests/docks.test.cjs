const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const project=path.resolve(__dirname,'..');

async function setup(savedLayout){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.setContent('<style>body{margin:0;overflow:hidden}#split-view{position:fixed;inset:40px 0 0;background:#eee}</style><div id="split-view">PDF</div>');
  await page.addStyleTag({path:path.join(project,'src/assistant.css')});
  for(const name of ['core','deepseek','notion','docks','panel']){
    const file=path.join(project,'src',name+'.js');
    if(fs.existsSync(file))await page.addScriptTag({path:file});
  }
  await page.evaluate(async layout=>{
    const state=ZMACore.emptyState();
    globalThis.savedLayout=layout;
    globalThis.webLoads=0;
    const host={
      load:async()=>state,save:async()=>{},copy:()=>{},
      addon:{bridge:{renderMathPreview:(node,text)=>node.textContent=text}},
      dockLayoutAPI:()=>({state:()=>savedLayout,save:value=>{savedLayout={...value};}}),
      notionLinks:async()=>[{id:1,title:'Notion',url:'https://www.notion.so/0123456789abcdef0123456789abcdef'}],
      createNotionBrowser:(_reader,anchor)=>{
        const editor=document.createElement('textarea');
        editor.setAttribute('aria-label','网页笔记');editor.value='网页中的草稿';anchor.append(editor);
        return {load:()=>{webLoads++;},setVisible:()=>{},align:()=>{},destroy:()=>{}};
      }
    };
    globalThis.panel=await new ZMAPanel.Panel(host,{itemID:1},document).init();
    panel.showChat();panel.question.value='助手中的草稿';await panel.showNotion();
  },savedLayout);
  return {browser,page};
}

test('Notion and assistant are separate simultaneous docks with independent close and reopen',async()=>{
  const {browser,page}=await setup();
  try{
    assert.equal(await page.locator('.zma-chat').isVisible(),true);
    assert.equal(await page.locator('.zma-notion-dock').isVisible(),true);
    const geometry=await page.evaluate(()=>({notion:panel.notion.node.getBoundingClientRect().toJSON(),assistant:panel.node.getBoundingClientRect().toJSON(),pdf:document.querySelector('#split-view').getBoundingClientRect().toJSON()}));
    assert.equal(geometry.notion.left,0);
    assert.equal(geometry.assistant.right,1600);
    assert.equal(geometry.pdf.left,geometry.notion.right);
    assert.equal(geometry.pdf.right,geometry.assistant.left);
    await page.evaluate(()=>panel.close());
    assert.equal(await page.locator('.zma-notion-dock').isVisible(),true);
    await page.evaluate(()=>panel.open());
    assert.equal(await page.locator('.zma-chat').isVisible(),true);
    await page.getByRole('button',{name:'关闭 Notion 栏',exact:true}).click();
    assert.equal(await page.locator('.zma-panel').isVisible(),true);
    await page.evaluate(()=>panel.showNotion());
    assert.equal(await page.evaluate(()=>webLoads),1);
  }finally{await browser.close();}
});

async function dragTo(page,selector,x){
  const box=await page.locator(selector).boundingBox();
  await page.mouse.move(box.x+Math.min(45,box.width/2),box.y+box.height/2);
  await page.mouse.down();await page.mouse.move(x,box.y+box.height/2,{steps:12});await page.mouse.up();
}

test('dragging either title swaps dock sides and keeps both drafts and the webpage instance',async()=>{
  const {browser,page}=await setup();
  try{
    await dragTo(page,'.zma-notion-dock .zma-dock-title',1450);
    assert.equal(await page.locator('.zma-notion-dock').getAttribute('data-dock-side'),'right');
    assert.equal(await page.locator('.zma-panel').getAttribute('data-dock-side'),'left');
    await dragTo(page,'.zma-panel .zma-heading',1450);
    assert.equal(await page.locator('.zma-panel').getAttribute('data-dock-side'),'right');
    assert.equal(await page.locator('.zma-notion-dock').getAttribute('data-dock-side'),'left');
    assert.equal(await page.getByRole('textbox',{name:'问题',exact:true}).inputValue(),'助手中的草稿');
    assert.equal(await page.getByRole('textbox',{name:'网页笔记',exact:true}).inputValue(),'网页中的草稿');
    assert.equal(await page.evaluate(()=>webLoads),1);
    assert.equal((await page.evaluate(()=>savedLayout)).assistantSide,'right');
  }finally{await browser.close();}
});

test('each dock resizes from its inner edge while preserving space for the PDF',async()=>{
  const {browser,page}=await setup();
  try{
    const initial=await page.evaluate(()=>({assistant:panel.node.offsetWidth,notion:panel.notion.node.offsetWidth}));
    const n=await page.getByRole('separator',{name:'调整 Notion 栏宽度',exact:true}).boundingBox();
    await page.mouse.move(n.x+n.width/2,n.y+100);await page.mouse.down();await page.mouse.move(n.x+n.width/2+80,n.y+100,{steps:8});await page.mouse.up();
    const resized=await page.evaluate(()=>({assistant:panel.node.offsetWidth,notion:panel.notion.node.offsetWidth}));
    assert.equal(resized.assistant,initial.assistant);assert.ok(resized.notion>=initial.notion+78);
    await page.setViewportSize({width:900,height:1000});await page.waitForTimeout(80);
    const geometry=await page.evaluate(()=>({a:panel.node.getBoundingClientRect().toJSON(),n:panel.notion.node.getBoundingClientRect().toJSON(),pdf:document.querySelector('#split-view').getBoundingClientRect().toJSON()}));
    assert.ok(geometry.pdf.width>=358,JSON.stringify(geometry));
    assert.ok(geometry.n.right<=geometry.pdf.left+1&&geometry.a.left>=geometry.pdf.right-1);
    const folder=path.join(project,'evidence/ui-0160');fs.mkdirSync(folder,{recursive:true});await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:path.join(folder,'independent-docks.png')});
  }finally{await browser.close();}
});

test('saved dock placement and widths restore in another panel',async()=>{
  const {browser,page}=await setup({assistantSide:'left',assistantWidth:390,notionWidth:340});
  try{
    assert.equal(await page.locator('.zma-panel').getAttribute('data-dock-side'),'left');
    assert.equal(await page.locator('.zma-notion-dock').getAttribute('data-dock-side'),'right');
    assert.equal(await page.evaluate(()=>panel.node.offsetWidth),390);
    assert.equal(await page.evaluate(()=>panel.notion.node.offsetWidth),340);
  }finally{await browser.close();}
});

test('both docks keep commands in collapsed title-bar menus and give Notion the content area',async()=>{
  const {browser,page}=await setup();
  try{
    assert.equal(await page.getByRole('button',{name:'文档助手操作',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Notion 栏操作',exact:true}).count(),1);
    assert.equal(await page.locator('.zma-notion-view > .zma-actions').count(),0);
    assert.equal(await page.getByRole('button',{name:'在浏览器打开',exact:true}).isVisible(),false);
    await page.getByRole('button',{name:'Notion 栏操作',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'在浏览器打开',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'Notion 栏操作',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'在浏览器打开',exact:true}).isVisible(),false);
  }finally{await browser.close();}
});

test('canceling a resize in a narrow window preserves the preferred widths', async () => {
  const { browser, page } = await setup();
  try {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const handle = page.getByRole('separator', { name: '调整 Notion 栏宽度', exact: true });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 25, box.y + 100);
    await page.evaluate(() => {
      const gesture = panel.docks.gesture;
      gesture.target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: gesture.id }));
    });
    await page.mouse.up();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => panel.docks.update());
    assert.equal(await page.locator('.zma-panel').evaluate(node => node.offsetWidth), 420);
    assert.equal(await page.locator('.zma-notion-dock').evaluate(node => node.offsetWidth), 380);
  } finally {
    await browser.close();
  }
});

test('losing pointer capture cancels a title drag and allows the next drag', async () => {
  const { browser, page } = await setup();
  try {
    const header = page.locator('.zma-notion-dock .zma-dock-title');
    const box = await header.boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(700, box.y + box.height / 2, { steps: 8 });
    await page.evaluate(() => {
      const gesture = panel.docks.gesture;
      gesture.target.releasePointerCapture(gesture.id);
    });
    await page.mouse.move(850, 500);
    await page.mouse.up();
    assert.equal(await page.locator('.zma-dock-drop-hint').count(), 0);
    await dragTo(page, '.zma-notion-dock .zma-dock-title', 1450);
    assert.equal(await page.locator('.zma-notion-dock').getAttribute('data-dock-side'), 'right');
  } finally {
    await browser.close();
  }
});

test('a wide dock keeps its displayed width when the resize is committed', async () => {
  const { browser, page } = await setup();
  try {
    await page.setViewportSize({ width: 2560, height: 1000 });
    await page.evaluate(() => panel.close());
    const box = await page.getByRole('separator', { name: '调整 Notion 栏宽度', exact: true }).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 950, box.y + 100, { steps: 10 });
    const during = await page.locator('.zma-notion-dock').evaluate(node => node.offsetWidth);
    await page.mouse.up();
    const after = await page.locator('.zma-notion-dock').evaluate(node => node.offsetWidth);
    assert.ok(during >= 1100);
    assert.equal(after, during);
    assert.equal(await page.evaluate(() => savedLayout.notionWidth), after);
    assert.ok(after <= 1200);
  } finally {
    await browser.close();
  }
});
