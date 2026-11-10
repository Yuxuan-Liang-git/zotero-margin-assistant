(function (root) {
    'use strict';
    const M = root.ZMAMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);
    const R = root.ZMARAG || (typeof require === 'function' ? require('./rag.js') : null);
    const Profiles = root.ZMAEmbeddingProfiles || (typeof require === 'function' ? require('./embedding-profiles.js') : null);
    const Client = root.ZMAEmbeddingClient || (typeof require === 'function' ? require('./embedding-client.js') : null);
    const Store = root.ZMAVectorStore || (typeof require === 'function' ? require('./vector-store.js') : null);
    const Runtime = root.ZMAVectorRuntime || (typeof require === 'function' ? require('./vector-runtime.js') : null);
    const check = signal => {
        if (signal?.aborted)
            throw new Error('Corpus scan cancelled');
    };
    class Corpus {
        constructor(options) {
            this.libraryID = options.libraryID;
            this.papers = options.papers;
            this.history = options.history;
            this.readRecord = options.readRecord;
        }
        async pilotCohort(limit, priority, signal) {
            const keys = [], seen = new Set();
            const add = key => {
                if (/^[A-Z0-9]{8}$/.test(key) && !seen.has(key) && keys.length < limit) {
                    keys.push(key); seen.add(key);
                }
            };
            if (priority?.libraryID === this.libraryID) {
                let key = priority.paperKey;
                if (!key && priority.attachmentKey && this.papers) {
                    await this.papers.ensure();
                    key = await this.papers.index.paperForAttachment(priority.attachmentKey);
                }
                add(key);
            }
            // A reading record means eligible committed reading material,
            // rather than a draft or an unanswered question.
            if (this.history) {
                const scopes = (await this.history.list(this.libraryID)).sort((a, b) => a.attachmentKey.localeCompare(b.attachmentKey));
                for (const scope of scopes) {
                    check(signal);
                    if (keys.length >= limit) break;
                    const record = await this.readRecord(scope, signal);
                    if (!record) continue;
                    const summary = record.state.readingSummary;
                    const hasSummary = record.summaryValid && summary?.noteKey && summary.text?.trim();
                    const hasDialogue = record.state.conversations?.some(conversation => conversation.history.some((answer, i) =>
                        i > 0 && answer.role === 'assistant' && !answer.incomplete && answer.content?.trim() && conversation.history[i - 1].role === 'user'));
                    if (hasSummary || hasDialogue) add(record.metadata?.paperKey || scope.attachmentKey);
                }
            }
            if (this.papers && keys.length < limit) {
                await this.papers.ensure();
                const records = await this.papers.index.papers();
                for (const paper of records.sort((a, b) => a.key.localeCompare(b.key))) {
                    check(signal); add(paper.key);
                    if (keys.length >= limit) break;
                }
            }
            return keys;
        }
        /** @param {any} options */
        async *sources({ cursor = '', limitPapers, priority, signal } = {}) {
            let position = { phase: 'library', afterId: 0, attachment: '', at: 0, paperAt: 0 };
            if (cursor) position = { ...position, ...JSON.parse(cursor) };
            let cohort = null;
            if (limitPapers) {
                // Persisted selection wins over a later reader/priority change.
                // Older partial pilot cursors retain their already used subset.
                cohort = position.cohort || position.papers || await this.pilotCohort(limitPapers, priority, signal);
                position.cohort = cohort;
            }
            const allowed = source => !cohort || cohort.includes(source.paperKey || source.attachmentKey);
            let first = true;
            const entry = (source, next) => {
                const result = { source, cursor: JSON.stringify({ ...next, ...(cohort ? { cohort } : {}) }) };
                if (first && cohort) { result.checkpoint = JSON.stringify(position); first = false; }
                return result;
            };
            if (position.phase === 'library' && this.papers) {
                await this.papers.ensure();
                const selected = cohort || [null];
                for (let paperAt = cohort ? position.paperAt : 0; paperAt < selected.length; paperAt++) {
                    let afterId = paperAt === (cohort ? position.paperAt : 0) ? position.afterId : 0;
                    while (true) {
                        check(signal);
                        const page = await this.papers.index.sourcesPage({ afterId, limit: 128, ...(selected[paperAt] ? { paperKey: selected[paperAt] } : {}) });
                        if (!page.sources.length) break;
                        for (const value of page.sources) {
                            check(signal); afterId = value.cursor;
                            if (!allowed(value.source)) continue;
                            yield entry(value.source, { phase: 'library', afterId, ...(cohort ? { paperAt } : {}) });
                        }
                    }
                }
            }
            if (!this.history) return;
            const scopes = (await this.history.list(this.libraryID)).sort((a, b) => a.attachmentKey.localeCompare(b.attachmentKey));
            for (const scope of scopes) {
                check(signal);
                if (position.phase === 'history' && scope.attachmentKey < position.attachment) continue;
                const record = await this.readRecord(scope, signal);
                if (!record) continue;
                const metadata = record.metadata || {}, base = { libraryID: this.libraryID, attachmentKey: scope.attachmentKey, title: String(metadata.title || scope.attachmentKey).slice(0, 500), year: String(metadata.year || '').slice(0, 20), doi: String(metadata.doi || '').slice(0, 250), ...(metadata.paperKey ? { paperKey: metadata.paperKey } : {}) };
                if (!allowed(base)) continue;
                let at = 0;
                const emit = function* (text, details) { for (const [part, value] of M.splitText(text).chunks.entries())
                    yield { ...base, ...details, label: '阅读1', part, text: value };
                };
                const entries = function* () {
                    const summary = record.state.readingSummary;
                    if (record.summaryValid && summary?.noteKey && summary.text?.trim())
                        yield* emit(summary.text, { kind: 'summary', conversationId: '', messageIndex: 0, signature: M.signature(summary.text), updatedAt: summary.updatedAt || 0 });
                    for (const conversation of record.state.conversations || []) {
                        for (let i = 1; i < conversation.history.length; i++) {
                            const q = conversation.history[i - 1], a = conversation.history[i];
                            if (a.role !== 'assistant' || a.incomplete || !a.content?.trim() || q.role !== 'user') continue;
                            const question = M.splitText(q.content, 360).chunks[0] || '原问题包含较长公式，请打开原会话阅读。';
                            yield* emit('用户问题\n' + question + '\n\n历史助手解释\n' + a.content, { kind: 'dialogue', conversationId: conversation.id, messageIndex: i, signature: M.signature(q.content + '\n' + a.content), updatedAt: conversation.updatedAt || 0 });
                        }
                    }
                };
                for (const source of entries()) {
                    check(signal); at++;
                    if (position.phase === 'history' && scope.attachmentKey === position.attachment && at <= position.at) continue;
                    yield entry(source, { phase: 'history', attachment: scope.attachmentKey, at });
                    if (at % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        async validate(source, signal) {
            check(signal);
            if (source.libraryID !== this.libraryID)
                return false;
            try {
                if (source.version === 2)
                    return !!this.papers && await this.papers.adapter.validateSource(source);
                const record = await this.readRecord(source, signal);
                return !!record && (source.kind !== 'summary' || !!record.summaryValid && !!record.state.readingSummary?.noteKey) && M.sourceCurrent(source, record.state);
            }
            catch {
                check(signal);
                return false;
            }
        }
    }
    /** @param {any} host @param {any} options */
    function create(host, { history, readRecord, papers, enabled, notify } = {}) {
        const { Z, IO, P } = host, libraryID = Z.Libraries?.userLibraryID;
        if (!Z.DBConnection || !Z.Prefs || !Z.OSKeyStore || !Number.isSafeInteger(libraryID) || !host.createRAGWorker)
            return null;
        try {
            const win = host.runtimeWindow();
            if (!win.crypto?.subtle || !win.fetch || !win.Worker || !win.TextEncoder)
                return null;
            // Bootstrap sandbox globals are supplied from the privileged runtime only.
            root.URL ||= win.URL;
            root.TextEncoder ||= win.TextEncoder;
            root.TextDecoder ||= win.TextDecoder;
            root.btoa ||= win.btoa?.bind(win);
            const hash = async (text) => Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256', new win.TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
            const profiles = new Profiles.Profiles({ get: name => Z.Prefs.get(name), set: (name, value) => Z.Prefs.set(name, value), encrypt: key => Z.OSKeyStore.encrypt(key), decrypt: value => Z.OSKeyStore.decrypt(value), digest: hash });
            const directory = P.join(host.directory, 'research-memory'), db = new Z.DBConnection(P.join(directory, 'vectors-v1.sqlite'));
            db.skipBackup = true;
            let prepared;
            const connection = { queryAsync: async (sql, params) => {
                    prepared ||= IO.makeDirectory(directory, { ignoreExisting: true, createAncestors: true });
                    await prepared;
                    return db.queryAsync(sql, params);
                }, executeTransaction: async (work) => {
                    prepared ||= IO.makeDirectory(directory, { ignoreExisting: true, createAncestors: true });
                    await prepared;
                    return db.executeTransaction(work);
                }, closeDatabase: () => db.closeDatabase(true) };
            const corpus = new Corpus({ history, readRecord, papers, libraryID }), client = new Client.Client({ fetch: (...args) => host.runtimeWindow().fetch(...args), credentials: () => profiles.credentials(), controller: () => host.newAbortController() }), runtime = new Runtime.Runtime(() => host.createRAGWorker());
            const manager = new R.Manager({ profiles, client, store: new Store.Store(connection), runtime, corpus: options => corpus.sources(options), validate: (source, signal) => corpus.validate(source, signal), hash, libraryID, controller: () => host.newAbortController(), foreground: () => !host.running || host.activeRequests.size > 0 || host.transferTasks.size > 0, notify });
            return manager;
        }
        catch {
            return null;
        }
    }
    root.ZMARAGHost = { create, Corpus };
    if (typeof module !== 'undefined')
        module.exports = root.ZMARAGHost;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
