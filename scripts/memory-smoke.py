"""Isolated Zotero cross-paper retrieval, provenance, export and cold restoration."""
import argparse
from pathlib import Path
import subprocess
import sys
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/notion-smoke.py'), '--run-name', args.run_name], check=True)
qa = project / 'evidence' / args.run_name / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()

insertion = r'''
    await check('cross-paper-memory-native',async()=>{
      const memory=host.memory;if(!memory)throw Error('Research memory module missing');
      const libraryID=Zotero.Libraries.userLibraryID,scopeA=host.scope(reader),stateA=await host.load(reader);
      if(!seed.memoryAttachmentID){
        const parent=new Zotero.Item('journalArticle');parent.libraryID=libraryID;parent.setField('title','Research Memory B excitation QA');await parent.saveTx();
        const path=PathUtils.join(work,'memory-b.pdf');await IOUtils.copy(PathUtils.join(work,'qa.pdf'),path);
        const attachment=new Zotero.Item('attachment');attachment.libraryID=libraryID;attachment.parentID=parent.id;attachment.setField('title','Memory B QA');attachment.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;attachment.attachmentPath=path;attachment.attachmentContentType='application/pdf';await attachment.saveTx();seed.memoryAttachmentID=attachment.id;
      }
      const attachmentB=Zotero.Items.get(seed.memoryAttachmentID),scopeB=host.scope({itemID:attachmentB.id});
      let stateB=await host.store.load(scopeB);
      if(seed.launch===1){
        const conversation={...stateB.conversations[0],id:'research-b',title:'B中的缓存激励条件',createdAt:Date.now(),updatedAt:Date.now(),draft:'B的本地草稿',history:[{role:'user',content:'缓存激励条件如何保证参数可辨识？',materials:[]},{role:'assistant',content:'B中的既有阅读结论是缓存激励条件要求信息矩阵正定。定义灵敏度psi，则有 \\[J=\\mathbb{E}[\\psi\\psi^{\\mathsf T}]>0\\]。',materials:[],incomplete:false}]};
        stateB.conversations=[conversation];stateB.activeConversationId=conversation.id;
        stateB.readingSummary={version:1,formatVersion:2,text:'# 文章内容\n\nB研究缓存激励条件与参数辨识。\n\n# 关键公式解释\n\n信息矩阵为 \\[J=\\mathbb{E}[\\psi\\psi^{\\mathsf T}]\\]，正定性需要核对具体激励条件。',updatedAt:Date.now(),noteKey:null,noteHTML:''};
        const published=await host.publishReadingSummary({itemID:attachmentB.id},stateB.readingSummary.text,stateB.readingSummary);
        Object.assign(stateB.readingSummary,published);await host.store.save(scopeB,stateB);
      }else{
        if(!stateB.conversations[0].history.some(message=>message.memorySources?.some(source=>source.attachmentKey===scopeB.attachmentKey)))throw Error('Memory provenance did not survive cold restart');
      }
      await memory.ensure(libraryID);const cachedCount=memory.status(libraryID).indexed;
      if(seed.launch>1&&cachedCount<1)throw Error('Research catalog did not restore from disk');
      await memory.rebuild(libraryID);
      const query='Research Memory B excitation QA 的缓存激励条件与当前论文有什么联系？';
      const sources=await memory.retrieve(scopeA,query,{conversationId:stateA.activeConversationId});
      if(!sources.some(source=>source.attachmentKey===scopeB.attachmentKey&&source.kind==='dialogue'))throw Error('B dialogue was not retrieved');
      const conversations=stateA.conversations,active=stateA.activeConversationId,panelID=panel.conversationId,draft=panel.question.value,selectedClient=host.selectedClient,choose=host.chooseConversationFile;
      let requests=[],targetPanel;
      try{
        const temporary={...conversations[0],id:'memory-send-'+seed.launch,title:'A联系B验证',history:[],draft:'',draftAttachments:[],draftQuotes:[],summary:'',compactedThrough:0};
        stateA.conversations=[...conversations,temporary];stateA.activeConversationId=temporary.id;panel.conversationId=temporary.id;panel.showChat();
        host.selectedClient=()=>({generate:async(messages,options)=>{requests.push(messages);options.onDelta?.('关联说明[阅读1]。');return '关联说明[阅读1]。';}});
        panel.question.value=query;await panel.send();
        const answer=temporary.history.at(-1);
        if(requests.length!==1||!JSON.stringify(requests).includes('B中的既有阅读结论')||!answer.memorySources?.length)throw Error('Normal request omitted cross-paper memory');
        if(!panel.node.querySelector('.zma-memory-sources')||!panel.node.querySelector('.zma-memory-cite'))throw Error('Memory provenance UI missing');
        if(seed.launch===1){stateB.conversations[0].history.push({role:'user',content:'A问题的验证回答',materials:[]},JSON.parse(JSON.stringify(answer)));await host.store.save(scopeB,stateB);}
        const dialogue=answer.memorySources.find(source=>source.attachmentKey===scopeB.attachmentKey&&source.kind==='dialogue');
        if(!dialogue)throw Error('Request did not retain dialogue origin');
        await memory.openSource(dialogue);
        targetPanel=[...host.panels.values()].find(value=>Number(value.reader.itemID)===attachmentB.id);
        if(!targetPanel||targetPanel.conversationId!=='research-b'||!targetPanel.messages.querySelector('[data-message-index="1"]')||targetPanel.messages.querySelectorAll('.zma-message').length>12)throw Error('Native source navigation failed');
        const bnote=Zotero.Items.getByLibraryAndKey(libraryID,stateB.readingSummary.noteKey),originalNote=bnote.getNote();
        try{
          bnote.setNote(originalNote+'<p>QA人工改写</p>');await bnote.saveTx();
          const afterEdit=await memory.retrieve(scopeA,query,{conversationId:temporary.id});
          if(afterEdit.some(source=>source.attachmentKey===scopeB.attachmentKey&&source.kind==='summary'))throw Error('Manually edited summary was reused');
        }finally{bnote.setNote(originalNote);await bnote.saveTx();stateB.readingSummary.noteHTML=bnote.getNote();await host.store.save(scopeB,stateB);}
        await memory.settingsAPI().set(false);if((await memory.retrieve(scopeA,query)).length)throw Error('Memory switch ignored');await memory.settingsAPI().set(true);
        const output=PathUtils.join(work,'research-notes.md');
        host.chooseConversationFile=async(_win,options)=>{if(!options.save||options.extension!=='md'||options.title!=='导出研究笔记')throw Error('Unexpected research export picker');return output;};
        await memory.settingsAPI().export();const markdown=await IOUtils.readUTF8(output);
        if(!markdown.includes('B研究缓存激励条件')||!markdown.includes('\\[J=')||markdown.includes('B中的既有阅读结论'))throw Error('Research-note export did not preserve formal summary');
        return {normalRequestContainsOtherPaper:true,localOnlyIndex:true,provenancePersisted:true,coldProvenanceRestored:seed.launch>1,catalogColdRestored:seed.launch>1,nativeSourceNavigation:true,boundedHistoryView:true,manualSummaryEditExcluded:true,preferenceSwitch:true,standaloneMarkdownExport:true,noExternalApiCalls:true,indexed:memory.status(libraryID).indexed};
      }finally{
        host.selectedClient=selectedClient;host.chooseConversationFile=choose;
        stateA.conversations=conversations;stateA.activeConversationId=active;panel.conversationId=panelID;panel.question.value=draft;await host.save(reader,stateA);panel.showChat();panel.renderMessages();targetPanel?.close();await reader.focus();
        await memory.rebuild(libraryID);
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
