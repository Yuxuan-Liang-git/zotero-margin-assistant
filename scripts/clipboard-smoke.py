"""Prepare an isolated, offline Gecko test of sidebar copy/paste and LaTeX."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/pdf-history-smoke.py'), '--run-name', args.run_name], check=True)
work = project / 'evidence' / args.run_name
qa = work / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
insertion = r'''
    await check('sidebar-clipboard-and-latex',async()=>{
      const panel=await host.panel(reader);panel.showChat();
      if(typeof panel.disposeClipboard!=='function')throw new Error('Clipboard integration missing');
      const win=reader._iframeWindow,doc=panel.doc,chat=panel.conversation();
      const originalDraft=chat.draft,copy=host.copy,read=host.readClipboard,readAssets=host.readAttachmentClipboard,writes=[];
      host.readAttachmentClipboard=()=>[];host.copy=value=>writes.push(value);host.readClipboard=()=>String.raw`\(x^2\)`;
      try{
        const latex=String.raw`\[a=b \\ c=d\]`;
        chat.history.push({role:'user',content:'Clipboard QA',materials:[]},{role:'assistant',content:'前文 '+latex+' 后文',materials:[],incomplete:false});panel.renderMessages();
        const answer=panel.messages.lastElementChild.querySelector('.zma-answer'),math=answer.querySelector('math');
        if(!math||math.getAttribute('data-zma-latex')!==latex)throw new Error('Exact original LaTeX not retained');
        const selection=win.getSelection(),range=doc.createRange();range.selectNodeContents(math.querySelector('mi'));selection.removeAllRanges();selection.addRange(range);
        const data=new win.DataTransfer();win.addEventListener('copy',event=>{event.clipboardData.setData('text/plain','wrong PDF annotation');event.preventDefault();},{capture:true,once:true});
        const copyEvent=new win.ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data});doc.body.dispatchEvent(copyEvent);
        if(copyEvent.clipboardData.getData('text/plain')!==latex||writes.at(-1)!==latex)throw new Error('Selection copy did not override reader clipboard: '+JSON.stringify({actual:copyEvent.clipboardData.getData('text/plain'),writes,selection:selection.toString(),rangeCount:selection.rangeCount,active:doc.activeElement.localName,status:panel.status.textContent,formulaSource:math.getAttribute('data-zma-latex')}));
        const question=panel.question;question.value='old text';question.focus();question.setSelectionRange(4,8);
        question.dispatchEvent(new win.KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true}));
        if(question.value!==String.raw`old \(x^2\)`||chat.draft!==question.value)throw new Error('Paste or draft update failed');
        question.select();question.dispatchEvent(new win.KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true}));
        if(writes.at(-1)!==question.value)throw new Error('Composer Ctrl C failed');
        question.setSelectionRange(2,2);
        for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End']){
          for(const modifiers of [{},{shiftKey:true},{ctrlKey:true},{ctrlKey:true,shiftKey:true}]){
            const event=new win.KeyboardEvent('keydown',{key,...modifiers,bubbles:true,cancelable:true});question.dispatchEvent(event);
            if(event.defaultPrevented||doc.activeElement!==question)throw new Error('Reader intercepted composer editing key: '+key+' '+JSON.stringify(modifiers));
          }
        }
        math.dispatchEvent(new win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:80}));
        const button=Array.from(panel.node.querySelectorAll('.zma-clipboard-menu button')).find(b=>b.textContent==='复制公式 LaTeX');
        if(!button)throw new Error('Formula context menu missing');button.click();
        if(writes.at(-1)!==latex)throw new Error('Context menu formula copy failed');
        if(win.getComputedStyle(answer).userSelect!=='text')throw new Error('Text selection still disabled');
        return {readerEventOverride:true,partialFormulaToFullLatex:true,multilineSource:true,ctrlCopy:true,ctrlPaste:true,draftUpdated:true,contextMenu:true,editingKeysNotCancelled:true,editingFocusRetained:true,editingEventCombinations:24,coldRestart:seed.launch>1,systemClipboard:'mocked to preserve user clipboard'};
      }finally{host.copy=copy;host.readClipboard=read;host.readAttachmentClipboard=readAssets;chat.draft=originalDraft;panel.question.value=originalDraft;}
    });
'''
point = '    await host.store.flush();'
if bootstrap.count(point) != 1:
    raise RuntimeError('Unexpected harness integration point')
bootstrap = bootstrap.replace(point, insertion + '\n' + point)
with zipfile.ZipFile(qa, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', manifest)
    archive.writestr('bootstrap.js', bootstrap)
print(json.dumps({'profile': str(work / 'profile'), 'isolated': True}))
