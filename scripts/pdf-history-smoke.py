"""Prepare an isolated Zotero profile for PDF-side history and Zotero library entry cold restarts."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
if not args.run_name.replace('-', '').isalnum():
    raise ValueError('Unsafe QA name')
work = project / 'evidence' / args.run_name
if work.exists():
    raise RuntimeError('Use a fresh run name; never replace the installed QA package')
profile, data = work / 'profile', work / 'data'
(profile / 'extensions').mkdir(parents=True)
data.mkdir()
shutil.copy2(project / 'evidence/text-paper-fixture.pdf', work / 'qa.pdf')
version = json.loads((project / 'package.json').read_text(encoding='utf-8'))['version']
package = project / f'dist/margin-comments-deepseek-{version}.xpi'
shutil.copy2(package, profile / 'extensions/margin-comments@local.zotero.xpi')
package_hash = hashlib.sha256(package.read_bytes()).hexdigest()
prefs = {
    'extensions.zotero.useDataDir': True, 'extensions.zotero.dataDir': str(data),
    'extensions.zotero.firstRun': False, 'extensions.zotero.firstRun2': False,
    'extensions.zotero.integration.autoInstall': False, 'extensions.zotero.sync.autoSync': False,
    'extensions.zotero.automaticScraperUpdates': False, 'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 15, 'extensions.update.enabled': False,
    'app.update.auto': False, 'datareporting.policy.dataSubmissionEnabled': False,
    'extensions.zoteroWinWordIntegration.skipInstallation': True,
    'extensions.zoteroOpenOfficeIntegration.skipInstallation': True,
}
(profile / 'user.js').write_text('\n'.join('user_pref(' + json.dumps(k) + ', ' + json.dumps(v) + ');' for k, v in prefs.items()), encoding='utf-8')
bootstrap = r'''
function install(){}
function uninstall(){}
function shutdown(){}
function startup(){setTimeout(()=>run(),250);}
async function run(){
  const work=__WORK__,data=__DATA__,seedFile=PathUtils.join(work,'seed.json');
  let seed={launch:0},report={packageVersion:__VERSION__,packageSha256:__HASH__,steps:[]};
  const write=async()=>IOUtils.writeUTF8(PathUtils.join(work,'report-'+(seed.launch||'fatal')+'.json'),JSON.stringify(report,null,2));
  const check=async(name,fn)=>{try{report.steps.push({name,ok:true,result:await fn()});}catch(e){report.steps.push({name,ok:false,error:String(e),stack:e.stack});}await write();};
  try{
    await Zotero.initializationPromise;await Zotero.uiReadyPromise;
    await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item');
    if(Zotero.DataDirectory.dir!==data)throw new Error('Isolation guard failed');
    if(await IOUtils.exists(seedFile))seed=JSON.parse(await IOUtils.readUTF8(seedFile));
    seed.launch++;report.launch=seed.launch;report.process=Services.appinfo.processID;report.zotero=Zotero.version;await write();
    let addon;for(let i=0;i<200;i++){addon=Zotero.MarginComments;if(addon?.assistant?.running)break;await new Promise(r=>setTimeout(r,50));}
    if(!addon?.assistant?.running)throw new Error('Assistant did not start');
    const host=addon.assistant,legacy={version:1,sources:[],references:[],history:[{role:'user',content:'旧问题',materials:[]},{role:'assistant',content:'旧回答',materials:[]}],draft:'旧草稿',images:[],imageNoteKey:null};
    if(!seed.attachmentID){
      const parent=new Zotero.Item('journalArticle');parent.libraryID=Zotero.Libraries.userLibraryID;parent.setField('title','PDF history QA');await parent.saveTx();seed.parentID=parent.id;
      const item=new Zotero.Item('attachment');item.libraryID=Zotero.Libraries.userLibraryID;item.parentID=parent.id;item.setField('title','Conversation migration QA');
      item.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;item.attachmentContentType='application/pdf';item.attachmentPath=__PDF__;await item.saveTx();
      seed.attachmentID=item.id;const path=PathUtils.join(host.directory,item.libraryID+'-'+item.key+'.json');
      await IOUtils.makeDirectory(host.directory,{ignoreExisting:true});await IOUtils.writeUTF8(path,JSON.stringify(legacy));
      await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));
    }
    let reader=await Zotero.Reader.open(seed.attachmentID);for(let i=0;i<200&&!reader;i++){await new Promise(r=>setTimeout(r,50));reader=Zotero.Reader._readers.find(r=>r.itemID===seed.attachmentID);}if(!reader)throw new Error('QA reader was not restored');await reader._initPromise;
    const panel=await host.panel(reader);panel.open();
    await check('v1-migration-and-conversation-switch',async()=>{
      if(seed.launch===1){
        if(panel.state.conversations.length!==1||panel.conversation().history[1]?.content!=='旧回答'||panel.question.value!=='旧草稿')throw new Error('Legacy chat not loaded');
        await panel.newConversation();
        if(panel.state.conversations.length!==2||panel.conversation().history.length||panel.question.value)throw new Error('New chat did not start blank');
        const second=panel.conversation();second.history.push({role:'user',content:'新问题',materials:[]},{role:'assistant',content:'新回答',materials:[]});panel.question.value='新草稿';second.draft='新草稿';
        await panel.persist();await panel.switchConversation('default');
      }
      if(panel.state.conversations.length!==2||panel.conversation().history[1]?.content!=='旧回答'||panel.question.value!=='旧草稿')throw new Error('Original chat not restored');
      const next=panel.state.conversations.find(c=>c.id!=='default');await panel.switchConversation(next.id);
      if(panel.conversation().history[1]?.content!=='新回答'||panel.question.value!=='新草稿')throw new Error('Second chat not restored');
      await panel.switchConversation('default');
      const scope=host.scope(reader),name=scope.libraryID+'-'+scope.attachmentKey+'.json',path=await host.pdfStatePath(name),oldPath=PathUtils.join(host.directory,name);
      const backup=await IOUtils.readUTF8(path+'.v1.bak'),saved=JSON.parse(await IOUtils.readUTF8(path));
      if((await IOUtils.readUTF8(oldPath))!==JSON.stringify(legacy))throw new Error('Original central history was changed');
      if(JSON.stringify(JSON.parse(backup))!==JSON.stringify(legacy)||saved.version!==2||saved.conversations.length!==2)throw new Error('Migration backup or v2 state missing');
      return {conversations:2,legacyBackup:true,oldHistory:panel.conversation().history.length,newHistory:next.history.length,restoredAfterRestart:seed.launch>1};
    });
    await check('history-child-row-opens-sidebar-list',async()=>{
      const parent=Zotero.Items.get(seed.parentID),attachment=Zotero.Items.get(seed.attachmentID);
      const notes=Zotero.Items.get(parent.getNotes()).filter(n=>host.historyTarget(n)?.id===attachment.id);
      if(notes.length!==1)throw new Error('Expected one history child note, got '+notes.length);
      const panel=await host.panel(reader);panel.close();
      await Zotero.getMainWindow().ZoteroPane.viewItems([notes[0]]);
      if(panel.node.hidden||panel.conversationList.hidden)throw new Error('Child row did not open conversation list');
      const path=await host.pdfStatePath(attachment.libraryID+'-'+attachment.key+'.json');
      if(!path.startsWith(PathUtils.parent(await attachment.getFilePathAsync())))throw new Error('History is not beside PDF');
      return {noteKey:notes[0].key,sidecar:path,opened:true,launch:seed.launch};
    });
    await check('toolbar-and-preferences',async()=>{
      let toolbar;for(let i=0;i<200;i++){toolbar=reader._iframeWindow.document.querySelector('.zma-toolbar');if(toolbar)break;await new Promise(r=>setTimeout(r,50));}
      if(!toolbar)throw new Error('DeepSeek toolbar missing');panel.close();toolbar.click();await new Promise(r=>setTimeout(r,150));
      if(panel.node.hidden)throw new Error('Toolbar cannot reopen sidebar');
      const pane=Zotero.PreferencePanes.pluginPanes.find(p=>p.id==='margin-comments-preferences');if(!pane)throw new Error('Preference pane missing');
      return {toolbar:true,panelVisible:true,preferences:true};
    });
    await host.store.flush();await Zotero.Session.save();await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));report.done=true;await write();
  }catch(e){report.fatal={error:String(e),stack:e.stack};await write();}
  finally{Services.startup.quit(Services.startup.eForceQuit);}
}
'''
for token, value in {
    '__WORK__': str(work), '__DATA__': str(data), '__VERSION__': version,
    '__HASH__': package_hash, '__PDF__': str(work / 'qa.pdf'),
}.items():
    bootstrap = bootstrap.replace(token, json.dumps(value, ensure_ascii=True))
manifest = {'manifest_version': 2, 'name': 'ZMA PDF history QA', 'version': '1.0', 'applications': {'zotero': {'id': 'zma-pdf-history-qa@local.zotero', 'strict_min_version': '10.0', 'strict_max_version': '10.0.*', 'update_url': 'https://updates.invalid/pdf-history-qa.json'}}}
with zipfile.ZipFile(profile / 'extensions/zma-pdf-history-qa@local.zotero.xpi', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', json.dumps(manifest))
    archive.writestr('bootstrap.js', bootstrap)
print(json.dumps({'profile': str(profile), 'data': str(data), 'sha256': package_hash}))
