(function (root) {
  'use strict';

  const MAX_DIMENSIONS = 65536;
  function dimension(value) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DIMENSIONS) throw new Error('Invalid vector dimensions');
    return value;
  }

  // Scaling first also handles finite inputs whose ordinary sum of squares overflows.
  function normalized(vector) {
    if (!vector || typeof vector.length !== 'number') throw new Error('Invalid vector');
    dimension(vector.length);
    let scale = 0;
    for (const value of vector) {
      if (!Number.isFinite(value)) throw new Error('Invalid vector value');
      scale = Math.max(scale, Math.abs(value));
    }
    if (!scale) throw new Error('Invalid vector zero norm');
    let squared = 0;
    for (const value of vector) squared += (value / scale) ** 2;
    const length = Math.sqrt(squared);
    return Float32Array.from(vector, value => value / scale / length);
  }

  function base64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }

  function pack(vector) {
    const floats = normalized(vector);
    const bytes = new Uint8Array(floats.length * 4), compact = new Uint8Array(floats.length);
    const view = new DataView(bytes.buffer);
    let squared = 0, compactScale = 0;
    for (const value of floats) compactScale = Math.max(compactScale, Math.abs(value));
    for (let i = 0; i < floats.length; i++) {
      view.setFloat32(i * 4, floats[i], true);
      const value = Math.sign(floats[i]) * Math.round(Math.abs(floats[i]) / compactScale * 127);
      compact[i] = value & 255;
      squared += value * value;
    }
    return { encoded: base64(bytes), compact: base64(compact), norm: Math.sqrt(squared), dimensions: floats.length };
  }

  function unpack(encoded, dimensions) {
    dimension(dimensions);
    if (typeof encoded !== 'string' || encoded.length !== 4 * Math.ceil(dimensions * 4 / 3)
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid vector encoding');
    const binary = atob(encoded);
    if (binary.length !== dimensions * 4) throw new Error('Invalid vector byte length');
    const bytes = Uint8Array.from(binary, value => value.charCodeAt(0));
    if (base64(bytes) !== encoded) throw new Error('Invalid vector noncanonical encoding');
    const view = new DataView(bytes.buffer), vector = new Float32Array(dimensions);
    let nonzero = false;
    for (let i = 0; i < dimensions; i++) {
      vector[i] = view.getFloat32(i * 4, true);
      if (!Number.isFinite(vector[i])) throw new Error('Invalid vector value');
      nonzero ||= vector[i] !== 0;
    }
    if (!nonzero) throw new Error('Invalid vector zero norm');
    return vector;
  }

  function cosine(query, vector) {
    if (!query || !vector || query.length !== vector.length) throw new Error('Invalid vector dimensions');
    dimension(query.length);
    let aScale = 0, bScale = 0;
    for (let i = 0; i < query.length; i++) {
      if (!Number.isFinite(query[i]) || !Number.isFinite(vector[i])) throw new Error('Invalid vector value');
      aScale = Math.max(aScale, Math.abs(query[i])); bScale = Math.max(bScale, Math.abs(vector[i]));
    }
    if (!aScale || !bScale) throw new Error('Invalid vector zero norm');
    // Accumulate from the original float32 values in double precision. Do not
    // round a second normalized float32 copy before comparing close scores.
    let dot = 0, aSquared = 0, bSquared = 0;
    for (let i = 0; i < query.length; i++) {
      const a = query[i] / aScale, b = vector[i] / bScale;
      dot += a * b; aSquared += a * a; bSquared += b * b;
    }
    return Math.max(-1, Math.min(1, dot / Math.sqrt(aSquared * bSquared)));
  }

  function anchorKey(source) {
    return JSON.stringify([source.libraryID, source.paperKey || '', source.attachmentKey || '', source.sourceKey || '',
      source.kind, source.conversationId || '', source.messageIndex, source.part]);
  }

  function hybridSelect(candidates, _query, options = {}) {
    const memory = root.ZMAMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);
    if (!memory) throw new Error('Memory core is required for source selection');
    const bound = (value, fallback, maximum) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, maximum) : fallback;
    const maxPapers = bound(options.maxPapers, 3, 3), maxChars = bound(options.maxChars, 6000, 6000);
    const maxFragment = bound(options.maxFragment, 1800, 1800), perPaper = bound(options.perPaper, 4, 4);
    const byAnchor = new Map();
    for (const candidate of candidates) {
      const source = candidate?.source;
      if (!source || source.text?.length > maxFragment || options.scope && source.libraryID !== options.scope.libraryID
        || options.scope?.attachmentKey === source.attachmentKey && source.kind === 'dialogue' && source.conversationId === options.conversationId) continue;
      const rank = value => Number.isSafeInteger(value) && value > 0 ? 1 / (60 + value) : 0;
      const dense = candidate.score === undefined || Number.isFinite(candidate.score) && candidate.score > 0
        ? rank(candidate.denseRank) || (Number.isFinite(candidate.score) && candidate.score > 0 ? candidate.score / 61 : 0) : 0;
      const score = dense + rank(candidate.sparseRank);
      if (!(score > 0)) continue;
      let clean;
      try { clean = memory.cleanSources([{ ...source, label: '阅读1' }])[0]; } catch { continue; }
      const key = anchorKey(clean), existing = byAnchor.get(key);
      if (existing) existing.score = Math.max(existing.score, score);
      else byAnchor.set(key, { source: clean, score });
    }
    const sorted = [...byAnchor.values()].sort((a, b) => b.score - a.score);
    const papers = new Map(), seen = new Set(), result = [];
    let used = 0;
    for (const { source } of sorted) {
      const paper = source.libraryID + ':' + (source.paperKey || source.attachmentKey);
      const text = source.text.replace(/\s+/g, ' ').trim();
      if (seen.has(text) || used + source.text.length > maxChars || (papers.get(paper) || 0) >= perPaper
        || !papers.has(paper) && papers.size >= maxPapers || result.length >= 12) continue;
      result.push({ ...source, label: '阅读' + (result.length + 1) });
      papers.set(paper, (papers.get(paper) || 0) + 1);
      seen.add(text); used += source.text.length;
    }
    return result;
  }

  const api = { pack, unpack, cosine, anchorKey, hybridSelect };
  root.ZMAVectors = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
