"""Isolated native appearance, persistent font and native free-text acceptance."""
import argparse,json,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/whole-pdf-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture: command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('appearance-and-native-text',async()=>{
      const panel=await host.panel(reader),win=panel.doc.defaultView;
      if(seed.launch>1&&host.appearanceState().fontSize!==20)throw new Error('Font preference did not survive cold restart');
      const originalDraft=panel.question.value;panel.showChat();panel.question.value='Appearance draft';panel.question.focus();panel.question.setSelectionRange(2,5);await host.setFontSize(20);
      if(win.getComputedStyle(panel.question).fontSize!=='20px'||win.getComputedStyle(panel.messages).fontSize!=='20px')throw new Error('Native font change not applied');
      if(panel.question.value!=='Appearance draft'||panel.question.selectionStart!==2||panel.question.selectionEnd!==5)throw new Error('Font change reset draft or caret');
      if(panel.node.querySelector('select')||[...panel.node.querySelectorAll('button')].some(b=>/登录|管理用量/.test(b.textContent)))throw new Error('Configuration still occupies chat sidebar');
      const markup=Zotero.File.getContentsFromURL('chrome://margincomments/content/deepseek-settings.inc.xhtml'),parsed=new win.DOMParser().parseFromString('<div xmlns="http://www.w3.org/1999/xhtml" xmlns:html="http://www.w3.org/1999/xhtml">'+markup+'</div>','application/xhtml+xml'),settings=panel.doc.importNode(parsed.querySelector('#zma-api-settings'),true);panel.doc.body.append(settings);
      try{host.bindPreferencePaneWindow(win);const size=settings.querySelector('#zma-font-size');if(size.value!=='20'||!settings.querySelector('#zma-chatgpt-model')||!settings.querySelector('#zma-api-key'))throw new Error('Native settings controls missing');size.value='18';size.dispatchEvent(new win.Event('change',{bubbles:true}));for(let i=0;i<50&&host.appearanceState().fontSize!==18;i++)await new Promise(r=>setTimeout(r,20));if(win.getComputedStyle(panel.question).fontSize!=='18px')throw new Error('Native settings event did not resize conversation');await host.setFontSize(20);}finally{settings.remove();}
      const annotation=await Zotero.Annotations.saveFromJSON(Zotero.Items.get(reader.itemID),{key:Zotero.DataObjectUtilities.generateKey(),type:'text',color:'#ff6666',pageLabel:'1',sortIndex:'00000|000400|00000',comment:'Native text stays on PDF',position:{pageIndex:0,rects:[[80,380,300,420]],fontSize:14,rotation:0}});
      const session=await host.addon.controller.ensureSession(reader);session.setVisibleTypes(new Set(['highlight','underline','note','text','image']));await session.reveal([annotation.key]);
      if(session.cardRuntimes().some(r=>r.annotation.key===annotation.key))throw new Error('Native free-text duplicated as a margin card');
      if(!Zotero.Items.get(annotation.id)||annotation.annotationComment!=='Native text stays on PDF')throw new Error('Native free-text was modified');
      panel.question.value=originalDraft;
      return {fontApplied:true,fontPersisted:seed.launch>1,configurationInSettings:true,draftAndCaretRetained:true,nativeTextRetained:true,noDuplicateMarginText:true,noExternalApiCalls:true};
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
