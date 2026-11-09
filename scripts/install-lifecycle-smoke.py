"""Exercise Zotero's real add-on installer in an isolated profile, then restart unchanged."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--run-name',required=True)
parser.add_argument('--from-existing',action='store_true')
parser.add_argument('--with-notero',action='store_true')
parser.add_argument('--default-addon-prefs',action='store_true')
args=parser.parse_args()
if not args.run_name.replace('-','').isalnum():raise ValueError('Unsafe QA name')
work=project/'evidence'/args.run_name
if work.exists():raise RuntimeError('Use a new run name; do not reset installed state')
profile=work/'profile';data=work/'data'
(profile/'extensions').mkdir(parents=True);data.mkdir()
base=project/'dist/margin-comments-deepseek-0.10.5.xpi'
version=json.loads((project/'package.json').read_text(encoding='utf-8'))['version']
package=project/f'dist/margin-comments-deepseek-{version}.xpi'
if args.from_existing:shutil.copy2(base,profile/'extensions/margin-comments@local.zotero.xpi')
if args.with_notero:shutil.copy2(Path('C:/Users/HP/AppData/Roaming/Zotero/Zotero/Profiles/vvcpo9eq.default/extensions/notero@vanoni.dev.xpi'),profile/'extensions/notero@vanoni.dev.xpi')
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun2':False,'extensions.zoteroWinWordIntegration.skipInstallation':True,'extensions.zoteroOpenOfficeIntegration.skipInstallation':True,'extensions.zotero.sync.autoSync':False,'extensions.zotero.automaticScraperUpdates':False,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.update.enabled':False,'app.update.auto':False,'datareporting.policy.dataSubmissionEnabled':False}
if args.default_addon_prefs:
    prefs.pop('extensions.autoDisableScopes')
    prefs.pop('extensions.enabledScopes')
(profile/'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+', '+json.dumps(v)+');' for k,v in prefs.items()),encoding='utf-8')
bootstrap=r'''
function install(){}
function uninstall(){}
function shutdown(){}
function startup(_data,reason){setTimeout(()=>run(reason),500);}
async function run(reason){
  const work=__WORK__,seedFile=PathUtils.join(work,'seed.json');let seed={launch:0},report={reason,steps:[]};
  try{
    await Zotero.initializationPromise;await Zotero.uiReadyPromise;
    if(Zotero.DataDirectory.dir!==__DATA__)throw new Error('QA profile/data isolation failed');
    if(await IOUtils.exists(seedFile))seed=JSON.parse(await IOUtils.readUTF8(seedFile));seed.launch++;
    report.launch=seed.launch;report.process=Services.appinfo.processID;
    const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const {FileUtils}=ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');
    const snapshot=async(phase)=>{const a=await AddonManager.getAddonByID('margin-comments@local.zotero');const pane=Zotero.PreferencePanes.pluginPanes.find(p=>p.id==='margin-comments-preferences');report.steps.push({phase,addon:a?{id:a.id,version:a.version,isActive:a.isActive,appDisabled:a.appDisabled,pendingOperations:a.pendingOperations,rootURI:a.getResourceURI()?.spec}:null,pane:pane?{id:pane.id,src:pane.src}:null});await IOUtils.writeUTF8(PathUtils.join(work,'report-'+seed.launch+'.json'),JSON.stringify(report,null,2));};
    await snapshot('before');
    if(seed.launch===1){
      const otherPane=Zotero.PreferencePanes.pluginPanes.find(p=>p.pluginID==='notero@vanoni.dev');
      if(otherPane){const otherWin=Zotero.Utilities.Internal.openPreferences(otherPane.id);await new Promise(r=>setTimeout(r,600));report.otherPaneBefore={id:otherPane.id,selected:otherWin.Zotero_Preferences.navigation.value,loaded:otherWin.Zotero_Preferences.panes.get(otherPane.id)?.loaded};}
      const install=await AddonManager.getInstallForFile(new FileUtils.File(__PACKAGE__));
      report.install={stateBefore:install?.state,errorBefore:install?.error};
      await install.install();
      report.install.stateAfter=install.state;report.install.errorAfter=install.error;
      await snapshot('after-install');
      const win=Zotero.Utilities.Internal.openPreferences('margin-comments-preferences');await new Promise(r=>setTimeout(r,1200));
      try{const p=win.Zotero_Preferences,entry=p.panes.get('margin-comments-preferences');report.preference={nav:p.navigation.value,loaded:entry?.loaded,api:!!entry?.container.querySelector('#zma-api-key'),visible:entry?.container.hidden===false};}catch(e){report.preference={error:String(e)};}
      await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));
    }else{
      const win=Zotero.Utilities.Internal.openPreferences('margin-comments-preferences');await new Promise(r=>setTimeout(r,1200));
      try{const p=win.Zotero_Preferences,entry=p.panes.get('margin-comments-preferences');report.preference={nav:p.navigation.value,loaded:entry?.loaded,api:!!entry?.container.querySelector('#zma-api-key'),visible:entry?.container.hidden===false};}catch(e){report.preference={error:String(e)};}
    }
    await snapshot('end');report.done=true;
  }catch(e){report.fatal={message:String(e),stack:e.stack};}
  finally{await IOUtils.writeUTF8(PathUtils.join(work,'report-'+(report.launch||'fatal')+'.json'),JSON.stringify(report,null,2));Services.startup.quit(Services.startup.eForceQuit);}
}
'''
for token,value in {'__WORK__':str(work),'__DATA__':str(data),'__PACKAGE__':str(package)}.items():bootstrap=bootstrap.replace(token,json.dumps(value,ensure_ascii=True))
manifest={'manifest_version':2,'name':'Margin install lifecycle QA','version':'1.0','applications':{'zotero':{'id':'margin-install-lifecycle-qa@local.zotero','strict_min_version':'10.0','strict_max_version':'10.0.*','update_url':'https://updates.invalid/margin-install-lifecycle-qa.json'}}}
with zipfile.ZipFile(profile/'extensions/margin-install-lifecycle-qa@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as archive:archive.writestr('manifest.json',json.dumps(manifest));archive.writestr('bootstrap.js',bootstrap)
print(json.dumps({'profile':str(profile),'data':str(data),'fromExisting':args.from_existing,'withNotero':args.with_notero,'packageSha256':hashlib.sha256(package.read_bytes()).hexdigest()}))
