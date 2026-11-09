(function (root) {
  'use strict';
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const Index = root.ZMALibraryIndex || (typeof require !== 'undefined' ? require('./library-index.js') : null);
  const Store = root.ZMALibraryStore || (typeof require !== 'undefined' ? require('./library-store.js') : null);
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
  const check = signal => { if (signal?.aborted) throw new Error('文献读取已取消'); };

  function nestedText(node) {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    return (Array.isArray(node.content) ? node.content : []).map(nestedText).join(node.type === 'paragraph' ? '' : '\n');
  }

  function create(host, options = {}) {
    const { Z, IO, P } = host;
    const libraryID = Z.Libraries?.userLibraryID;
    if (!Z.DBConnection || !Number.isSafeInteger(libraryID) || !Z.Items?.getAsync || !IO?.stat) return null;
    const directory = P.join(host.directory, 'research-memory');
    const db = new Z.DBConnection(P.join(directory, 'papers-v1.sqlite'));
    db.skipBackup = true;
    let prepared;
    const connection = {
      queryAsync: async (sql, params) => {
        prepared ||= IO.makeDirectory(directory, { ignoreExisting: true, createAncestors: true });
        await prepared;
        return db.queryAsync(sql, params);
      },
      executeTransaction: action => db.executeTransaction(action),
      closeDatabase: permanent => db.closeDatabase(permanent)
    };
    const index = new Index.Index(connection, libraryID);

    async function load(item) {
      if (item?.loadAllData) await item.loadAllData();
      return item;
    }

    async function byKey(key) {
      return load(Z.Items.getByLibraryAndKey(libraryID, key));
    }

    function live(item) { return !!item && !item.deleted && item.libraryID === libraryID; }

    function field(item, name) {
      try { return String(item?.getField?.(name) || ''); } catch { return ''; }
    }

    function plainNote(html) {
      const text = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li)\b[^>]*>/gi, '\n\n').replace(/<[^>]*>/g, '')
        .replace(/zma-summary:\/\/[1-9]\d*\/[A-Z0-9]{8}/g, '');
      if (Z.Utilities?.unescapeHTML) return Z.Utilities.unescapeHTML(text).trim();
      return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    }

    function metadata(item) {
      const title = (field(item, 'title') || item.key).slice(0, 500);
      const year = /\d{4}/.exec(field(item, 'date'))?.[0] || '';
      const doi = field(item, 'DOI').slice(0, 250);
      const authors = (item.getCreators?.() || []).map(creator => [creator.firstName, creator.lastName || creator.name].filter(Boolean).join(' ')).join(', ');
      const tags = (item.getTags?.() || []).map(tag => tag.tag).join(', ');
      const text = [title, authors, year, doi, field(item, 'abstractNote'), tags].filter(Boolean).join('\n\n');
      return { key: item.key, libraryID, title, year, doi, authors, tags, text };
    }

    function base(paper, item, kind, attachmentKey = '') {
      return { key: kind + '-' + item.key, libraryID, paperKey: paper.key, sourceKey: item.key, kind, attachmentKey,
        title: paper.title, year: paper.year, doi: paper.doi, updatedAt: 0 };
    }

    function textUnit(paper, item, kind, text, raw, attachmentKey = '') {
      return { ...base(paper, item, kind, attachmentKey), text, fingerprint: M.signature(paper.key + '|' + paper.title + '|' + item.key + '|' + raw), status: 'ready' };
    }

    async function pdfUnit(paper, item) {
      let path = '', stat = null, reason = '';
      try { path = await item.getFilePathAsync(); if (path && await IO.exists(path)) stat = await IO.stat(path); }
      catch (error) { reason = String(error.message).slice(0, 300); }
      const cache = Z.Fulltext?.getItemCacheFile?.(item)?.path;
      const storage = Z.Attachments?.getStorageDirectory?.(item)?.path;
      const sdt = storage ? P.join(storage, '.zotero-sdt-cache') : '';
      const stamps = [];
      for (const file of [cache, sdt]) {
        if (!file) continue;
        try {
          if (!await IO.exists(file)) { stamps.push(file + '|missing'); continue; }
          const value = await IO.stat(file);
          stamps.push([file, value.size, value.lastModified].join('|'));
        } catch { stamps.push(file + '|unreadable'); }
      }
      return { ...base(paper, item, 'pdf', item.key), path: path || '', size: stat?.size || 0, mtime: stat?.lastModified || 0,
        fingerprint: M.signature([paper.key, paper.title, item.key, path || '', stat?.size ?? 'missing', stat?.lastModified || 0, reason, ...stamps].join('|')),
        reason, status: reason ? 'failed' : stat ? 'pending' : 'missing' };
    }

    function annotationUnit(paper, item, attachment) {
      const text = [item.annotationText, item.annotationComment].filter(value => typeof value === 'string' && value.trim()).join('\n\n');
      const raw = [item.annotationType, item.annotationText, item.annotationComment, item.annotationPosition].join('|');
      const unit = textUnit(paper, item, 'annotation', text, raw, attachment.key);
      let pageIndex;
      try {
        const value = JSON.parse(item.annotationPosition).pageIndex;
        if (Number.isSafeInteger(value) && value >= 0 && value <= 1000000) pageIndex = value;
      } catch {}
      return { ...unit, ...(pageIndex !== undefined ? { pageIndex } : {}) };
    }

    async function* discover(signal) {
      let ids;
      if (Z.Items.getAll) ids = await Z.Items.getAll(libraryID, false, false, true);
      else { const search = new Z.Search(); search.libraryID = libraryID; ids = await search.search(); }
      const seen = new Set();
      for (let at = 0; at < ids.length; at += 32) {
        check(signal);
        const batch = await Z.Items.getAsync(ids.slice(at, at + 32));
        for (let item of batch) {
          check(signal);
          if (!live(item) || seen.has(item.key) || !(item.isRegularItem?.() || item.isPDFAttachment?.() && !item.parentID)) continue;
          item = await load(item);
          seen.add(item.key);
          const paper = metadata(item);
          /** @type {any[]} */
          const units = [textUnit(paper, item, 'metadata', paper.text, paper.text)];
          const notes = item.getNotes?.() || [];
          for (const note of notes.length ? await Z.Items.getAsync(notes) : []) {
            await load(note);
            if (!live(note) || !note.isNote?.()) continue;
            const html = note.getNote();
            if (/zma-history:\/\/[1-9]\d*\/[A-Z0-9]{8}/.test(html)) continue;
            // A damaged conversation pointer must not hide an otherwise
            // readable Zotero note or stop discovery of later papers.
            try { if (await options.canonicalSummary?.(note)) continue; } catch {}
            const text = plainNote(html);
            if (text) units.push(textUnit(paper, note, 'note', text, html));
          }
          const attachments = item.isPDFAttachment?.() ? [item] : (item.getAttachments?.() || []).length ? await Z.Items.getAsync(item.getAttachments()) : [];
          for (const attachment of attachments) {
            await load(attachment);
            if (!live(attachment) || !attachment.isPDFAttachment?.()) continue;
            units.push(await pdfUnit(paper, attachment));
            for (let annotation of attachment.getAnnotations?.() || []) {
              annotation = await load(typeof annotation === 'number' ? await Z.Items.getAsync(annotation) : annotation);
              if (!live(annotation)) continue;
              const unit = annotationUnit(paper, annotation, attachment);
              if (unit.text) units.push(unit);
            }
          }
          yield { paper, units };
          await yieldControl();
        }
      }
    }

    async function currentUnit(kind, sourceKey) {
      const item = await byKey(sourceKey);
      if (!live(item)) return null;
      let owner = item;
      if (kind === 'annotation') owner = await load(Z.Items.get(item.parentID));
      if (!live(owner)) return null;
      const parent = owner.parentID ? await load(Z.Items.get(owner.parentID)) : owner;
      if (!live(parent)) return null;
      const paper = metadata(kind === 'metadata' ? item : parent);
      if (kind === 'metadata' && (item.isRegularItem?.() || item.isPDFAttachment?.() && !item.parentID)) return textUnit(paper, item, kind, paper.text, paper.text);
      if (kind === 'pdf' && item.isPDFAttachment?.()) return pdfUnit(paper, item);
      if (kind === 'note' && item.isNote?.() && !/zma-history:\/\//.test(item.getNote())) return textUnit(paper, item, kind, plainNote(item.getNote()), item.getNote());
      if (kind === 'annotation' && item.isAnnotation?.() && owner.isPDFAttachment?.()) return annotationUnit(paper, item, owner);
      return null;
    }

    async function validateSource(source, checked = new Map()) {
      if (source.libraryID !== libraryID || !await index.contains(source)) return false;
      const key = source.kind + '-' + source.sourceKey;
      if (!checked.has(key)) checked.set(key, currentUnit(source.kind, source.sourceKey));
      const current = await checked.get(key);
      return current?.paperKey === source.paperKey && current.attachmentKey === source.attachmentKey && current.fingerprint === source.fingerprint;
    }

    async function cachedPDF(unit) {
      const item = await byKey(unit.sourceKey);
      const file = Z.Fulltext?.getItemCacheFile?.(item)?.path;
      if (!file || !await IO.exists(file)) return null;
      const stat = await IO.stat(file);
      if (stat.lastModified < unit.mtime || !stat.size) return null;
      if (!IO.read && stat.size > 8 * 1024 * 1024) return null;
      const coverage = await Z.Fulltext.getPages(item.id);
      const complete = coverage?.total > 0 && coverage.indexedPages >= coverage.total;
      const cachedText = IO.read ? null : await IO.readUTF8(file);
      const textChunks = async function* () {
        if (IO.read) {
          const Decoder = host.runtimeWindow?.().TextDecoder || host.win?.TextDecoder || globalThis.TextDecoder;
          const decoder = new Decoder();
          for (let offset = 0; offset < stat.size; offset += 256 * 1024) {
            const bytes = await IO.read(file, { offset, maxBytes: Math.min(256 * 1024, stat.size - offset) });
            const text = decoder.decode(bytes, { stream: offset + bytes.length < stat.size });
            yield { text };
          }
        } else yield { text: cachedText };
      };
      let separators = 0;
      for await (const chunk of textChunks()) separators += chunk.text.split('\f').length - 1;
      const pageAware = separators > 0 && separators + 1 === coverage?.indexedPages;
      const pages = (async function* () {
        let pageIndex = 0, hasText = false;
        for await (const chunk of textChunks()) {
          if (!pageAware) { yield chunk; continue; }
          const parts = chunk.text.split('\f');
          for (const [at, text] of parts.entries()) {
            if (at) {
              if (!hasText) yield { pageIndex, text: '' };
              pageIndex++; hasText = false;
            }
            if (text.trim()) { hasText = true; yield { pageIndex, text }; }
          }
        }
        if (pageAware && !hasText) yield { pageIndex, text: '' };
        const after = await IO.stat(file);
        if (stat.size !== after.size || stat.lastModified !== after.lastModified) throw new Error('全文缓存已变更，稍后重新读取');
      })();
      return { status: complete ? 'ready' : 'partial', reason: pageAware ? '已有全文缓存，分页与原生覆盖记录一致' : complete ? '已有全文缓存，页号需搜索定位' : '已有全文缓存覆盖部分页，页号需搜索定位', pages };
    }

    async function readPDF(unit, { cacheOnly, signal }) {
      check(signal);
      if (cacheOnly) return cachedPDF(unit);
      if (unit.size > Store.MAX_PDF_BYTES) return null;
      const item = await byKey(unit.sourceKey);
      if (!live(item)) return null;
      if (Z.SDT?.getPack && Z.SDT.getReader) {
        let pack = await Z.SDT.getPack(item.id, { isPriority: false });
        check(signal);
        if (!pack.ok && pack.reason !== 'unavailable') return { status: pack.reason === 'password-required' ? 'password' : 'failed', pages: (async function* () {})() };
        if (pack.ok) {
          pack = null;
          const reader = await Z.SDT.getReader(item.id, { isPriority: false });
          if (!reader) return null;
          const catalog = await reader.getCatalog();
          const count = catalog?.pages?.length || 0;
          const pages = (async function* () {
            for (let pageIndex = 0; pageIndex < count; pageIndex++) {
              check(signal);
              const blocks = await reader.getPageBlocks(pageIndex);
              yield { pageIndex, text: blocks.map(nestedText).join('\n\n') };
              await yieldControl();
            }
          })();
          return { pages, reason: '按结构化页提取，图像公式可能缺少文字' };
        }
      }
      if (!Z.PDFWorker?.getFullText) return null;
      try {
        const result = await Z.PDFWorker.getFullText(item.id, null, false);
        check(signal);
        const text = String(result?.text || '');
        return { status: result.extractedPages < result.totalPages ? 'partial' : 'ready', reason: '普通文字提取，页号需搜索定位', pages: (async function* () {
          for (let at = 0; at < text.length; at += 65536) { check(signal); yield { text: text.slice(at, at + 65536) }; await yieldControl(); }
        })() };
      } catch (error) {
        check(signal);
        if (/password|密码/i.test(String(error.name) + ' ' + error.message)) return { status: 'password', pages: (async function* () {})() };
        throw error;
      }
    }

    const adapter = {
      index, libraryID, discover, readPDF, validateSource,
      enabled: () => host.running && (options.enabled?.() ?? true),
      userPaused: () => options.userPaused?.() ?? false,
      foreground: () => host.activeRequests.size > 0 || host.transferTasks.size > 0,
      controller: () => host.newAbortController(),
      notify: () => options.notify?.(), report: error => Z.logError?.(error),
      valid: async unit => { const current = await currentUnit(unit.kind, unit.sourceKey); return current?.paperKey === unit.paperKey && current.fingerprint === unit.fingerprint; }
    };
    const manager = new Store.Manager(adapter);

    manager.openSource = async value => {
      const source = M.cleanSources([value])[0];
      await manager.ensure();
      if (source.version !== 2 || !await validateSource(source)) { manager.refresh(); throw new Error('原文献资料已变更，请重新检索最新来源'); }
      const item = await byKey(source.sourceKey);
      const pane = Z.getMainWindow?.()?.ZoteroPane;
      if (source.kind === 'metadata') { await pane.selectItem(item.id); return; }
      if (source.kind === 'note') { await pane.openNote(item.id, { openInWindow: true }); return; }
      const attachment = await byKey(source.attachmentKey);
      const location = { ...(source.pageIndex !== undefined ? { pageIndex: source.pageIndex } : {}), ...(source.kind === 'annotation' ? { annotationID: source.sourceKey } : {}) };
      const reader = await host.openPDF(attachment, location);
      if (source.pageIndex === undefined && source.kind === 'pdf') {
        const internal = host.unwrap ? host.unwrap(reader._internalReader) : reader._internalReader;
        if (!internal?._updateState || !internal._state) throw new Error('PDF已打开，请按Ctrl+F搜索来源节选 ' + source.text.slice(0, 100));
        const findState = { ...internal._state.primaryViewFindState, popupOpen: true, active: true, query: source.text.replace(/\s+/g, ' ').slice(0, 100), result: null };
        const state = { primaryViewFindState: findState };
        internal._updateState(host.cloneInto ? host.cloneInto(state, reader._iframeWindow) : state);
      }
    };
    return manager;
  }

  root.ZMALibraryHost = { create };
  if (typeof module !== 'undefined') module.exports = root.ZMALibraryHost;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
