(function (root) {
  'use strict';
  const C = root.ZMACore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const Store = root.ZMAMemoryStore || (typeof require !== 'undefined' ? require('./memory-store.js') : null);
  const Library = root.ZMALibraryHost || (typeof require !== 'undefined' ? require('./library-host.js') : null);

  const RAG = root.ZMARAGHost || (typeof require !== 'undefined' ? require('./rag-host.js') : null);

  function create(host) {
    const { Z, IO, P } = host;
    if (!Z.Search || !IO?.exists || !IO.stat || !IO.readUTF8 || !IO.writeUTF8 || !IO.makeDirectory) return null;
    const directory = P.join(host.directory, 'research-memory');
    const listeners = new Set();
    let enabled = Z.Prefs?.get('margincomments.researchMemory') !== false;
    let currentLibrary = Z.Libraries?.userLibraryID || 1;
    let userPaused = Z.Prefs?.get('margincomments.researchMemoryPaused') === true;

    function checked(scope) {
      C.scopeKey(scope);
      return scope;
    }

    function cachePath(libraryID, file) {
      if (!Number.isSafeInteger(libraryID) || libraryID < 1) throw new Error('文献库标识无效');
      return P.join(directory, String(libraryID), file);
    }

    async function readJSON(file, maximum) {
      if (!await IO.exists(file)) return null;
      if ((await IO.stat(file)).size > maximum) throw new Error('研究记忆缓存过大，请重建索引');
      return JSON.parse(await IO.readUTF8(file));
    }

    async function writeJSON(file, value) {
      await IO.makeDirectory(P.parent(file), { ignoreExisting: true, createAncestors: true });
      await IO.writeUTF8(file, JSON.stringify(value), { tmpPath: file + '.tmp' });
    }

    async function readRecord(scope, signal) {
      checked(scope);
      if (signal?.aborted) throw new Error('研究记忆读取已取消');
      const attachment = Z.Items.getByLibraryAndKey(scope.libraryID, scope.attachmentKey);
      if (!attachment?.isPDFAttachment?.() || attachment.deleted || attachment.libraryID !== scope.libraryID) return null;
      const parent = attachment.parentID ? Z.Items.get(attachment.parentID) : null;
      if (parent?.deleted) return null;
      const pdf = await attachment.getFilePathAsync();
      const name = C.scopeKey(scope) + '.json';
      const sidecar = pdf ? P.join(P.parent(pdf), 'margin-comments-assistant-' + name) : null;
      const file = sidecar && await IO.exists(sidecar) ? sidecar : P.join(host.directory, name);
      if (!await IO.exists(file)) return null;
      const before = await IO.stat(file);
      if (before.size > 16 * 1024 * 1024) throw new Error('本篇历史超过16 MiB，暂未建立研究记忆索引');
      const raw = await IO.readUTF8(file);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (signal?.aborted) throw new Error('研究记忆读取已取消');
      const state = C.cleanState(JSON.parse(raw));
      const after = await IO.stat(file);
      if (before.size !== after.size || before.lastModified !== after.lastModified) throw new Error('历史正在保存，稍后重新建立索引');
      const summary = state.readingSummary;
      let summaryValid = true;
      if (summary?.noteKey) {
        const note = Z.Items.getByLibraryAndKey(scope.libraryID, summary.noteKey);
        summaryValid = !!note?.isNote?.() && !note.deleted && note.libraryID === scope.libraryID
          && Number(note.parentID || 0) === Number(attachment.parentID || 0) && note.getNote() === summary.noteHTML;
      }
      const owner = parent || attachment;
      const metadata = { ...host.readingSummaryContext({ itemID: attachment.id }), ...(/^[A-Z0-9]{8}$/.test(owner.key) ? { paperKey: owner.key } : {}) };
      const fingerprint = M.signature([file, after.size, after.lastModified || 0, JSON.stringify(metadata), summaryValid].join('|'));
      return { state, metadata, fingerprint, summaryValid };
    }

    const adapter = {
      enabled: () => enabled && host.running,
      foreground: () => host.activeRequests.size > 0 || host.transferTasks.size > 0,
      controller: () => host.newAbortController(),
      read: readRecord,
      list: async libraryID => {
        const search = new Z.Search();
        search.libraryID = libraryID;
        search.addCondition('itemType', 'is', 'attachment');
        const ids = (await search.search()).sort((a, b) => b - a);
        const scopes = [];
        for (let index = 0; index < ids.length; index += 32) {
          const batch = ids.slice(index, index + 32);
          const items = Z.Items.getAsync ? await Z.Items.getAsync(batch) : batch.map(id => Z.Items.get(id));
          for (const item of items) {
            if (item?.isPDFAttachment?.() && !item.deleted && item.libraryID === libraryID) scopes.push({ libraryID, attachmentKey: item.key });
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return scopes;
      },
      readCatalog: libraryID => readJSON(cachePath(libraryID, 'catalog.json'), 8 * 1024 * 1024),
      writeCatalog: (libraryID, value) => writeJSON(cachePath(libraryID, 'catalog.json'), value),
      readDocument: async scope => { checked(scope); return readJSON(cachePath(scope.libraryID, scope.attachmentKey + '.json'), 2 * 1024 * 1024); },
      writeDocument: async (scope, value) => { checked(scope); return writeJSON(cachePath(scope.libraryID, scope.attachmentKey + '.json'), value); },
      notify: () => { for (const listener of listeners) listener(); }
    };
    const manager = new Store.Manager(adapter);
    const report = error => Z.logError?.(error);
    const papers = Library?.create(host, {
      enabled: () => enabled, userPaused: () => userPaused, notify: () => { adapter.notify(); manager.embedding?.refresh(); },
      canonicalSummary: async note => {
        const match = /zma-summary:\/\/([1-9]\d*)\/([A-Z0-9]{8})/.exec(note.getNote());
        if (!match || Number(match[1]) !== note.libraryID) return false;
        const record = await readRecord({ libraryID: note.libraryID, attachmentKey: match[2] });
        return !!record?.summaryValid && record.state.readingSummary?.noteKey === note.key;
      }
    });
    const history = {};
    for (const name of ['pause', 'resume', 'retrieve', 'rebuild', 'stop', 'export']) history[name] = manager[name].bind(manager);
    manager.papers = papers;
    manager.embedding = RAG?.create(host, { history: adapter, readRecord, papers, enabled: () => enabled, notify: adapter.notify });
    const originalSchedule = manager.schedule.bind(manager);
    manager.schedule = scope => { originalSchedule(scope); manager.embedding?.refresh(); };
    manager.pause = () => { history.pause(); papers?.pause(); manager.embedding?.suspend(true); };
    manager.resume = async () => { manager.embedding?.suspend(false); if (!userPaused) await Promise.all([history.resume(), papers?.resume()]); };
    manager.rebuild = async libraryID => { await Promise.all([history.rebuild(libraryID), papers?.rebuild()]); };
    manager.stop = async () => { await Promise.all([history.stop(), papers?.stop(), manager.embedding?.stop()]); };
    manager.retrieve = async (scope, query, options = {}) => {
      // A title or old question in the expanded context must not turn a local
      // overview/symbol question into an automatic search of unrelated papers.
      if (!M.queryTokens(options.question || query).length) return [];
      const previous = await history.retrieve(scope, query, options);
      for (const source of previous) {
        const item = Z.Items.getByLibraryAndKey(source.libraryID, source.attachmentKey);
        const parent = item?.parentID ? Z.Items.get(item.parentID) : item;
        if (/^[A-Z0-9]{8}$/.test(parent?.key)) source.paperKey = parent.key;
      }
      const attachment = Z.Items.getByLibraryAndKey(scope.libraryID, scope.attachmentKey);
      const owner = attachment?.parentID ? Z.Items.get(attachment.parentID) : attachment;
      const current = await papers?.retrieve(scope, query, { ...options, paperKey: owner?.key }) || [];
      const lexicalSources = [...previous, ...current];
      if (manager.embedding?.state().enabled) return manager.embedding.retrieve({ ...scope, paperKey: owner?.key }, query, { ...options, lexicalSources });
      return M.mergeSources(lexicalSources, options.question || query);
    };

    return Object.assign(manager, {
      async start() {
        if (userPaused) manager.pause();
        await Promise.all([manager.ensure(currentLibrary), papers?.start(), manager.embedding?.start()]);
      },
      onItemsChanged() { papers?.refresh(); manager.embedding?.refresh(); },
      forReader(reader) {
        const scope = host.scope(reader);
        currentLibrary = Z.Libraries?.userLibraryID || scope.libraryID;
        papers?.prioritize(scope.attachmentKey);
        const attachment = Z.Items.getByLibraryAndKey(scope.libraryID, scope.attachmentKey);
        const owner = attachment?.parentID ? Z.Items.get(attachment.parentID) : attachment;
        manager.embedding?.prioritize({ ...scope, paperKey: owner?.key });
        void Promise.all([manager.ensure(scope.libraryID), papers?.start()]).then(() => { manager.schedule(scope); adapter.notify(); }).catch(report);
      },
      settingsAPI() {
        return {
          state: () => ({ enabled, paused: userPaused, libraryID: currentLibrary, ...manager.status(currentLibrary), ...(papers ? { coverage: papers.status() } : {}) }),
          watch: listener => { listeners.add(listener); return () => listeners.delete(listener); },
          set: async value => {
            enabled = !!value;
            Z.Prefs?.set('margincomments.researchMemory', enabled);
            if (enabled) { await manager.start(); void manager.resume().catch(report); }
            else manager.pause();
            adapter.notify();
          },
          pause: async () => {
            userPaused = !userPaused;
            Z.Prefs?.set('margincomments.researchMemoryPaused', userPaused);
            if (userPaused) manager.pause(); else void manager.resume().catch(report);
            adapter.notify();
          },
          rebuild: () => manager.rebuild(currentLibrary),
          export: async () => {
            let text = await history.export(currentLibrary);
            if (papers) {
              await papers.start();
              await papers.run();
              const records = await papers.index.papers();
              text += '\n# 文献资料与覆盖情况\n\n以下为本地文献资料，正文覆盖仅代表实际提取的文字，图像公式可能缺少文字。\n\n';
              for (const paper of records) {
                const units = await papers.index.units(paper.key);
                const counts = units.filter(unit => unit.kind === 'pdf').map(unit => unit.sourceKey + ' ' + unit.status).join('，') || '仅文献信息';
                text += '## ' + paper.title.replace(/[\r\n]/g, ' ') + '\n\n' + paper.text + '\n\n正文覆盖 ' + counts + '\n\n';
              }
            }
            return host.writeConversationFile(text, 'md', '研究阅读笔记', { research: true });
          }
        };
      },
      async openSource(value) {
        const source = M.cleanSources([value])[0];
        if (source.version === 2) { if (!papers) throw new Error('个人文献库索引模块尚未就绪，请更新插件并重启'); await papers.openSource(source); return; }
        const record = await readRecord(source);
        if (!record || source.kind === 'summary' && !record.summaryValid || !M.sourceCurrent(source, record.state)) throw new Error('原阅读记录已变更，请重新检索最新记录');
        const attachment = Z.Items.getByLibraryAndKey(source.libraryID, source.attachmentKey);
        const existing = [...host.panels.entries()].find(([reader]) => Number(reader.itemID) === attachment.id)?.[1];
        if (existing?.busy || existing?.pendingMaterials.size) throw new Error('目标论文正在处理，请完成后再打开来源');
        await host.openHistory(attachment);
        const reader = [...host.panels.keys()].find(reader => Number(reader.itemID) === attachment.id);
        if (!reader) throw new Error('目标论文阅读器未能打开');
        const panel = await host.panel(reader);
        if (source.kind === 'summary') panel.showReadingSummary();
        else { await panel.switchConversation(source.conversationId); panel.revealMessage(source.messageIndex); }
      }
    });
  }

  root.ZMAMemoryHost = { create };
  if (typeof module !== 'undefined') module.exports = root.ZMAMemoryHost;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
