(function (root) {
  'use strict';
  const C = root.ZMACore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const P = root.ZMAPageImageCore || (typeof require !== 'undefined' ? require('./page-image-core.js') : null);
  const cancelled = () => Object.assign(new Error('PDF 导出已取消'), { name: 'AbortError' });
  function checkAbort(signal) { if (signal?.aborted) throw cancelled(); }

  function jpegOrientation(bytes) {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset] !== 255 || bytes[offset + 1] === 218 || bytes[offset + 1] === 217) break;
      const length = data.getUint16(offset + 2), end = offset + 2 + length;
      if (length < 2 || end > bytes.length) break;
      if (bytes[offset + 1] === 225 && length >= 16 && [69, 120, 105, 102, 0, 0].every((value, index) => bytes[offset + 4 + index] === value)) {
        const tiff = offset + 10, little = data.getUint16(tiff) === 0x4949;
        if (data.getUint16(tiff + 2, little) !== 42) return 1;
        const directory = tiff + data.getUint32(tiff + 4, little);
        if (directory < tiff || directory + 2 > end) return 1;
        const count = data.getUint16(directory, little);
        for (let index = 0; index < count; index++) {
          const entry = directory + 2 + index * 12; if (entry + 12 > end) break;
          if (data.getUint16(entry, little) === 274 && data.getUint16(entry + 2, little) === 3 && data.getUint32(entry + 4, little) === 1) {
            const orientation = data.getUint16(entry + 8, little); return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
      }
      offset = end;
    }
    return 1;
  }

  async function normalizeAsset(host, asset) {
    if (asset.mime === 'image/png' || asset.mime === 'image/jpeg' && jpegOrientation(asset.bytes) === 1) return asset;
    const win = host.runtimeWindow(), bitmap = await win.createImageBitmap(new win.Blob([asset.bytes], { type: asset.mime }));
    const canvas = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    try {
      canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('图片无法转换为 PDF 可用格式');
      const bytes = new Uint8Array(host.unwrap(await host.attachmentManager.readInput(blob)));
      return { id: asset.id, mime: 'image/png', bytes };
    } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
  }

  async function snapshot(host, reader) {
    return host.imageManager.transaction(reader, async () => {
      const state = await host.load(reader), info = await host.pageImageInfo(reader);
      const placements = (state.pageImages || []).map(P.cleanPlacement);
      if (!placements.length) throw new Error('当前 PDF 尚无页面图片');
      if (placements.some(image => image.fingerprint !== info.fingerprint || image.pageIndex >= info.pageCount)) throw new Error('图片来源已经改变，请重新放置后导出');
      const used = new Set(placements.map(image => image.imageID)), images = state.images.filter(image => used.has(image.id)).map(image => ({ ...image }));
      if (images.length !== used.size) throw new Error('页面图片资产缺失');
      const sourcePath = await host.Z.Items.get(Number(reader.itemID)).getFilePathAsync();
      return { scopeKey: C.scopeKey(host.scope(reader)), sourcePath, fingerprint: info.fingerprint, placements, images };
    });
  }

  async function verifySource(host, reader, value) {
    const path = await host.Z.Items.get(Number(reader.itemID)).getFilePathAsync();
    if (C.scopeKey(host.scope(reader)) !== value.scopeKey || path !== value.sourcePath || await host.fingerprint(reader) !== value.fingerprint) throw new Error('导出期间原 PDF 文件已经改变，请重试');
  }

  function sameFile(host, source, target) {
    const original = host.Z.File.pathToFile(source), chosen = host.Z.File.pathToFile(target), parent = chosen.parent;
    original.normalize(); parent.normalize(); parent.append(chosen.leafName); return original.equals(parent);
  }

  function runWorker(host, data, signal, onProgress) {
    const worker = host.createImageExportWorker();
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        signal?.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; worker.terminate();
        if (error) reject(error); else resolve(value);
      };
      const abort = () => finish(cancelled());
      worker.onmessage = event => {
        const message = host.unwrap(event.data);
        if (message.type === 'progress') onProgress('正在合成图片 ' + message.progress.completed + ' / ' + message.progress.total);
        else if (message.type === 'completed') finish(null, new Uint8Array(host.unwrap(message.pdfBytes)));
        else if (message.type === 'error') finish(new Error('PDF 解析或图片合成失败，请检查源文件和图片格式。'));
      };
      worker.onerror = event => { event.preventDefault?.(); finish(new Error('PDF 导出后台处理失败')); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try { worker.postMessage(data, [data.pdfBytes.buffer, ...data.images.map(image => image.bytes.buffer)]); }
      catch { finish(new Error('无法启动 PDF 图片合成任务')); }
    });
  }

  /** @param {{signal?: AbortSignal, onProgress?: (message: string) => void}} [options] */
  async function exportPDF(host, reader, value, target, options = {}) {
    const { signal, onProgress = (_message) => {} } = options;
    checkAbort(signal); await verifySource(host, reader, value);
    if (sameFile(host, value.sourcePath, target)) throw new Error('请选择新的导出文件，当前原 PDF 文件受保护');
    const id = host.runtimeWindow().crypto.randomUUID(), intermediate = target + '.zma-' + id + '.source.pdf', temporary = target + '.zma-' + id + '.tmp';
    if (await host.IO.exists(intermediate) || await host.IO.exists(temporary)) throw new Error('导出临时文件已存在，请重试');
    try {
      onProgress('正在导出原有标注…'); checkAbort(signal);
      await host.Z.PDFWorker.export(Number(reader.itemID), intermediate, true);
      checkAbort(signal); await verifySource(host, reader, value);
      const images = [];
      for (let index = 0; index < value.images.length; index++) {
        checkAbort(signal); onProgress('正在处理图片 ' + (index + 1) + ' / ' + value.images.length);
        const asset = value.images[index], loaded = await host.imageManager.readBytes(reader, asset);
        images.push(await normalizeAsset(host, { id: asset.id, ...loaded }));
      }
      checkAbort(signal);
      const pdfBytes = new Uint8Array(host.unwrap(await host.IO.read(intermediate)));
      const bytes = await runWorker(host, { pdfBytes, images, placements: value.placements }, signal, onProgress);
      checkAbort(signal); await verifySource(host, reader, value); checkAbort(signal); onProgress('正在保存 PDF…');
      await host.IO.write(target, bytes, { tmpPath: temporary }); return target;
    } finally {
      for (const file of [intermediate, temporary]) if (await host.IO.exists(file)) await host.IO.remove(file);
    }
  }

  const api = { snapshot, normalizeAsset, exportPDF };
  root.ZMAPageImageExport = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
