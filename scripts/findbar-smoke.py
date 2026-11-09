"""Native PDF search visibility with the dock open, resized and reopened."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/vision-smoke.py'),'--run-name',args.run_name],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('pdf-search-with-assistant',async()=>{
      const panel=await host.panel(reader),doc=panel.doc,win=doc.defaultView,style=doc.documentElement.style,oldWidth=style.getPropertyValue('--zma-assistant-user-width'),view=doc.querySelector('#split-view,.split-view');
      const tick=()=>new Promise(r=>setTimeout(r,100));
      const geometry=()=>{const popup=doc.querySelector('.find-popup'),input=popup?.querySelector('input'),vr=view.getBoundingClientRect(),pr=popup?.getBoundingClientRect(),side=panel.node.getBoundingClientRect(),ir=input?.getBoundingClientRect(),hit=ir&&doc.elementFromPoint(ir.left+ir.width/2,ir.top+ir.height/2);return {viewClass:view.className,viewRight:vr.right,viewLeft:vr.left,searchLeft:pr?.left,searchRight:pr?.right,sideLeft:side.left,inputVisible:!!input&&input.contains(hit),query:input?.value};};
      const assertVisible=()=>{const g=geometry();report.findGeometry=g;if(!g.inputVisible||g.searchRight>g.sideLeft+1||g.searchLeft<g.viewLeft-1||g.viewRight>g.sideLeft+1)throw new Error('PDF search covered or clipped: '+JSON.stringify(g));return g;};
      try{
        panel.showChat();host.unwrap(reader._internalReader).toggleFindPopup({open:true});for(let i=0;i<100&&!doc.querySelector('.find-popup');i++)await tick();if(!doc.querySelector('.find-popup'))throw new Error('Native Ctrl F popup did not open');await tick();assertVisible();
        const input=doc.querySelector('.find-popup input');input.focus();input.value='prediction';input.dispatchEvent(new win.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,600));assertVisible();if(doc.activeElement!==input)throw new Error('Native find input cannot retain focus');
        style.setProperty('--zma-assistant-user-width','540px');await tick();assertVisible();panel.close();await tick();const closed=view.getBoundingClientRect().right;if(Math.abs(closed-win.innerWidth)>2)throw new Error('Closing dock did not restore PDF width');panel.open();await tick();assertVisible();if(input.value!=='prediction')throw new Error('Search query lost on reopen');
        return {nativeFindPopup:true,searchClickable:true,pdfWidthReserved:true,resizedVisible:true,closedWidthRestored:true,reopenedQueryRetained:true,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{if(oldWidth)style.setProperty('--zma-assistant-user-width',oldWidth);else style.removeProperty('--zma-assistant-user-width');host.unwrap(reader._internalReader).toggleFindPopup({open:false});}
    });
    await check('stale-sources-do-not-block-chat',async()=>{
      const panel=await host.panel(reader),chat=panel.conversation(),draft=chat.draft,files=chat.draftAttachments,materials=panel.materials,originalClient=host.selectedClient;let sent;
      try{
        const annotation=await Zotero.Annotations.saveFromJSON(Zotero.Items.get(reader.itemID),{key:Zotero.DataObjectUtilities.generateKey(),type:'image',color:'#ffd400',pageLabel:'1',sortIndex:'00000|000450|00000',comment:'QA region',position:{pageIndex:0,rects:[[35,450,565,560]]}}),source=await host.resolveSource(reader,annotation.key),sourceJSON=JSON.stringify(source);
        annotation.annotationPosition=JSON.stringify({pageIndex:0,rects:[[45,450,565,560]]});await annotation.saveTx();
        let rejected=false;try{await host.resolveSource(reader,source);}catch(e){rejected=e.code==='SOURCE_STALE';}if(!rejected)throw new Error('Moved source was not detected as stale');
        chat.history.push({role:'user',content:'QA question with original region',materials:[source]},{role:'assistant',content:'QA original answer preserved',materials:[]});panel.materials=[{source,dataURL:'data:image/png;base64,YQ==',text:''}];chat.draftAttachments=[];
        host.selectedClient=()=>({summarize:async()=> 'Earlier conversation summary',generate:async messages=>{sent=messages;return 'QA continued answer';}});panel.question.value='Continue after moved region';await panel.send();
        if(chat.history.at(-1).incomplete||chat.history.at(-1).content!=='QA continued answer')throw new Error('Stale source still blocked generation: '+panel.status.textContent);
        if(JSON.stringify(chat.history.at(-4).materials[0])!==sourceJSON||!sent.some(m=>m.role==='assistant'&&m.content==='QA original answer preserved'))throw new Error('Old history or source changed');
        if(chat.history.at(-2).materials.some(s=>s.annotationKey===source.annotationKey)||!chat.history.at(-2).sourceWarnings?.length||!panel.materialList.textContent.includes('本轮未发送'))throw new Error('Stale material was substituted or omission not shown');
        await panel.persist();const scope=host.scope(reader),path=await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'),stored=JSON.parse(await IOUtils.readUTF8(path)),saved=stored.conversations.find(c=>c.id===chat.id);if(!saved.history.at(-2).sourceWarnings?.length)throw new Error('Omission warning lost on disk');
        return {actualMovedAnnotation:true,strictValidationRetained:true,chatContinues:true,originalHistoryPreserved:true,omittedSourceNotSubstituted:true,warningPersisted:true,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;chat.draft=draft;chat.draftAttachments=files;panel.materials=materials;panel.question.value=draft;await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
