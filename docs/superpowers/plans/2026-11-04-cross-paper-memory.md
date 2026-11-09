# 跨论文研究记忆实施计划

执行约定为在当前会话使用 superpowers:executing-plans 逐项实施，最后独立审查并验证交付。用户已批准设计及连续实现、测试和打包。本目录采用现有源码和发布归档管理变更。

### 目标与架构

实现同一文献库内跨论文关联、可信来源跳转和研究笔记导出。纯文本算法、索引任务与Zotero适配分别位于 `src/memory-core.js`、`src/memory-store.js` 和 `src/memory-host.js`，通过现有Host和Panel接入。使用现有JavaScript、Zotero IOUtils和文件选择器。

依据为 [已批准设计](../specs/2026-11-04-cross-paper-memory-design.md)。目标版本0.17.0，目标Zotero 10.0.x，最多三篇论文、6000字符、每片段1800字符。当前问题、明确材料和当前PDF优先使用上下文预算。原生验证使用隔离配置。

### 审查重点

阅读摘要人工改写后，旧索引应跳过不匹配的正文。历史导入和后台更新并发时，候选来源须校验当前权威记录。大型中文及公式历史应分批处理，当前提问可以取消。来源点击应定位历史窗口中的原消息，并保留当前草稿。缺少摘要、旧版记录及丢失PDF路径均有明确状态。

### 任务一 文本索引与请求资料

涉及 `src/memory-core.js`、`src/core.js` 和 `tests/memory-core.test.cjs`。核心导出 `buildDocument(scope, state, metadata, options)`、`rankDocuments(entries, query)`、`selectSources(documents, query, options)`、`cleanSources(value)`、`appendContext(messages, sources, budget)` 及 `exportNotes(documents)`。构建接口异步接受取消与让出事件循环回调，检索来源使用附件key、会话ID、消息位置和内容签名。

- [x] 编写并运行失败回归，覆盖中英文、标题/DOI、无关主题、公式、当前会话排除、重复来源、三篇/6000/1800预算及旧消息兼容。
- [x] 实现纯文本抽取、BM25排序、受控来源元数据、上下文资料封装及正式摘要Markdown导出。
- [x] 运行 `node --test tests/memory-core.test.cjs` 并核对通过，确认语料处理主动让出事件循环。

### 任务二 本地索引任务和Zotero接入

涉及 `src/memory-store.js`、`src/memory-host.js`、`src/host.js`、`tests/memory-store.test.cjs` 和 `tests/memory-host.test.cjs`。Manager使用适配器完成枚举、只读加载、原子缓存、权威来源验证和前台状态检查，导出 `schedule(scope)`、`ensure(libraryID)`、`retrieve(scope, query, options)`、`rebuild(libraryID)`、`export(libraryID)`、`status(libraryID)` 与 `stop()`。Zotero适配创建 `create(host)`，提供同一Manager、设置API和 `openSource(source)`。

- [x] 编写失败回归，覆盖回填旧路径、冷恢复、并发旧任务作废、损坏和超大记录、人工笔记编辑、删除与取消。
- [x] 实现分批索引、独立文献库缓存、LRU和资源上限，纯读历史路径避开Host.load副作用。
- [x] 将Host启动、保存、导入、读取器恢复及停用接入索引，加入设置API和原会话跳转。
- [x] 运行两份Manager/适配器测试及现有历史、摘要回归，验证正常保存入口触发增量索引。

### 任务三 正常提问、来源界面和设置

涉及 `src/panel.js`、`src/settings.js`、`src/assistant.css`、`content/deepseek-settings.inc.xhtml` 和浏览器回归。发送流程在构造当前论文上下文后调用 `host.memory.retrieve`，以现有 `D.textSize` 计算剩余预算，来源元数据随该轮回答保存。Panel展示折叠来源并复用会话选择和摘要视图。设置接入同一Manager的开关、状态、重建和导出。

- [x] 编写并运行失败浏览器回归，通过正常发送入口观察A论文请求中B论文片段，检查关闭、无命中、取消和预算不足。
- [x] 实现来源引用和按需展开，重开后保留依据，点击定位旧会话且保留草稿。导入导出覆盖来源字段契约。
- [x] 增加设置并验证原生模板绑定，导出采用既有文件选择器及受保护路径检查。
- [x] 运行目标浏览器及设置回归，查看渲染截图并记录大历史心跳。

### 任务四 审查与发布验证

涉及 `scripts/build.py`、`scripts/verify.py`、隔离原生脚本、`package.json`、README和验收记录。

- [x] 更新模块加载顺序和0.17.0版本，完成独立代码审查并逐项处理实质发现。
- [x] 运行完整 `npm test` 及全src checkJs，按失败原因修复并复验。
- [x] 使用两篇夹具PDF执行隔离Zotero首次启动和冷重启，验证回填、跨论文请求、来源跳转、设置和导出。
- [x] 构建最终XPI，核对原生报告哈希、基线文件及资源，生成源码归档并交付。
