(function (root) {
    'use strict';
    function bind(container, api) {
        const find = id => container.querySelector('#zma-embedding-' + id), endpoint = find('endpoint');
        if (!endpoint)
            return;
        const fields = { endpoint, model: find('model'), key: find('key'), maxInputBytes: find('max-input'), batchSize: find('batch-size'), rpm: find('rpm'), threshold: find('threshold') }, enabled = find('enabled'), preset = find('preset'), status = find('status');
        let working = false, localError = '';
        const read = () => Object.fromEntries(Object.entries(fields).map(([name, node]) => [name, ['maxInputBytes', 'batchSize', 'rpm', 'threshold'].includes(name) ? Number(node.value) : node.value.trim()]));
        const render = (full = false, preview) => {
            const active = api?.state() || {};
            const state = preview || active;
            if (full) {
                for (const [name, node] of Object.entries(fields)) {
                    if (name !== 'key')
                        node.value = String(state[name] ?? (name === 'threshold' ? 0.45 : ''));
                }
                fields.key.value = '';
                fields.key.placeholder = state.hasKey ? '本端点已保存；留空保留密钥' : '输入本端点 API Key';
                preset.value = state.endpoint === 'https://api.siliconflow.cn/v1/embeddings' ? 'siliconflow' : 'custom';
                enabled.checked = !!state.enabled;
            }
            const unsaved = !!api && Object.entries(fields).some(([name, node]) =>
                name === 'key' ? !!node.value.trim() : node.value.trim() !== String(active[name] ?? (name === 'threshold' ? 0.45 : '')));
            for (const node of [...Object.values(fields), preset])
                node.disabled = working || !api;
            enabled.disabled = working || !api || unsaved;
            for (const name of ['apply', 'test', 'clear-key', 'pilot', 'build', 'pause', 'clear-index']) {
                const node = find(name);
                if (node)
                    node.disabled = working || !api || (unsaved && !['apply', 'test'].includes(name)) || (['pilot', 'build'].includes(name) && (!state.hasKey || !state.tested || !state.enabled));
            }
            find('pause').textContent = state.paused ? '继续后台任务' : '暂停后台任务';
            status.textContent = localError || state.error || (api ? `${state.status || 'idle'} · 已就绪 ${state.readySources || 0} 个来源 / ${state.readySegments || 0} 片段 · 待处理 ${state.pending || 0} · 失败批次 ${state.batchFailures || 0}${state.mode === 'pilot' ? ' · 试建最多20篇，覆盖为部分资料' : ''}` : '当前平台无法使用云端向量模块；现有 PDF 对话仍可使用');
        };
        const run = async (action) => {
            if (working || !api)
                return;
            working = true;
            localError = '';
            render();
            try {
                await action();
                render(true);
            }
            catch {
                localError = '操作未完成，请检查配置、连接状态后重试';
            }
            finally {
                working = false;
                render();
            }
        };
        for (const node of Object.values(fields)) node.addEventListener('input', () => render());
        const apply = () => api.apply(read());
        endpoint.addEventListener('change', () => {
            try {
                localError = '';
                render(true, api?.state(endpoint.value.trim()));
            }
            catch {
                fields.key.value = '';
                fields.key.placeholder = '输入本端点 API Key';
                localError = '请输入完整的 HTTPS Embedding 端点';
                render();
            }
        });
        preset.addEventListener('change', () => {
            if (preset.value === 'siliconflow') {
                endpoint.value = 'https://api.siliconflow.cn/v1/embeddings';
                endpoint.dispatchEvent(new endpoint.ownerDocument.defaultView.Event('change'));
            }
            else {
                fields.key.value = '';
                fields.key.placeholder = '输入本端点 API Key';
                endpoint.focus();
            }
        });
        find('apply').addEventListener('click', () => void run(apply));
        find('test').addEventListener('click', () => void run(async () => {
            await apply();
            await api.test();
        }));
        find('clear-key').addEventListener('click', () => void run(() => api.clearKey()));
        enabled.addEventListener('change', () => {
            const value = enabled.checked;
            void run(() => api.setEnabled(value));
        });
        for (const [name, method] of [['pilot', 'pilot'], ['build', 'build'], ['pause', 'pause'], ['clear-index', 'clearIndex']])
            find(name).addEventListener('click', () => void run(() => api[method]()));
        render(true);
        const dispose = api?.watch(() => render());
        if (dispose)
            container.ownerDocument.defaultView?.addEventListener('unload', dispose, { once: true });
    }
    root.ZMAEmbeddingUI = { bind };
    if (typeof module !== 'undefined')
        module.exports = root.ZMAEmbeddingUI;
})(typeof _globalThis !== 'undefined' ? _globalThis : globalThis);
