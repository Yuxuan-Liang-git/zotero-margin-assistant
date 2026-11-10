(function (root) {
    'use strict';
    const M = root.ZMAMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);
    const V = root.ZMAVectors || (typeof require === 'function' ? require('./vector-core.js') : null);
    const abort = () => Object.assign(new Error('云端检索已取消'), { name: 'AbortError' });
    const check = signal => {
        if (signal?.aborted)
            throw abort();
    };
    function delay(ms, signal) {
        return new Promise((resolve, reject) => {
            const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
            const timer = setTimeout(finish, ms);
            const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abort()); };
            if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
        });
    }
    function boundedText(text, max) {
        let result = '', size = 0;
        const encoder = new TextEncoder();
        for (const char of text) {
            const bytes = encoder.encode(char).length;
            if (size + bytes > max)
                break;
            result += char;
            size += bytes;
        }
        return result;
    }
    async function segments(source, max, hash) {
        max = Math.min(max, 8000);
        const encoder = new TextEncoder();
        const prefix = boundedText(source.title, Math.max(0, Math.floor(max / 3))) + '\n' + source.kind + '\n';
        const room = max - encoder.encode(prefix).length;
        if (room < 4)
            throw new Error('输入字节限制过小');
        const result = [];
        let text = '', size = 0;
        const push = async () => {
            if (text.trim()) {
                const input = prefix + text;
                result.push({ key: await hash(input), input });
            }
            text = '';
            size = 0;
        };
        for (const char of source.text) {
            const bytes = encoder.encode(char).length;
            if (size + bytes > room)
                await push();
            text += char;
            size += bytes;
        }
        await push();
        return result;
    }
    class Manager {
        constructor(options) {
            this.profiles = options.profiles;
            this.client = options.client;
            this.store = options.store;
            this.runtime = options.runtime;
            this.corpus = options.corpus;
            this.validate = options.validate;
            this.hash = options.hash;
            this.libraryID = options.libraryID;
            this.controller = options.controller;
            this.foreground = options.foreground;
            this.notify = options.notify;
            this.now = options.now || Date.now;
            this.sleep = options.sleep || delay;
            this.listeners = new Set();
            this.status = 'idle';
            this.error = '';
            this.batchFailures = 0;
            this.stats = { readySegments: 0, readySources: 0, pending: 0, revision: 0 };
            this.space = null;
            this.control = { mode: 'idle', paused: true, cursor: '', scanID: '', completed: false };
            this.epoch = 0;
            this.stopped = false;
            this.suspended = false;
            this.querying = 0;
            this.lastRequest = 0;
            this.work = Promise.resolve();
            this.started = null;
            this.authorized = false;
            this.refreshNeeded = false;
            this.queryControllers = new Set();
            this.testController = null;
            this.testWork = null;
            this.scanSerial = 0;
        }
        publish() {
            for (const listener of this.listeners) {
                try {
                    listener();
                }
                catch {
                }
            }
            this.notify?.();
        }
        state(endpoint) {
            return { ...this.profiles.state(endpoint), ...this.stats, mode: this.control.mode, paused: this.control.paused, completed: this.control.completed, status: this.status, error: this.error, batchFailures: this.batchFailures, namespace: this.space?.namespace || '', threshold: this.profiles.state(endpoint).threshold ?? 0.45, refreshPending: this.refreshNeeded, foregroundBudgetMs: 8000 };
        }
        async updateStats() {
            if (this.space)
                this.stats = await this.store.stats(this.space.namespace);
            this.publish();
        }
        async configure(valid) {
            const raw = await this.profiles.space();
            if (valid && !valid()) throw abort();
            this.space = raw ? { ...raw, namespace: await this.hash(JSON.stringify(['library-space-v1', this.libraryID, raw.namespace])), libraryID: this.libraryID } : null;
            if (valid && !valid()) throw abort();
            if (this.space) {
                await this.store.configure(this.space);
                if (valid && !valid()) throw abort();
                this.control = await this.store.control(this.space.namespace);
                this.authorized = this.control.mode !== 'idle';
                await this.updateStats();
            }
            else
                this.stats = { readySegments: 0, readySources: 0, pending: 0, revision: 0 };
        }
        start() {
            if (!this.started)
                this.started = (async () => {
                    try {
                        await this.profiles.load();
                        await this.store.open();
                        await this.configure();
                        this.threshold = this.profiles.state().threshold ?? 0.45;
                        if (this.authorized && !this.control.completed) {
                            this.control.paused = true;
                            await this.store.setControl(this.space.namespace, this.control);
                            this.status = 'paused';
                        }
                        this.publish();
                    }
                    catch {
                        this.error = '云端向量设置或本地索引不可用，请检查设置；当前 PDF 对话仍可使用';
                        this.status = 'error';
                        this.publish();
                    }
                })();
            return this.started;
        }
        invalidate() {
            this.epoch++;
            this.buildController?.abort();
            this.testController?.abort();
            for (const controller of this.queryControllers)
                controller.abort();
            this.runtime.invalidate();
            clearTimeout(this.refreshTimer);
        }
        async changed(action) {
            await this.start();
            this.invalidate();
            await action();
            this.threshold = this.profiles.state().threshold ?? 0.45;
            await this.configure();
            this.status = 'idle';
            this.error = '';
            this.publish();
            return this.state();
        }
        settingsAPI() {
            return { state: endpoint => this.state(endpoint), watch: listener => {
                    this.listeners.add(listener);
                    return () => this.listeners.delete(listener);
                }, apply: values => this.changed(() => this.profiles.apply(values)), test: () => this.test(), clearKey: () => this.changed(() => this.profiles.clearKey()), setEnabled: value => this.changed(() => this.profiles.setEnabled(value)), pilot: () => this.schedule('pilot'), build: () => this.schedule('full'), pause: () => this.pause(), clearIndex: () => this.clearIndex() };
        }
        async test() {
            await this.start();
            if (this.stopped) throw abort();
            this.invalidate();
            const control = this.controller(), epoch = this.epoch, revision = this.profiles.state().revision;
            this.testController = control;
            const valid = () => !this.stopped && !control.signal.aborted && epoch === this.epoch;
            let cancel;
            const cancelled = new Promise((_, reject) => {
                cancel = () => reject(abort());
                control.signal.addEventListener('abort', cancel, { once: true });
            });
            this.status = 'testing';
            this.error = '';
            this.publish();
            const work = async () => {
                const result = await this.client.embed(['This is a connection test.'], { expectedDimensions: null, signal: control.signal });
                if (!valid()) throw abort();
                // The guard also runs inside the serialized profile mutation;
                // cancellation can occur while this call waits in that queue.
                await this.profiles.markTested(result.dimensions, result.model, revision, valid);
                if (!valid()) throw abort();
                await this.configure(valid);
                if (!valid()) throw abort();
                this.status = 'tested';
                return this.state();
            };
            this.testWork = Promise.race([work(), cancelled]).catch(error => {
                if (valid()) {
                    this.status = 'error';
                    this.error = '连接测试失败，请检查端点、模型、密钥或网络';
                }
                throw error;
            }).finally(() => {
                control.signal.removeEventListener('abort', cancel);
                if (this.testController === control) this.testController = null;
                if (valid()) this.publish();
            });
            return this.testWork;
        }
        usable() {
            const p = this.profiles.state();
            return !this.stopped && p.enabled && p.tested && p.hasKey && !!this.space;
        }
        async schedule(mode) {
            await this.start();
            if (!this.usable())
                throw new Error('请先保存配置、测试连接并启用云端语义检索');
            this.invalidate();
            await this.work.catch(() => {
            });
            const same = this.control.mode === mode && !this.control.completed && !this.refreshNeeded && this.control.scanID;
            this.refreshNeeded = false;
            this.authorized = true;
            this.control = { mode, paused: false, cursor: same ? this.control.cursor : '', scanID: same ? this.control.scanID : await this.hash(String(this.now()) + ':' + (++this.scanSerial) + ':' + this.epoch), completed: false };
            await this.store.setControl(this.space.namespace, this.control);
            this.error = '';
            this.launch();
            this.publish();
            return this.state();
        }
        launch() {
            if (this.stopped || this.suspended || !this.usable() || this.control.paused || this.control.completed)
                return;
            const control = this.controller();
            this.buildController = control;
            const epoch = this.epoch, space = this.space, revision = this.profiles.state().revision, scanID = this.control.scanID;
            const valid = () => !control.signal.aborted && !this.stopped && epoch === this.epoch && revision === this.profiles.state().revision;
            let onAbort;
            const cancelled = new Promise((_, reject) => {
                onAbort = () => reject(abort());
                control.signal.addEventListener('abort', onAbort, { once: true });
            });
            this.work = Promise.race([this.run(control, space, scanID, valid), cancelled]).catch(async (error) => {
                if (!valid())
                    return;
                this.batchFailures++;
                this.control.paused = true;
                this.status = 'paused';
                this.error = error?.name === 'EmbeddingHTTPError' && (error.status === 401 || error.status === 403) ? '认证失败，请检查密钥和权限后继续' : error?.status === 429 ? '服务限流或配额不足，请稍后继续' : '后台向量任务已暂停，请检查网络或配置后继续';
                await this.store.setControl(space.namespace, this.control);
                this.publish();
            }).finally(() => {
                control.signal.removeEventListener('abort', onAbort);
                if (this.buildController === control)
                    this.buildController = null;
            });
        }
        async wait(ms, signal) {
            check(signal);
            let cancel;
            const stopped = new Promise((_, reject) => {
                cancel = () => reject(abort());
                signal.addEventListener('abort', cancel, { once: true });
            });
            try {
                await Promise.race([this.sleep(ms, signal), stopped]);
                check(signal);
            }
            finally {
                signal.removeEventListener('abort', cancel);
            }
        }
        async backgroundGate(signal) {
            while (this.suspended || this.querying || this.foreground?.()) {
                await this.wait(50, signal);
            }
            check(signal);
        }
        async embedBackground(inputs, signal, valid) {
            for (let attempt = 0;; attempt++) {
                await this.backgroundGate(signal);
                const interval = 60000 / this.profiles.state().rpm, delay = this.lastRequest + interval - this.now();
                if (delay > 0)
                    await this.wait(delay, signal);
                await this.backgroundGate(signal);
                if (!valid())
                    throw abort();
                this.lastRequest = this.now();
                try {
                    return await this.client.embed(inputs, { signal });
                }
                catch (error) {
                    if (!valid() || !error.retryable || attempt >= 3)
                        throw error;
                    await this.wait(Math.min(60000, Math.max(250, error.retryAfter ?? (500 * 2 ** attempt))), signal);
                }
            }
        }
        async run(control, space, scanID, valid) {
            this.status = 'building';
            this.publish();
            const limit = Math.min(8, this.profiles.state().batchSize);
            const jobs = [], inputs = new Map();
            // A source cursor becomes durable only after every earlier source
            // and every pending input belonging to this source has committed.
            const advance = async () => {
                let cursor;
                while (jobs[0]?.enumerated && !jobs[0].remaining.size) cursor = jobs.shift().cursor;
                if (cursor !== undefined) {
                    if (!valid()) throw abort();
                    this.control.cursor = String(cursor);
                    await this.store.setControl(space.namespace, this.control);
                }
            };
            const flush = async () => {
                if (!inputs.size) { await advance(); return; }
                const batch = [...inputs.values()], owners = new Set(batch.flatMap(input => [...input.owners]));
                const authorities = async () => {
                    for (const job of owners) {
                        if (!valid() || !await this.validate(job.source, control.signal)) throw abort();
                    }
                    if (!valid()) throw abort();
                };
                // Check all owners, including owners sharing an input hash.
                // One stale owner rolls back publication of this whole batch.
                await authorities();
                const response = await this.embedBackground(batch.map(input => input.input), control.signal, valid);
                await authorities();
                await this.store.commit(space.namespace, batch.map((input, i) => ({ key: input.key, vector: response.vectors[i] })), valid);
                for (const input of batch) for (const job of input.owners) job.remaining.delete(input.key);
                inputs.clear();
                await advance();
                await this.updateStats();
            };
            for await (const entry of this.corpus({ cursor: this.control.cursor, limitPapers: this.control.mode === 'pilot' ? 20 : undefined, priority: this.priority, signal: control.signal })) {
                check(control.signal);
                if (!valid()) throw abort();
                await this.backgroundGate(control.signal);
                // A pilot cohort is pinned before its first network request,
                // without advancing past any uncommitted source.
                if (entry.checkpoint !== undefined && !this.control.cursor) {
                    this.control.cursor = String(entry.checkpoint);
                    await this.store.setControl(space.namespace, this.control);
                }
                const source = M.cleanSources([{ ...entry.source, label: '阅读1' }])[0];
                const authoritative = await this.validate(source, control.signal);
                if (!valid()) throw abort();
                const job = { source, cursor: entry.cursor, remaining: new Set(), enumerated: false };
                jobs.push(job);
                if (authoritative) {
                    const pieces = await segments(source, this.profiles.state().maxInputBytes, this.hash);
                    if (!valid()) throw abort();
                    await this.store.sync(space.namespace, source, pieces, scanID);
                    const loaded = new Set();
                    while (true) {
                        // Source scoping prevents unrelated stale pending rows
                        // from being uploaded or starving this source.
                        const pending = await this.store.pending(space.namespace, 1024, source);
                        for (const piece of pending) {
                            if (loaded.has(piece.key)) continue;
                            loaded.add(piece.key);
                            job.remaining.add(piece.key);
                            const shared = inputs.get(piece.key);
                            if (shared) shared.owners.add(job);
                            else inputs.set(piece.key, { ...piece, owners: new Set([job]) });
                            if (inputs.size === limit) await flush();
                        }
                        if (pending.length < 1024) break;
                    }
                }
                job.enumerated = true;
                await advance();
                // Bound retained owner/source objects even for thousands of
                // identical inputs, which otherwise never fill a unique batch.
                if (jobs.length >= 128) await flush();
            }
            await flush();
            if (!valid()) throw abort();
            this.control.completed = true;
            await this.store.setControl(space.namespace, this.control);
            if (this.control.mode === 'full') await this.store.prune(space.namespace, scanID, valid);
            this.status = 'ready';
            await this.updateStats();
        }
        async pause() {
            await this.start();
            if (this.control.mode === 'pilot' && this.refreshNeeded && this.control.paused)
                return this.state();
            this.control.paused = !this.control.paused;
            if (this.control.paused) {
                this.invalidate();
                await this.work.catch(() => {
                });
                this.status = 'paused';
            }
            if (this.space)
                await this.store.setControl(this.space.namespace, this.control);
            if (!this.control.paused && !this.control.completed)
                this.launch();
            this.publish();
            return this.state();
        }
        suspend(value) {
            this.suspended = !!value;
            if (!value && this.refreshNeeded)
                this.refresh();
            if (!value && !this.stopped && this.authorized && !this.control.paused && !this.control.completed && !this.buildController)
                this.launch();
        }
        prioritize(scope) {
            this.priority = scope;
        }
        refresh() {
            if (this.stopped || !this.authorized)
                return;
            this.refreshNeeded = true;
            clearTimeout(this.refreshTimer);
            // A pilot authorizes one explicit sample only. Changed/opened sources may
            // not rotate that sample and cumulatively upload the rest of the library.
            if (this.control.mode === 'pilot') {
                this.control.paused = true;
                this.buildController?.abort();
                this.status = 'paused';
                this.error = '试建资料已更新，请再次点击试建或全库建立；现有有效向量保留';
                if (this.space)
                    void this.store.setControl(this.space.namespace, this.control).catch(() => {
                    });
                this.publish();
                return;
            }
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                if (this.control.paused || this.suspended || !this.usable())
                    return;
                void this.schedule('full').catch(() => {
                });
            }, 500);
        }
        async clearIndex() {
            await this.start();
            this.invalidate();
            await this.work.catch(() => {
            });
            if (this.space)
                await this.store.clear(this.space.namespace);
            this.authorized = false;
            this.control = { mode: 'idle', paused: true, cursor: '', scanID: '', completed: false };
            this.status = 'idle';
            this.error = '';
            await this.updateStats();
        }
        async lexical(scope, query, options) {
            const candidates = [];
            for (const [i, source] of (options.lexicalSources || []).entries()) {
                if (await this.validate(source, options.signal))
                    candidates.push({ source, sparseRank: i + 1 });
            }
            return V.hybridSelect(candidates, query, { scope, conversationId: options.conversationId });
        }
        async retrieve(scope, query, options = {}) {
            await this.start();
            if (!M.queryTokens(options.question ?? query).length || options.signal?.aborted)
                return [];
            const fallback = () => this.lexical(scope, query, options);
            if (!this.usable() || !this.stats.readySegments)
                return fallback();
            clearTimeout(this.idleTimer);
            const controller = this.controller(), epoch = this.epoch, space = this.space;
            const onAbort = () => controller.abort();
            options.signal?.addEventListener('abort', onAbort, { once: true });
            this.queryControllers.add(controller);
            this.querying++;
            let timer;
            const expired = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(abort());
                }, 8000);
                controller.signal.addEventListener('abort', () => reject(abort()), { once: true });
            });
            const work = async () => {
                const max = Math.min(this.profiles.state().maxInputBytes, 8000), input = boundedText(options.question ?? query, max);
                const response = await this.client.embed([input], { signal: controller.signal, timeoutMs: 8000 });
                check(controller.signal);
                if (epoch !== this.epoch)
                    throw abort();
                const stats = await this.store.stats(space.namespace), hits = await this.runtime.search({ namespace: space.namespace, revision: stats.revision, dimensions: space.dimensions, vector: response.vectors[0], scope, conversationId: options.conversationId, signal: controller.signal, rows: (afterId, limit) => this.store.vectors(space.namespace, { afterId, limit }) });
                const eligible = hits.filter(h => h.score >= this.threshold), rows = await this.store.sources(space.namespace, eligible.map(h => h.id));
                const byId = new Map(rows.map(row => [row.id, row.source])), candidates = [];
                for (const [i, hit] of eligible.entries()) {
                    const source = byId.get(hit.id);
                    if (source && await this.validate(source, controller.signal))
                        candidates.push({ source, score: hit.score, denseRank: i + 1 });
                }
                for (const [i, source] of (options.lexicalSources || []).entries()) {
                    if (await this.validate(source, controller.signal))
                        candidates.push({ source, sparseRank: i + 1 });
                }
                check(controller.signal);
                if (epoch !== this.epoch)
                    throw abort();
                const selected = V.hybridSelect(candidates, query, { scope, conversationId: options.conversationId }), final = [];
                for (const source of selected)
                    if (await this.validate(source, controller.signal))
                        final.push({ ...source, label: '阅读' + (final.length + 1) });
                check(controller.signal);
                return final;
            };
            try {
                return await Promise.race([work(), expired]);
            }
            catch {
                this.error = '本次语义检索未完成，已使用有效的本地检索结果';
                this.publish();
                return options.signal?.aborted ? [] : await fallback();
            }
            finally {
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', onAbort);
                this.queryControllers.delete(controller);
                this.querying--;
                controller.abort();
                if (!this.stopped)
                    this.idleTimer = setTimeout(() => {
                        if (!this.querying) {
                            this.runtime.invalidate();
                            this.runtime.worker?.terminate();
                            this.runtime.worker = null;
                        }
                    }, 60000);
            }
        }
        async stop() {
            if (this.stopped)
                return;
            this.stopped = true;
            this.invalidate();
            clearTimeout(this.idleTimer);
            await this.work.catch(() => {
            });
            await this.started?.catch(() => {
            });
            await this.testWork?.catch(() => {});
            this.runtime.destroy();
            await this.store.close();
            this.listeners.clear();
        }
    }
    root.ZMARAG = { Manager };
    if (typeof module !== 'undefined')
        module.exports = root.ZMARAG;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
