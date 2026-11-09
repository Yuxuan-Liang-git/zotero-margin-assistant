"""Native automatic full-PDF attachment and reopening acceptance; offline inference."""
import argparse,json,shutil,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/findbar-smoke.py'),'--run-name',args.run_name],check=True)
work=project/'evidence'/args.run_name
shutil.copy2(Path(args.pdf_fixture) if args.pdf_fixture else work/'qa.pdf',work/'whole-paper.pdf')
qa=work/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('automatic-full-pdf-after-reopen',async()=>{
      if(!seed.wholeAttachmentID){const attachment=new Zotero.Item('attachment');attachment.libraryID=Zotero.Libraries.userLibraryID;attachment.parentID=seed.parentID;attachment.setField('title','Whole-paper QA');attachment.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;attachment.attachmentContentType='application/pdf';attachment.attachmentPath=__WHOLE_PDF__;await attachment.saveTx();seed.wholeAttachmentID=attachment.id;}
      let target=await Zotero.Reader.open(seed.wholeAttachmentID);for(let i=0;i<200&&!target;i++){await new Promise(r=>setTimeout(r,50));target=Zotero.Reader._readers.find(r=>r.itemID===seed.wholeAttachmentID);}if(!target)throw new Error('Whole PDF reader was not restored');await target._initPromise;const panel=await host.panel(target),chat=panel.conversation(),client=host.chatgpt,originalFetch=client.fetch,originalClient=host.selectedClient,originalDraft=chat.draft,win=target._iframeWindow,requests=[];
      try{
        const bytes=await IOUtils.read(__WHOLE_PDF__);host.selectedClient=()=>client;
        client.fetch=async(url,options)=>{if(!url.endsWith('/responses'))throw new Error('Unexpected offline endpoint');const body=JSON.parse(options.body),files=body.input.flatMap(m=>m.content||[]).filter(p=>p.type==='input_file');if(files.length!==1)throw new Error('Whole PDF missing or repeated: '+files.length);const binary=win.atob(files[0].file_data.split(',')[1]);if(binary.length!==bytes.length)throw new Error('PDF bytes truncated');for(let i=0;i<bytes.length;i++)if(binary.charCodeAt(i)!==bytes[i])throw new Error('PDF bytes differ');requests.push(body);return new win.Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'Whole paper offline QA answer.'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{service_tier:'default'}})+'\n\n');};
        panel.showChat();const id=chat.id,before=chat.history.length;panel.question.value='Explain equation (26)';await panel.send();if(chat.history.at(-1).incomplete)throw new Error('Full PDF send failed: '+panel.status.textContent);
        panel.close();host.documents.clear();host.pdfFiles.clear();panel.showChat();if(chat.id!==id||chat.history.length!==before+2)throw new Error('Closing panel cleared conversation');panel.question.value='Continue equation (26) after reopening';await panel.send();
        if(chat.history.at(-1).incomplete||requests.length!==2||chat.history.length!==before+4)throw new Error('Reopened turn did not resend PDF: '+panel.status.textContent);
        if(!requests[1].input.some(m=>m.role==='assistant'&&m.content.some(p=>p.type==='output_text'&&p.text==='Whole paper offline QA answer.')))throw new Error('Previous answer missing after reopen');
        if(chat.history.at(-2).pdfContext?.mode!=='full-pdf'||!panel.contextInfo.textContent.includes('已附带完整 PDF 文件'))throw new Error('Full PDF coverage not recorded');await panel.persist();
        const scope=host.scope(target),saved=await IOUtils.readUTF8(await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'));if(saved.includes('base64,')||saved.includes('file_data'))throw new Error('File body leaked into local history');
        return {wholePdfEveryTurn:true,originalBytesVerified:true,reopenKeepsHistory:true,reopenReattachesPDF:true,cacheClearedBetweenTurns:true,coverageRecorded:true,noFileBodyInHistory:true,pages:chat.history.at(-2).pdfContext.totalPages,fileBytes:bytes.length,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;client.fetch=originalFetch;chat.draft=originalDraft;panel.question.value=originalDraft;await panel.persist();}
    });
'''.replace('__WHOLE_PDF__',json.dumps(str(work/'whole-paper.pdf')))
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
