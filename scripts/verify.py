"""Verify generated XPI resources, baseline preservation and JS syntax; archive source."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import zipfile

PROJECT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--node',default=os.environ.get('ZMA_NODE','node'))
parser.add_argument('--baseline-xpi',default='C:/Users/HP/Downloads/margin-comments-latex-custom-0.9.5.xpi')
args=parser.parse_args()
version=json.loads((PROJECT/'package.json').read_text(encoding='utf-8'))['version']
package=PROJECT/f'dist/margin-comments-deepseek-{version}.xpi'
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
    names=set(archive.namelist())
    manifest=json.loads(archive.read('manifest.json'))
    assert manifest['version']==version
    assert manifest['applications']['zotero']['strict_min_version']=='10.0'
    assert manifest['applications']['zotero']['strict_max_version']=='10.0.*'
    assert manifest['applications']['zotero']['id']=='margin-comments@local.zotero'
    assert manifest['applications']['zotero']['update_url']=='https://updates.invalid/margin-comments-deepseek/update.json'
    for name in ['bootstrap.js','content/scripts/core.js','content/scripts/capture.js','content/scripts/references.js','content/scripts/deepseek.js','content/scripts/settings.js','content/scripts/panel.js','content/scripts/host.js','content/scripts/assistant-settings.js','content/assistant-settings.xhtml','content/assistant.css','content/vendor/katex/katex.min.css']:
        assert name in names,name
    for path in (PROJECT/'build').rglob('*.js'):
        subprocess.run([args.node,'--check',str(path)],check=True,capture_output=True)
    expected_changes={'manifest.json','bootstrap.js','content/scripts/margincomments.js','content/preferences.xhtml'}
    changed=[]
    for path in (PROJECT/'baseline').rglob('*'):
        if path.is_file():
            name=path.relative_to(PROJECT/'baseline').as_posix()
            if archive.read(name)!=path.read_bytes():
                changed.append(name)
    assert set(changed)==expected_changes,changed
original=Path(args.baseline_xpi)
baseline_verified=False
if original.exists():
    assert hashlib.sha256(original.read_bytes()).hexdigest().upper()=='875A363693CA0CFC53A414CDDD966286B8BA0FE821148EC278CBF0602673B1CA'
    with zipfile.ZipFile(original) as archive:
        for name in archive.namelist():
            if not name.endswith('/'):
                assert (PROJECT/'baseline'/name).read_bytes()==archive.read(name),name
    baseline_verified=True
source_zip=PROJECT/f'dist/margin-comments-deepseek-{version}-source.zip'
with zipfile.ZipFile(source_zip,'w',zipfile.ZIP_DEFLATED) as archive:
    for folder in ['baseline','src','content','tests','scripts','docs']:
        for path in sorted((PROJECT/folder).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                archive.write(path,path.relative_to(PROJECT).as_posix())
    for name in ['package.json','README.md','progress.md']:
        archive.write(PROJECT/name,name)
smoke_path=PROJECT/'evidence/zotero-smoke-v4/report.json'
smoke=json.loads(smoke_path.read_text(encoding='utf-8')) if smoke_path.exists() else None
native_smoke='passed: actual Zotero 10.0.6 isolated reader capture, panel and native API preferences' if smoke and smoke.get('done') and all(step['ok'] for step in smoke['steps']) else 'not passed or not run'
report={'date':'2026-10-13','xpi_sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'xpi_size':package.stat().st_size,'baseline_verified_against_original':baseline_verified,'changed_baseline_files':changed,'resource_and_syntax_checks':'passed','source_zip':str(source_zip),'real_api_test':'not run; user key not configured','native_zotero_smoke':native_smoke,'current_user_profile_gui_test':'not run; existing profile/library unchanged'}
(PROJECT/'dist/verification-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
