(function (root) {
  'use strict';
  const C = root.ZMACore || (typeof require !== 'undefined' ? require('./core.js') : null);
  const M = root.ZMAMemoryCore || (typeof require !== 'undefined' ? require('./memory-core.js') : null);
  const Store = root.ZMAMemoryStore || (typeof require !== 'undefined' ? require('./memory-store.js') : null);

  function create(host) {
    const { Z, IO, P } = host;
    if (!Z.Search || !IO?.exists || !IO.stat || !IO.readUTF8 || !IO.writeUTF8 || !IO.makeDirectory) return null;
    const directory = P.join(host.directory, 'research-memory');
    const listeners = new Set();
    let enabled = Z.Prefs?.get('margincomments.researchMemory') !== false;
    let currentLibrary = Z.Libraries?.userLibraryID || 1;

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
      const metadata = host.readingSummaryContext({ itemID: attachment.id });
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

    return Object.assign(manager, {
      forReader(reader) {
        const scope = host.scope(reader);
        currentLibrary = scope.libraryID;
        void manager.ensure(currentLibrary).then(() => { manager.schedule(scope); adapter.notify(); }).catch(report);
      },
      settingsAPI() {
        return {
          state: () => ({ enabled, libraryID: currentLibrary, ...manager.status(currentLibrary) }),
          watch: listener => { listeners.add(listener); return () => listeners.delete(listener); },
          set: async value => {
            enabled = !!value;
            Z.Prefs?.set('margincomments.researchMemory', enabled);
            if (enabled) { await manager.ensure(currentLibrary); void manager.resume().catch(report); }
            else manager.pause();
            adapter.notify();
          },
          rebuild: () => manager.rebuild(currentLibrary),
          export: async () => {
            const text = await manager.export(currentLibrary);
            return host.writeConversationFile(text, 'md', '研究阅读笔记', { research: true });
          }
        };
      },
      async openSource(value) {
        const source = M.cleanSources([value])[0];
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
