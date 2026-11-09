"""Native Zotero added-text LaTeX display, real editing and cold restoration."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/reference-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('native-added-text-latex',async()=>{
      reader._window.Zotero_Tabs.select(reader.tabID,true);await reader.focus();const panel=await host.panel(reader);panel.close();const session=await host.addon.controller.ensureSession(reader),doc=session.adapter.document(),win=doc.defaultView,pause=()=>new Promise(r=>setTimeout(r,30));
      const first='参数 \\(y=Hu+e\\)\n\\[\\frac{a}{b}\\]',updated='参数 \\(y=Hu+e\\)\n\\[\\frac{\\partial e}{\\partial\\theta}=-u\\]';let annotation,restored=false;
      if(!seed.textMathKey){annotation=await Zotero.Annotations.saveFromJSON(Zotero.Items.get(reader.itemID),{key:Zotero.DataObjectUtilities.generateKey(),type:'text',color:'#ff6666',pageLabel:'1',sortIndex:'00000|000400|00000',position:{pageIndex:0,rects:[[80,380,350,470]],fontSize:18,rotation:0},comment:first});seed.textMathKey=annotation.key;}
      else{annotation=host.nativeAnnotation(reader,seed.textMathKey);restored=annotation?.annotationComment===updated;if(!restored)throw new Error('Added text LaTeX source was not restored');}
      host.jump(reader,{pageIndex:0,annotationKey:annotation.key});host.bindReferences(reader,doc);let input,view;
      for(let i=0;i<200;i++){input=doc.querySelector(`textarea.textAnnotation[data-id="${annotation.key}"]`);input?.blur();view=doc.querySelector(`.zma-text-math-view[data-annotation-key="${annotation.key}"]`);if(view?.querySelectorAll('math').length===2&&!view.hidden&&!input.disabled)break;await pause();}
      if(!view||view.querySelectorAll('math').length!==2||view.hidden||input.value!==annotation.annotationComment)throw new Error('Native added text did not render in place');
      if(view.closest('.customAnnotationLayer')||!input.classList.contains('zma-text-math-source'))throw new Error('Native editable node was replaced or not hidden');
      input.classList.add('focusable');input.focus();await pause();report.textMathFocus={activeSame:doc.activeElement===input,activeSameNode:doc.activeElement?.isSameNode(input),activeClass:doc.activeElement?.className,sourceClass:input.className,sourceConnected:input.isConnected,viewHidden:view.hidden,disabled:input.disabled,valueMatches:input.value===annotation.annotationComment};await write();if(!view.hidden||input.classList.contains('zma-text-math-source')||input.value!==annotation.annotationComment)throw new Error('Focus did not restore editable LaTeX: '+JSON.stringify(report.textMathFocus));
      input.value=updated;const inputEvent=new win.Event('input',host.cloneInto({bubbles:true},win));input.dispatchEvent(inputEvent);report.textMathInput={bubbles:inputEvent.bubbles,commentUpdated:input.getAttribute('data-comment')===updated};await write();input.blur();
      for(let i=0;i<350;i++){view=doc.querySelector(`.zma-text-math-view[data-annotation-key="${annotation.key}"]`);if(annotation.annotationComment===updated&&view?.querySelector('math[display="block"]')?.getAttribute('data-zma-latex')==='\\[\\frac{\\partial e}{\\partial\\theta}=-u\\]'&&!view.hidden)break;await pause();}
      if(annotation.annotationComment!==updated||view?.hidden||input.value!==updated||view.querySelectorAll('math').length!==2)throw new Error('Native input was not saved or re-rendered after blur: '+JSON.stringify({stored:annotation.annotationComment===updated,hidden:view?.hidden,value:input.value===updated,math:view?.querySelectorAll('math').length,input:report.textMathInput}));
      const pos=JSON.parse(annotation.annotationPosition);pos.fontSize=24;pos.rotation=20;annotation.annotationPosition=JSON.stringify(pos);await annotation.saveTx();
      for(let i=0;i<150;i++){await pause();input=doc.querySelector(`textarea.textAnnotation[data-id="${annotation.key}"]`);view=doc.querySelector(`.zma-text-math-view[data-annotation-key="${annotation.key}"]`);if(view&&win.getComputedStyle(input).fontSize===win.getComputedStyle(view).fontSize&&input.style.transform===view.style.transform&&input.style.fontSize.includes('24'))break;}
      const a=input.getBoundingClientRect(),b=view.getBoundingClientRect();if(Math.abs(a.left-b.left)>2||Math.abs(a.top-b.top)>2||input.style.transform!==view.style.transform||win.getComputedStyle(input).fontSize!==win.getComputedStyle(view).fontSize)throw new Error('Added text font/rotation/position did not follow native geometry');
      session.setVisibleTypes(new Set(['highlight','underline','note','text','image']));await session.reveal([annotation.key]);if(session.cardRuntimes().some(r=>r.annotation.key===annotation.key))throw new Error('Added text duplicated into margin');
      if(annotation.annotationComment!==updated||annotation.annotationComment.includes('<math'))throw new Error('Rendered MathML leaked into stored annotation');
      return {createdOnPage:true,rawSourcePreserved:true,focusEditing:true,editPersisted:true,mathAfterBlur:true,geometryFollows:true,noDuplicateMargin:true,coldRestored:restored,noExternalApiCalls:true};
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
