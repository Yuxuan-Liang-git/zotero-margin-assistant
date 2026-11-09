"""Isolated Zotero paste/file persistence and quote-to-question acceptance."""
import argparse,json,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/chatgpt-smoke.py'),'--run-name',args.run_name],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('composer-attachments-quotes',async()=>{
      const panel=await host.panel(reader),chat=panel.conversation(),win=reader._iframeWindow,doc=panel.doc,originalDraft=chat.draft,client=host.chatgpt,originalFetch=client.fetch,originalAssets=host.readAttachmentClipboard,originalError=panel.error;let calls=0,body;
      panel.showChat();const before=chat.history.filter(m=>m.attachments?.length).length;
      if(seed.launch>1&&!before)throw new Error('Pasted draft files not restored into the next request after restart');
      try{
        panel.error=function(error){report.attachmentErrorStack=error.stack;originalError.call(this,error);};
        client.fetch=async(url,options)=>{if(!url.endsWith('/responses'))throw new Error('Unexpected offline endpoint');calls++;body=JSON.parse(options.body);return new win.Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'附件说明：\\(x=1\\)。'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{service_tier:'default'}})+'\n\n');};
        const answer=panel.messages.lastElementChild.querySelector('.zma-answer'),math=answer.querySelector('math'),range=doc.createRange();if(!math)throw new Error('Quote fixture math missing');range.selectNodeContents(math);win.getSelection().removeAllRanges();win.getSelection().addRange(range);math.dispatchEvent(new win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:60}));
        const quote=Array.from(panel.node.querySelectorAll('.zma-clipboard-menu button')).find(b=>b.textContent==='引用并批注提问');if(!quote)throw new Error('Quote context action missing');quote.click();
        const comment=panel.previewArea.querySelector('textarea');comment.value='native quote annotation';const add=Array.from(panel.previewArea.querySelectorAll('button')).find(b=>b.textContent==='加入问题');add.click();
        for(let i=0;i<60&&panel.previewArea.querySelector('textarea');i++)await new Promise(r=>setTimeout(r,30));
        if(!panel.question.value.includes('native quote annotation')||!panel.question.value.includes('\\('))throw new Error('Selected formula not retained as LaTeX in draft');
        const pdfBytes=await IOUtils.read(await Zotero.Items.get(reader.itemID).getFilePathAsync()),png=Uint8Array.from(win.atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
        const data=new win.DataTransfer();data.items.add(new win.File([pdfBytes],'native-attachment.pdf',{type:'application/pdf'}));data.items.add(new win.File([png],'native-image.png',{type:'image/png'}));const pasteEvent=new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});report.pasteProbe={source:data.files.length,event:pasteEvent.clipboardData?.files.length,items:data.items.length};await write();host.readAttachmentClipboard=()=>Array.from(data.files);panel.question.focus();panel.question.dispatchEvent(new win.KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true}));
        for(let i=0;i<200&&panel.pendingMaterials.size;i++)await new Promise(r=>setTimeout(r,30));
        const records=chat.draftAttachments?.slice();if(records?.length!==2||calls)throw new Error('Paste import failed or sent automatically: '+panel.status.textContent);
        for(const file of records)await host.loadAttachment(reader,file);
        await panel.send();if(chat.history.at(-1).incomplete||!body?.input.some(m=>m.content?.some(c=>c.type==='input_file'))||!body.input.some(m=>m.content?.some(c=>c.type==='input_image')))throw new Error('Pasted PDF/image missing from Responses input: '+panel.status.textContent);
        chat.draftAttachments=records;
        return {pastedPdfAndImage:true,localOnlyBeforeSend:true,requestContainsFiles:true,quoteWithLatexAndComment:true,draftReferencesPreserved:true,filesRestoredAfterRestart:seed.launch>1&&before>0,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{panel.error=originalError;host.readAttachmentClipboard=originalAssets;client.fetch=originalFetch;chat.draft=originalDraft;panel.question.value=originalDraft;await panel.persist();}
    });
'''
point='    await host.store.flush();'
assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
