const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Host } = require('../src/host.js');

// Exercise the shipped native predicate together with the actual Host reader
// restoration entry point. Rendering a fabricated card would miss this filter.
const built = fs.readFileSync(require('node:path').resolve(__dirname, '../build/content/scripts/margincomments.js'), 'utf8');
const expression = /function shouldDisplayAnnotation\(annotation, forcedKeys[\s\S]*?\n  }/.exec(built);
const visible = vm.runInNewContext('(' + expression[0] + ')');

function fixture() {
  const host = Object.create(Host.prototype), reader = { itemID: 1, type: 'pdf', _initPromise: Promise.resolve(), _iframeWindow: { document: {} } };
  const items = [
    { key: 'IMGONLY1', type: 'highlight', comment: '', annotationType: 'highlight' },
    { key: 'NOIMAGE1', type: 'highlight', comment: '', annotationType: 'highlight' },
    { key: 'FREETEXT', type: 'text', comment: 'on-page text', annotationType: 'text' }
  ];
  const record = key => ({ id: 'a'.repeat(32), annotationKey: key, fileName: 'margin-comment-' + 'a'.repeat(32) + '.png', mime: 'image/png', noteKey: 'NOTE0001', noteImageKey: 'IMAGE001' });
  const state = { images: [record('IMGONLY1'), record('FREETEXT'), record('OUTSIDE1')] };
  const tasks = [], rendered = [];
  let refreshes = 0, loads = 0;
  const session = { reader, forcedKeys: new Set(), adapter: { document: () => ({}) }, cardRuntimes: () => [], refresh: async () => { refreshes++; } };
  Object.assign(host, {
    running: true, closedReaders: new WeakSet(), Z: { Reader: { _readers: [reader] } }, addon: { controller: { ensureSession: async () => session } },
    nativeAnnotation: (_reader, key) => items.find(item => item.key === key), load: async () => { loads++; return JSON.parse(JSON.stringify(state)); },
    guard: action => tasks.push(Promise.resolve().then(action)), watchToolbar() {}, ensureToolbar() {}, bindReferences() {},
    decorateSession: current => rendered.push(items.filter(item => visible(item, current.forcedKeys, current.marginImageKeys)).map(item => item.key))
  });
  return { host, reader, session, state, tasks, rendered, counts: () => ({ refreshes, loads }) };
}

test('reopening an empty highlight restores its image-only margin card without making unrelated blank or on-page text cards visible', async () => {
  const f = fixture();
  f.host.restoreReaders(); f.host.restoreReaders();
  await Promise.all(f.tasks);
  assert.deepEqual(f.rendered[0], ['IMGONLY1']);
  assert.deepEqual(f.rendered[1], ['IMGONLY1']);
  assert.deepEqual(f.counts(), { refreshes: 1, loads: 1 });
  assert.equal(f.session.forcedKeys.has('OUTSIDE1'), false);
  f.session.forcedKeys.clear();
  assert.equal(visible({ key: 'IMGONLY1', type: 'highlight', comment: '' }, f.session.forcedKeys, f.session.marginImageKeys), true);
});

test('closing a reader during image-visibility restoration cannot repaint its removed card', async () => {
  const f = fixture();
  assert.equal(typeof f.host.restoreMarginImages, 'function');
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  f.host.load = async () => { entered(); return new Promise(resolve => { release = () => resolve(f.state); }); };
  const restoring = f.host.restoreMarginImages(f.session); await started;
  f.host.closedReaders.add(f.reader); release(); await restoring;
  assert.equal(f.session.forcedKeys.size, 0);
  assert.equal(f.counts().refreshes, 0);
});
