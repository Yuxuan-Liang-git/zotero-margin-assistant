const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
test('native settings service/model changes retain selected values and show sign-in, account and usage actions',async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{const page=await browser.newPage();await page.setContent(fs.readFileSync(path.resolve(__dirname,'../content/deepseek-settings.inc.xhtml'),'utf8').replace(/html:/g,''));await page.addScriptTag({path:path.resolve(__dirname,'../src/settings.js')});
    await page.evaluate(()=>{globalThis.state={provider:'deepseek',accounts:[{id:'account-a',label:'QA Account',signedIn:true,model:'first',models:[{slug:'first',displayName:'First'},{slug:'second',displayName:'Second',reasoningEfforts:['low','medium','high']}]}],activeID:'account-a'};globalThis.changed=null;globalThis.actions=[];
      ZMASettings.bind(document.getElementById('zma-api-settings'),{model:'deepseek-flash',hasKey:false,apply:async()=>{},clear:async()=>{},test:async()=>[],chatgpt:{state:()=>state,watch:callback=>{changed=callback;return ()=>{};},provider:async value=>{state.provider=value;},model:async value=>{state.accounts[0].model=value;},reasoning:async value=>{state.accounts[0].reasoningEffort=value;},select:async id=>{state.activeID=id;},login:async id=>{actions.push(['login',id||'new']);},cancel:()=>actions.push(['cancel']),refresh:async()=>[],logout:async()=>{actions.push(['logout']);state.accounts[0].signedIn=false;},usage:()=>actions.push(['usage'])}});
    });
    await page.locator('#zma-provider').selectOption('chatgpt');await page.waitForFunction(()=>state.provider==='chatgpt');assert.equal(await page.locator('#zma-provider').inputValue(),'chatgpt');
    await page.locator('#zma-chatgpt-model').selectOption('second');await page.waitForFunction(()=>state.accounts[0].model==='second');
    await page.locator('#zma-chatgpt-reasoning').selectOption('high');await page.waitForFunction(()=>state.accounts[0].reasoningEffort==='high');assert.equal(await page.locator('#zma-chatgpt-reasoning').inputValue(),'high');
    await page.getByRole('button',{name:'Continue with ChatGPT',exact:true}).click();await page.getByRole('button',{name:'管理用量',exact:true}).click();assert.deepEqual(await page.evaluate(()=>actions),[['login','account-a'],['usage']]);
    await page.getByRole('button',{name:'退出当前账户',exact:true}).click();await page.waitForFunction(()=>!state.accounts[0].signedIn);assert.ok(await page.locator('#zma-chatgpt-model').isDisabled());
  }finally{await browser.close();}
});
