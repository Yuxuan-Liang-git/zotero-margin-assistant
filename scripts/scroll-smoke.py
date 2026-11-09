"""Prepare isolated native answer-scroll acceptance on top of attachment checks."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/attachments-smoke.py'),'--run-name',args.run_name],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('answer-reading-position',async()=>{
      const panel=await host.panel(reader),chat=panel.conversation(),originalDraft=chat.draft,originalFiles=chat.draftAttachments,originalClient=host.selectedClient,win=reader._iframeWindow;
      const text=Array.from({length:90},(_,i)=>'第 '+i+' 段：公式推导与条件。').join('\n\n');
      try{
        chat.draftAttachments=[];host.selectedClient=()=>({summarize:async()=> '已有对话摘要。',generate:async(_messages,{onDelta})=>{onDelta(text);return text;}});
        panel.question.value='Native scroll QA';await panel.send();const offset=panel.messages.lastElementChild.getBoundingClientRect().top-panel.messages.getBoundingClientRect().top;
        if(Math.abs(offset)>5||panel.messages.lastElementChild.offsetHeight<=panel.messages.clientHeight)throw new Error('Completed answer not shown from its start: '+offset);
        let ready,finish;host.selectedClient=()=>({summarize:async()=> '已有对话摘要。',generate:(_messages,{onDelta})=>new Promise(resolve=>{onDelta(text);finish=()=>{onDelta('\n\n继续段落。');setTimeout(()=>resolve(text+'\n\n继续段落。'),250);};ready=true;})});
        panel.question.value='Native manual reading QA';const task=panel.send();for(let i=0;i<200&&!ready;i++)await new Promise(r=>setTimeout(r,30));if(!ready)throw new Error('Manual read fixture not ready');
        panel.messages.dispatchEvent(new win.WheelEvent('wheel',{deltaY:-120,bubbles:true}));panel.messages.scrollTop=200;const before=panel.messages.scrollTop;finish();await task;
        if(Math.abs(panel.messages.scrollTop-before)>3)throw new Error('Completion moved manual reading position');
        return {startsAtAnswer:true,manualPositionRetained:true,streamDoesNotStealPosition:true,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;chat.draft=originalDraft;chat.draftAttachments=originalFiles;panel.question.value=originalDraft;await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
