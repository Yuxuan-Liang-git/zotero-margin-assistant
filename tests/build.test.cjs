const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const project=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(project+'/package.json','utf8')).version;
test('package preserves baseline identity and emits resources without an upstream replacement updater',()=>{
  assert.ok(fs.existsSync(project+'/scripts/build.py'),'reproducible builder must exist');
  const run=cp.spawnSync(process.env.ZMA_PYTHON||'C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[project+'/scripts/build.py'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const manifest=JSON.parse(fs.readFileSync(project+'/build/manifest.json','utf8'));
  assert.equal(manifest.applications.zotero.id,'margin-comments@local.zotero');assert.equal(manifest.version,version);assert.equal(new URL(manifest.applications.zotero.update_url).hostname,'updates.invalid');
  for(const file of ['bootstrap.js','content/scripts/host.js','content/scripts/panel.js','content/assistant-settings.xhtml','content/assistant.css','content/vendor/katex/katex.min.css'])assert.ok(fs.existsSync(project+'/build/'+file),file);
  const packagePath=project+`/dist/margin-comments-deepseek-${version}.xpi`;
  assert.ok(fs.statSync(packagePath).size>100000);
  const first=fs.readFileSync(packagePath);fs.writeFileSync(project+'/build/stale.tmp','obsolete');
  const again=cp.spawnSync(process.env.ZMA_PYTHON||'C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[project+'/scripts/build.py'],{encoding:'utf8'});assert.equal(again.status,0,again.stderr);
  assert.ok(!fs.existsSync(project+'/build/stale.tmp'));assert.deepEqual(fs.readFileSync(packagePath),first);
});
