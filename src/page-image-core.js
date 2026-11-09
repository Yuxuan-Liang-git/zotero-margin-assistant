(function (root) {
  'use strict';
  const ID = /^[a-f0-9]{32}$/;

  function cleanPlacement(record) {
    if (!record || !ID.test(record.id) || !ID.test(record.imageID) || !Number.isSafeInteger(record.pageIndex) || record.pageIndex < 0 || typeof record.fingerprint !== 'string' || !record.fingerprint || record.fingerprint.length > 160) throw new Error('页面图片身份无效');
    const m = record.matrix;
    if (!Array.isArray(m) || m.length !== 6 || m.some(value => !Number.isFinite(value) || Math.abs(value) > 1e7)) throw new Error('页面图片位置无效');
    const width = Math.hypot(m[0], m[1]), height = Math.hypot(m[2], m[3]);
    if (width < 0.001 || height < 0.001 || m[0] * m[3] - m[1] * m[2] <= 0 || Math.abs(m[0] * m[2] + m[1] * m[3]) > width * height * 1e-6 || record.locked !== undefined && typeof record.locked !== 'boolean') throw new Error('页面图片变换无效');
    return { id: record.id, imageID: record.imageID, pageIndex: record.pageIndex, matrix: m.slice(), locked: !!record.locked, fingerprint: record.fingerprint };
  }

  function fromViewport(meta, rect, viewport) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error('页面图片尺寸无效');
    const origin = viewport.convertToPdfPoint(rect.x, rect.y + rect.height);
    const right = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height);
    const up = viewport.convertToPdfPoint(rect.x, rect.y);
    return cleanPlacement({ ...meta, matrix: [right[0] - origin[0], right[1] - origin[1], up[0] - origin[0], up[1] - origin[1], origin[0], origin[1]] });
  }

  function corners(record) {
    const m = record.matrix;
    return [[m[4], m[5]], [m[4] + m[0], m[5] + m[1]], [m[4] + m[2], m[5] + m[3]], [m[4] + m[0] + m[2], m[5] + m[1] + m[3]]];
  }

  function toViewport(record, viewport) {
    const m = record.matrix;
    const origin = viewport.convertToViewportPoint(m[4] + m[2], m[5] + m[3]);
    const right = viewport.convertToViewportPoint(m[4] + m[2] + m[0], m[5] + m[3] + m[1]);
    const down = viewport.convertToViewportPoint(m[4], m[5]);
    const points = corners(record).map(point => viewport.convertToViewportPoint(point[0], point[1]));
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, matrix: [right[0] - origin[0], right[1] - origin[1], down[0] - origin[0], down[1] - origin[1], origin[0], origin[1]] };
  }

  function within(record, bounds) {
    return corners(record).every(point => point[0] >= bounds[0] - 0.001 && point[0] <= bounds[2] + 0.001 && point[1] >= bounds[1] - 0.001 && point[1] <= bounds[3] + 0.001);
  }

  function move(record, dx, dy, viewport) {
    const box = toViewport(record, viewport), next = cleanPlacement(record);
    dx = Math.max(-box.x, Math.min(dx, viewport.width - box.x - box.width));
    dy = Math.max(-box.y, Math.min(dy, viewport.height - box.y - box.height));
    const start = viewport.convertToPdfPoint(0, 0), end = viewport.convertToPdfPoint(dx, dy);
    next.matrix[4] += end[0] - start[0]; next.matrix[5] += end[1] - start[1]; return next;
  }

  function resize(record, factor, viewport) {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('页面图片缩放无效');
    const box = toViewport(record, viewport), next = cleanPlacement(record);
    const maximum = Math.min((viewport.width - box.x) / box.width, (viewport.height - box.y) / box.height);
    factor = Math.min(maximum, Math.max(24 / Math.max(box.width, box.height), factor));
    const anchor = viewport.convertToPdfPoint(box.x, box.y);
    for (let i = 0; i < 4; i++) next.matrix[i] *= factor;
    next.matrix[4] = anchor[0] + (next.matrix[4] - anchor[0]) * factor;
    next.matrix[5] = anchor[1] + (next.matrix[5] - anchor[1]) * factor; return next;
  }

  const api = { cleanPlacement, fromViewport, toViewport, within, move, resize };
  root.ZMAPageImageCore = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
