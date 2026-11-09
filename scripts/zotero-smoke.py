"""Prepare an isolated Zotero profile to exercise the actual Gecko reader, offline."""
import json
import shutil
import zipfile
from pathlib import Path

project=Path(__file__).resolve().parent.parent
workspace=project/'evidence/zotero-smoke-v4'
profile=workspace/'profile'
data=workspace/'data'
profile.mkdir(parents=True,exist_ok=True)
data.mkdir(parents=True,exist_ok=True)
(profile/'extensions').mkdir(exist_ok=True)
version=json.loads((project/'package.json').read_text())['version']
shutil.copy2(project/f'dist/margin-comments-deepseek-{version}.xpi',profile/'extensions/margin-comments@local.zotero.xpi')
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun':False,'extensions.zotero.sync.autoSync':False,'extensions.zotero.automaticScraperUpdates':False,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.update.enabled':False,'app.update.auto':False,'browser.aboutwelcome.enabled':False,'datareporting.policy.dataSubmissionEnabled':False}
(profile/'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+', '+json.dumps(v)+');' for k,v in prefs.items()),encoding='utf-8')
bootstrap=r'''
function install() {}
function uninstall() {}
function shutdown() {}
async function startup() {
  const report={zotero:Zotero.version,harness:4,process:Services.appinfo.processID,steps:[],phase:'startup'};
  const output=__REPORT__;
  const write=()=>IOUtils.writeUTF8(output,JSON.stringify(report,null,2));
  const step=async(name,action)=>{try{const result=await action();report.steps.push({name,ok:true,result});}catch(e){report.steps.push({name,ok:false,error:String(e),stack:e.stack});}await write();};
  await write();
  setTimeout(async()=>{
    try{
      await Zotero.initializationPromise;await Zotero.uiReadyPromise;
      if(Zotero.DataDirectory.dir!==__DATA__)throw new Error('Isolation guard: wrong Zotero data directory');
      let addon;for(let n=0;n<200;n++){addon=Zotero.MarginComments;if(addon?.assistant?.running)break;await new Promise(r=>setTimeout(r,100));}
      if(!addon?.assistant)throw new Error('Assistant bootstrap did not initialize');
      report.hostRunning=addon.assistant.running;await write();
      report.phase='create-local-linked-attachment';await write();
      const attachment=new Zotero.Item('attachment');attachment.libraryID=Zotero.Libraries.userLibraryID;attachment.setField('title','Offline QA scanned page');attachment.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;attachment.attachmentContentType='application/pdf';attachment.attachmentPath=__PDF__;await attachment.saveTx();
      report.phase='create-annotation';await write();
      const annotation=await Zotero.Annotations.saveFromJSON(attachment,{key:'SMKEREG2',type:'image',color:'#ffd400',pageLabel:'100',sortIndex:'00000|000010|00000',comment:'',position:{pageIndex:0,rects:[[30,250,350,550]]}});
      report.phase='open-reader';await write();
      const reader=await Zotero.Reader.open(attachment.id);await reader._initPromise;
      report.phase='initialize-reader-adapter';await write();
      const session=await addon.controller.ensureSession(reader);
      await step('runtime-page-boundary',async()=>{
        const raw=await session.adapter.pdfWindow.PDFViewerApplication.pdfDocument.getPage(1);
        const unwrapped=Components.utils.waiveXrays(raw);
        return {wrappedGetViewport:typeof raw.getViewport,unwrappedGetViewport:typeof unwrapped.getViewport,nativeRenderer:typeof session.adapter.primaryView._pdfRenderer?.renderRegionCrops};
      });
      await step('capture-real-scanned-region',async()=>{
        const material=await addon.assistant.capture(reader,annotation.key);
        if(!material.dataURL.startsWith('data:image/png;base64,')||material.width<10||material.height<10)throw new Error('Invalid screenshot');
        const bytes=Uint8Array.from(atob(material.dataURL.split(',')[1]),c=>c.charCodeAt(0));await IOUtils.write(__PNG__,bytes);
        return {width:material.width,height:material.height,bytes:bytes.length};
      });
      await step('current-page-material',async()=>{const source=await addon.assistant.currentPage(reader);if(!source.fullPage||!source.rects?.[0]?.every(Number.isFinite))throw new Error('Invalid full-page coordinates');return {pageIndex:source.pageIndex,rects:source.rects};});
      await step('question-panel-material',async()=>{const panel=await addon.assistant.panel(reader);await panel.addMaterial(await addon.assistant.resolveSource(reader,annotation.key));if(panel.materials.length!==1)throw new Error('Material not displayed');return {materialCount:panel.materials.length,panelVisible:!panel.node.hidden};});
      await step('native-zotero-preference-pane',async()=>{
        addon.assistant.settings();await new Promise(r=>setTimeout(r,1000));
        let prefs;for(const win of Services.wm.getEnumerator(null)){if(win.document.getElementById('zma-api-key'))prefs=win;}
        if(!prefs)throw new Error('DeepSeek fields not found in Zotero preferences');
        const key=prefs.document.getElementById('zma-api-key');key.value='preferences-smoke-placeholder';prefs.document.getElementById('zma-api-apply').click();
        if(addon.assistant.key!=='preferences-smoke-placeholder')throw new Error('Preference API field is not bound');prefs.document.getElementById('zma-api-clear').click();return {masked:key.type==='password',cleared:addon.assistant.key===''};
      });
      report.done=true;await write();
    }catch(e){report.fatal={error:String(e),stack:e.stack};await write();}
    finally{Services.startup.quit(Services.startup.eForceQuit);}
  },250);
}
'''
replacements={'__REPORT__':workspace/'report.json','__DATA__':data,'__PDF__':project/'evidence/scanned-page-100.pdf','__PNG__':workspace/'native-scan-crop.png'}
for token,path in replacements.items():bootstrap=bootstrap.replace(token,json.dumps(str(path),ensure_ascii=True))
manifest={'manifest_version':2,'name':'ZMA isolated runtime smoke test','version':'1.1','applications':{'zotero':{'id':'zma-runtime-smoke@local.zotero','strict_min_version':'10.0','strict_max_version':'10.0.*','update_url':'https://updates.invalid/zma-smoke.json'}}}
with zipfile.ZipFile(profile/'extensions/zma-runtime-smoke@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json',json.dumps(manifest))
    archive.writestr('bootstrap.js',bootstrap)
print(json.dumps({'profile':str(profile),'data':str(data),'report':str(workspace/'report.json')}))
