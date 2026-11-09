"""Isolated native import/export, continuation with the PDF and cold restoration."""
import argparse,json,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/text-math-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('conversation-import-export',async()=>{
      const target=Zotero.Reader._readers.find(r=>r.itemID===seed.wholeAttachmentID)||await Zotero.Reader.open(seed.wholeAttachmentID);await target._initPromise;const panel=await host.panel(target),priorID=panel.conversationId,win=target._iframeWindow,doc=panel.doc,client=host.chatgpt,priorFetch=client.fetch,priorClient=host.selectedClient,priorPicker=host.chooseConversationFile,pause=()=>new Promise(r=>setTimeout(r,30));let restored=false,requests=[];
      const press=(node,label)=>{const button=[...node.querySelectorAll('button')].find(b=>b.textContent===label);if(!button)throw new Error('Missing transfer button: '+label);button.click();};
      const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await pause();}throw new Error('Transfer wait: '+label+' '+panel.transfer?.note?.textContent);};
      try{
        if(!panel.transfer)throw new Error('Transfer UI not loaded');
        if(seed.transferID){const c=panel.state.conversations.find(c=>c.id===seed.transferID);if(c?.history[0]?.content!=='网页里的论文问题'||c.history[1]?.content!=='网页公式 \\[x=\\frac{a}{b}\\]')throw new Error('Imported history not restored');restored=true;}
        else{
          const input=PathUtils.join(work,'import-conversation.json'),message=(role,text)=>({author:{role},content:{content_type:'text',parts:[text]}});
          const web=[{title:'导入的论文对话',current_node:'a',mapping:{r:{parent:null,message:null},u:{parent:'r',message:message('user','网页里的论文问题')},a:{parent:'u',message:message('assistant','网页公式 \\[x=\\frac{a}{b}\\]')}}}];
          await IOUtils.writeUTF8(input,JSON.stringify(web));host.chooseConversationFile=async()=>input;
          const count=panel.state.conversations.length;panel.transfer.open();press(panel.transfer.dialog,'选择 JSON 文件');await wait(()=>!!panel.transfer.dialog.querySelector('select'),'file chooser');press(panel.transfer.dialog,'预览所选对话');await wait(()=>!!panel.transfer.prepared,'preview');if(panel.state.conversations.length!==count)throw new Error('Preview wrote to history');press(panel.transfer.dialog,'确认导入为新对话');await wait(()=>panel.state.conversations.length===count+1&&!panel.transfer.dialog,'import saved');seed.transferID=panel.conversationId;
        }
        await panel.switchConversation(seed.transferID);if(!panel.messages.querySelector('math'))throw new Error('Imported formula did not render');
        host.selectedClient=()=>client;client.fetch=async(url,options)=>{if(!url.endsWith('/responses'))throw new Error('Unexpected offline endpoint');const body=JSON.parse(options.body);requests.push(body);return new win.Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:'Imported context continuation QA.'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{service_tier:'default'}})+'\n\n');};
        panel.question.value='接着上面的讨论，结合当前论文解释';await panel.send();if(panel.conversation().history.at(-1).incomplete||requests.length!==1)throw new Error('Continuation failed: '+panel.status.textContent);
        const request=requests[0],serialized=JSON.stringify(request);if(!serialized.includes('网页里的论文问题')||!serialized.includes('网页公式')||!request.input.some(m=>m.content?.some(p=>p.type==='input_file')))throw new Error('Imported messages or current PDF missing from next request');
        for(const extension of ['json','md']){const output=PathUtils.join(work,'export-conversation.'+extension);host.chooseConversationFile=async()=>output;await panel.transfer.exportConversation(seed.transferID,extension);const raw=await IOUtils.readUTF8(output);if(!raw.includes('网页里的论文问题')||!raw.includes('网页公式'))throw new Error('Exported text missing');if(extension==='json'){const data=JSON.parse(raw);if(data.format!=='zma-conversation'||data.conversation.history[1].content!=='网页公式 \\[x=\\frac{a}{b}\\]')throw new Error('Portable JSON LaTeX mismatch');}}
        const scope=host.scope(target),sidecar=await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'),before=await IOUtils.readUTF8(sidecar);host.chooseConversationFile=async()=>sidecar;let rejected=false;try{await host.writeConversationFile('bad','json','bad');}catch{rejected=true;}if(!rejected||before!==await IOUtils.readUTF8(sidecar))throw new Error('Export could overwrite local history');
        panel.transfer.open();const input=panel.transfer.dialog.querySelector('textarea');input.value='你说：\n粘贴的提问\nChatGPT 说：\n粘贴的回答 \\(y=Hu\\)';press(panel.transfer.dialog,'预览粘贴内容');await wait(()=>!!panel.transfer.prepared,'paste preview');if(panel.transfer.prepared.history.length!==2)throw new Error('Pasted roles missing');press(panel.transfer.dialog,'取消');await wait(()=>!panel.transfer.dialog,'cancel');
        await panel.persist();const onDisk=JSON.parse(await IOUtils.readUTF8(sidecar));if(!onDisk.conversations.some(c=>c.id===seed.transferID))throw new Error('Imported chat absent on disk');
        return {filePreview:true,importedMath:true,pastePreview:true,cancelPreserves:true,exportsJSONAndMarkdown:true,liveSidecarProtected:true,continuationIncludesHistory:true,currentPDFIncluded:true,coldRestored:restored,noExternalApiCalls:true};
      }finally{host.chooseConversationFile=priorPicker;host.selectedClient=priorClient;client.fetch=priorFetch;if(panel.transfer.dialog)panel.transfer.close();await panel.switchConversation(priorID);}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
