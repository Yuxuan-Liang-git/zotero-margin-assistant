"""Measure native UI responsiveness alongside the complete isolated feature probe."""
import argparse, subprocess, sys, zipfile
from pathlib import Path
project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
parser.add_argument('--pdf-fixture')
args = parser.parse_args()
command = [sys.executable, str(project/'scripts/transfer-smoke.py'), '--run-name', args.run_name]
if args.pdf_fixture:
    command += ['--pdf-fixture', args.pdf_fixture]
subprocess.run(command, check=True)
qa = project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
old = "const check=async(name,fn)=>{try{report.steps.push({name,ok:true,result:await fn()});}catch(e){report.steps.push({name,ok:false,error:String(e),stack:e.stack});}await write();};"
new = """const check=async(name,fn)=>{const begin=Date.now();let last=begin,maxDelay=0,ticks=0;const timer=setInterval(()=>{const now=Date.now();maxDelay=Math.max(maxDelay,now-last-20);last=now;ticks++;},20);try{report.steps.push({name,ok:true,result:await fn()});}catch(e){report.steps.push({name,ok:false,error:String(e),stack:e.stack});}finally{await new Promise(r=>setTimeout(r,25));clearInterval(timer);Object.assign(report.steps.at(-1),{elapsedMs:Date.now()-begin,maxHeartbeatDelayMs:maxDelay,heartbeatTicks:ticks});}await write();};"""
assert bootstrap.count(old)==1
bootstrap = bootstrap.replace(old,new)
insertion = r'''
    await check('native-performance-idle-stream-edit-scroll',async()=>{
      const target=Zotero.Reader._readers.find(r=>r.itemID===seed.wholeAttachmentID)||reader;
      target._window.Zotero_Tabs.select(target.tabID,true);await target.focus();
      const panel=await host.panel(target);panel.showChat();
      const doc=panel.doc,win=doc.defaultView,pause=ms=>new Promise(r=>setTimeout(r,ms));
      await pause(200);
      let toolbarChecks=0,refreshCalls=0,textScans=0;
      const originalToolbar=host.ensureToolbar,originalRefresh=host.refreshReferenceCards,wrapped=[];
      host.ensureToolbar=function(...args){toolbarChecks++;return originalToolbar.apply(this,args);};
      host.refreshReferenceCards=function(...args){refreshCalls++;return originalRefresh.apply(this,args);};
      for(const entry of host.cleanups.values())if(entry.textMath){const tm=entry.textMath,original=tm.update;tm.update=function(...args){textScans++;return original.apply(this,args);};wrapped.push([tm,original]);}
      const fragment=doc.createElementNS('http://www.w3.org/1999/xhtml','div');panel.messages.append(fragment);
      const priorDraft=panel.question.value,priorChat=panel.conversation().draft;
      try{
        await pause(300);const idle={toolbarChecks,textScans,refreshCalls};toolbarChecks=refreshCalls=textScans=0;
        for(let i=0;i<60;i++){const span=doc.createElementNS('http://www.w3.org/1999/xhtml','span');span.textContent='Streaming fixture '+i;fragment.append(span);await pause(8);}
        await pause(100);const stream={toolbarChecks,textScans,refreshCalls,batches:60};toolbarChecks=refreshCalls=textScans=0;
        for(let i=0;i<4;i++){panel.question.value='性能测试草稿 '+i;panel.conversation().draft=panel.question.value;await panel.persist();await pause(30);}
        const draft={toolbarChecks,textScans,refreshCalls,saves:4};toolbarChecks=refreshCalls=textScans=0;
        const session=await host.addon.controller.ensureSession(target),pdf=session.adapter.document(),viewport=pdf.querySelector('#viewerContainer');
        if(!viewport)throw new Error('Native PDF viewport missing');const top=viewport.scrollTop;
        for(let i=0;i<20;i++){viewport.scrollTop=top+(i%5)*100;await pause(25);}viewport.scrollTop=top;await pause(100);
        const scroll={toolbarChecks,textScans,refreshCalls,steps:20};
        return {idle,stream,draft,scroll,noExternalApiCalls:true};
      }finally{fragment.remove();host.ensureToolbar=originalToolbar;host.refreshReferenceCards=originalRefresh;for(const [tm,original]of wrapped)tm.update=original;panel.question.value=priorDraft;panel.conversation().draft=priorChat;await panel.persist();}
    });
'''
point='    await host.store.flush();'
assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json',manifest)
    archive.writestr('bootstrap.js',bootstrap)
