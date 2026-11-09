"""Native reading-summary persistence, math, incremental work and edit protection.

All writes target a fresh isolated profile. OAuth/inference remain synthetic.
"""
import argparse
import subprocess
import sys
import zipfile
from pathlib import Path

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/admission-smoke.py'), '--run-name', args.run_name], check=True)
qa = project / 'evidence' / args.run_name / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
insertion = r'''
    await check('reading-summary-native',async()=>{
      const state=await host.load(reader),manager=host.readingSummary,client=host.chatgpt,win=reader._iframeWindow,scope=host.scope(reader),attachment=Zotero.Items.get(reader.itemID);
      if(!manager)throw Error('Reading summary module missing');
      const conversations=state.conversations,activeID=state.activeConversationId,fetch=client.fetch,selectedClient=host.selectedClient,automatic=host.readingAuto,delay=manager.delay;
      const cached=state.readingSummary?.text;
      if(seed.launch>1){panel.close();panel.open();if(!cached||panel.readingView.hidden||!panel.readingView.textContent.includes('正则性'))throw Error('Cold restart did not open local summary');}
      let calls=0;
      const answer='### 正则性的作用\n\n正则性约束局部可辨识性，需要结合原文条件核对。内联公式 \\(y=Hu+e\\)。\n\n\\[J=\\mathbb{E}[\\psi\\psi^{\\mathsf T}]\\]\n\n### 尚待核对\n\n图像公式仍需返回原文核实。';
      const pair=n=>[{role:'user',content:'正则性问题 '+seed.launch+'-'+n,materials:[]},{role:'assistant',content:'澄清条件 '+seed.launch+'-'+n,materials:[],incomplete:false}];
      const make=(id,n)=>({...conversations[0],id,title:'阅读难点 '+n,history:pair(n),materials:[],quoteDrafts:[],draft:''});
      const noteCount=()=>Zotero.Items.get(attachment.parentID).getNotes().map(id=>Zotero.Items.get(id)).filter(n=>!n.deleted&&n.getNote().includes('zma-summary://'+scope.libraryID+'/'+scope.attachmentKey)).length;
      try{
        host.readingAuto=false;manager.cancelAutomatic();
        state.conversations=[make('summaryone',1),make('summarytwo',2)];state.activeConversationId='summaryone';
        client.fetch=async(url,options)=>{
          if(!url.endsWith('/responses'))throw Error('Unexpected offline endpoint');
          const body=JSON.parse(options.body),parts=body.input.flatMap(m=>m.content||[]);
          if(parts.some(p=>p.type!=='input_text')||body.tools||body.service_tier!=='default'||body.reasoning&&body.reasoning.effort!=='low')throw Error('Summary request included files, images, tools or Fast tier');
          if(!body.instructions.includes('完整段落')||!parts.some(p=>p.text.includes('newDialogue')))throw Error('Summary prompt or textual incremental input missing');
          calls++;
          return new win.Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify({changed:true,text:answer})})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{service_tier:'default'}})+'\n\n');
        };
        host.selectedClient=()=>client;
        await manager.update(reader);
        if(calls!==2||state.readingSummary.remaining||state.readingSummary.pendingText)throw Error('Cross-conversation incremental publication failed: '+JSON.stringify(state.readingSummary));
        const record=state.readingSummary,note=Zotero.Items.getByLibraryAndKey(scope.libraryID,record.noteKey),html=note?.getNote();
        if(!note||note.parentID!==attachment.parentID||!html.includes('class="math"')||!html.includes('$$J=')||!html.includes('zma-summary://'))throw Error('Native note scope or native math source missing');
        panel.showReadingSummary();
        if(panel.readingView.querySelectorAll('math').length!==2||panel.readingView.querySelector('.zma-reading-note h3')?.textContent!=='正则性的作用')throw Error('Sidebar summary Markdown/MathML failed');
        const before=calls;await manager.update(reader);if(calls!==before)throw Error('Unchanged Q&A triggered inference');
        const beforeCount=noteCount(),recovery=await host.publishReadingSummary(reader,answer,{...record,noteKey:null,noteHTML:''});
        if(recovery.noteKey!==note.key||noteCount()!==beforeCount)throw Error('Native canonical HTML did not recover a saved note');
        state.conversations[0].history.push(...pair(3));host.readingAuto=true;manager.delay=30;manager.schedule(reader);
        for(let i=0;i<200&&(calls<before+1||manager.active||manager.timers.size);i++)await new Promise(r=>setTimeout(r,20));
        if(calls!==before+1||state.readingSummary.processed.length<3)throw Error('Idle update did not process new Q&A');
        host.readingAuto=false;manager.cancelAutomatic();
        note.setNote(note.getNote().replace('</div>','<p>人工补充</p></div>'));await note.saveTx();
        state.conversations[1].history.push(...pair(4));await manager.update(reader);
        if(record.pendingReason!=='manual-edit'||!record.pendingText||!note.getNote().includes('人工补充'))throw Error('Manual edit protection failed');
        const oldKey=note.key;await manager.apply(reader);
        if(record.noteKey===oldKey||record.pendingText||!note.getNote().includes('人工补充')||noteCount()!==beforeCount+1)throw Error('Explicit new version did not retain manual note');
        panel.close();panel.open();if(panel.readingView.hidden||!panel.readingView.textContent.includes('正则性'))throw Error('Reopen did not read local summary');
        await host.openReadingSummary(reader);
        return {crossConversation:true,incrementalTextOnly:true,unchangedSkipsInference:true,idleUpdate:true,nativeNote:true,nativeMathSource:true,sidebarMath:true,manualEditProtected:true,newVersionRetainsOriginal:true,canonicalPublicationRecovery:true,reopenUsesLocal:true,coldRestored:seed.launch>1,openedNativeNote:true,noExternalApiCalls:true,calls};
      }finally{
        manager.cancelAutomatic();host.readingAuto=automatic;manager.delay=delay;host.selectedClient=selectedClient;client.fetch=fetch;
        state.conversations=conversations;state.activeConversationId=activeID;await host.save(reader,state);panel.showChat();
      }
    });
'''
point = '    await host.store.flush();'
assert bootstrap.count(point) == 1
bootstrap = bootstrap.replace(point, insertion + '\n' + point)
subprocess.run(['node', '--check'], input=bootstrap, text=True, encoding='utf-8', check=True, capture_output=True)
with zipfile.ZipFile(qa, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', manifest)
    archive.writestr('bootstrap.js', bootstrap)
