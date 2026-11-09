"""Focused first-reader admission/clipboard/context acceptance, no second-PDF probe."""
import argparse, subprocess, sys, zipfile
from pathlib import Path

project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--run-name',required=True)
parser.add_argument('--pdf-fixture')
args=parser.parse_args()
command=[sys.executable,str(project/'scripts/composer-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest=archive.read('manifest.json')
    bootstrap=archive.read('bootstrap.js').decode()
# Keep the first ten checks, including real OAuth/Responses/error/explicit-retry
# code in the original reader. The full multi-PDF chain remains available through
# composer-smoke.py; this focused run does not claim to validate its later checks.
start=bootstrap.index("    await check('automatic-full-pdf-after-reopen'")
end=bootstrap.index('    await host.store.flush();',start)
bootstrap=bootstrap[:start]+bootstrap[end:]
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json',manifest)
    archive.writestr('bootstrap.js',bootstrap)
