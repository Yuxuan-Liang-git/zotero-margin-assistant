"""Native PDF selection/screenshot quote bubbles and cold-restart drafts."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/bubble-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
bootstrap=bootstrap.replace('c.id!==seed.quoteConversationID','c.id!==seed.quoteConversationID&&c.id!==seed.pdfQuoteConversationID')
insertion=r'''
    await check('pdf-selection-quote-bubbles',async()=>{
      const panel=await host.panel(reader),originalID=panel.conversation().id,session=await host.addon.controller.ensureSession(reader),pdfDoc=session.adapter.document(),pdfWin=pdfDoc.defaultView,originalClient=host.selectedClient,originalContext=host.documentContext;let restored=false,requests=0,sent;
      reader._window.Zotero_Tabs.select(reader.tabID,true);await reader.focus();
      const pause=()=>new Promise(r=>setTimeout(r,80)),outside=()=>pdfDoc.body.dispatchEvent(new pdfWin.PointerEvent('pointerdown',{bubbles:true,cancelable:true})),comment=value=>{const input=panel.quotes.popover.querySelector('textarea');input.value=value;input.dispatchEvent(new pdfWin.Event('input',{bubbles:true}));};
      try{
        if(seed.pdfQuoteConversationID){await panel.switchConversation(seed.pdfQuoteConversationID);restored=panel.conversation().draftQuotes?.length===2&&panel.conversation().draftQuotes.every(q=>q.source)&&panel.conversation().draftQuotes[0].source.selection===true;if(!restored)throw new Error('PDF source drafts did not restore');panel.quotes.clear();}else{await panel.newConversation();seed.pdfQuoteConversationID=panel.conversation().id;}
        const chat=panel.conversation();panel.showChat();const nativeBefore=Zotero.Items.get(reader.itemID).getAnnotations().length,selection={text:'Native selected definition for PDF quote',pageLabel:'1',sortIndex:'00000|000300|00000',position:{pageIndex:0,rects:[[50,300,300,325]]}},menu=[];host.onViewMenu({reader,params:{annotation:selection},append:m=>menu.push(m)});const command=menu.find(m=>m.label==='批注并提问（选中文字）');if(!command||command.disabled)throw new Error('PDF text bubble menu missing');command.onCommand();for(let i=0;i<100&&!panel.quotes.active;i++)await pause();
        report.pdfBubbleProbe={active:panel.quotes.active,status:panel.status.textContent,portal:!!panel.quotes.pdfPortal,owner:panel.quotes.popover.ownerDocument?.URL,expected:pdfDoc.URL,parent:panel.quotes.popover.parentElement?.className,sameOwner:panel.quotes.popover.ownerDocument===pdfDoc,sameParent:panel.quotes.popover.parentElement===panel.quotes.pdfPortal};await write();
        if(!panel.quotes.active||host.unwrap(panel.quotes.popover.ownerDocument)!==host.unwrap(pdfDoc)||host.unwrap(panel.quotes.popover.parentElement)!==host.unwrap(panel.quotes.pdfPortal))throw new Error('Bubble not displayed on native PDF');comment('Explain this PDF definition');outside();if(chat.draftQuotes.length!==1||!panel.quotes.popover.hidden||Zotero.Items.get(reader.itemID).getAnnotations().length!==nativeBefore)throw new Error('Text selection wrote native annotation or lost draft');
        const image=await Zotero.Annotations.saveFromJSON(Zotero.Items.get(reader.itemID),{key:Zotero.DataObjectUtilities.generateKey(),type:'image',color:'#ffd400',pageLabel:'1',sortIndex:'00000|000350|00000',position:{pageIndex:0,rects:[[50,350,350,425]]},comment:''});const actions=[];host.onMenu({reader,params:{ids:[image.key]},append:m=>actions.push(m)});actions.find(m=>m.label==='批注并提问').onCommand();for(let i=0;i<100&&!panel.quotes.active;i++)await pause();comment('Explain the equation in this crop');outside();await pause();
        const badges=panel.quotes.pdfLayer.querySelectorAll('button:not([hidden])');if(badges.length!==2)throw new Error('PDF source icons missing');const page=session.adapter.page(0),pageRect=page.element.getBoundingClientRect(),badgeRect=badges[0].getBoundingClientRect();if(badgeRect.left<pageRect.left||badgeRect.left>pdfWin.innerWidth||badgeRect.top<0||badgeRect.top>pdfWin.innerHeight)throw new Error('PDF icon outside page viewport');
        const originalPage=session.adapter.page;try{session.adapter.page=()=>undefined;panel.quotes.open(chat.draftQuotes[0].id);panel.quotes.position();const r=panel.quotes.popover.getBoundingClientRect();if(panel.quotes.popover.hidden||r.left<0||r.top<0||r.right>pdfWin.innerWidth||r.bottom>pdfWin.innerHeight)throw new Error('Unrendered PDF page fallback did not keep bubble in viewport');outside();}finally{session.adapter.page=originalPage;panel.quotes.layout();}
        panel.quotes.open(chat.draftQuotes[1].id);for(let i=0;i<100&&!panel.quotes.popover.querySelector('img')?.src;i++)await pause();if(!panel.quotes.popover.querySelector('img')?.src.startsWith('data:image/'))throw new Error('Crop preview not rendered');outside();
        const scope=host.scope(reader);await panel.persist();const disk=JSON.parse(await IOUtils.readUTF8(await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'))).conversations.find(c=>c.id===seed.pdfQuoteConversationID);if(disk.draftQuotes.length!==2||JSON.stringify(disk).includes('base64,'))throw new Error('PDF draft persisted image body or lost source');
        const pending=chat.draftQuotes.map(q=>({...q}));host.documentContext=async()=>({mode:'full-text',text:'Native offline PDF context',pages:[1],totalPages:1});host.selectedClient=()=>({generate:async messages=>{requests++;sent=messages;return 'Native PDF quote answer';}});panel.question.value='Explain both PDF comments';await panel.send();
        const wire=JSON.stringify(sent);if(requests!==1||!wire.includes('Explain this PDF definition')||!wire.includes('Explain the equation in this crop')||!wire.includes('data:image/')||chat.history.at(-2).materials.length!==2||chat.draftQuotes.length)throw new Error('PDF text, crop or comments missing from combined request: '+panel.status.textContent);
        chat.draftQuotes=pending;panel.quotes.render();await panel.persist();return {textMenu:true,regionMenu:true,bubbleInPDF:true,noPermanentHighlight:true,sourceIcons:true,unrenderedPageFallback:true,cropPreview:true,combinedTextImage:true,metadataOnlyDraft:true,coldRestored:restored,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;host.documentContext=originalContext;await panel.switchConversation(originalID);await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
