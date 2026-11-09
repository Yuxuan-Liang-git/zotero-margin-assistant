# 个人文献库论文记忆实施计划

执行约定为使用 superpowers:executing-plans 在当前会话连续实施，最后进行一次独立代码审查。用户已批准设计及实现。工作区使用既有源码与发布归档管理变更，保留0.17.0基线。

### 目标与架构

依据为 [已批准设计](../specs/2026-11-04-personal-library-memory-design.md)。目标版本0.18.0，目标运行环境Zotero 10.0.x。整个个人文献库的书目、PDF文字、普通笔记与文字标注进入本地检索，并与既有历史问答及正式摘要合并。

新增 `src/library-index.js` 负责独立SQLite派生索引，使用按词索引的倒排表与分段原文，查询交给异步SQLite连接。`src/library-store.js` 负责元数据优先、已有缓存优先的后台队列和取消。`src/library-host.js` 负责Zotero身份、文件、文字提取与导航。`src/memory-host.js` 保留旧索引并组合两个通道，`src/memory-core.js` 管理统一来源契约与预算。

接口采用 `Index.open()/replacePaper()/beginUnit()/append()/commitUnit()/search()/status()/prune()/close()`，`LibraryManager.start()/refresh()/run()/pause()/resume()/retrieve()/rebuild()/status()/stop()`，`LibraryHost.create(host, options)` 返回适配器及Manager。提取器以异步页迭代器提供 `{pageIndex, text}`，页号无依据时省略。索引代际提交前校验取消标记和权威指纹，未完成代际不可检索。

### 全局约束

个人文献库覆盖全部分类并去重，多PDF版本保持附件身份。最多三篇关联论文、6000字符、每段1800字符，当前问题与PDF优先。自动提取单文件上限64 MiB，优先复用有效缓存。正文通道独立于旧对话的2000篇和256000字符限制。背景索引使用本地能力，自动OCR和全库AI摘要不在本次推理流程中。测试使用隔离Zotero配置及夹具。

### 审查重点

来源在条目移动、删除、文件替换、笔记修改及标注编辑后应及时失效。超2000篇的元数据与长文献最后一页的罕见关键词都可被检索。暂停、前台请求、停用与重启不能发布部分代际或失去后续任务。缓存的部分文字层、纯扫描页和大文件须准确展示状态。多PDF、重复摘要及旧版保存来源应保留正确身份和预算。

### 任务一 统一来源与分段检索

涉及 `src/memory-core.js`、新增 `src/library-index.js`、`tests/library-index.test.cjs` 及现有核心测试。新来源使用 `version:2`、`paperKey`、`sourceKey`、`fingerprint`，保留旧来源读取。资料类型增加 `metadata`、`pdf`、`note`、`annotation`。每个文本片段维护内容签名，PDF可带零基页号。

- [x] 先写失败回归，覆盖新旧来源清理、类型标签、三篇预算、重复文字、多版本附件、末页稀有词和超过2000篇发现。
- [x] 实现统一来源与SQLite派生表，参数化查询、分段写入、代际原子提交及孤立代际清理。
- [x] 运行 `node --test tests/memory-core.test.cjs tests/library-index.test.cjs` 并记录RED与GREEN。

### 任务二 后台索引与原生适配

涉及新增 `src/library-store.js`、`src/library-host.js`、`tests/library-store.test.cjs`、`tests/library-host.test.cjs`。元数据及笔记先完成发现，再读取现有全文缓存，最后逐篇提取缺失PDF。只使用个人文献库ID。按页读取SDT，缺少接口时回退普通Worker文字并采用搜索定位。

- [x] 先写失败回归，覆盖无历史的论文、多个分类、双PDF、普通笔记、文字标注、入口笔记排除与仅书目条目。
- [x] 实现文件指纹、缓存完整性、64 MiB前置保护与各状态，来源用于请求或打开前复验。
- [x] 验证单提取队列、元数据优先、暂停重排、文件处理中变化、提问抢占和冷恢复。
- [x] 运行新增Store与Host测试并记录结果。

### 任务三 正常提问与设置接入

涉及 `src/memory-host.js`、`src/host.js`、`src/panel.js`、`src/settings.js`、`content/deepseek-settings.inc.xhtml`、构建模块表与浏览器回归。

- [x] 用正常发送入口写失败回归，检查无历史的B正文、书目和笔记来源进入A请求，折叠出处可打开原页或条目。
- [x] 合并旧新检索并按父文献去重，接入启动及条目变化，设置提供覆盖数量、暂停/继续/重建及导出。
- [x] 导出保留正式摘要，为无摘要论文附加明确标识的书目与覆盖信息。
- [x] 运行目标浏览器与设置回归，检查紧凑来源界面及预算。

### 任务四 独立审查与发布

涉及隔离原生脚本、`scripts/verify.py`、`package.json`、README及发布报告。

- [x] 运行完整回归与全部src checkJs，独立审查整个变更并用RED→GREEN验证实质修复。
- [x] 隔离Zotero使用无历史真实PDF测试Worker提取、正文入请求、原页跳转、书目/笔记/标注身份、缓存和冷重启。AI使用捕获输入的模拟响应。
- [x] 更新0.18.0、验证最终XPI哈希、原有资源及确定性构建，生成源码归档和验收报告。
