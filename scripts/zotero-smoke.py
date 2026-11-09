"""Prepare an isolated Zotero profile to exercise the actual Gecko reader, offline."""
import json
import hashlib
import argparse
import shutil
import zipfile
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--run-name',default='zotero-ui-after')
args=parser.parse_args()
if not args.run_name.replace('-','').isalnum():
    raise ValueError('Invalid test directory name')
project=Path(__file__).resolve().parent.parent
workspace=project/'evidence'/args.run_name
profile=workspace/'profile'
data=workspace/'data'
profile.mkdir(parents=True,exist_ok=True)
data.mkdir(parents=True,exist_ok=True)
(profile/'extensions').mkdir(exist_ok=True)
version=json.loads((project/'package.json').read_text())['version']
shutil.copy2(project/f'dist/margin-comments-deepseek-{version}.xpi',profile/'extensions/margin-comments@local.zotero.xpi')
package_hash=hashlib.sha256((profile/'extensions/margin-comments@local.zotero.xpi').read_bytes()).hexdigest()
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun':False,'extensions.zotero.sync.autoSync':False,'extensions.zotero.automaticScraperUpdates':False,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.update.enabled':False,'app.update.auto':False,'browser.aboutwelcome.enabled':False,'datareporting.policy.dataSubmissionEnabled':False}
(profile/'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+', '+json.dumps(v)+');' for k,v in prefs.items()),encoding='utf-8')
bootstrap=r'''
function install() {}
function uninstall() {}
function shutdown() {}
async function startup() {
  const report={zotero:Zotero.version,harness:5,packageVersion:__VERSION__,packageSha256:__HASH__,process:Services.appinfo.processID,steps:[],phase:'startup'};
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
      await step('question-panel-material',async()=>{
        const panel=await addon.assistant.panel(reader);await panel.addMaterial(await addon.assistant.resolveSource(reader,annotation.key));await new Promise(r=>setTimeout(r,500));
        if(panel.materials.length!==1)throw new Error('Material not displayed');
        const bounds=panel.node.getBoundingClientRect(),style=reader._iframeWindow.getComputedStyle(panel.node);
        report.panelGeometry={position:style.position,display:style.display,x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,viewportWidth:reader._iframeWindow.innerWidth,viewportHeight:reader._iframeWindow.innerHeight,stylesheetReady:!!panel.doc.getElementById('zma-styles')?.sheet};await write();
        if(style.position!=='fixed'||bounds.width<200||bounds.height<200||bounds.right>reader._iframeWindow.innerWidth+1||bounds.bottom>reader._iframeWindow.innerHeight+1)throw new Error('Question UI is not visible inside the reader viewport');
        const split=panel.doc.getElementById('split-view');if(split.getBoundingClientRect().right>bounds.left+1)throw new Error('Sidebar covers the PDF viewport');
        panel.close();if(Math.abs(split.getBoundingClientRect().width-reader._iframeWindow.innerWidth)>2)throw new Error('Closing sidebar does not restore the PDF viewport');panel.showChat();
        return {materialCount:panel.materials.length,panelVisible:!panel.node.hidden};
      });
      await step('inline-reference-in-native-margin',async()=>{
        const source={...await addon.assistant.resolveSource(reader,annotation.key),id:'qa-source-630',type:'公式',number:'6.30',description:'引用应与当前批注位于同一侧'};
        const target=await Zotero.Annotations.saveFromJSON(attachment,{key:'TARGRF23',type:'note',color:'#2ea8e5',pageLabel:'100',sortIndex:'00000|000030|00000',comment:'参考前文',position:{pageIndex:0,rects:[[520,250,542,272]]}});
        const state=await addon.assistant.load(reader);state.sources.push(source);state.references.push({annotationKey:target.key,sourceID:source.id,link:addon.assistant.sourceLink(source)});await addon.assistant.save(reader,state);
        target.annotationComment='参考前文 <a href="'+addon.assistant.sourceLink(source)+'">公式 (6.30)</a>';await target.saveTx();await session.refresh(true);await new Promise(r=>setTimeout(r,900));
        const runtime=session.cardRuntimes().find(r=>r.annotation.key===target.key),widget=runtime?.card.querySelector('.zma-inline-reference'),img=widget?.querySelector('img');
        if(!runtime||!widget||!img)throw new Error('Reference screenshot is missing from the native margin card');
        const bounds=widget.getBoundingClientRect(),cardBounds=runtime.card.getBoundingClientRect();
        if(bounds.width<=0||bounds.width>cardBounds.width+1||!img.naturalWidth)throw new Error('Reference card has invalid visible geometry');
        return {side:runtime.anchor.side,parentAnnotation:target.key,width:bounds.width,cardWidth:cardBounds.width,imageWidth:img.naturalWidth};
      });
      await step('native-dialogue-buttons-mocked-api',async()=>{
        const panel=await addon.assistant.panel(reader),client=addon.assistant.client;
        addon.assistant.client={generate:async(_messages,{onDelta})=>{onDelta('这是隔离测试中的模拟回答。');return '这是隔离测试中的模拟回答。';}};
        try{
          for(const question of ['请解释所列材料','继续追问其定义']){const before=panel.state.history.length;panel.question.value=question;panel.sendButton.click();for(let n=0;n<150;n++){if(!panel.busy&&panel.state.history.length===before+2)break;await new Promise(r=>setTimeout(r,20));}if(panel.state.history.length!==before+2||panel.state.history.at(-1).incomplete)throw new Error('Native send button did not produce a complete mock turn');}
          const button=panel.sendButton.getBoundingClientRect(),chat=panel.chat.getBoundingClientRect();if(button.bottom>chat.bottom+1)throw new Error('Send button is clipped in the sidebar');
          return {turns:2,messages:panel.state.history.length,api:'mock; no request sent',sendButtonVisible:true};
        }finally{addon.assistant.client=client;}
      });
      await step('native-zotero-preference-pane',async()=>{
        addon.assistant.settings();await new Promise(r=>setTimeout(r,1000));
        let prefs;for(const win of Services.wm.getEnumerator(null)){if(win.document.getElementById('zma-api-key'))prefs=win;}
        if(!prefs)throw new Error('DeepSeek fields not found in Zotero preferences');
        const key=prefs.document.getElementById('zma-api-key');key.value='preferences-smoke-placeholder';prefs.document.getElementById('zma-api-apply').click();
        if(addon.assistant.key!=='preferences-smoke-placeholder')throw new Error('Preference API field is not bound');prefs.document.getElementById('zma-api-clear').click();return {masked:key.type==='password',cleared:addon.assistant.key===''};
      });
      await step('native-source-change-invalidates-preview',async()=>{
        annotation.annotationPosition=JSON.stringify({pageIndex:0,rects:[[65,70,325,320]]});await annotation.saveTx();
        const runtime=session.cardRuntimes().find(r=>r.annotation.key==='TARGRF23');await addon.assistant.syncReferences(session,runtime);await new Promise(r=>setTimeout(r,800));
        if(runtime.referenceRoot.querySelector('img')||!runtime.referenceRoot.textContent.includes('重新定位'))throw new Error('Stale source image remains after annotation moves');
        return {staleImageRemoved:true,notice:runtime.referenceRoot.textContent};
      });
      report.done=true;await write();
    }catch(e){report.fatal={error:String(e),stack:e.stack};await write();}
    finally{Services.startup.quit(Services.startup.eForceQuit);}
  },250);
}
'''
replacements={'__REPORT__':workspace/'report.json','__DATA__':data,'__PDF__':project/'evidence/scanned-page-100.pdf','__PNG__':workspace/'native-scan-crop.png'}
for token,path in replacements.items():bootstrap=bootstrap.replace(token,json.dumps(str(path),ensure_ascii=True))
bootstrap=bootstrap.replace('__VERSION__',json.dumps(version)).replace('__HASH__',json.dumps(package_hash))
manifest={'manifest_version':2,'name':'ZMA isolated runtime smoke test','version':'1.1','applications':{'zotero':{'id':'zma-runtime-smoke@local.zotero','strict_min_version':'10.0','strict_max_version':'10.0.*','update_url':'https://updates.invalid/zma-smoke.json'}}}
with zipfile.ZipFile(profile/'extensions/zma-runtime-smoke@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json',json.dumps(manifest))
    archive.writestr('bootstrap.js',bootstrap)
print(json.dumps({'profile':str(profile),'data':str(data),'report':str(workspace/'report.json')}))
