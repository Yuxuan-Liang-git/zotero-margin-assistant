(function (root) {
  'use strict';
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
  const check = valid => { if (valid && !valid()) throw new Error('文献索引操作已取消或过期'); };

  // This connection belongs only to the rebuildable plugin index. Zotero's
  // bibliographic database and its native full-text index are never written here.
  class Index {
    constructor(db, libraryID) {
      this.db = db;
      this.libraryID = libraryID;
      this.writes = Promise.resolve();
      this.counter = 0;
    }

    write(action) {
      const task = this.writes.catch(() => {}).then(() => this.db.executeTransaction(action));
      this.writes = task;
      return task;
    }

    async open() {
      await this.db.queryAsync('CREATE TABLE IF NOT EXISTS papers (paperKey TEXT PRIMARY KEY, data TEXT NOT NULL)');
      await this.db.queryAsync('CREATE TABLE IF NOT EXISTS units (unitKey TEXT PRIMARY KEY, paperKey TEXT NOT NULL, fingerprint TEXT NOT NULL, generation TEXT NOT NULL, data TEXT NOT NULL)');
      await this.db.queryAsync('CREATE INDEX IF NOT EXISTS units_paper ON units(paperKey)');
      await this.db.queryAsync('CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, unitKey TEXT NOT NULL, generation TEXT NOT NULL, data TEXT NOT NULL)');
      await this.db.queryAsync('CREATE INDEX IF NOT EXISTS chunks_unit ON chunks(unitKey,generation)');
      await this.db.queryAsync('CREATE TABLE IF NOT EXISTS terms (term TEXT NOT NULL, chunkID INTEGER NOT NULL, weight INTEGER NOT NULL, PRIMARY KEY(term,chunkID)) WITHOUT ROWID');
      await this.db.queryAsync('CREATE INDEX IF NOT EXISTS terms_chunk ON terms(chunkID)');
      await this.write(async () => {
        await this.db.queryAsync('DELETE FROM terms WHERE chunkID IN (SELECT c.id FROM chunks c LEFT JOIN units u ON u.unitKey=c.unitKey WHERE u.unitKey IS NULL OR c.generation<>u.generation)');
        await this.db.queryAsync('DELETE FROM chunks WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.unitKey=chunks.unitKey AND u.generation=chunks.generation)');
      });
    }

    async replacePaper(paper, valid) {
      if (paper.libraryID !== this.libraryID || !/^[A-Z0-9]{8}$/.test(paper.key)) throw new Error('文献身份无效');
      await this.write(async () => {
        check(valid);
        await this.db.queryAsync('REPLACE INTO papers(paperKey,data) VALUES (?,?)', [paper.key, JSON.stringify(paper)]);
        check(valid);
      });
    }

    async units(paperKey) {
      const rows = await this.db.queryAsync('SELECT data,generation FROM units WHERE paperKey=?', [paperKey]);
      return rows.map(row => ({ ...JSON.parse(row.data), generation: row.generation }));
    }

    async beginUnit(unit, valid) {
      const generation = Date.now().toString(36) + '-' + (++this.counter);
      await this.write(async () => {
        check(valid);
        const rows = await this.db.queryAsync('SELECT fingerprint,generation,data FROM units WHERE unitKey=?', [unit.key]);
        const current = rows[0];
        const active = current?.fingerprint === unit.fingerprint ? current.generation : '';
        await this.db.queryAsync('REPLACE INTO units(unitKey,paperKey,fingerprint,generation,data) VALUES (?,?,?,?,?)',
          [unit.key, unit.paperKey, unit.fingerprint, active, active ? current.data : JSON.stringify(unit)]);
        check(valid);
      });
      return generation;
    }

    async append(unit, generation, chunks, valid) {
      await this.write(async () => {
        for (const chunk of chunks) {
          check(valid);
          const source = {
            version: 2, label: '阅读1', libraryID: this.libraryID, paperKey: unit.paperKey, sourceKey: unit.sourceKey,
            attachmentKey: unit.attachmentKey || '', title: unit.title, year: unit.year || '', doi: unit.doi || '',
            kind: unit.kind, conversationId: '', messageIndex: 0, part: chunk.part,
            signature: M.signature(chunk.text), fingerprint: unit.fingerprint, updatedAt: unit.updatedAt || 0, text: chunk.text,
            ...(chunk.pageIndex !== undefined ? { pageIndex: chunk.pageIndex } : {})
          };
          M.cleanSources([source]);
          await this.db.queryAsync('INSERT INTO chunks(unitKey,generation,data) VALUES (?,?,?)', [unit.key, generation, JSON.stringify(source)]);
          const rows = await this.db.queryAsync('SELECT last_insert_rowid() AS id');
          const id = rows[0].id;
          const words = M.frequencies(chunk.text).terms;
          for (const term of M.tokens(unit.title + ' ' + unit.doi)) if (term in words) words[term] += 2;
          const entries = Object.entries(words);
          // Keep each prepared statement below SQLite's parameter limit.
          for (let at = 0; at < entries.length; at += 100) {
            const batch = entries.slice(at, at + 100);
            const placeholders = batch.map(() => '(?,?,?)').join(',');
            const params = batch.flatMap(([term, weight]) => [term, id, Math.min(Number(weight), 8)]);
            await this.db.queryAsync('INSERT INTO terms(term,chunkID,weight) VALUES ' + placeholders, params);
            check(valid);
          }
        }
        check(valid);
      });
    }

    async commitUnit(unit, generation, valid) {
      await this.write(async () => {
        check(valid);
        await this.db.queryAsync('DELETE FROM terms WHERE chunkID IN (SELECT id FROM chunks WHERE unitKey=? AND generation<>?)', [unit.key, generation]);
        await this.db.queryAsync('DELETE FROM chunks WHERE unitKey=? AND generation<>?', [unit.key, generation]);
        await this.db.queryAsync('UPDATE units SET generation=?,fingerprint=?,data=? WHERE unitKey=?', [generation, unit.fingerprint, JSON.stringify(unit), unit.key]);
        check(valid);
      });
    }

    async removeUnits(paperKey, keep, valid) {
      const units = await this.units(paperKey);
      await this.write(async () => {
        for (const unit of units) {
          if (keep.has(unit.key)) continue;
          check(valid);
          await this.db.queryAsync('DELETE FROM terms WHERE chunkID IN (SELECT id FROM chunks WHERE unitKey=?)', [unit.key]);
          await this.db.queryAsync('DELETE FROM chunks WHERE unitKey=?', [unit.key]);
          await this.db.queryAsync('DELETE FROM units WHERE unitKey=?', [unit.key]);
        }
        check(valid);
      });
    }

    async prune(keys, valid) {
      for (const paper of await this.papers()) {
        check(valid);
        if (!keys.has(paper.key)) {
          await this.removeUnits(paper.key, new Set(), valid);
          await this.write(async () => { check(valid); await this.db.queryAsync('DELETE FROM papers WHERE paperKey=?', [paper.key]); check(valid); });
        }
        await yieldControl();
      }
    }

    async papers() {
      const papers = [];
      let cursor = '';
      while (true) {
        const rows = await this.db.queryAsync('SELECT paperKey,data FROM papers WHERE paperKey>? ORDER BY paperKey LIMIT 64', [cursor]);
        if (!rows.length) break;
        for (const row of rows) { papers.push(JSON.parse(row.data)); cursor = row.paperKey; }
        await yieldControl();
      }
      return papers;
    }

    async status() {
      const total = (await this.db.queryAsync('SELECT COUNT(*) AS count FROM papers'))[0].count;
      const rows = await this.db.queryAsync('SELECT data FROM units WHERE unitKey LIKE ?', ['pdf-%']);
      const counts = {};
      for (const row of rows) { const unit = JSON.parse(row.data); counts[unit.status] = (counts[unit.status] || 0) + 1; }
      const metadata = (await this.db.queryAsync("SELECT COUNT(*) AS count FROM units WHERE unitKey LIKE ? AND generation<>''", ['metadata-%']))[0].count;
      return { total, metadata, counts };
    }

    async search(query, options = {}) {
      const words = [...new Set(M.tokens(query))].slice(0, 32);
      if (!words.length) return [];
      const questionWords = [...new Set(M.tokens(options.question || String(query).split('\n')[0]))].slice(0, 32);
      const placeholders = words.map(() => '?').join(',');
      const boost = questionWords.length ? 'CASE WHEN t.term IN (' + questionWords.map(() => '?').join(',') + ') THEN 4.0 ELSE 1.0 END' : '1.0';
      const scored = 'SELECT c.data,u.paperKey,SUM(t.weight*(' + boost + ')/f.df) AS score FROM terms t '
        + 'JOIN (SELECT term,COUNT(*) AS df FROM terms WHERE term IN (' + placeholders + ') GROUP BY term) f ON f.term=t.term '
        + 'JOIN chunks c ON c.id=t.chunkID '
        + 'JOIN units u ON u.unitKey=c.unitKey AND u.generation=c.generation JOIN papers p ON p.paperKey=u.paperKey '
        + 'WHERE t.term IN (' + placeholders + ") GROUP BY c.id HAVING COUNT(*)>=? OR MAX(CASE WHEN LENGTH(t.term)>=6 AND t.term GLOB '[a-z]*' THEN 1 ELSE 0 END)=1";
      // Inverse term frequency protects rare question words, while the window
      // cap keeps one long paper from consuming every candidate slot.
      const rows = await this.db.queryAsync('SELECT data FROM (SELECT data,score,ROW_NUMBER() OVER (PARTITION BY paperKey ORDER BY score DESC) AS paperRank FROM (' + scored + ')) WHERE paperRank<=4 ORDER BY score DESC LIMIT 96',
        [...questionWords, ...words, ...words, Math.min(2, words.length)]);
      const sources = [];
      for (const [i, row] of rows.entries()) {
        check(() => !options.signal?.aborted);
        const source = JSON.parse(row.data);
        if (source.kind === 'pdf' && source.attachmentKey === options.attachmentKey) continue;
        if (source.kind === 'metadata' && source.paperKey === options.paperKey) continue;
        source.label = '阅读1';
        M.cleanSources([source]);
        sources.push(source);
        if (i % 16 === 0) await yieldControl();
      }
      return M.mergeSources(sources, options.question || query);
    }

    // Only active committed generations are visible; the opaque ID advances
    // across every page, even when a consumer filters individual sources.
    async sourcesPage({ afterId = 0, limit = 128 } = {}) {
      if (!Number.isSafeInteger(afterId) || afterId < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1024) throw new Error('Invalid committed source cursor');
      await this.writes.catch(() => {});
      const rows = await this.db.queryAsync('SELECT c.id,c.data FROM chunks c JOIN units u ON u.unitKey=c.unitKey AND u.generation=c.generation JOIN papers p ON p.paperKey=u.paperKey WHERE c.id>? ORDER BY c.id LIMIT ?', [afterId, limit]);
      return { phase: 'library', cursor: rows.length ? rows[rows.length - 1].id : afterId,
        sources: rows.map(row => ({ source: JSON.parse(row.data), cursor: row.id, phase: 'library' })) };
    }

    async contains(source) {
      const unitKey = source.kind + '-' + source.sourceKey;
      const rows = await this.db.queryAsync('SELECT c.data FROM chunks c JOIN units u ON u.unitKey=c.unitKey AND u.generation=c.generation WHERE c.unitKey=? ORDER BY c.id LIMIT 1 OFFSET ?', [unitKey, source.part]);
      if (!rows.length) return false;
      const current = JSON.parse(rows[0].data);
      return current.paperKey === source.paperKey && current.sourceKey === source.sourceKey && current.attachmentKey === source.attachmentKey
        && current.fingerprint === source.fingerprint && current.signature === source.signature && current.text === source.text && current.pageIndex === source.pageIndex;
    }

    async close() {
      await this.writes.catch(() => {});
      await this.db.closeDatabase(true);
    }
  }

  root.ZMALibraryIndex = { Index };
  if (typeof module !== 'undefined') module.exports = root.ZMALibraryIndex;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
