(function (root) {
  'use strict';
  if (typeof module === 'undefined') root.importScripts('vendor/pdf-lib/pdf-lib.min.js', 'scripts/page-image-core.js');
  const PDF = root.PDFLib || require('pdf-lib');
  const P = root.ZMAPageImageCore || require('../src/page-image-core.js');

  async function compose(input, onProgress = () => {}) {
    const placements = input.placements.map(P.cleanPlacement);
    const document = await PDF.PDFDocument.load(input.pdfBytes, { updateMetadata: false });
    const pages = document.getPages(), embedded = new Map();
    const used = new Set(placements.map(image => image.imageID));
    for (const asset of input.images) {
      if (!used.has(asset.id)) continue;
      let image;
      if (asset.mime === 'image/png') image = await document.embedPng(asset.bytes);
      else if (asset.mime === 'image/jpeg') image = await document.embedJpg(asset.bytes);
      else throw new Error('导出图片需要 PNG 或 JPEG 数据');
      embedded.set(asset.id, image);
    }
    for (let index = 0; index < placements.length; index++) {
      const record = placements[index], page = pages[record.pageIndex], image = embedded.get(record.imageID);
      if (!page || !image) throw new Error('页面图片或页码无效');
      const crop = page.getCropBox();
      if (!P.within(record, [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height])) throw new Error('图片超出 PDF 页面范围');
      const m = record.matrix;
      page.drawImage(image, { x: m[4], y: m[5], width: Math.hypot(m[0], m[1]), height: Math.hypot(m[2], m[3]), rotate: PDF.degrees(Math.atan2(m[1], m[0]) * 180 / Math.PI) });
      onProgress({ completed: index + 1, total: placements.length });
    }
    return document.save({ updateFieldAppearances: false });
  }

  if (typeof module !== 'undefined') module.exports = { compose };
  else root.onmessage = async event => {
    try {
      const bytes = await compose(event.data, progress => root.postMessage({ type: 'progress', progress }));
      root.postMessage({ type: 'completed', pdfBytes: bytes }, [bytes.buffer]);
    } catch {
      root.postMessage({ type: 'error', message: 'PDF 解析或图片合成失败，请检查源文件和图片格式。' });
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
