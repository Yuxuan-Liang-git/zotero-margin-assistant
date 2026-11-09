"""Prepare isolated Gecko checks of public OIDC metadata, without user credentials."""
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
    raise ValueError('Unsafe run name')
work = project / 'evidence' / args.run_name
if work.exists():
    raise RuntimeError('Use a fresh run name')
profile, data = work / 'profile', work / 'data'
(profile / 'extensions').mkdir(parents=True)
data.mkdir()
version = json.loads((project / 'package.json').read_text(encoding='utf-8'))['version']
package = project / f'dist/margin-comments-deepseek-{version}.xpi'
shutil.copy2(package, work / 'assistant-under-test.xpi')
prefs = {
    'extensions.zotero.useDataDir': True,
    'extensions.zotero.dataDir': str(data),
    'extensions.zotero.firstRun': False,
    'extensions.zotero.firstRun2': False,
    'extensions.zotero.sync.autoSync': False,
    'extensions.zotero.integration.autoInstall': False,
    'extensions.zotero.automaticScraperUpdates': False,
    'extensions.zotero.margincomments.readingSummaryAuto': False,
    'extensions.zotero.margincomments.libraryMemoryEnabled': False,
    'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 15,
    'extensions.update.enabled': False,
    'app.update.auto': False,
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
  const work=__WORK__,data=__DATA__,report={version:__VERSION__,packageSha256:__HASH__,steps:[]};
  const write=()=>IOUtils.writeUTF8(PathUtils.join(work,'report.json'),JSON.stringify(report,null,2));
  const check=async(name,fn)=>{try{report.steps.push({name,ok:true,result:await fn()});}catch(e){report.steps.push({name,ok:false,error:String(e),code:e.code,name:e.name});}await write();};
  try{
    await Zotero.initializationPromise;await Zotero.uiReadyPromise;
    if(Zotero.DataDirectory.dir!==data)throw Error('Isolation guard failed');
    const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    let installed=await AddonManager.getAddonByID('margin-comments@local.zotero');
    if(!installed){const pending=await AddonManager.getInstallForFile(Zotero.File.pathToFile(PathUtils.join(work,'assistant-under-test.xpi')));await pending.install();}
    let host;for(let i=0;i<200;i++){host=Zotero.MarginComments?.assistant;if(host?.running&&host.auth)break;await new Promise(r=>setTimeout(r,50));}
    if(!host?.auth)throw Error('Auth module missing');
    const win=Zotero.getMainWindow();report.zotero=Zotero.version;
    report.proxyType=Services.prefs.getIntPref('network.proxy.type');
    await check('public-discovery-fetch',async()=>{
      const controller=new win.AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{const response=await win.fetch('https://auth.openai.com/.well-known/openid-configuration',{signal:controller.signal,redirect:'error'});
        const status=response.status,contentType=response.headers.get('content-type');
        report.publicResponse={status,contentType};await write();
        if(!response.ok)throw Error('Public discovery HTTP '+status);
        const metadata=await response.json();return {issuer:metadata.issuer,authorization:metadata.authorization_endpoint,token:metadata.token_endpoint,jwks:metadata.jwks_uri,revocation:metadata.revocation_endpoint};
      }finally{clearTimeout(timer);}
    });
    await check('production-auth-discovery',async()=>{const config=await host.auth.discovery();return {issuer:config.issuer,token:config.token_endpoint};});
    await check('production-discovery-recovery',async()=>{
      const originalFetch=host.auth.fetch;let reads=0;
      try{
        host.auth.config=null;
        host.auth.fetch=(...request)=>{reads++;if(reads===1)throw Error('fixture connection failure');return originalFetch(...request);};
        const [first,second]=await Promise.all([host.auth.discovery(),host.auth.discovery()]);
        if(reads!==2||first!==second||first.issuer!=='https://auth.openai.com')throw Error('Discovery retry or sharing failed');
        return {singleRetry:true,concurrentReadsShared:true,secondReadUsesPublicService:true};
      }finally{host.auth.fetch=originalFetch;host.auth.config=null;}
    });
    await check('production-discovery-safe-error',async()=>{
      const originalFetch=host.auth.fetch;let reads=0;
      try{
        host.auth.fetch=async()=>{reads++;return new win.Response('private diagnostic fixture',{status:403});};
        try{await host.auth.discovery();throw Error('Expected HTTP rejection');}
        catch(error){if(error.code!=='auth_http'||error.status!==403||!error.message.includes('HTTP 403')||error.message.includes('private diagnostic')||reads!==1)throw Error('HTTP failure lost its safe category');}
        return {httpStatusShown:true,rawBodyExcluded:true,permanentFailureNotRetried:true};
      }finally{host.auth.fetch=originalFetch;host.auth.config=null;}
    });
    report.credentialsAbsent=host.auth.accounts().length===0;
    report.done=true;
  }catch(e){report.fatal=String(e);}finally{await write();setTimeout(()=>Zotero.getMainWindow().goQuitApplication(),500);}
}
'''
for key, value in {
    '__WORK__': str(work), '__DATA__': str(data), '__VERSION__': version,
    '__HASH__': hashlib.sha256(package.read_bytes()).hexdigest(),
}.items():
    bootstrap = bootstrap.replace(key, json.dumps(value))
manifest = {
    'manifest_version': 2, 'name': 'Isolated public OIDC QA', 'version': '1.0',
    'applications': {'zotero': {'id': 'zma-auth-discovery-qa@local.zotero', 'strict_min_version': '10.0', 'strict_max_version': '10.0.*', 'update_url': 'https://updates.invalid/zma-auth-discovery/update.json'}},
}
with zipfile.ZipFile(profile / 'extensions/zma-auth-discovery-qa@local.zotero.xpi', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', json.dumps(manifest))
    archive.writestr('bootstrap.js', bootstrap)
print(json.dumps({'profile': str(profile), 'version': version}))
