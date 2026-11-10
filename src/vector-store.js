(function (root) {
  'use strict';
  const V = root.ZMAVectors || (typeof require === 'function' ? require('./vector-core.js') : null);
  const M = root.ZMAMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);
  const check = valid => { if (valid && !valid()) throw new Error('Vector operation cancelled or stale'); };
  const name = value => {
    if (typeof value !== 'string' || !value || value.length > 2048) throw new Error('Invalid vector namespace');
    return value;
  };
  const digest = key => {
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid vector input key');
    return key;
  };
  const pageLimit = (value, fallback) => {
    const result = value ?? fallback;
    if (!Number.isSafeInteger(result) || result < 1 || result > 1024) throw new Error('Invalid vector page limit');
    return result;
  };
  function safeControl(value) {
    if (!value || typeof value !== 'object' || !['idle', 'pilot', 'full'].includes(value.mode)
      || typeof value.paused !== 'boolean' || typeof value.scanID !== 'string' || value.scanID.length > 512
      || !(typeof value.cursor === 'string' && value.cursor.length <= 4096 || Number.isSafeInteger(value.cursor) && value.cursor >= 0)
      || value.completed !== undefined && typeof value.completed !== 'boolean') throw new Error('Invalid vector scan control');
    // Deliberate allowlist: credentials and arbitrary nested values never persist.
    return { mode: value.mode, paused: value.paused, cursor: value.cursor, scanID: value.scanID, completed: value.completed === true };
  }

  // The caller owns an independent vectors-v1.sqlite connection, never Zotero's
  // user database. All writes queue through its native async transaction API.
  class Store {
    constructor(connection) {
      this.db = connection;
      this.writes = Promise.resolve();
      this.closed = false;
    }

    write(action) {
      if (this.closed) return Promise.reject(new Error('Vector store closed'));
      const work = this.writes.catch(() => {}).then(() => this.db.executeTransaction(action));
      this.writes = work;
      return work;
    }

    async read(action) {
      await this.writes.catch(() => {});
      if (this.closed) throw new Error('Vector store closed');
      return action();
    }

    async open() {
      const statements = [
        'CREATE TABLE IF NOT EXISTS rag_spaces (namespace TEXT PRIMARY KEY, libraryID INTEGER NOT NULL, dimensions INTEGER NOT NULL, model TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, control TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS rag_sources (namespace TEXT NOT NULL, anchor TEXT NOT NULL, data TEXT NOT NULL, keysJSON TEXT NOT NULL, scanID TEXT NOT NULL, paperKey TEXT NOT NULL, attachmentKey TEXT NOT NULL, kind TEXT NOT NULL, conversationId TEXT NOT NULL, PRIMARY KEY(namespace,anchor))',
        'CREATE TABLE IF NOT EXISTS rag_vectors (namespace TEXT NOT NULL, inputKey TEXT NOT NULL, input TEXT NOT NULL, encoded TEXT, compact TEXT, norm REAL, dimensions INTEGER, PRIMARY KEY(namespace,inputKey))',
        'CREATE TABLE IF NOT EXISTS rag_links (id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT NOT NULL, anchor TEXT NOT NULL, position INTEGER NOT NULL, inputKey TEXT NOT NULL, UNIQUE(namespace,anchor,position))',
        'CREATE INDEX IF NOT EXISTS rag_links_input ON rag_links(namespace,inputKey)',
        'CREATE INDEX IF NOT EXISTS rag_links_source ON rag_links(namespace,anchor)',
        'CREATE INDEX IF NOT EXISTS rag_sources_scan ON rag_sources(namespace,scanID)'
      ];
      await this.write(async () => { for (const sql of statements) await this.db.queryAsync(sql); });
    }

    async space(namespace) {
      const rows = await this.db.queryAsync('SELECT libraryID,dimensions,model,revision,control FROM rag_spaces WHERE namespace=?', [name(namespace)]);
      if (!rows.length) throw new Error('Vector space is not configured');
      return rows[0];
    }

    async bump(namespace) {
      await this.db.queryAsync('UPDATE rag_spaces SET revision=revision+1 WHERE namespace=?', [namespace]);
    }

    async configure(space) {
      name(space?.namespace);
      if (!Number.isSafeInteger(space.libraryID) || space.libraryID < 1 || !Number.isSafeInteger(space.dimensions)
        || space.dimensions < 1 || space.dimensions > 65536 || typeof space.model !== 'string' || !space.model || space.model.length > 512) throw new Error('Invalid vector space');
      return this.write(async () => {
        const rows = await this.db.queryAsync('SELECT libraryID,dimensions,model FROM rag_spaces WHERE namespace=?', [space.namespace]);
        if (rows.length) {
          if (rows[0].libraryID !== space.libraryID || rows[0].dimensions !== space.dimensions || rows[0].model !== space.model) throw new Error('Vector space dimensions or identity changed');
          return;
        }
        await this.db.queryAsync('INSERT INTO rag_spaces(namespace,libraryID,dimensions,model,control) VALUES (?,?,?,?,?)',
          [space.namespace, space.libraryID, space.dimensions, space.model, JSON.stringify({ mode: 'idle', paused: true, cursor: '', scanID: '', completed: false })]);
      });
    }

    async sync(namespace, source, segments, scanID) {
      name(namespace);
      const clean = M.cleanSources([{ ...source, label: '阅读1' }])[0], anchor = V.anchorKey(clean), data = JSON.stringify(clean);
      if (!Array.isArray(segments) || segments.length > 10000 || typeof scanID !== 'string' || !scanID || scanID.length > 512) throw new Error('Invalid vector source segments or scan');
      const items = segments.map(segment => {
        const key = digest(segment?.key);
        if (typeof segment.input !== 'string' || !segment.input.trim() || new TextEncoder().encode(segment.input).length > 8000) throw new Error('Invalid vector source input');
        return { key, input: segment.input };
      });
      const keysJSON = JSON.stringify(items.map(item => item.key));
      return this.write(async () => {
        const space = await this.space(namespace);
        if (clean.libraryID !== space.libraryID) throw new Error('Vector source library mismatch');
        const rows = await this.db.queryAsync('SELECT data,keysJSON FROM rag_sources WHERE namespace=? AND anchor=?', [namespace, anchor]);
        const same = rows[0]?.data === data && rows[0]?.keysJSON === keysJSON;
        for (const item of items) {
          const existing = await this.db.queryAsync('SELECT input FROM rag_vectors WHERE namespace=? AND inputKey=?', [namespace, item.key]);
          if (existing.length && existing[0].input !== item.input) throw new Error('Vector input key collision');
          if (!existing.length) await this.db.queryAsync('INSERT INTO rag_vectors(namespace,inputKey,input) VALUES (?,?,?)', [namespace, item.key, item.input]);
        }
        if (same) {
          await this.db.queryAsync('UPDATE rag_sources SET scanID=? WHERE namespace=? AND anchor=?', [scanID, namespace, anchor]);
          return;
        }
        // Remove the former associations before any new embedding can publish.
        await this.db.queryAsync('DELETE FROM rag_links WHERE namespace=? AND anchor=?', [namespace, anchor]);
        await this.db.queryAsync('DELETE FROM rag_sources WHERE namespace=? AND anchor=?', [namespace, anchor]);
        await this.db.queryAsync('INSERT INTO rag_sources(namespace,anchor,data,keysJSON,scanID,paperKey,attachmentKey,kind,conversationId) VALUES (?,?,?,?,?,?,?,?,?)',
          [namespace, anchor, data, keysJSON, scanID, clean.paperKey || '', clean.attachmentKey, clean.kind, clean.conversationId]);
        for (let i = 0; i < items.length; i++) await this.db.queryAsync('INSERT INTO rag_links(namespace,anchor,position,inputKey) VALUES (?,?,?,?)', [namespace, anchor, i, items[i].key]);
        await this.bump(namespace);
      });
    }

    async pending(namespace, limit = 8) {
      limit = pageLimit(limit, 8);
      return this.read(async () => {
        await this.space(namespace);
        const rows = await this.db.queryAsync('SELECT v.inputKey,v.input FROM rag_vectors v JOIN rag_links l ON l.namespace=v.namespace AND l.inputKey=v.inputKey WHERE v.namespace=? AND v.encoded IS NULL GROUP BY v.inputKey,v.input ORDER BY MIN(l.id) LIMIT ?', [namespace, limit]);
        return rows.map(row => ({ key: row.inputKey, input: row.input }));
      });
    }

    async commit(namespace, records, valid) {
      name(namespace);
      if (!Array.isArray(records) || records.length > 1024) throw new Error('Invalid vector records');
      return this.write(async () => {
        check(valid);
        const space = await this.space(namespace), seen = new Set();
        let changed = false;
        for (const record of records) {
          const key = digest(record?.key);
          if (seen.has(key)) throw new Error('Duplicate vector record');
          seen.add(key);
          const packed = V.pack(record.vector);
          if (packed.dimensions !== space.dimensions) throw new Error('Invalid vector dimensions');
          V.unpack(packed.encoded, space.dimensions);
          const rows = await this.db.queryAsync('SELECT encoded FROM rag_vectors WHERE namespace=? AND inputKey=?', [namespace, key]);
          if (!rows.length || rows[0].encoded !== null) continue;
          await this.db.queryAsync('UPDATE rag_vectors SET encoded=?,compact=?,norm=?,dimensions=? WHERE namespace=? AND inputKey=?', [packed.encoded, packed.compact, packed.norm, packed.dimensions, namespace, key]);
          const active = await this.db.queryAsync('SELECT id FROM rag_links WHERE namespace=? AND inputKey=? LIMIT 1', [namespace, key]);
          changed ||= active.length > 0;
        }
        if (changed) await this.bump(namespace);
        check(valid);
      });
    }

    async vectors(namespace, { afterId = 0, limit = 128 } = {}) {
      limit = pageLimit(limit, 128);
      if (!Number.isSafeInteger(afterId) || afterId < 0) throw new Error('Invalid vector page cursor');
      return this.read(async () => {
        await this.space(namespace);
        const rows = await this.db.queryAsync('SELECT l.id,s.paperKey,s.attachmentKey,s.kind,s.conversationId,v.encoded,v.compact,v.norm,v.dimensions FROM rag_links l JOIN rag_sources s ON s.namespace=l.namespace AND s.anchor=l.anchor JOIN rag_vectors v ON v.namespace=l.namespace AND v.inputKey=l.inputKey WHERE l.namespace=? AND l.id>? AND v.encoded IS NOT NULL ORDER BY l.id LIMIT ?', [namespace, afterId, limit]);
        return rows.map(row => ({ id: row.id, paperKey: row.paperKey, attachmentKey: row.attachmentKey, kind: row.kind, conversationId: row.conversationId,
          encoded: row.encoded, compact: row.compact, norm: row.norm, dimensions: row.dimensions }));
      });
    }

    async sources(namespace, ids) {
      if (!Array.isArray(ids) || ids.length > 1024 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid vector source IDs');
      return this.read(async () => {
        await this.space(namespace);
        if (!ids.length) return [];
        const rows = await this.db.queryAsync('SELECT l.id,s.data,v.encoded,v.dimensions FROM rag_links l JOIN rag_sources s ON s.namespace=l.namespace AND s.anchor=l.anchor JOIN rag_vectors v ON v.namespace=l.namespace AND v.inputKey=l.inputKey WHERE l.namespace=? AND v.encoded IS NOT NULL AND l.id IN (' + ids.map(() => '?').join(',') + ') ORDER BY l.id', [namespace, ...ids]);
        return rows.map(row => ({ id: row.id, source: JSON.parse(row.data), encoded: row.encoded, dimensions: row.dimensions }));
      });
    }

    async stats(namespace) {
      return this.read(async () => {
        const space = await this.space(namespace);
        const count = async sql => (await this.db.queryAsync(sql, [namespace]))[0].total;
        const readySegments = await count('SELECT COUNT(*) AS total FROM rag_links l JOIN rag_vectors v ON v.namespace=l.namespace AND v.inputKey=l.inputKey WHERE l.namespace=? AND v.encoded IS NOT NULL');
        const readySources = await count('SELECT COUNT(*) AS total FROM rag_sources s WHERE s.namespace=? AND EXISTS (SELECT 1 FROM rag_links l WHERE l.namespace=s.namespace AND l.anchor=s.anchor) AND NOT EXISTS (SELECT 1 FROM rag_links l JOIN rag_vectors v ON v.namespace=l.namespace AND v.inputKey=l.inputKey WHERE l.namespace=s.namespace AND l.anchor=s.anchor AND v.encoded IS NULL)');
        const pending = await count('SELECT COUNT(DISTINCT l.inputKey) AS total FROM rag_links l JOIN rag_vectors v ON v.namespace=l.namespace AND v.inputKey=l.inputKey WHERE l.namespace=? AND v.encoded IS NULL');
        return { readySegments, readySources, pending, failed: 0, revision: space.revision };
      });
    }

    async control(namespace) {
      return this.read(async () => safeControl(JSON.parse((await this.space(namespace)).control)));
    }

    async setControl(namespace, value) {
      const data = JSON.stringify(safeControl(value));
      return this.write(async () => {
        await this.space(namespace);
        await this.db.queryAsync('UPDATE rag_spaces SET control=? WHERE namespace=?', [data, namespace]);
      });
    }

    async prune(namespace, scanID, valid) {
      return this.write(async () => {
        check(valid);
        const control = safeControl(JSON.parse((await this.space(namespace)).control));
        if (control.mode !== 'full' || control.paused || !control.completed || !scanID || control.scanID !== scanID) throw new Error('Prune requires a completed full scan');
        const stale = await this.db.queryAsync('SELECT anchor FROM rag_sources WHERE namespace=? AND scanID<>? LIMIT 1', [namespace, scanID]);
        await this.db.queryAsync('DELETE FROM rag_links WHERE namespace=? AND anchor IN (SELECT anchor FROM rag_sources WHERE namespace=? AND scanID<>?)', [namespace, namespace, scanID]);
        await this.db.queryAsync('DELETE FROM rag_sources WHERE namespace=? AND scanID<>?', [namespace, scanID]);
        if (stale.length) await this.bump(namespace);
        check(valid);
      });
    }

    async clear(namespace) {
      return this.write(async () => {
        await this.space(namespace);
        for (const table of ['rag_links', 'rag_sources', 'rag_vectors']) await this.db.queryAsync('DELETE FROM ' + table + ' WHERE namespace=?', [namespace]);
        await this.db.queryAsync('UPDATE rag_spaces SET control=? WHERE namespace=?', [JSON.stringify({ mode: 'idle', paused: true, cursor: '', scanID: '', completed: false }), namespace]);
        await this.bump(namespace);
      });
    }

    async close() {
      if (this.closed) return;
      this.closed = true;
      await this.writes.catch(() => {});
      await this.db.closeDatabase();
    }
  }

  root.ZMAVectorStore = { Store };
  if (typeof module !== 'undefined') module.exports = { Store };
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
