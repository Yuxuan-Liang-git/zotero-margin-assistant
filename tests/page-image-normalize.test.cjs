const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers/margin-images.cjs');

test('GIF first frame, WebP and EXIF JPEG normalize to the same visible orientation for PDF embedding', async () => {
  const script = path.resolve(__dirname, '../src/page-image-export.js'); assert.ok(fs.existsSync(script), 'image export normalization must exist');
  const { browser, page } = await setup();
  try {
    await page.addScriptTag({ path: script });
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16;
      const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 16, 16); context.fillStyle = 'blue'; context.fillRect(16, 0, 16, 16);
      const bytes = url => Uint8Array.from(atob(url.split(',')[1]), character => character.charCodeAt(0));
      const jpeg = bytes(canvas.toDataURL('image/jpeg', 1)), exif = Uint8Array.from([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
      const oriented = new Uint8Array(jpeg.length + exif.length); oriented.set(jpeg.subarray(0, 2)); oriented.set(exif, 2); oriented.set(jpeg.subarray(2), exif.length + 2);
      const gif = Uint8Array.from(atob('R0lGODlhAgABAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAwAAACwAAAAAAgABAAAIBQABAAgIACH5BAEDAAEALAAAAAACAAEAgQAA/wAAAAAAAAAAAAgFAAEACAgAOw=='), character => character.charCodeAt(0));
      const values = [];
      for (const [mime, input] of [['image/gif', gif], ['image/webp', bytes(canvas.toDataURL('image/webp'))], ['image/jpeg', oriented]]) {
        const normalized = await ZMAPageImageExport.normalizeAsset(fixture.host, { id: 'a'.repeat(32), mime, bytes: input });
        const blob = new Blob([normalized.bytes], { type: normalized.mime }), image = await createImageBitmap(blob);
        const output = document.createElement('canvas'); output.width = image.width; output.height = image.height; const target = output.getContext('2d'); target.drawImage(image, 0, 0);
        values.push({ mime: normalized.mime, width: image.width, height: image.height, top: [...target.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 4), 1, 1).data] }); image.close();
      }
      const original = await ZMAPageImageExport.normalizeAsset(fixture.host, { id: 'b'.repeat(32), mime: 'image/jpeg', bytes: jpeg });
      return { values, jpegUnchanged: original.mime === 'image/jpeg' && original.bytes.length === jpeg.length };
    });
    assert.equal(result.jpegUnchanged, true);
    assert.deepEqual(result.values.map(value => [value.mime, value.width, value.height]), [['image/png', 2, 1], ['image/png', 32, 16], ['image/png', 16, 32]]);
    assert.ok(result.values[0].top[0] > 240 && result.values[0].top[2] < 10);
    assert.ok(result.values[2].top[0] > 220 && result.values[2].top[2] < 30);
  } finally { await browser.close(); }
});
