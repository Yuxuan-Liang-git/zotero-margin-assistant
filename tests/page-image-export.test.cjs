const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { PDFDocument, StandardFonts, PDFName, degrees } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const P = require('../src/page-image-core.js');
const directory = path.resolve(__dirname, '../evidence/page-images-0190');
let fixture, pdfjs;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function worker() { const file = path.resolve(__dirname, '../content/pdf-image-worker.js'); assert.ok(fs.existsSync(file), 'PDF image composition worker must exist'); return require(file); }

before(async () => {
  pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90, 180, 270]) {
    const page = document.addPage([600, 800]); page.setCropBox(20, 30, 560, 740); page.setRotation(degrees(rotation));
    page.drawText('Original paragraph ' + rotation, { x: 45, y: 740, size: 14, font });
    const annotation = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [40, 700, 120, 725], F: 4, C: [1, 0, 0] }));
    page.node.set(PDFName.of('Annots'), document.context.obj([annotation]));
  }
  const pdfBytes = await document.save(), canvas = createCanvas(64, 32), context = canvas.getContext('2d');
  for (const [color, x, y] of [['red', 0, 0], ['lime', 32, 0], ['blue', 0, 16], ['yellow', 32, 16]]) { context.fillStyle = color; context.fillRect(x, y, 32, 16); }
  const images = [{ id: 'a'.repeat(32), mime: 'image/png', bytes: new Uint8Array(canvas.toBuffer('image/png')) }];
  const source = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise, placements = [];
  for (let index = 0; index < 4; index++) { const page = await source.getPage(index + 1); placements.push(P.fromViewport({ id: String(index + 1).repeat(32), imageID: images[0].id, pageIndex: index, fingerprint: 'fixture:1' }, { x: 80, y: 120, width: 144, height: 72 }, page.getViewport({ scale: 1 }))); }
  await source.destroy(); fixture = { pdfBytes, images, placements }; fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'source-rotations.pdf'), pdfBytes);
});

test('exported PDF renders the exact image corners across four rotations and crop offsets', async () => {
  const sourceHash = hash(fixture.pdfBytes), bytes = await worker().compose(fixture);
  assert.equal(hash(fixture.pdfBytes), sourceHash); fs.writeFileSync(path.join(directory, 'export-four-rotations.pdf'), bytes);
  const metadata = await PDFDocument.load(bytes); assert.equal(metadata.getPageCount(), 4);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  try {
    for (let index = 0; index < 4; index++) {
      const page = await pdf.getPage(index + 1), viewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(viewport.width, viewport.height), context = canvas.getContext('2d'); await page.render({ canvasContext: context, viewport }).promise;
      const colors = [[0.25, 0.25, [255, 0, 0]], [0.75, 0.25, [0, 255, 0]], [0.25, 0.75, [0, 0, 255]], [0.75, 0.75, [255, 255, 0]]];
      for (const [x, y, expected] of colors) { const pixel = context.getImageData(80 + 144 * x, 120 + 72 * y, 1, 1).data; for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(pixel[channel] - expected[channel]) < 10, `page ${index + 1} corner ${x},${y}`); }
      assert.ok((await page.getTextContent()).items.some(item => item.str.includes('Original paragraph')));
      assert.equal(metadata.getPage(index).node.Annots().size(), 1);
      assert.equal(metadata.getPage(index).getRotation().angle, index * 90);
      assert.deepEqual(metadata.getPage(index).getCropBox(), { x: 20, y: 30, width: 560, height: 740 });
      fs.writeFileSync(path.join(directory, 'export-page-' + (index + 1) + '.png'), canvas.toBuffer('image/png'));
    }
  } finally { await pdf.destroy(); }
});

test('composition rejects an unknown asset, out-of-page position and invalid page index', async () => {
  const compose = worker().compose, first = fixture.placements[0];
  for (const patch of [{ imageID: 'b'.repeat(32) }, { pageIndex: 4 }, { matrix: [144, 0, 0, 72, -100, -100] }]) await assert.rejects(compose({ ...fixture, placements: [{ ...first, ...patch }] }), /图片|页码/);
});

function exporter() { const file = path.resolve(__dirname, '../src/page-image-export.js'); assert.ok(fs.existsSync(file), 'PDF export lifecycle must be implemented'); return require(file); }
function exportHost() {
  const C = require('../src/core.js'), state = C.emptyState(), source = 'C:\\papers\\paper.pdf';
  state.images = fixture.images.map(image => ({ id: image.id, sourcePageIndex: 0, mime: image.mime, fileName: 'margin-comment-' + image.id + '.png', noteKey: 'NOTE0001', noteImageKey: 'IMAGE001' }));
  state.pageImages = fixture.placements.map(P.cleanPlacement); state.version = 3;
  const files = new Map([[source, new Uint8Array(fixture.pdfBytes)]]);
  class LocalFile {
    constructor(name) { this.path = name; }
    normalize() { this.path = path.win32.normalize(this.path); }
    get parent() { return new LocalFile(path.win32.dirname(this.path)); }
    get leafName() { return path.win32.basename(this.path); }
    append(name) { this.path = path.win32.join(this.path, name); }
    equals(other) { return this.path.toLowerCase() === other.path.toLowerCase(); }
  }
  const result = { files, state, source, fingerprint: 'fixture:1', nativeCalls: 0, failPublish: false };
  const host = {
    scope: () => ({ libraryID: 1, attachmentKey: 'ABCD1234' }), fingerprint: async () => result.fingerprint,
    pageImageInfo: async () => ({ fingerprint: result.fingerprint, pageCount: 4 }), load: async () => state,
    runtimeWindow: () => ({ crypto: globalThis.crypto, URL, Uint8Array }), unwrap: value => value,
    Z: { File: { pathToFile: name => new LocalFile(name) }, Items: { get: () => ({ getFilePathAsync: async () => source }) }, PDFWorker: { export: async (_id, name) => { result.nativeCalls++; files.set(name, files.get(source).slice()); } } },
    IO: { exists: async name => files.has(name), read: async name => { if (!files.has(name)) throw Error('missing'); return files.get(name).slice(); }, remove: async name => files.delete(name), write: async (name, bytes, options) => { files.set(options.tmpPath, bytes.slice()); if (result.failPublish) throw Error('publish blocked'); files.set(name, files.get(options.tmpPath)); files.delete(options.tmpPath); } },
    imageManager: { transaction: async (_reader, action) => action(), readBytes: async (_reader, record) => ({ bytes: fixture.images.find(image => image.id === record.id).bytes.slice(), mime: record.mime }) },
    createImageExportWorker: () => ({ terminate() { this.terminated = true; }, postMessage(data) { void worker().compose(data).then(pdfBytes => { if (!this.terminated) this.onmessage({ data: { type: 'completed', pdfBytes } }); }).catch(error => this.onerror?.(error)); } }),
  };
  return { ...result, host, getFingerprint: () => result.fingerprint, setFingerprint: value => { result.fingerprint = value; }, setPublishFailure: () => { result.failPublish = true; }, nativeCalls: () => result.nativeCalls };
}

test('normal export uses native annotations, an immutable placement snapshot and atomic output', async () => {
  const E = exporter(), f = exportHost(), reader = { itemID: 1 }, original = hash(f.files.get(f.source));
  const snapshot = await E.snapshot(f.host, reader), oldX = snapshot.placements[0].matrix[4];
  f.state.pageImages[0].matrix[4] += 35; assert.equal(snapshot.placements[0].matrix[4], oldX);
  const target = 'C:\\exports\\with-images.pdf'; await E.exportPDF(f.host, reader, snapshot, target);
  assert.equal(f.nativeCalls(), 1); assert.equal(hash(f.files.get(f.source)), original);
  assert.equal((await PDFDocument.load(f.files.get(target))).getPageCount(), 4);
  assert.equal(f.files.size, 2);
});

test('export guards the source path and cleans temporary files after source changes or failed publication', async () => {
  const E = exporter(), reader = { itemID: 1 };
  let f = exportHost(), snapshot = await E.snapshot(f.host, reader);
  await assert.rejects(E.exportPDF(f.host, reader, snapshot, 'c:\\papers\\..\\papers\\PAPER.pdf'), /原 PDF|源文件/); assert.equal(f.nativeCalls(), 0);
  f = exportHost(); snapshot = await E.snapshot(f.host, reader); const native = f.host.Z.PDFWorker.export;
  f.host.Z.PDFWorker.export = async (...args) => { await native(...args); f.setFingerprint('changed'); };
  await assert.rejects(E.exportPDF(f.host, reader, snapshot, 'C:\\exports\\changed.pdf'), /改变|变更/); assert.equal(f.files.size, 1);
  f = exportHost(); snapshot = await E.snapshot(f.host, reader); f.setPublishFailure();
  const target = 'C:\\exports\\existing.pdf', old = new Uint8Array([1, 2, 3]); f.files.set(target, old);
  await assert.rejects(E.exportPDF(f.host, reader, snapshot, target), /publish blocked/); assert.deepEqual(f.files.get(target), old); assert.equal(f.files.size, 2);
});

test('cancelling the composition worker preserves files and terminates the pending job', async () => {
  const E = exporter(), f = exportHost(), reader = { itemID: 1 }, controller = new AbortController();
  let entered, terminated = false; const started = new Promise(resolve => { entered = resolve; });
  f.host.createImageExportWorker = () => ({ terminate() { terminated = true; }, postMessage() { entered(); } });
  const snapshot = await E.snapshot(f.host, reader), task = E.exportPDF(f.host, reader, snapshot, 'C:\\exports\\cancelled.pdf', { signal: controller.signal });
  const failure = assert.rejects(task, /取消/); await started; controller.abort(); await failure;
  assert.equal(terminated, true); assert.equal(f.files.size, 1);
});
