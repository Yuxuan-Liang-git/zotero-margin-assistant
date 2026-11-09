# SDD ledger — plan: docs/superpowers/plans/2026-10-13-zotero-assistant.md

Authorization: user approved execution 2026-10-13; inline execution.
Ruling: use a dedicated source directory and preserved XPI baseline rather than git worktree — cwd has no repository, spec forbids creating one — cost: no commit history, use file hashes and reproducible build.
Ruling: original packed JS cannot recover original TS exactly; preserve it as baseline with checked build-time hooks and use small JS/JSDoc modules — avoids losing custom math behavior.
Pre-flight: Task 2 consumes core source/link/schema interfaces; matches Task 1.
Pre-flight: Task 3 consumes capture materials and native source identifiers; matches Task 2.
Pre-flight: Task 4 consumes Host/Panel lifecycle; matches Tasks 2/3.

Task 1: complete — five initial RED core tests → GREEN; added stable repair and whole-page identity regressions. Preserved original unpacked baseline; deterministic checked build patches.
Task 2: complete — rotation/clipping/capture/reference tests RED → GREEN; original rich editor roundtrip and MathML tested in Chrome. Real PDF.js pixel tests pass for normal/rotated offscreen pages. User scan local preview inspected.
Task 3: complete — payload/stream/errors/incomplete tests RED → GREEN; browser question panel joint-material send and independent PDF sessions tested. Key owned by host session, fixed endpoint.
Task 4: code/package complete — native-boundary simulated tests RED → GREEN; readonly, menu, lifecycle verified. Actual Zotero GUI/API acceptance remains pending as explicitly documented in docs/acceptance.md; no account key available and no native UI tool.
Review: fresh read-only Astra reviewer under requesting-code-review skill. Findings fixed with regression tests: same-PDF snapshot overwrite, external reader unload, close-during-init race, new unsent draft loss, out-of-region line extraction, finish_reason:length completeness.
Ruling: retain reliable complete text-item boxes only — source line-origin filtering included text outside selected area — cost: omit partially intersecting text while image remains complete.
Ruling: per-scope shared state plus generation mutex — serialized file writes alone do not protect independent snapshots — cost: only one live generation per PDF across reader windows.
Ruling: model length truncation remains incomplete and can be saved only with explicit incomplete marker — DONE describes protocol termination, not full answer.
Ruling: skip installing into active Zotero/data directory during build delivery — neither GUI interaction nor API credentials available — cost: user performs documented real-environment acceptance.
Final verification: 29/29 tests, 0 failures, TypeScript checkJs exit 0, packaged JS syntax/resources exit 0, original SHA and baseline bytes verified. XPI SHA256 06cb1ee08bb6f19cbe40309642ea2dc62f9da783e545dd1765df62a70dd82360, 1042152 bytes. Real API and Zotero GUI explicitly unverified.

2026-10-13 installation incident: user observed 0.10.0 rejected by Zotero. Installed runtime 10.0.6 requires nonempty applications.zotero.update_url; original baseline contains it, builder removed it. Reproduced the exact error by executing the installed Extension.sys.mjs manifest guard (RED). Version 0.10.1 restores mandatory metadata with HTTPS reserved .invalid URL to retain manual update policy. No change to compatibility range, library, or installed profile. Original and rejected packages retained.

2026-10-13 reader/settings incident: reproduced actual Gecko page wrapper missing getViewport; Cu.waiveXrays exposes method. Native renderer verified from installed bundle and requires Cu.cloneInto input arrays into renderer's own global. Added explicit native preferences API fields and route all settings buttons there. RED→GREEN tests for page unwrap, native renderer clone boundary, independent preferences input and settings route. Real Zotero10.0.6 isolated smoke v4: all 5 steps passed, 1280x1200 PNG generated, panel material shown, native password entry/apply/clear passed. No actual user library/key/API request. Native screenshot visually inspected. Focused independent review found no additional actionable issues before final native clone adjustment.

2026-10-13 margin/sidebar correction (0.10.3): user requests reference images under same-side annotation and a VSCode-like document chat sidebar. Actual native pre-fix geometry reproduced panel position static/offscreen despite hidden=false; direct CSS injection and HTML namespace creation fix native visibility. References now live inside their associated margin card, refresh on original comment preview updates/item notifications, validate source before reuse. Sidebar docks right, reserves PDF space, resizes and restores the document on close. RED→GREEN tests catch pending reference generation races, preexisting cards, stale sources, and source-lookup/material-capture/send races; final 44/44 pass, checkJs exit 0. Actual isolated Zotero10.0.6 release-final: all 8 steps pass including visible 420x487 dock, native same-side reference, two native button-driven mock turns, source movement invalidation and API field apply/clear. Independent reviewer confirmed prior P2s closed. Updated local visual preview inspected. Real DeepSeek API/account and user current profile remain untested. Package SHA256 742365d119b62434e2121f9f876039a98c19b27b489061e128bf437a8a85115d, 1048190 bytes.

2026-10-13 Markdown/reopen/text references (0.10.4): user requests Markdown rendering, reliable reopen, actual passage/screenshot/formula in margin, selected-text right-click reference. RED→GREEN regressions expose missing Markdown, detached panel cache, discarded passage storage, image-only source resolution and selected-text menu absence. Marked17.0.5 lexer bundled with MIT license; known tokens construct inert DOM, protect math and reuse original MathML, preserve code. Native first run caught global/context mismatch; added RED→GREEN context regression and fixed parser binding. Highlight/underline and right-click selection snapshots preserve native text and source identity; direct reference chooser defaults to readable 文字1 instead of internal key. Actual Zotero10.0.6 final native-menu report: all10 pass, including real customEvent/cloneInto/XUL menu command/save chain, inline passage+math, streamed mock Markdown, three reopen cycles and detach/remount. Selection is an injected isolated fixture, not a mouse acceptance test. Independent Luna reviewer found no confirmed Critical/Important issues; minor citation label addressed. Final51/51 tests, typecheck exit0, visual preview inspected. API mocked only; current user profile unchanged. Final package SHA256 b82d82214296ffac1193de945d3dc11954c7f33acafaf29b6738b97da81c96e9, 1066194 bytes.

2026-10-14 automatic PDF/restart/Enter/math/images (0.10.5): each send obtains current PDF text-layer context, full short documents or disclosed relevant excerpts for long files, automatic current-page screenshot for scans; no full scanned-book OCR. Enter sends, Shift+Enter newline and IME guard. Restored reader toolbar now mounts independently of PDF session readiness, observes replacement, and updates main-window reference. No single root cause was proven in user profile; late toolbar/session regression reproduced and fixed. User plain display LaTeX double-backslash renders as two MathML rows, existing environments preserved. Margin image insertion saves an immutable local copy beside PDF plus native embedded-image attachment in a PDF-specific Zotero note, shows inside associated margin comment, persists JSON association. Image operations serialize by PDF; local index commit failure compensates native note/file/state. Reviewer concurrency/commit findings reproduced RED→GREEN; reviewer unsupported note-sync limitation was rejected against official https://www.zotero.org/support/notes (embedded images sync and count toward storage). Native early QA fixture raced library item cache: fixed harness with waitForDataLoad before fixture creation; Windows path joins fixed. Repeated start page was caused by fresh QA profiles: scripts now set firstRun2=false and suppress Office installers; final cold restarts reuse same installed XPI/profile. Final 69/69 tests, checkJs exit0. Actual Zotero10.0.6 legacy10 checks plus same-profile launch1 six checks and launches2/3 five checks each all pass; button/sidebar/draft and same embedded image survive two cold restarts without reinstall. Native note export resolves image; local1821byte copy equals source. API mocked, picker path injected, real user profile/library untouched. Final package SHA256 6127ef2bc4d60bbfaae1c4fe91a4d61749eb92f523736b712c07344931d62a30, 1074801 bytes.

2026-10-18 caret navigation (0.10.10): installed Zotero FocusManager capture-phase guard omits textarea, cancelling arrow defaults; isTextBox has the same omission. Mark panel-created textareas contenteditable=true so native handlers recognize editable targets. RED: trusted ArrowLeft leaves caret at 4 instead of 3. GREEN: native browser caret/Shift selection, Unicode emoji, word selection, multiline Home/End/Up/Down, IME and Enter; outside-reader navigation preserved. Full 94/94 tests pass (223.5s), checkJs exit0, resources/syntax and preserved baseline pass. Final bbc7c0a00ec99d654b1dfc4d6a99b903ef17fdc94a093480626cf5cc3fca581d, 1083291 bytes. Isolated Zotero10.0.6 first launch and same-profile cold restart each pass 4 checks; 24 synthetic editing key combinations keep focus and default action, clipboard/formula/draft/history/toolbar/settings checks pass. Trusted caret movement verified in Chrome; native Gecko uses synthetic events and a mocked clipboard bridge. User library/profile unchanged.

2026-10-18 ChatGPT subscription integration (0.11.0): official SIWC browser PKCE/OIDC with native loopback callback, per-registration OSKeyStore credentials, account/model/provider UI, serialized refresh/logout and local PDF history. Responses store=false/stream=true with instructions and local text/image context, no unsupported limits or server history IDs. Native test found IPv4 identity omitted by private HttpServer._start; RED regression and public start fixed it. Independent review found lost rotating refresh tokens on account switch/normal shutdown and ignored refusal events; each reproduced RED, fixed, and reviewer confirmed no remaining scoped blockers. Final 112/112 tests, checkJs and syntax/resources pass. Isolated native first launch and cold restart each 5/5 with synthetic OAuth/inference, real HttpServer/WebCrypto/OSKeyStore and PDF context; account, model, history and editing recover. Historical real-account subscription probe is separate; final XPI real-account sign-in remains user acceptance. Original/user profile and library unchanged. Package e37a38019ef561c56ff9e2f4088cafeb146de73851f09ad2e3f3b4870ae8591f, 1096531 bytes.

2026-10-18 0.11.1: persisted per-account reasoning effort in native settings and sidebar, supported model choices forwarded through Responses. Explicit Codex/ChatGPT Work shared allowance labels. Added bounded live Markdown/math block renderer (180ms, at most two committed blocks/tick, complete delimiters, selection deferral). 116/116 tests and full checkJs passed. Isolated Zotero first/cold launch 5/5 each confirms math before response completion and high effort restored; synthetic inference only. User profile unchanged. XPI SHA256 176779476d09e5df150e5f136b72a3a7f3b90fe651b12f3b77262ff1b2e180bf; 1099621 bytes.

2026-10-18 0.11.2: aligned Light/Extra High/Max controls and migrated legacy fallback capability cache; excluded Ultra multi-agent orchestration from plain reasoning parameters. Added separate Standard/Fast/Ultrafast selection, model/account validation, encrypted persistence, unsupported-control reset and actual completed service-tier reporting including downgrades. Summary stays Standard/low. 121/121 tests (70.9s), checkJs, isolated Zotero first/cold restart 5/5 each passed using synthetic inference; online Ultrafast entitlement/latency unverified. User profile unchanged. XPI bd55f3bdbde03dc658f73238f2092bf9e1179b1e35663a9624551544e56a88e3, 1101496 bytes.

2026-10-18 0.11.3: user confirmed Standard succeeds while Fast fails, isolating tier handling but not exact entitlement versus alias cause. Fast now uses canonical compatible priority wire value. Safe HTTP/SSE parameter/code diagnostics and explicit Standard retry button preserve history, avoid automatic paid inference and duplicate questions, and protect changed drafts. 125/125 regression tests (63.8s), full checkJs and isolated first/cold Zotero 5/5 each passed. Synthetic tier rejection/retry only; real-account acceleration remains unverified. User profile unchanged. XPI 92557543e20d2fc2caa5bd021ff6db061da8c93aef5504f09f9c89e113bd2fc7, 1102107 bytes.

2026-10-19 0.12.0: replaced message-count compaction with 30000-character high water and ~14000 retained context, increased summary batching; kept raw history. Added local per-PDF pasted/picked/dropped PDF/image attachments, validated signatures/generated metadata paths, native clipboard callback, Responses PDF/image fields and explicit DeepSeek PDF guard. Added selected dialogue quote/comment draft action preserving formula LaTeX. Native Gecko revealed sanitized synthetic paste FileList and cross-window Blob.arrayBuffer Promise constructor denial; use synthetic Ctrl+V callback in QA and real native FileReader in product, backed by regression. 135/135 tests (66.4s), full checkJs, isolated first/cold launch 6/6 each passed. Real system clipboard and online PDF inference remain user acceptance; originals/user profile untouched. XPI 9088db5c80ea546eb33cd8fa4ae3d689093c3dc20f98db3db898514f5288582e; 1106439 bytes.

2026-10-19 0.12.1: removed unconditional completion scroll-to-bottom; completed answers align at their own beginning unless manual reading/selection took over. Manual wheel/touch/pointer/navigation stops stream following and preserves scrollTop across final Markdown render; partial answers stay put, per-turn listeners cleaned up. Two RED-to-GREEN browser regressions, 137/137 full tests (67.0s), checkJs and isolated first/cold Zotero 7/7 each passed. Native real DOM positions and streaming verified with synthetic inference, user profile unchanged. XPI 2d49daec40f70239eb88ece1e6540b7a666d93edbd32b03084695f2c97c60ca8, 1106725 bytes.

2026-10-19 0.12.2: reproduced raster formula loss in real mixed PDF because any text disabled automatic imaging. Added bounded current/explicit/relevant page snapshots even with text (3 pages / ~4 MiB auto material, shared 8-item and 12 MiB body caps), per-page cancellation/error reporting and truthful text/image coverage. Kept automatic source markers in local history while refreshing snapshots only for the current turn, avoiding repeated old auto-image rendering/uploads; explicit materials unchanged. No full scanned-document OCR index yet. Six new regressions plus condition-based attachment test wait; 143/143 full tests (67.9s), full checkJs and isolated first/cold Zotero 8/8 each passed. Native raster equation PNG visually inspected; real renderer and request images verified with synthetic inference only, online recognition accuracy unverified. QA script variable corrected before clean v2 acceptance; user profile untouched. XPI a1495b92143f345b54c4e6b1bcf311119f28c629e063a63a5b977c5da9677294, 1108111 bytes.

2026-10-19 0.12.3: fixed assistant docking for native .split-view as well as legacy #split-view, keeping PDF Ctrl F popup visible and usable during resize/close/reopen. Reproduced history-source revalidation aborting an entire turn; strict SOURCE_STALE / SOURCE_MISSING validation remains, chat now explicitly omits unavailable historical/current regions without substituting or deleting original history, persists current omission warnings and labels invalid draft materials. Unknown errors/cancellation remain fatal. Recent real history fingerprint matched the PDF; active SQLite locked and local API unavailable, so no assertion about the actual edited region and no user data changes. 146/146 tests (71.5s), checkJs and isolated native first/cold launch 10/10 each passed; real find popup hit/focus and actually moved annotation verified using synthetic inference. XPI 204f11185caf2f418ab57662d3684faaeadcc3650d3985bd674f623d5f58877f, 1108672 bytes.

2026-10-19 0.12.4: confirmed closing only hides the panel and preserves chat; screenshot established missing equation coverage plus PNG/request-space exhaustion. ChatGPT now attaches whole current PDF each turn for <=20-page, <=6 MiB files fitting the encoded auto budget (~4 MiB maximum), with per-turn filename/page/size audit metadata and no encoded body in history; large/DeepSeek fallback remains explicit. Deduplicated repeated source images without mutating history; optimized large automatic PNGs to smaller JPEG quality 0.9 at the same pixel size, explicit crops unchanged. 153/153 full tests (80.5s), checkJs, isolated first/cold restart 11/11 each passed. Actual 8-page 851593-byte Cho 2018 PDF copied into offline QA and checked byte-for-byte in Responses before/after reopen and cache clear, history and metadata retained. QA multi-tab startup wait corrected in fresh v2 after v1 cold reader race; XPI unchanged. All inference mocked, online equation recognition unverified, user data unchanged. XPI 80734c7797263ba0a620e67905eda1c2293fda0de88114020e4141b610e37da5, 1110462 bytes.

2026-10-19 0.12.5

## 0.12.5：阅读布局、字号与原生文字批注

新增 设置 → 页边批注 → 文档助手 → 阅读外观，支持 12–24 px 整数字号，默认 14 px。预览、助手正文/公式/输入框即时更新，保存在 Zotero Prefs，重启恢复，不改变 PDF。更新只写面板 CSS 变量，不重建聊天和输入 DOM，草稿及选区保留。

聊天区移除服务、模型、账户、思考强度、速度下拉框及登录/用量按钮，统一使用原生设置页。五个页头图标分别为新会话、记录、引用、设置、关闭；输入框固定在底部，发送和停止按钮切换。当前模型保留为简洁状态。消息采用轻边框/用户气泡、图标动作及折叠文档范围，保留不完整材料标记，不隐藏来源覆盖问题。

用户明确“新增文字”指 PDF 添加文本。构建时仅过滤 text 类型的页边卡片，并移除相应显示复选框；原条目及 PDF 页面文字不删改。高亮/下划线中的前文文字引用与其他批注保留。即使 forcedKeys 主动定位也不重复显示。

验证：157/157 全套测试通过，87.2 秒，evidence/ui-0125/tests.txt；checkJs 通过。真实 MathML 的浅深主题、320/420/540 px 宽度和 14/20/24 px 字号共 18 组布局无横向溢出，保留至少 200 px 消息阅读区，截图在 evidence/ui-0125/。新增字体测试先观察缺失偏好/控件导致失败，再实现后通过。

隔离 Zotero 10.0.6 首次启动及冷重启各 12/12 通过：evidence/zotero-0125-appearance-v3/report-1.json 与 report-2.json。新增检查在 Gecko 里绑定真实设置片段，触发字号 change，确认 18/20 px 应用、草稿选区保留，冷重启确认 20 px 恢复；创建真实 text 批注，强制 reveal 后确认无页边卡片、原文字和条目仍在。此前完整 PDF、来源失效、搜索、附件、历史、剪贴板、LaTeX、阅读位置和账户配置恢复验收继续通过。在线推理为合成数据，未提交论文、未消耗账户额度；真实文献库及用户配置未修改。v1 QA 准备时遗漏 NODE_PATH 导致 pdf-lib 缺失；v2 设置页整份 XML 包含外部声明而无法直接导入，修正 QA 为带 namespace 的真实设置片段后在全新 v3 配置完成首启与冷重启。两次均为 QA 问题，产品构建未因此改变。

XPI SHA-256：424fb0c27daa08fc6d6795c224bd0a58d99294c732125d856a82d3f831c31ef1，1112643 字节。原始 0.9.5 XPI 和 baseline 未修改。


2026-10-19 0.12.6

## 0.12.6：多条引用批注气泡与合并发送

按用户“参考 ChatGPT 批注交互”要求，对话选区右键“引用并批注提问”在选区附近打开非模态气泡。点击外部（包括嵌套 PDF 页面）或收起：空/空白批注自动移除，有内容则保留编号锚点及输入框上方编号入口。点击可重开编辑/删除，最多20条同时待发送，只展开一条；选择原文与气泡预览支持 LaTeX。源消息不插入标记文本，不改变原回答。

气泡不再把每条引用与评论逐次追加到输入框。发送时一次合并输入框问题和所有有内容的批注，可只发批注。发送失败/停止时草稿保留，成功才清空待发送气泡；已发出的原文与批注仍保存在本次用户消息中。原 v2 JSON 增加可选 draftQuotes 字段，保持老数据兼容；按 PDF/会话隔离保存、切换恢复、关闭及重启保留。引用/批注长度及总体请求容量继续有检查。

验证：批注交互回归先观察旧实现缺少气泡、表单遮挡问题导致失败，加入新实现后通过；新增 PDF 子 frame 外部点击先复现仍展开，再绑定嵌套文档捕获事件修正。161/161 全套测试通过，90.8 秒，evidence/ui-0126/tests.txt；完整 checkJs 通过。真实 MathML 选区转精确 LaTeX、编号重开、删除/清空、双批注一次发送、仅批注发送、失败保留、面板重建、会话隔离、JSON 往返及旧历史兼容均检查。浅/深主题、320px/20px 和 440px/14px 气泡/收起截图在 evidence/ui-0126/，已目视检查，气泡限于侧栏范围，输入框保持可用。

隔离 Zotero 10.0.6 首次启动与冷重启均13/13通过：evidence/zotero-0126-bubbles-v2/report-1.json、report-2.json。原生 MathML 右键引用、PDF 外部点击、空批注删除、非空收起重开编辑、两条批注合并单次调用、失败保留及成功清空均通过；单独会话持久保存两条批注及公式到 PDF 同目录 JSON，冷重启逐条核对恢复。此前12项原生检查继续通过。v1 冷重启的旧迁移 QA 写死总会话数2，加入第三个批注验收会话后触发“Original chat not restored”；已仅从该 QA 数量中排除明确定义的第三个测试会话，保留所有原历史/草稿/备份校验，在全新 v2 隔离配置重做首启及冷重启。产品 XPI 未因此变化。真实用户文献库、配置、系统剪贴板和原 PDF 均未改动；在线 OAuth/推理使用合成响应，未消耗账户额度。

最终 XPI SHA-256：489aeac20beb5c030485791b3c81a9851373e1718d5afbf512da9460fcbc7c94，1115702 字节。原始 0.9.5 XPI 与 baseline 未修改。


2026-10-19 0.12.7

## 0.12.7：PDF 原文/区域气泡批注提问

PDF 文字选择右键新增“批注并提问（选中文字）”，原有高亮/下划线/图像区域右键新增“批注并提问”。气泡和编号直接显示在 PDF 子窗口内，点击外部收起，空批注移除，有内容可通过 PDF 编号或输入框编号重开编辑。文字选区采用冻结快照，不添加永久高亮，包含只读库的选择提问；已有区域保留原生批注，气泡预览实际截图，不覆盖原批注内容。

PDF 草稿与对话批注可混合保存、一次发送，传入页码/原文/截图和逐条评论；每次发送前校验来源并重新 capture。按原规则对已失效来源明确省略而非替换，文本标作原选区快照。未知读取错误、容量超限或失败仍保留草稿。PDF 材料与其他附件/区域合计最多8项，总批注20条，沿用既有体积和文字预算。临时文字来源不会被列为保存答案到原生批注的目标。草稿 JSON 保存 source 元数据及原文/评论，不写 Base64 图像。

163/163 全套回归通过（92.0秒，evidence/ui-0127/tests-final.txt），完整 checkJs 通过。新增入口/只读快照/文件指纹验证及跨 PDF iframe 气泡、文字与截图联合发送回归先失败后通过。新增滚动60px、页面缩放0.8倍、关闭/重开和原选区编号跟随的断言已单独重新执行并通过；截图预览使用有效图像并目视检查，evidence/ui-0127/pdf-region-bubble.png 和 pdf-collapsed.png。旧菜单测试仅把新增入口导致的数量3更新为4，原类型和生命周期断言保留。

隔离 Zotero10.0.6 首次启动与同配置冷重启各14/14通过：evidence/zotero-0127-pdf-bubbles-v4/report-1.json、report-2.json。实际 PDF document 中气泡、原生区域截图、编号可视位置、无永久高亮、文字/截图/评论单次联合请求、PDF同目录元数据草稿及冷恢复均确认；前13项原生验收继续通过。v1/v2 发现 PDF 窗口无法读取特权脚本坐标数组（Permission denied to access property 0），改为逐点传数值后通过；DOM 包装器需在 QA 解除 Xray 后核对对象身份。v3 的几何 QA 仍在此前完整PDF测试留下的后台标签中，帧暂停导致 requestAnimationFrame 不运行，编号尚未定位；QA 改为先选择目标 PDF 标签并 focus 后，在全新 v4 配置完成首启及冷重启。最终源码的浏览器全套、checkJs和目标几何检查均完成。未操作真实用户配置/文库、未修改原 PDF；推理为合成响应，未提交论文或消耗账户额度。

XPI SHA-256：9467217c64ec00195b8636563e5f2065f6d250cd3dc24acc0bb65ab3f39b8381，1117412字节。原始0.9.5 XPI与baseline保留。


2026-10-19 0.12.8

## 0.12.8：修复隐藏/未渲染 PDF 锚点报错

用户截图显示 anchor.getBoundingClientRect is not a function。已在浏览器中复现：PDF 页面尚未渲染时 source 编号隐藏，选取回退锚点的 logical AND 表达式返回 false。可选链仅处理 null/undefined，因而仍调用 false 上不存在的方法。该边界是0.12.7验收遗漏，修复为显式 null 表示缺少元素，使用条件选择 DOM 边界或既有 PDF viewport 回退区域；不通过全局异常捕获掩盖问题。

新测试先得到同一 TypeError（QuoteBubbles.position），修复后在 adapter.page 返回 undefined、编号隐藏情况下，验证新增气泡、输入批注、收起、重开后保留内容及矩形位于 viewport 内。164/164完整回归通过，96.3秒，evidence/ui-0128/tests.txt；完整checkJs通过。

隔离 Zotero10.0.6 首次启动及冷重启各14/14通过：evidence/zotero-0128-anchor-fallback-v1/report-1.json、report-2.json。原生PDF测试临时置空 page lookup，明确执行无页面锚点的定位分支，再恢复；unrenderedPageFallback=true，气泡无报错且仍在PDF可视区域内。文字/截图批注联合提交、本地草稿冷恢复及前13项原生验收继续通过。未操作真实用户文献库/配置，推理使用合成响应，未提交论文或消耗账户额度。

最终XPI SHA-256：80e08665c7a4055e6e83f6976bd65d076749bdfacb90fa07a857992e77d04c2d，1117414字节。原始0.9.5 XPI与baseline保留。

2026-10-20 0.13.0

## 插件内联网、来源与配图

用户选择继续现有插件方式，未嵌入 ChatGPT 网页。沿用 PDF 自动材料、订阅授权及本地会话，ChatGPT 普通问答按设置添加可选 web_search 工具和图像结果，摘要不带工具。联网/配图设置保存在 Zotero 首选项，默认自动/开启，位于设置页；DeepSeek 沿用原文档模式。提示先给直观结论，按需解释概念、公式、例子，并区分原文与外部依据。

新增 web.js 收集注释、sources/results，过滤 URL、去重和限量；文中引用可点击，其他检索资料单独列出，最多3张带出处的配图单独标明不是论文原图。图像懒加载、无 Referer、加载失败保留来源；普通 Markdown 图片仍不自动加载。元数据随原 JSON 保存，重开和后续提问保留可读来源；图像字节不自动复制到 PDF 目录。搜索被账户/模型拒绝时明确提示，只在点击“关闭联网搜索并重试”后重发，不重复插入问题。

参考 LibreChat 的检索/来源分层及 OpenAI 官方工具、订阅限制文档，未复制上游代码。7项新增测试先失败后通过，另补 Host 首选项恢复/生成互斥，以及同一标记多 URL 和 Unicode/数学偏移测试。多 URL 用例发现同一标记原先只保留首个链接，现按相同区间合并链接后替换一次。174/174完整回归通过，95.0秒，evidence/ui-0130/tests-final.txt；完整checkJs通过。浅/深色 web-light.png、web-dark.png 已目视检查。

最终包在隔离 Zotero10.0.6 首次启动及冷重启各15/15通过：evidence/zotero-0130-web-v2/report-1.json、report-2.json，设置/搜索元数据冷恢复通过。v1为多来源链接修正前的中间包，保留历史证据。原生 QA 使用合成响应并通过 CSP 阻止外部图像网络；浏览器回归使用受控 HTTP 图像验证720px实际像素加载。没有调用当前真实账户，联网/图像能力及质量仍需线上验收；用户真实配置、文库和原 PDF 保留，未消耗账户额度。

最终XPI SHA-256：ec2e3365f6eea67722df654130006b906f24be8f4bc0d661c2b7b06c7dcf6131，1122913字节。原始0.9.5 XPI与baseline保留。

