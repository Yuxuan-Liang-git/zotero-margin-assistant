# Zotero Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek region questions and manually numbered, cross-page references to custom Margin Comments 0.9.5.

**Architecture:** Preserve the packaged baseline, add small plain JavaScript modules, and apply narrowly checked integration patches during the reproducible build. Native image annotations remain the source of PDF coordinates. Host code owns storage, credentials and API requests; reader UI presents materials and results.

**Tech Stack:** JavaScript/JSDoc, Node test runner, Python zipfile builder, PDF.js in Zotero, Playwright for isolated UI tests.

**Spec:** `docs/superpowers/specs/2026-10-12-zotero-deepseek-region-references-design.md`

## Global Constraints

- Zotero `10.0` to `10.0.*`; preserve original add-on ID and baseline functionality.
- Official endpoint `https://api.deepseek.com`, default model `deepseek-flash`; session-only API key.
- Native PDF coordinates, attachment/library isolation, versioned atomic local persistence.
- Only explicit Send uploads regions; only explicit Save writes notes/comments.
- No whole-book OCR, automatic uploads, credential logging, or original package modification.
- Local index/drafts do not promise Zotero Sync. Real API and actual Zotero GUI acceptance remain distinct from simulation tests.

## Review Focus

- Rotated, clipped, offscreen PDF regions must use the source page's viewport.
- Duplicate numbering and deleted/replaced sources must not silently select a different source.
- Links must survive rich-text editing without accepting arbitrary URLs or script attributes.
- Chunked UTF-8/SSE and cancellation must preserve partial answers with a visible incomplete state.
- Corrupt local JSON and concurrent writes must preserve previous data and block silent overwrite.

### Task 1: Reproducible baseline and core

**Files:** `zotero-margin-assistant/{baseline/,src/core.js,tests/core.test.cjs,scripts/build.py,package.json}`.
**Interfaces:** `normalizeNumber(text): string`, `ReferenceIndex.add/find/remove`, `sourceLink(source,groupID): string`, `parseSourceLink(text): object|null`, `LocalStore.load/save(scope,data): Promise`.

- [ ] Write core tests for equivalent number inputs, attachment isolation, duplicates, safe links, disk corruption, and serialized atomic writes; run RED.
- [ ] Implement validated core records and storage adapter; run GREEN.
- [ ] Copy unchanged baseline; create deterministic patch-and-package builder that refuses unmatched patches and removes upstream automatic update URL.

### Task 2: Region capture and source references

**Files:** `src/{capture.js,references.js,host.js,assistant.css}`, `tests/{capture.test.cjs,browser.test.cjs}`.
**Interfaces:** `captureRegion(pdfDocument,source,document): Promise<Material>`, `References.renderStored/readStored`, `Host.resolveSource/preview/insertReference`.

- [ ] Write failing capture tests with independently derived rotated/clipped bounds; write browser reference editing roundtrip and unsafe-link tests; run RED.
- [ ] Implement single-page PDF.js render with cropping, size limits and per-file-fingerprint memory cache, optional region text extraction.
- [ ] Implement numbering/type form, directory/disambiguation, pinned screenshot previews, jump/add material, source repair and invalidation.
- [ ] Patch existing rich-text boundary and add per-card Insert Reference action; verify roundtrip and baseline rich text behavior GREEN.

### Task 3: DeepSeek and question panel

**Files:** `src/{deepseek.js,panel.js}`, `content/assistant-settings.xhtml`, `tests/{deepseek.test.cjs,browser.test.cjs}`.
**Interfaces:** `DeepSeekClient.generate(messages,{signal,onDelta}): Promise<string>`, `buildMessages(history,question,materials): messages`, `Panel.addMaterial/send/saveAnswer`.

- [ ] Write failing multi-image/history payload, streaming/chunk splitting, 401/429/network, abort, size-budget and per-PDF session tests; run RED.
- [ ] Implement official-only request transport, host session credentials, settings connection test and incremental SSE parsing.
- [ ] Implement screenshot/question panel, stop/retry, LaTeX, explicit editable save preview, source-linked native note/comment saves and draft restoration.
- [ ] Verify canceled results remain incomplete, unsent material removal and failed questions remain recoverable; run GREEN.

### Task 4: Integration, package and delivery

**Files:** `src/host.js`, `scripts/{build.py,verify.py}`, `tests/integration.test.cjs`, `README.md`, `docs/acceptance.md`.
**Interfaces:** `Host.start/stop`, reader toolbar/context menu, native item save and lifecycle cleanup.

- [ ] Write failing host integration tests for menu actions, isolated readers, readonly saves and cleanup; run RED.
- [ ] Integrate bootstrap lifecycle; restore readers opened before activation; cancel requests on reader close/unload.
- [ ] Run all tests, syntax/static checks, build XPI, verify manifest/assets and preserved baseline changes, inspect standalone UI screenshot.
- [ ] Conduct fresh review and fix actionable issues with regression tests. Document exact verified scope and remaining Zotero/API acceptance; deliver XPI plus buildable source.

No Git commit steps: this workspace is not a repository; preserve evidence in a per-plan ledger. Execution is authorized by the user's 2026-10-13 “允许执行”; proceed in the current session.


## 0.12.5 执行结果

- 完成外观偏好、原生设置预览、即时应用及重启恢复；模型/账户等配置收进设置。
- 完成简化页头、问答排版、底部输入和可展开文档范围；保留输入及附件、引用、流式渲染功能。
- 按用户明确选择排除 PDF 添加文本的重复页边卡片，保留原文字批注。
- 浏览器全套回归、checkJs、18 组排版检查；原生隔离首次启动及冷重启验证由 appearance-smoke.py 串联现有验收，记录见 acceptance.md。


## 0.12.6 执行结果

- 以既有右键引用流程为基础，增加选区附近气泡及多个编号锚点，外部点击收起、空内容移除、非空保留、重新打开编辑和删除。
- 批注草稿按会话与 PDF 保存，保持旧 v1/v2 历史兼容；发送时合并所有批注及问题，失败保留、成功清空待发送记录。
- 引用公式沿用 LaTeX 提取，预览用 MathML；原生 textarea 继续支持光标、复制/粘贴及 IME，点击嵌套 PDF frame 也能收起。
- 完成先失败后通过的批注交互与跨 frame 点击测试，161 项完整回归、checkJs、浅深/窄宽气泡截图检查，原生隔离验收见 acceptance.md。


## 0.12.7 执行结果

- PDF 文字选区与原生高亮/下划线/区域菜单增加批注提问入口，文字采用无数据库写入的文件指纹快照。
- QuoteBubbles 扩展 PDF 覆盖层、原文/截图预览、坐标换算和缩放/滚动监听，保留当前字体、剪贴板和原生输入。
- PDF 来源与对话批注共用待发送列表及本地持久化，原文/截图与评论合并发送，旧草稿兼容；失效来源遵循既有明确省略策略。
- 先失败后通过的菜单/快照/跨 frame UI 集成，完整回归和实际 Gecko 首启/冷重启验收，证据见 acceptance.md。


## 0.12.8 定位错误修复

- 复现用户截图同类错误：PDF page 尚未渲染、编号隐藏时，logical AND 的 false 被当作元素调用边界方法。
- 改为显式 null 和元素/可视区域两条定位路径；保持来源、草稿和发送行为。
- 新回归先复现 TypeError，再验证隐藏锚点下气泡打开、编辑、重开、范围正确。
- 全套164项与checkJs通过；隔离原生无页面锚点测试和冷重启结果记录在 acceptance.md。

## 0.13.0 执行结果

- 依据用户选择继续现有插件和 PDF 自动材料流程，联网和配图配置放入设置页，无新增密钥服务。
- 新增独立 web.js，收集 Responses 搜索事件、引用及带出处图像；扩展 ChatGPT 参数、文中编号链接、来源列表和独立配图区。
- 本地保存可选来源元数据，兼容既有 v2 历史；复制、保存和后续历史带可读来源，原回答保留用于引用偏移。
- 先验证7项新增单元/界面测试失败，再实现并通过；另补充 Host 设置冷恢复及生成互斥测试。完整回归、类型检查、浅深色截图和首启/冷重启验收记录在 acceptance.md。

## 0.13.1 渲染修复

- 只读核对截图对应历史并记录实际 KaTeX strict 诊断，确认合法中文标点公式被整体拒绝，以及 CJK 双星号闭合边界未识别。
- 3项故障回归先全部失败，再修复 Unicode 字形诊断和助手独立 Marked tokenizer，确认流式/历史一致、源码保留、无效命令/代码/转义不变。
- 补充真实侧栏浅/深色、320/420px长公式与加粗展示检查。原生 Gecko 与完整回归验收见 acceptance.md。

## 0.13.2 前文引用预览

- 读取本机原生批注编辑器源码，确认 a 标签只在插件卡片被解析；沿现有索引/捕获流程增加每文档的悬停管理器。
- 保留原生编辑对象，在阅读层显示安全链接，焦点/编辑切换不重写原批注；同时适配 PDF 和外层 reader 窗口。
- 新增图片悬停/移入/关闭/键盘、原生阅读及编辑恢复、失效和晚到截图、文字公式/跨PDF拒绝、嵌套窗口回归。先观察缺失行为失败，再实现并通过。
- 增加实际 Zotero AnnotationPopup、真实截图捕获、原批注不变、页码不跳、原生弹窗重开及冷重启检查，结果见 acceptance.md。

## 0.13.3 浮层避让

- 先用页外空白、窄窗口、跨iframe公式区域三种布局重现遮挡，再加入页面/选区几何与候选空白区域选择。
- 约束页外候选的左右边界、图片加载后重新定位；宽高受可用区域限制，保留原阅读器缩放和原数据。
- 原生QA增加真实目标公式绘制边界与浮层非重叠检查，完整回归、截图和冷启动证据记录在acceptance.md。
