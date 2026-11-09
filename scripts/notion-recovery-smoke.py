"""Headless Gecko regression: stop only the isolated test web process, then reload.

The selected module is loaded in a fresh Zotero profile and only a loopback test
page is visited. Existing Zotero libraries, credentials and windows are unused.
"""
from pathlib import Path
import argparse,json,subprocess,time,zipfile
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-name',required=True)
parser.add_argument('--xpi',help='Test a built XPI instead of the current source module')
args=parser.parse_args()
if not args.run_name.replace('-','').isalnum(): raise ValueError('Use a new simple run name')
work=ROOT/'evidence'/args.run_name
if work.exists(): raise RuntimeError('Keep previous evidence; choose a fresh run name')
profile,data=work/'profile',work/'data';(profile/'extensions').mkdir(parents=True);data.mkdir()
source=(ROOT/'src/notion-browser.js').as_uri()
if args.xpi:
    package=(ROOT/args.xpi).resolve()
    if not package.is_relative_to(ROOT/'dist') or not package.is_file():raise ValueError('XPI must be a local dist package')
    source='jar:'+package.as_uri()+'!/content/scripts/notion-browser.js'
prefs={'extensions.zotero.useDataDir':True,'extensions.zotero.dataDir':str(data),'extensions.zotero.firstRun':False,'extensions.zotero.firstRun2':False,'extensions.zotero.sync.autoSync':False,'extensions.zotero.automaticScraperUpdates':False,'extensions.zotero.integration.autoInstall':False,'extensions.zoteroWinWordIntegration.skipInstallation':True,'extensions.zoteroOpenOfficeIntegration.skipInstallation':True,'extensions.autoDisableScopes':0,'extensions.enabledScopes':15,'extensions.update.enabled':False,'app.update.auto':False}
(profile/'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+','+json.dumps(v)+');' for k,v in prefs.items()),encoding='utf-8')
bootstrap=(ROOT/'tests/fixtures/notion-recovery-bootstrap.js').read_text(encoding='utf-8').replace('__WORK__',json.dumps(str(work))).replace('__DATA__',json.dumps(str(data))).replace('__SOURCE__',json.dumps(source))
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',capture_output=True,check=True)
manifest={'manifest_version':2,'name':'Isolated Notion recovery regression','version':'1.0','applications':{'zotero':{'id':'zma-notion-lifecycle-qa@local.zotero','strict_min_version':'10.0','strict_max_version':'10.0.*','update_url':'https://updates.invalid/notion-lifecycle'}}}
with zipfile.ZipFile(profile/'extensions/zma-notion-lifecycle-qa@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as z:z.writestr('manifest.json',json.dumps(manifest));z.writestr('bootstrap.js',bootstrap)
flags=subprocess.CREATE_NO_WINDOW
with (work/'process.log').open('wb') as output:
    launcher=subprocess.Popen([r'C:\Program Files\Zotero\zotero.exe','-headless','-no-remote','-profile',str(profile)],stdout=output,stderr=output,creationflags=flags)
    report_file=work/'report.json';deadline=time.monotonic()+90;report={}
    def observe():
        try:return json.loads(report_file.read_text(encoding='utf-8'))
        except (FileNotFoundError,json.JSONDecodeError):return {}
    while time.monotonic()<deadline:
        report=observe()
        if report.get('phase') in ['waiting-crash','complete','failed']:break
        time.sleep(.2)
    if report.get('phase')!='waiting-crash':raise RuntimeError('Native setup failed: '+json.dumps(report,ensure_ascii=True))
    parent_id=int(report['process']);child_id=int(report['remoteProcess'])
    safe_profile=str(profile).replace("'","''")
    guard=f"$probeParent=Get-CimInstance Win32_Process -Filter 'ProcessId={parent_id}'; $probeChild=Get-CimInstance Win32_Process -Filter 'ProcessId={child_id}'; if (-not $probeParent -or -not $probeChild -or -not $probeParent.CommandLine.Contains('{safe_profile}') -or -not $probeParent.CommandLine.Contains('-headless') -or $probeChild.ParentProcessId -ne {parent_id} -or -not $probeChild.CommandLine.Contains('-contentproc')) {{throw 'Isolation guard rejected process stop'}}; Stop-Process -Id {child_id}"
    subprocess.run(['powershell.exe','-NoProfile','-Command',guard],capture_output=True,check=True,creationflags=flags)
    print(json.dumps({'phase':'stopped-isolated-web-process','parent':parent_id,'child':child_id}),flush=True)
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        report=observe()
        if report.get('phase') in ['complete','failed']:break
        time.sleep(.2)
    case=next((c for c in report.get('cases',[]) if c['name']=='reload-after-remote-process-loss'),{})
    passed=report.get('phase')=='complete' and case.get('loaded') and case.get('recreated') and case.get('cookieRetained') and not report.get('probeError')
    print(json.dumps({'passed':bool(passed),'report':str(report_file),'zotero':report.get('zotero'),'recovery':case},ensure_ascii=True),flush=True)
    if not passed:raise RuntimeError('Native recovery regression failed; inspect the saved report')
