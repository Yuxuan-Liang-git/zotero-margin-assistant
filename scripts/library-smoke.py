"""Prepare isolated real SQLite/SDT and unread-paper acceptance. Inference stays mocked."""
import argparse
from pathlib import Path
import subprocess
import sys
import zipfile
import shutil

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/memory-smoke.py'), '--run-name', args.run_name], check=True)
work = project / 'evidence' / args.run_name

# Use a real, multi-page, text-layer PDF. This fixture has never been given a
# conversation sidecar. A last-page token proves full-document coverage.
fixture = r'''
const fs=require('node:fs');const {PDFDocument,StandardFonts}=require('pdf-lib');
(async()=>{const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=0;i<5;i++){const page=pdf.addPage([600,800]);page.drawText('Personal library real PDF page '+(i+1),{x:50,y:720,size:14,font});page.drawText(i===4?'LibraryUnreadNeedle guarantees full-tail excitation.':'Ordinary observer discussion.',{x:50,y:680,size:12,font});}
fs.writeFileSync(process.argv[1],await pdf.save());})();
'''
subprocess.run(['node', '-e', fixture, str(work / 'unread-paper.pdf')], check=True)
qa = work / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
version = __import__('json').loads((project / 'package.json').read_text(encoding='utf-8'))['version']
shutil.copy2(project / f'dist/margin-comments-deepseek-{version}.xpi', work / 'assistant-under-test.xpi')
install = r'''
    const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    let installed=await AddonManager.getAddonByID('margin-comments@local.zotero');
    if(!installed){
      const packageFile=Zotero.File.pathToFile(PathUtils.join(work,'assistant-under-test.xpi'));
      const pending=await AddonManager.getInstallForFile(packageFile);await pending.install();
      installed=await AddonManager.getAddonByID('margin-comments@local.zotero');
    }
    report.assistantInstall={version:installed?.version,active:installed?.isActive};await write();
'''
point = '    let addon;for(let i=0;i<200;i++)'
assert bootstrap.count(point) == 1
bootstrap = bootstrap.replace(point, install + '\n' + point)
insertion = r'''
    await check('personal-library-memory-native',async()=>{
      const memory=host.memory,papers=memory?.papers;if(!papers)throw Error('Personal-library module unavailable');
      const libraryID=Zotero.Libraries.userLibraryID,scopeA=host.scope(reader),stateA=await host.load(reader),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      await papers.ensure();const restored=papers.status();
      if(seed.launch>1&&restored.total<3)throw Error('Personal-library SQLite catalog not restored');
      if(!seed.libraryAttachmentID){
        const parent=new Zotero.Item('journalArticle');parent.libraryID=libraryID;parent.setField('title','Unread Library Observer QA');parent.setField('abstractNote','NativeAbstractNeedle explains an observer condition.');parent.setField('date','2025');await parent.saveTx();
        const attachment=new Zotero.Item('attachment');attachment.libraryID=libraryID;attachment.parentID=parent.id;attachment.setField('title','Unread PDF version one');attachment.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;attachment.attachmentPath=PathUtils.join(work,'unread-paper.pdf');attachment.attachmentContentType='application/pdf';await attachment.saveTx();
        const version=new Zotero.Item('attachment');version.libraryID=libraryID;version.parentID=parent.id;version.setField('title','Unread PDF version two');version.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;version.attachmentPath=PathUtils.join(work,'unread-paper.pdf');version.attachmentContentType='application/pdf';await version.saveTx();
        const note=new Zotero.Item('note');note.libraryID=libraryID;note.parentID=parent.id;note.setNote('<div data-schema-version="9"><p>NativeNoteNeedle explains the excitation condition and its assumptions.</p></div>');await note.saveTx();
        const mark=new Zotero.Item('annotation');mark.libraryID=libraryID;mark.parentID=attachment.id;mark.annotationType='highlight';mark.annotationText='NativeMarkNeedle is an important source passage.';mark.annotationComment='A local margin interpretation.';mark.annotationColor='#ffd400';mark.annotationPageLabel='2';mark.annotationSortIndex='00001|000000|00000';mark.annotationPosition=JSON.stringify({pageIndex:1,rects:[[50,670,450,700]]});await mark.saveTx();
        const only=new Zotero.Item('journalArticle');only.libraryID=libraryID;only.setField('title','Metadata-only QA article');only.setField('abstractNote','MetadataOnlyNeedle gives an identifiability condition.');await only.saveTx();
        const collections=[];for(const name of ['Library memory QA one','Library memory QA two']){const c=new Zotero.Collection();c.libraryID=libraryID;c.name=name;await c.saveTx();collections.push(c.id);}parent.setCollections(collections);await parent.saveTx();
        Object.assign(seed,{libraryParentID:parent.id,libraryAttachmentID:attachment.id,libraryVersionID:version.id,libraryNoteID:note.id,libraryMarkID:mark.id,libraryOnlyID:only.id});
      }
      const parent=Zotero.Items.get(seed.libraryParentID),attachment=Zotero.Items.get(seed.libraryAttachmentID),version=Zotero.Items.get(seed.libraryVersionID),note=Zotero.Items.get(seed.libraryNoteID);
      const scopeB=host.scope({itemID:attachment.id}),name='margin-comments-assistant-'+libraryID+'-'+attachment.key+'.json';
      const absentHistory=async()=>!await IOUtils.exists(PathUtils.join(work,name))&&!await IOUtils.exists(PathUtils.join(host.directory,libraryID+'-'+attachment.key+'.json'));
      if(!await absentHistory())throw Error('Unread paper unexpectedly has a plugin history');
      const nativePack=await Zotero.SDT.getPack(attachment.id,{isPriority:false});if(!nativePack.ok)throw Error('Real native PDF worker did not produce SDT: '+JSON.stringify(nativePack));
      const nativeReader=await Zotero.SDT.getReader(attachment.id),catalog=await nativeReader.getCatalog();if(catalog.pages.length!==5)throw Error('Native SDT catalog page count changed');
      // Only remove derived caches belonging to this isolated fixture. This
      // ensures the normal index route exercises page-aware SDT rather than
      // Zotero's optional page-less plain cache on either launch.
      for(const item of [attachment,version]){
        const cache=Zotero.Fulltext.getItemCacheFile(item).path;
        if(!cache.startsWith(PathUtils.join(work,'data')))throw Error('QA cache escaped isolated data directory');
        if(await IOUtils.exists(cache))await IOUtils.remove(cache);
      }
      await memory.rebuild(libraryID);
      const matches=await memory.retrieve(scopeA,'LibraryUnreadNeedle',{question:'LibraryUnreadNeedle'}),source=matches.find(s=>s.version===2&&s.kind==='pdf'&&s.paperKey===parent.key);
      if(!source||source.pageIndex!==4||!source.text.includes('LibraryUnreadNeedle'))throw Error('Unread last-page passage was not retrieved: '+JSON.stringify(matches));
      const units=await papers.index.units(parent.key);if(units.filter(u=>u.kind==='pdf').length!==2)throw Error('PDF versions were merged');
      if((await papers.index.papers()).filter(p=>p.key===parent.key).length!==1)throw Error('Collection membership duplicated the paper');
      const panel=await host.panel(reader),conversations=stateA.conversations,active=stateA.activeConversationId,panelID=panel.conversationId,draft=panel.question.value,selected=host.selectedClient,choose=host.chooseConversationFile;
      const temporary={...conversations[0],id:'unread-library-qa',title:'Unread QA',history:[],draft:'',summary:'',summaryThrough:0};
      stateA.conversations=[temporary];stateA.activeConversationId=temporary.id;panel.conversationId=temporary.id;panel.showChat();panel.renderMessages();
      const requests=[];let target;
      try{
        host.selectedClient=()=>({generate:async(messages,options)=>{requests.push(messages);options.onDelta?.('Local paper explanation[阅读1]。');return 'Local paper explanation[阅读1]。';}});
        panel.question.value='LibraryUnreadNeedle';await panel.send();
        if(requests.length!==1||!JSON.stringify(requests).includes('LibraryUnreadNeedle guarantees full-tail excitation.'))throw Error('Normal question omitted unread PDF text');
        const answer=temporary.history.at(-1);if(!answer.memorySources?.some(s=>s.version===2&&s.kind==='pdf'))throw Error('New provenance did not persist in assistant message');
        if(seed.launch===1){conversations[0].history.push({role:'user',content:'Personal library provenance QA',materials:[]},JSON.parse(JSON.stringify(answer)));}
        else if(!conversations.some(c=>c.history.some(m=>m.memorySources?.some(s=>s.version===2))))throw Error('New provenance did not survive cold restart');
        await memory.openSource(source);
        target=Zotero.Reader._readers.find(r=>Number(r.itemID)===Zotero.Items.getByLibraryAndKey(libraryID,source.attachmentKey).id);if(!target)throw Error('Source PDF reader did not open');
        let page=-1;for(let i=0;i<100;i++){page=host.unwrap(target._internalReader)._state.primaryViewState?.pageIndex;if(page===4)break;await pause(50);}if(page!==4)throw Error('Source did not navigate to PDF page five: '+page);
        const noteSource=(await memory.retrieve(scopeA,'NativeNoteNeedle')).find(s=>s.kind==='note');if(!noteSource||noteSource.sourceKey!==note.key)throw Error('Native note identity missing');
        const actual=note.getNote();try{note.setNote(actual+'<p>Changed note QA</p>');await note.saveTx();const after=await memory.retrieve(scopeA,'NativeNoteNeedle');if(after.some(s=>s.kind==='note'))throw Error('Changed note source was reused');}finally{note.setNote(actual);await note.saveTx();}
        const markSource=(await memory.retrieve(scopeA,'NativeMarkNeedle')).find(s=>s.kind==='annotation');if(!markSource||markSource.pageIndex!==1||markSource.sourceKey!==Zotero.Items.get(seed.libraryMarkID).key)throw Error('Annotation provenance missing');
        const metadata=(await memory.retrieve(scopeA,'MetadataOnlyNeedle')).find(s=>s.kind==='metadata');if(!metadata||metadata.attachmentKey!=='')throw Error('Metadata-only article was excluded');
        await memory.openSource(metadata);const pane=Zotero.getMainWindow().ZoteroPane;if(!pane.getSelectedItems().some(item=>item.id===seed.libraryOnlyID))throw Error('Metadata source did not select original item');
        await memory.rebuild(libraryID);
        const api=memory.settingsAPI();await api.pause();if(!api.state().paused)throw Error('Pause preference missing');await memory.resume();if(!api.state().paused)throw Error('Foreground resume cleared manual pause');await api.pause();
        const output=PathUtils.join(work,'library-research-notes.md');host.chooseConversationFile=async()=>output;await api.export();const text=await IOUtils.readUTF8(output);if(!text.includes('文献资料与覆盖情况')||!text.includes('Metadata-only QA article'))throw Error('Export omitted metadata-only paper');
        if(!await absentHistory())throw Error('Read-only indexing created a history sidecar');
        return {unreadPaperInNormalRequest:true,realWorkerSDT:true,realSQLite:true,lastPageLocated:true,metadataOnlyNavigation:true,noteAndAnnotationIdentity:true,changedNoteRejected:true,collectionDeduplicated:true,pdfVersionsRetained:true,noHistorySideEffects:true,manualPauseRespected:true,coverageShown:api.state().coverage.metadata>=3,metadataExport:true,coldCatalogRestored:seed.launch>1,coldProvenanceRestored:seed.launch>1,noExternalApiCalls:true,coverage:api.state().coverage};
      }finally{
        host.selectedClient=selected;host.chooseConversationFile=choose;stateA.conversations=conversations;stateA.activeConversationId=active;panel.conversationId=panelID;panel.question.value=draft;await host.save(reader,stateA);panel.renderMessages();await reader.focus();
        await memory.papers.run();
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
