const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const evidence=path.join(ROOT,'evidence','ui-0136');

async function setup(){
  const browser=await chromium.launch({executablePath:CHROME,headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.setContent('<div id="split-view"></div>');
  await page.addStyleTag({path:path.join(ROOT,'src','assistant.css')});
  await page.evaluate(()=>{globalThis._globalThis=globalThis;globalThis.Zotero={};});
  for(const file of ['core','references','math','markdown'])await page.addScriptTag({path:path.join(ROOT,'src',file+'.js')});
  await page.addScriptTag({path:path.join(ROOT,'content','vendor','marked','marked.umd.js')});
  await page.addScriptTag({path:path.join(ROOT,'build','content','scripts','margincomments.js')});
  for(const file of ['deepseek','transfer','transfer-ui','docks','panel','streaming'])await page.addScriptTag({path:path.join(ROOT,'src',file+'.js')});
  await page.evaluate(async()=>{
    const bridge=Zotero.MarginComments.bridge,render=bridge.renderMathPreview;
    globalThis.mathRenderCalls=0;
    bridge.renderMathPreview=(node,text)=>{mathRenderCalls++;return render(node,text);};
    const state=ZMACore.emptyState();
    globalThis.host={addon:{bridge},load:async()=>state,save:async(_reader,s)=>{globalThis.lastSaved=structuredClone(s);},
      capture:async()=>{throw Error('no selected materials');},client:{generate:async(_messages,{onDelta})=>{
        const answer=globalThis.pendingAnswer??'完成';onDelta(answer);return answer;
      }},newAbortController:()=>new AbortController(),copy:async text=>{globalThis.copied=text;}};
    globalThis.panel=await new ZMAPanel.Panel(host,{itemID:1},document).init();panel.showChat();
  });
  return {browser,page};
}

function heavyAnswer(i){
  const equations=Array.from({length:4},(_,j)=>`\n\n\\[x_{${i},${j}}(t)=\\frac{a_{${j}}+b_{${j}}\\,\\theta(t)}{1+\\lambda_{${j}}^2}\\]`).join('');
  return `第 ${i} 个推导：由状态方程与参数约束得到${equations}\n\n因此需要保留原始公式文本。`;
}

test('20-message math-heavy history and repeated conversation switches stay measurable and preserve source',async()=>{
  const {browser,page}=await setup();
  try{
    const metrics=await page.evaluate(async()=>{
      const state=panel.state;
      const first=panel.conversation();
      first.title='长推导';
      first.history=Array.from({length:40},(_,i)=>{
        if(i%2===0)return {role:'user',content:`问题 ${i/2}`,materials:[]};
        const equations=Array.from({length:4},(_,j)=>`\\[x_{${i},${j}}(t)=\\frac{a_{${j}}+b_{${j}}\\,\\theta(t)}{1+\\lambda_{${j}}^2}\\]`).join('\n\n');
        return {role:'assistant',content:`第 ${i/2} 个推导：由状态方程与参数约束得到\n\n${equations}\n\n因此需要保留原始公式文本。`,materials:[]};
      });
      const results=[];
      for(let run=0;run<5;run++){
        const conv=run===0?first:ZMACore.createConversation(state,`stress-${run}`);
        if(run>0){conv.history=first.history.slice(-20).map(m=>({...m}));}
        panel.conversationId=conv.id;
        const start=performance.now(),callsBefore=mathRenderCalls;
        panel.renderMessages();
        results.push({run,durationMs:performance.now()-start,messages:panel.messages.querySelectorAll('.zma-message').length,
          equations:panel.messages.querySelectorAll('math').length,renderCalls:mathRenderCalls-callsBefore,
          lastIndex:panel.messages.querySelectorAll('.zma-message').item(19)?.dataset.messageIndex});
      }
      panel.messages.querySelector('.zma-message[data-message-index="19"] .zma-message-actions button')?.click();
      await new Promise(resolve=>setTimeout(resolve,0));
      return {results,storedChars:first.history.reduce((n,m)=>n+m.content.length,0),
        copied:globalThis.copied||'',sourcePreserved:first.history[39].content.includes('\\frac'),renderCalls:mathRenderCalls};
    });
    assert.equal(metrics.results[0].messages,20);
    assert.equal(metrics.results[0].lastIndex,'39');
    assert.equal(metrics.results[0].equations,40);
    assert.ok(metrics.sourcePreserved);
    assert.ok(metrics.results.every(r=>r.messages===20));
    await page.waitForTimeout(0);
    fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'stress-performance.json'),JSON.stringify({history:metrics,copyChars:metrics.copied.length},null,2));
    assert.ok(metrics.copied.includes('\\frac'), 'copy action should preserve LaTeX source');
    assert.ok(metrics.results.every(r=>Number.isFinite(r.durationMs)));
  }finally{await browser.close();}
});

test('200-message text import, long streamed math, live draft typing and completion remain responsive',async()=>{
  const {browser,page}=await setup();
  try{
    const result=await page.evaluate(async()=>{
      const history=Array.from({length:200},(_,i)=>({role:i%2?'assistant':'user',content:i%2?
        `回答 ${Math.floor(i/2)}：${'解释推导与参数约束。 '.repeat(8)}\\[x_${i}=a/b\\]`:
        `问题 ${Math.floor(i/2)}：请解释公式 ${i}`,materials:[]}));
      const start=performance.now();
      host.importConversation=async(_reader,prepared)=>{
        const conv=ZMACore.createConversation(panel.state,'stress-import');
        conv.title=prepared.title;conv.history=prepared.history;conv.draft=prepared.draft;return conv;
      };
      await panel.commitImport({title:'200 条实验记录',history,draft:'导入后草稿'});
      const importMs=performance.now()-start;
      const imported={visible:panel.messages.querySelectorAll('.zma-message').length,total:panel.conversation().history.length,
        first:panel.messages.querySelector('.zma-message')?.dataset.messageIndex};
      let olderBatches=0;const batchDurations=[];
      while(Number(panel.messages.querySelector('.zma-message')?.dataset.messageIndex||0)>0&&olderBatches<9){const batchStart=performance.now();panel.renderMessages(Math.max(0,Number(panel.messages.querySelector('.zma-message')?.dataset.messageIndex||0)-20));batchDurations.push(performance.now()-batchStart);olderBatches++;}
      const fullyRevealed=panel.messages.querySelectorAll('.zma-message').length;
      const chunks=Array.from({length:12},(_,i)=>`${i?'\n\n':''}流式解释 ${i}：\n\n\\[\\hat{x}_{${i}}=\\frac{\\alpha_{${i}}+\\beta_{${i}}}{1+\\gamma_{${i}}}\\]`);
      const answer=chunks.join('');
      globalThis.pendingAnswer=answer;
      let markStarted;const answerStarted=new Promise(resolve=>{markStarted=resolve;});
      host.client.generate=async(_messages,{onDelta})=>{
        markStarted();
        for(const chunk of chunks){onDelta(chunk);await new Promise(resolve=>setTimeout(resolve,18));}
        return answer;
      };
      panel.question.value='解释这个长推导';
      const interval=[];let last=performance.now();const heartbeat=setInterval(()=>{const now=performance.now();interval.push(now-last);last=now;},5);
      await new Promise(resolve=>setTimeout(resolve,30));
      const sendStart=performance.now();const pending=panel.send();
      await answerStarted;
      panel.question.value='正在回答时输入的后续问题';
      await pending;clearInterval(heartbeat);
      const sendMs=performance.now()-sendStart;
      const lastAnswer=panel.conversation().history.at(-1);
      const answerNode=panel.messages.querySelector('.zma-message:last-of-type .zma-answer');
      const observedMaxGap=Math.max(0,...interval);
      return {importMs,imported,fullyRevealed,olderBatches,batchDurations,sendMs,observedMaxGap,heartbeatTicks:interval.length,
        draft:panel.conversation().draft,input:panel.question.value,answerSource:lastAnswer.content,
        visibleMath:answerNode?.querySelectorAll('math').length||0,renderCalls:mathRenderCalls};
    });
    assert.deepEqual(result.imported,{visible:20,total:200,first:'180'});
    assert.equal(result.fullyRevealed,200);
    assert.equal(result.draft,'正在回答时输入的后续问题');
    assert.equal(result.input,result.draft);
    assert.equal(result.answerSource,await page.evaluate(()=>pendingAnswer));
    assert.ok(result.visibleMath>=12);
    assert.ok(result.heartbeatTicks>=10,result);
    fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'stress-stream-import.json'),JSON.stringify(result,null,2));
  }finally{await browser.close();}
});
