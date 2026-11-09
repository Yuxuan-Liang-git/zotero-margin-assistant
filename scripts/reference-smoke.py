"""Actual native annotation popup, source crop and hover-preview restart checks."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/rendering-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('native-reference-hover-preview',async()=>{
      reader._window.Zotero_Tabs.select(reader.tabID,true);await reader.focus();
      const panel=await host.panel(reader);panel.close();const session=await host.addon.controller.ensureSession(reader),pdfDoc=session.adapter.document(),doc=reader._iframeWindow.document,win=doc.defaultView,ir=host.unwrap(reader._internalReader),oldPopup=ir._state.primaryViewAnnotationPopup,pause=()=>new Promise(r=>setTimeout(r,30));
      const attachment=Zotero.Items.get(reader.itemID),state=await host.load(reader);let restored=false;
      if(!seed.hoverSourceKey){
        const source=await Zotero.Annotations.saveFromJSON(attachment,{key:Zotero.DataObjectUtilities.generateKey(),type:'image',color:'#ffd400',pageLabel:'1',sortIndex:'00000|000350|00000',position:{pageIndex:0,rects:[[50,350,350,425]]},comment:''});
        const target=await Zotero.Annotations.saveFromJSON(attachment,{key:Zotero.DataObjectUtilities.generateKey(),type:'note',color:'#ffd400',pageLabel:'1',sortIndex:'00000|000450|00000',position:{pageIndex:0,rects:[[370,450,390,470]]},comment:'Native reference QA'});seed.hoverSourceKey=source.key;seed.hoverTargetKey=target.key;
        const record={...await host.resolveSource(reader,source.key),id:'hover-'+source.key,type:'公式',number:'P1'};state.sources.push(record);await host.save(reader,state);
      }else restored=!!state.sources.find(s=>s.annotationKey===seed.hoverSourceKey)&&state.references.some(r=>r.annotationKey===seed.hoverTargetKey);
      const source=state.sources.find(s=>s.annotationKey===seed.hoverSourceKey),target=host.nativeAnnotation(reader,seed.hoverTargetKey);await host.insertReference(reader,{annotationKey:target.key},source,state);const stored=target.annotationComment;
      host.bindReferences(reader,pdfDoc);
      try{
        let annotation;for(let i=0;i<150;i++){annotation=ir._state.annotations.find(a=>a.id===target.key);if(annotation?.comment===stored)break;await pause();}if(annotation?.comment!==stored)throw new Error('Native reader did not receive stored link');
        const params={annotation:JSON.parse(JSON.stringify(annotation)),rect:[100,180,300,220]};ir._updateState(host.cloneInto({primaryViewAnnotationPopup:params},ir));
        let view;for(let i=0;i<150;i++){view=doc.querySelector('.annotation-popup .zma-native-reference');if(view?.querySelector('a'))break;await pause();}if(!view?.querySelector('a'))throw new Error('Real native annotation popup did not restore links');
        const popup=doc.querySelector('.annotation-popup'),editor=popup.querySelector('.editor'),content=editor.querySelector('.content'),link=view.querySelector('a');if(!content.textContent.includes('<a href=')||win.getComputedStyle(editor).display!=='none'||view.textContent.includes('<a href='))throw new Error('Native source was changed or raw HTML still visible');
        const pageBefore=session.adapter.currentPageIndex();link.dispatchEvent(new win.PointerEvent('pointerover',{bubbles:true}));let preview,image;for(let i=0;i<150;i++){preview=doc.querySelector('.zma-reference-popover');image=preview?.querySelector('img');if(image?.naturalWidth>1&&!preview.hidden)break;await pause();}if(!image?.naturalWidth||preview.hidden)throw new Error('Native crop hover preview did not load');
        if(session.adapter.currentPageIndex()!==pageBefore)throw new Error('Hover navigated the PDF');const rect=preview.getBoundingClientRect();if(rect.left<0||rect.top<0||rect.right>win.innerWidth+1||rect.bottom>win.innerHeight+1)throw new Error('Hover preview left viewport');
        image.dispatchEvent(new win.PointerEvent('pointerover',{bubbles:true,relatedTarget:link}));await new Promise(r=>setTimeout(r,250));if(preview.hidden)throw new Error('Moving into preview closed it');doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));if(!preview.hidden)throw new Error('Escape did not close preview');
        ir._updateState(host.cloneInto({primaryViewAnnotationPopup:null},ir));await pause();ir._updateState(host.cloneInto({primaryViewAnnotationPopup:params},ir));for(let i=0;i<150&&!doc.querySelector('.annotation-popup .zma-native-reference a');i++)await pause();if(!doc.querySelector('.annotation-popup .zma-native-reference a')||target.annotationComment!==stored)throw new Error('Reopened native popup lost reference or changed original');
        return {realNativeAnnotationPopup:true,originalCommentUntouched:true,safeLinkRestored:true,realCropLoaded:true,hoverDoesNotJump:true,viewportBounded:true,pointerTransit:true,escapeCloses:true,reopenRestores:true,coldRestored:restored,noExternalApiCalls:true};
      }finally{ir._updateState(host.cloneInto({primaryViewAnnotationPopup:oldPopup||null},ir));for(const entry of host.cleanups.values())entry.preview?.hide();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
