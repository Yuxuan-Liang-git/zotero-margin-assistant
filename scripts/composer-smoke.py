"""Verify the composer height control in an isolated native Zotero reader."""
import argparse, subprocess, sys, zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/performance-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('composer-input-height',async()=>{
      const target=Zotero.Reader._readers.find(r=>r.itemID===seed.wholeAttachmentID)||reader,panel=await host.panel(target);target._window.Zotero_Tabs.select(target.tabID,true);await target.focus();panel.showChat();
      const doc=panel.doc,win=doc.defaultView,handle=panel.composerHandle,field=panel.question,original=field.value,draft=panel.conversation().draft,pause=()=>new Promise(r=>setTimeout(r,50));
      if(!handle||handle.getAttribute('aria-orientation')!=='horizontal')throw new Error('Composer height handle missing');
      try{
        field.value='Native draft \\(y=Hu+e\\)';field.focus();field.setSelectionRange(3,3);const before=field.getBoundingClientRect().height;
        const pointer=(type,y)=>handle.dispatchEvent(new win.PointerEvent(type,host.cloneInto({bubbles:true,cancelable:true,pointerId:7,button:0,clientY:y},win)));
        pointer('pointerdown',500);pointer('pointermove',280);pointer('pointerup',280);await pause();const grown=field.getBoundingClientRect().height,max=Number(handle.getAttribute('aria-valuemax')),min=Number(handle.getAttribute('aria-valuemin'));
        if(grown<=before||grown<Math.min(max,before+220)-2||field.value!=='Native draft \\(y=Hu+e\\)'||field.selectionStart!==3)throw new Error('Upward resize or draft/caret preservation failed: '+JSON.stringify({before,grown,max,caret:field.selectionStart}));
        const send=panel.sendButton.getBoundingClientRect();if(send.bottom>win.innerHeight||panel.messages.getBoundingClientRect().height<65)throw new Error('Resize obscured answer area or send control');
        panel.close();panel.showChat();if(Math.abs(field.getBoundingClientRect().height-grown)>2)throw new Error('Reopening reset composer height');
        pointer('pointerdown',280);pointer('pointermove',380);pointer('pointerup',380);await pause();const shrunk=field.getBoundingClientRect().height;if(shrunk>=grown||Math.abs(shrunk-Math.max(min,grown-100))>2)throw new Error('Downward resize did not shrink');
        handle.focus();handle.dispatchEvent(new win.KeyboardEvent('keydown',host.cloneInto({key:'End',bubbles:true,cancelable:true},win)));await pause();if(Math.abs(field.getBoundingClientRect().height-max)>2)throw new Error('Keyboard End did not grow height');handle.dispatchEvent(new win.KeyboardEvent('keydown',host.cloneInto({key:'Home',bubbles:true,cancelable:true},win)));await pause();if(Math.abs(field.getBoundingClientRect().height-min)>2)throw new Error('Keyboard Home did not reduce height');
        return {growsUpward:true,shrinksDownward:true,withinAvailableSpace:true,expandedAbove180:grown>180,draftAndCaretPreserved:true,reopenPreservesHeight:true,controlsVisible:true,keyboardResize:true,firstHeight:before,grownHeight:grown,availableMaximum:max,viewportHeight:win.innerHeight,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{field.value=original;panel.conversation().draft=draft;}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
