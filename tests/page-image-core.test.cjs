const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('../src/core.js');
const Transfer = require('../src/transfer.js');
const scope = { libraryID: 1, attachmentKey: 'ABCD1234' };
const meta = { id: 'b'.repeat(32), imageID: 'a'.repeat(32), pageIndex: 0, fingerprint: '10:20' };
let views;
function api() {
  const file = path.resolve(__dirname, '../src/page-image-core.js');
  assert.ok(fs.existsSync(file), 'page image coordinates must be implemented'); return require(file);
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`); }
function stateWithPlacement() {
  const state = C.emptyState();
  state.images.push({ id: meta.imageID, sourcePageIndex: 0, mime: 'image/png', fileName: 'margin-comment-' + meta.imageID + '.png', noteKey: 'NOTE0001', noteImageKey: 'IMAGE001' });
  state.pageImages = [{ ...meta, matrix: [120, 0, 0, 48, 50, 600], locked: false }]; return state;
}
before(async () => {
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../evidence/text-paper-fixture.pdf'))) }).promise;
  const page = await pdf.getPage(1), Viewport = page.getViewport({ scale: 1 }).constructor;
  views = [0, 90, 180, 270].map(rotation => new Viewport({ viewBox: [30, 40, 570, 760], userUnit: 1, scale: 1.25, rotation }));
  await pdf.destroy();
});

test('PDF image coordinates round-trip through real PDF.js viewports for all rotations and a crop offset', () => {
  const P = api(), rect = { x: 40, y: 50, width: 120, height: 48 };
  for (const viewport of views) {
    const record = P.fromViewport(meta, rect, viewport), display = P.toViewport(record, viewport);
    for (const field of ['x', 'y', 'width', 'height']) near(display[field], rect[field]);
    assert.equal(P.within(record, viewport.viewBox), true);
    const moved = P.move(record, -9999, -9999, viewport);
    const atOrigin = P.toViewport(moved, viewport); near(atOrigin.x, 0); near(atOrigin.y, 0);
    assert.equal(P.within(moved, viewport.viewBox), true);
    const enlarged = P.resize(record, 100, viewport), size = P.toViewport(enlarged, viewport);
    near(size.width / size.height, 2.5); assert.ok(size.x + size.width <= viewport.width + 0.001); assert.ok(size.y + size.height <= viewport.height + 0.001);
    near(P.toViewport(record, viewport).width, 120);
  }
});

test('placement validation rejects missing identities, nonfinite, mirrored and skewed transforms', () => {
  const P = api(), valid = P.fromViewport(meta, { x: 20, y: 30, width: 120, height: 48 }, views[0]);
  for (const patch of [{ imageID: 'bad' }, { pageIndex: -1 }, { fingerprint: '' }, { matrix: [NaN, 0, 0, 1, 0, 0] }, { matrix: [1, 0, 0, -1, 0, 0] }, { matrix: [1, 0, 1, 1, 0, 0] }]) assert.throws(() => P.cleanPlacement({ ...valid, ...patch }), /图片/);
});

test('version3 round-trips page assets and positions while legacy data and dialogue import still work', () => {
  const state = stateWithPlacement(), clean = C.cleanState(state);
  assert.equal(clean.version, 3); assert.deepEqual(clean.pageImages, state.pageImages);
  assert.equal(clean.images[0].sourcePageIndex, 0); assert.equal(clean.images[0].annotationKey, undefined);
  assert.deepEqual(C.cleanState(JSON.parse(JSON.stringify(clean))), clean);
  assert.equal(C.cleanState(C.emptyState()).version, 2);
  assert.equal(Transfer.parseJSON(JSON.stringify(clean)).length, 1);
  assert.throws(() => C.cleanState({ ...state, pageImages: [{ ...state.pageImages[0], imageID: 'c'.repeat(32) }] }), /图片/);
  assert.throws(() => C.cleanState({ ...state, pageImages: [state.pageImages[0], state.pageImages[0]] }), /图片/);
});

test('first version3 publication backs up exact version2 bytes and rejects stale older saves', async () => {
  const original = JSON.stringify(C.emptyState()), file = '1-ABCD1234.json', files = new Map([[file, original]]);
  const store = new C.LocalStore({ exists: async name => files.has(name), read: async name => files.get(name), writeAtomic: async (name, value) => files.set(name, value) });
  const old = await store.load(scope); await store.save(scope, stateWithPlacement());
  assert.equal(files.get(file + '.v2.bak'), original); assert.equal(JSON.parse(files.get(file)).version, 3);
  await assert.rejects(store.save(scope, old), /版本/); assert.equal(JSON.parse(files.get(file)).pageImages.length, 1);
  const restored = await store.load(scope); assert.deepEqual(restored.pageImages, stateWithPlacement().pageImages);
});

test('backup failure preserves the authoritative JSON before any version3 publication', async () => {
  const original = JSON.stringify(C.emptyState()), file = '1-ABCD1234.json', files = new Map([[file, original]]);
  const store = new C.LocalStore({ exists: async name => files.has(name), read: async name => files.get(name), writeAtomic: async (name, value) => { if (name.endsWith('.bak')) throw Error('backup blocked'); files.set(name, value); } });
  await store.load(scope); await assert.rejects(store.save(scope, stateWithPlacement()), /备份|backup/);
  assert.equal(files.get(file), original);
});

test('Host routes version2 migration backups beside the same PDF and rejects unrelated paths', async () => {
  const { Host } = require('../src/host.js'), host = Object.create(Host.prototype);
  host.Z = { Items: { getByLibraryAndKey: () => ({ isPDFAttachment: () => true, getFilePathAsync: async () => 'C:\\papers\\paper.pdf' }) } };
  host.P = { join: path.win32.join, parent: path.win32.dirname };
  for (const suffix of ['.v2.bak', '.v2.1790000000000-abcdef.bak']) assert.equal(await host.pdfStatePath('1-ABCD1234.json' + suffix), 'C:\\papers\\margin-comments-assistant-1-ABCD1234.json' + suffix);
  await assert.rejects(host.pdfStatePath('../1-ABCD1234.json.v2.bak'), /文件名/);
});
