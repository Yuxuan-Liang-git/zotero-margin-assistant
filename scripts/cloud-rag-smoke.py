"""Final XPI acceptance in fresh, headless, isolated Zotero profiles only.

Only authored PDFs and a synthetic vector DB are used. Embedding fetch and answer
generation are deterministic external-boundary fixtures; no provider is called.
"""
from pathlib import Path
import argparse, ctypes, hashlib, json, shutil, subprocess, time, zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-name', required=True)
parser.add_argument('--xpi', default='dist/margin-comments-deepseek-0.20.0.xpi')
parser.add_argument('--synthetic-db', default='evidence/cloud-rag-0200-perf3-default96/synthetic-vectors.sqlite')
parser.add_argument('--perf-page-size', type=int, choices=(0,128,512,1024), default=0)
args = parser.parse_args()
if not args.run_name.replace('-', '').isalnum(): raise ValueError('Use a fresh simple run name')
work = ROOT / 'evidence' / args.run_name
if work.exists(): raise RuntimeError('Previous evidence is immutable; choose a fresh run name')
package = (ROOT / args.xpi).resolve()
synthetic = (ROOT / args.synthetic_db).resolve()
if not package.is_relative_to(ROOT / 'dist') or not package.is_file(): raise ValueError('Use a built dist XPI')
if not synthetic.is_relative_to(ROOT / 'evidence') or not synthetic.is_file(): raise ValueError('Use an evidence-only synthetic DB')
profile, data = work / 'profile', work / 'data'
(profile / 'extensions').mkdir(parents=True); data.mkdir()
shutil.copy2(package, work / 'assistant-under-test.xpi')
package_hash = hashlib.sha256(package.read_bytes()).hexdigest()
# Authored fixtures: B's English evidence is on page 2 and has no chat history.
pdf_script = r"""
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts}=require('pdf-lib');
(async()=>{for(const [name,pages]of Object.entries({
 A:['CurrentDocumentAnchor: a numerical observer estimates rotor flux.'],
 B:['A passive network description and component conventions.',
    'Damping injection dissipates stored energy and ensures passivity.',
    ],
 C:['LexicalFallbackNeedle describes an auxiliary thermal model.']
})){const p=await PDFDocument.create(),font=await p.embedFont(StandardFonts.Helvetica);
for(const text of pages){const page=p.addPage([600,800]);page.drawText(text,{x:35,y:700,size:12,font});}
fs.writeFileSync(path.join(process.argv[1],name+'.pdf'),await p.save());}})();
"""
subprocess.run(['node', '-e', pdf_script, str(work)], cwd=ROOT, check=True)
prefs = {
 'extensions.zotero.useDataDir': True, 'extensions.zotero.dataDir': str(data),
 'extensions.zotero.firstRun': False, 'extensions.zotero.firstRun2': False,
 'extensions.zotero.sync.autoSync': False, 'extensions.zotero.automaticScraperUpdates': False,
 'extensions.zotero.integration.autoInstall': False,
 'extensions.zoteroWinWordIntegration.skipInstallation': True,
 'extensions.zoteroOpenOfficeIntegration.skipInstallation': True,
 'extensions.zotero.margincomments.readingSummaryAuto': False,
 'extensions.autoDisableScopes': 0, 'extensions.enabledScopes': 15,
 'extensions.update.enabled': False, 'app.update.auto': False,
 'datareporting.policy.dataSubmissionEnabled': False,
}
(profile / 'user.js').write_text('\n'.join('user_pref('+json.dumps(k)+','+json.dumps(v)+');' for k,v in prefs.items()), encoding='utf-8')
bootstrap = (ROOT / 'tests/fixtures/cloud-rag-bootstrap.js').read_text(encoding='utf-8-sig')
for token,value in {'__WORK__':str(work),'__DATA__':str(data),'__HASH__':package_hash,'__SYNTHETIC__':str(synthetic),'__PAGESIZE__':args.perf_page_size}.items():
    bootstrap = bootstrap.replace(token, json.dumps(value, ensure_ascii=True))
subprocess.run(['node','--check'], input=bootstrap, text=True, encoding='utf-8', capture_output=True, check=True)
manifest = {'manifest_version':2,'name':'Isolated cloud RAG final XPI QA','version':'1.0',
 'applications':{'zotero':{'id':'zma-cloud-rag-qa@local.zotero',
 'strict_min_version':'10.0','strict_max_version':'10.0.*',
 'update_url':'https://updates.invalid/cloud-rag-qa'}}}
with zipfile.ZipFile(profile / 'extensions/zma-cloud-rag-qa@local.zotero.xpi','w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps(manifest)); z.writestr('bootstrap.js',bootstrap)
flags = subprocess.CREATE_NO_WINDOW
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_bool,ctypes.c_ulong]
kernel.OpenProcess.restype=ctypes.c_void_p
kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
kernel.CloseHandle.argtypes=[ctypes.c_void_p]
def wait_native_exit(pid, seconds=35):
    handle=kernel.OpenProcess(0x100000,False,pid)
    if not handle:return
    try:
        if kernel.WaitForSingleObject(handle,int(seconds*1000)) != 0:
            raise RuntimeError('Isolated native process still alive after report: '+str(pid))
    finally:kernel.CloseHandle(handle)
reports=[]
for launch in (1,2):
    report_file=work / ('report-'+str(launch)+'.json')
    with (work / ('process-'+str(launch)+'.log')).open('wb') as output:
        launcher=subprocess.Popen([r'C:\Program Files\Zotero\zotero.exe','-headless','-no-remote','-profile',str(profile)],
            stdout=output,stderr=output,creationflags=flags)
        deadline=time.monotonic()+300; report={}
        while time.monotonic()<deadline:
            try:report=json.loads(report_file.read_text(encoding='utf-8'))
            except (FileNotFoundError,json.JSONDecodeError):pass
            if report.get('phase') in ('done','failed'):break
            time.sleep(.2)
        if report.get('phase') not in ('done','failed'):
            raise RuntimeError('Native timeout; isolated process left untouched. Inspect '+str(report_file))
        wait_native_exit(int(report['process']))
        valid=report.get('phase')=='done' and report.get('packageSha256')==package_hash and all(c.get('ok') for c in report.get('cases',[]))
        reports.append({'launch':launch,'passed':valid,'cases':len(report.get('cases',[])),'report':str(report_file),'process':report['process']})
        print(json.dumps(reports[-1]),flush=True)
        if not valid:
            (work/'verification.json').write_text(json.dumps({'passed':False,'sha256':package_hash,'launches':reports},indent=2),encoding='utf-8')
            raise RuntimeError('Native acceptance failed; inspect '+str(report_file))
summary={'passed':True,'package':str(package),'sha256':package_hash,'launches':reports,
 'boundary':'Headless isolated Zotero, real OSKeyStore/SQLite/Worker/SDT/navigation; controlled external fetch/generation only. No real cloud quality claim.'}
(work/'verification.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary),flush=True)

