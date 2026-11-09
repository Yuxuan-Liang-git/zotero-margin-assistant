// Independently render the PDF produced by the isolated native Zotero export.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { createCanvas } = require('@napi-rs/canvas');

(async () => {
  const directory = path.resolve(process.argv[2]);
  const states = fs.readdirSync(directory).filter(name => /^margin-comments-assistant-\d+-[A-Z0-9]{8}\.json$/.test(name)).map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
  const state = states.find(value => value.pageImages?.length);
  assert.ok(state, 'Native page-image state must exist');
  const placement = state.pageImages[0];
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const reports = [];
  for (const launch of [1, 2]) {
    const file = path.join(directory, 'page-images-export-' + launch + '.pdf');
    const bytes = fs.readFileSync(file);
    const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    try {
      const page = await document.getPage(1), viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d'); await page.render({ canvasContext: context, viewport }).promise;
      const m = placement.matrix, samples = [[.9, .07], [.95, .9], [.6, .05]].map(([x, y]) => {
        const point = viewport.convertToViewportPoint(m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y);
        return Array.from(context.getImageData(point[0], point[1], 1, 1).data).slice(0, 3);
      });
      assert.ok(samples.some(pixel => pixel.every((value, index) => Math.abs(value - [244, 246, 255][index]) < 4)), 'Expected saved image pixels in native export ' + launch);
      assert.ok((await page.getTextContent()).items.some(item => item.str.includes('Mixed PDF abstract')), 'Original PDF text must remain');
      const preview = path.join(directory, 'independent-export-' + launch + '.png');
      fs.writeFileSync(preview, canvas.toBuffer('image/png'));
      reports.push({ launch, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pages: document.numPages, savedImagePixels: true, originalText: true, preview });
    } finally { await document.destroy(); }
  }
  const report = { renderer: 'pdfjs-dist 5.6.205 outside Zotero', outputs: reports, passed: true };
  fs.writeFileSync(path.join(directory, 'independent-export-check.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
