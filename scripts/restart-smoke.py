"""Prepare once; subsequent launches reuse the same profile, data and installed XPIs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--run-name',required=True)
args=parser.parse_args()
if not args.run_name.replace('-','').isalnum():raise ValueError('Unsafe run name')
work=project/'evidence'/args.run_name
if work.exists():raise RuntimeError('Use a fresh run name; never replace XPIs between restart checks')
profile=work/'profile';data=work/'data'
(profile/'extensions').mkdir(parents=True);data.mkdir()
version=json.loads((project/'package.json').read_text())['version']
xpi=project/f'dist/margin-comments-deepseek-{version}.xpi'
shutil.copy2(xpi,profile/'extensions/margin-comments@local.zotero.xpi')
package_hash=hashlib.sha256(xpi.read_bytes()).hexdigest()
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun':False,'extensions.zotero.firstRun2':False,'extensions.zotero.integration.autoInstall':False,'extensions.zotero.sync.autoSync':False,'extensions.zotero.automaticScraperUpdates':False,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.update.enabled':False,'app.update.auto':False,'datareporting.policy.dataSubmissionEnabled':False}
prefs.update({'extensions.zoteroWinWordIntegration.skipInstallation':True,'extensions.zoteroOpenOfficeIntegration.skipInstallation':True})
(profile/'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+', '+json.dumps(v)+');' for k,v in prefs.items()),encoding='utf-8')
bootstrap=r'''
function install(){}
function uninstall(){}
function shutdown(){}
function startup(_data,reason){setTimeout(()=>run(reason),250);}
async function run(reason){
  const work=__WORK__,seedFile=PathUtils.join(work,'seed.json');let seed,report;
  try{
    await IOUtils.writeUTF8(PathUtils.join(work,'entered.json'),JSON.stringify({reason,process:Services.appinfo.processID}));
    await Zotero.initializationPromise;await Zotero.uiReadyPromise;
    await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item');
    if(Zotero.DataDirectory.dir!==__DATA__)throw new Error('Isolation guard failed');
    seed=await IOUtils.exists(seedFile)?JSON.parse(await IOUtils.readUTF8(seedFile)):{launch:0};seed.launch++;
    report={zotero:Zotero.version,packageVersion:__VERSION__,packageSha256:__HASH__,launch:seed.launch,reason,process:Services.appinfo.processID,steps:[],api:'mock only; no request sent'};
    const output=PathUtils.join(work,'report-launch-'+seed.launch+'.json'),write=()=>IOUtils.writeUTF8(output,JSON.stringify(report,null,2));await write();
    const check=async(name,fn)=>{try{report.steps.push({name,ok:true,result:await fn()});}catch(e){report.steps.push({name,ok:false,error:String(e),stack:e.stack});}await write();};
    let addon;for(let n=0;n<200;n++){addon=Zotero.MarginComments;if(addon?.assistant?.running)break;await new Promise(r=>setTimeout(r,50));}
    if(!addon?.assistant?.running)throw new Error('Assistant failed to start');
    const host=addon.assistant;
    const timer=setInterval(()=>{const snapshot={phase:report.phase,readers:Zotero.Reader._readers.map(r=>({id:r.itemID,type:r.type,frame:!!r._iframeWindow,internal:!!r._internalReader,primary:!!r._internalReader?._primaryView,toolbar:r._iframeWindow?.document.querySelectorAll('.zma-toolbar').length})),errors:[...Services.console.getMessageArray()].map(m=>m.message).filter(m=>/Error|Exception|error/i.test(m)).slice(-8)};void IOUtils.writeUTF8(PathUtils.join(work,'diagnostic.json'),JSON.stringify(snapshot,null,2));},1000);
    if(!seed.textID){
      const link=async(path,title)=>{const item=new Zotero.Item('attachment');item.libraryID=Zotero.Libraries.userLibraryID;item.setField('title',title);item.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;item.attachmentContentType='application/pdf';item.attachmentPath=path;await item.saveTx();await Zotero.Items.getAsync(item.id);return item.id;};
      seed.scanID=await link(__SCAN__,'Scan QA');seed.textID=await link(__TEXT__,'Automatic PDF context QA');await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));
      report.phase='open-scan';await write();const scanReader=await Zotero.Reader.open(seed.scanID);report.phase='scan-init';await write();await scanReader._initPromise;
      report.phase='scan-context';await write();await check('scan-automatic-current-page',async()=>{const context=await host.documentContext(scanReader,'解释当前页');if(context.mode!=='current-page-image'||!context.material?.dataURL)throw new Error('Scan did not get automatic screenshot');return {mode:context.mode,imageWidth:context.material.width,manualMaterials:0};});
      await Zotero.Reader.open(seed.textID);
    }
    let reader;for(let n=0;n<200;n++){reader=Zotero.Reader._readers.find(r=>r.itemID===seed.textID);if(reader)break;await new Promise(r=>setTimeout(r,50));}
    if(!reader)throw new Error('Saved selected PDF tab was not restored');await reader._initPromise;
    await check('native-display-math-line-break',async()=>{const node=reader._iframeWindow.document.createElement('div');addon.bridge.renderMathPreview(node,'$$\\frac{\\partial e}{\\partial\\theta}=-\\frac{\\partial H}{\\partial\\theta}u \\\\\n\\frac{\\partial H}{\\partial\\theta}u$$');const rows=node.querySelectorAll('math mtable mtr').length;if(rows!==2)throw new Error('Expected two display math rows; got '+rows);return {rows};});
    await check('restored-reader-toolbar',async()=>{let button;for(let n=0;n<200;n++){button=reader._iframeWindow?.document.querySelector('.zma-toolbar');if(button)break;await new Promise(r=>setTimeout(r,50));}if(!button)throw new Error('DeepSeek button missing on restored reader');button.click();let panel;for(let n=0;n<200;n++){panel=host.panels.get(reader);if(panel&&!panel.node.hidden)break;await new Promise(r=>setTimeout(r,30));}if(!panel||panel.node.hidden||!panel.node.isConnected)throw new Error('Restored toolbar did not open sidebar');if(seed.launch>1&&panel.question.value!=='待续的追问')throw new Error('Saved draft not restored');return {readerID:reader.itemID,buttonCount:reader._iframeWindow.document.querySelectorAll('.zma-toolbar').length,panelVisible:true,draftRestored:seed.launch>1};});
    const panel=await host.panel(reader);host.client={generate:async(messages,{onDelta})=>{const text=messages.at(-1).content.filter(p=>p.type==='text').map(p=>p.text).join('\n');if(!text.includes('PMSM PARAMETER IDENTIFICATION')||!text.includes('CONCLUSION EXCITATION CANCELS BIAS'))throw new Error('Automatic context lacks first or unseen last page');onDelta('## 文档已自动读取\n\n**三页材料完整提供。**');return '## 文档已自动读取\n\n**三页材料完整提供。**';}};
    await check('enter-sends-pdf-without-manual-material',async()=>{panel.materials=[];panel.question.value='当前这篇论文讲了什么';const before=panel.conversation().history.length,event=new reader._iframeWindow.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});panel.question.dispatchEvent(event);for(let n=0;n<400;n++){if(!panel.busy&&panel.conversation().history.length===before+2)break;await new Promise(r=>setTimeout(r,25));}if(panel.conversation().history.length!==before+2||panel.conversation().history.at(-1).incomplete)throw new Error('Enter/automatic PDF failed: '+panel.status.textContent);if(!event.defaultPrevented)throw new Error('Enter default newline not prevented');return {manualMaterials:0,context:panel.contextInfo.textContent,markdown:!!panel.messages.lastElementChild.querySelector('h2'),complete:true};});
    await check('toolbar-rebuild-and-reopen',async()=>{panel.close();reader._iframeWindow.document.querySelectorAll('.zma-toolbar').forEach(b=>b.remove());await new Promise(r=>setTimeout(r,300));const buttons=reader._iframeWindow.document.querySelectorAll('.zma-toolbar');if(buttons.length!==1)throw new Error('Rebuilt toolbar not restored once');buttons[0].click();await new Promise(r=>setTimeout(r,150));if(panel.node.hidden)throw new Error('Rebuilt button cannot reopen');return {buttons:buttons.length,reopened:true};});
    await check('native-margin-image-note-and-local-copy',async()=>{
      if(!seed.imageAnnotation){const item=await Zotero.Annotations.saveFromJSON(Zotero.Items.get(seed.textID),{key:Zotero.DataObjectUtilities.generateKey(),type:'note',color:'#2ea8e5',pageLabel:'1',sortIndex:'00000|000010|00000',comment:'图片说明',position:{pageIndex:0,rects:[[400,650,422,672]]}});seed.imageAnnotation=item.key;}
      const session=await addon.controller.ensureSession(reader);session.forcedKeys.add(seed.imageAnnotation);await session.refresh(true);
      let runtime;for(let n=0;n<150;n++){runtime=session.cardRuntimes().find(r=>r.annotation.key===seed.imageAnnotation);if(runtime?.referenceRoot)break;await new Promise(r=>setTimeout(r,30));}if(!runtime)throw new Error('Native image target card missing');
      let state=await host.load(reader);if(!state.images?.length){host.chooseImage=async()=>__IMAGE__;runtime.card.querySelector('.zma-insert-image')?.click();for(let n=0;n<200;n++){if(state.images?.length)break;await new Promise(r=>setTimeout(r,30));}}
      if(state.images?.length!==1)throw new Error('Image button did not persist exactly one image');
      const record=state.images[0];await host.store.flush();await host.syncReferences(session,runtime);await new Promise(r=>setTimeout(r,500));
      const img=runtime.referenceRoot.querySelector('.zma-inline-image img');if(!img?.naturalWidth)throw new Error('Saved image not visible in native margin');
      const note=Zotero.Items.getByLibraryAndKey(host.scope(reader).libraryID,record.noteKey),embedded=Zotero.Items.getByLibraryAndKey(note.libraryID,record.noteImageKey);if(!note.isNote()||embedded.parentID!==note.id||!note.getNote().includes('data-attachment-key="'+record.noteImageKey+'"'))throw new Error('Native embedded image relationship invalid');
      const exportHTML=await Zotero.Notes.getExportableNote(note);if(!exportHTML.includes('src="data:image/png;base64,'))throw new Error('Native Zotero note does not resolve its embedded image');
      const copy=PathUtils.join(PathUtils.parent(await Zotero.Items.get(seed.textID).getFilePathAsync()),'margin-comments-images',record.fileName),original=await IOUtils.read(__IMAGE__),bytes=await IOUtils.read(copy);if(bytes.length!==original.length||bytes.some((v,i)=>v!==original[i]))throw new Error('PDF-directory image copy differs from original');
      const onDisk=JSON.parse(await IOUtils.readUTF8(PathUtils.join(host.directory,host.scope(reader).libraryID+'-'+host.scope(reader).attachmentKey+'.json')));if(onDisk.images.length!==1||onDisk.images[0].noteKey!==note.key)throw new Error('Image association not on disk');
      return {imageWidth:img.naturalWidth,nativeNote:note.key,nativeEmbeddedImage:embedded.key,localCopyBytes:bytes.length,diskAssociation:true,restoredAfterRestart:seed.launch>1,noteExportImage:true};
    });
    panel.question.value='待续的追问';panel.conversation().draft=panel.question.value;await panel.persist();await Zotero.Session.save();await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));report.done=true;await write();clearInterval(timer);
  }catch(e){if(report){report.fatal={error:String(e),stack:e.stack};await IOUtils.writeUTF8(PathUtils.join(work,'report-launch-'+seed.launch+'.json'),JSON.stringify(report,null,2));}else await IOUtils.writeUTF8(PathUtils.join(work,'fatal.json'),JSON.stringify({error:String(e),stack:e.stack}));}
  finally{Services.startup.quit(Services.startup.eForceQuit);}
}
'''
for token,value in {'__WORK__':str(work),'__DATA__':str(data),'__VERSION__':version,'__HASH__':package_hash,'__SCAN__':str(project/'evidence/scanned-page-100.pdf'),'__TEXT__':str(project/'evidence/text-paper-fixture.pdf'),'__IMAGE__':str(project/'evidence/note-image-fixture.png')}.items():bootstrap=bootstrap.replace(token,json.dumps(value,ensure_ascii=True))
manifest={'manifest_version':2,'name':'ZMA isolated restart QA','version':'1.0','applications':{'zotero':{'id':'zma-restart-qa@local.zotero','strict_min_version':'10.0','strict_max_version':'10.0.*','update_url':'https://updates.invalid/restart-qa.json'}}}
with zipfile.ZipFile(profile/'extensions/zma-restart-qa@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as archive:archive.writestr('manifest.json',json.dumps(manifest));archive.writestr('bootstrap.js',bootstrap)
print(json.dumps({'profile':str(profile),'data':str(data),'sha256':package_hash}))
