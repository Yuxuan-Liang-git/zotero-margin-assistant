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

2026-10-20 0.13.1

## 中文公式与加粗渲染修复

用户截图中公式源码外露、中文双星号未加粗。只读核对对应本地历史，确认公式分隔符完整；独立浏览器诊断实际错误为 KaTeX unicodeTextInMathMode（数学中的中文顿号在 strict:error 下被拒绝）。仅对该字形兼容诊断返回ignore，其余strict诊断保持error，trust:false/展开和尺寸上限不变，非法命令保留原文。原始data-zma-latex及历史JSON内容不改写。

中文句号结束的加粗片段、紧接正文时受CommonMark标点边界限制。助手使用独立且缓存的Marked实例和简单CJK strong inline扩展，不插入空格/不可见字符，也不修改全局解析器；代码块、行内代码、转义和复杂嵌套沿原规则。流式及历史重开共用渲染。3项故障测试先全部失败再通过，补充真实侧栏完整长公式在320/420px浅/深色的显示和溢出检查，截图已目视检查。

最终npm test 178/178通过，107.4秒，evidence/ui-0131/tests-final.txt，完整checkJs通过。首轮177/178，唯一失败为原有PDF滚动定位用固定80ms等待导致偶发未定位；单独复查通过，测试改为等到实际60px坐标变化，保留2px误差与超时断言，生产滚动逻辑未改。

最终包在隔离Zotero10.0.6首启/冷重启各16/16通过：evidence/zotero-0131-rendering-v3/report-1.json、report-2.json。新增原生项核对中文MathML、中文加粗、原始LaTeX、历史答案卡重绘、代码和非法命令原文保留。v1新增QA误用未定义g变量，v2误将消息标题strong当作答案正文strong；更正QA后v3通过，无对应生产变更。原生既有流式数学项继续通过，中文流式在浏览器回归验证。未修改真实用户配置/文库/原PDF，未调用外部推理或消耗账户额度。

最终XPI SHA-256：1e8125a2f980280c566f5e5ff076c10ed564682de78664be7eba6f5d6968e86e，1123503字节。原始0.9.5 XPI与baseline保留。

2026-10-23 0.13.2

## 前文引用悬停预览与原生批注链接

用户图1显示原生批注内a标签源码，希望像图2在链接上悬停显示前文公式/截图。读取本机app/omni.ja的reader.js Content/Editor，确认原生编辑器只解析有限富文本，不支持a，而此前插件只修复自己的页边卡片。新增ReferencePreview独立阅读层和悬停管理，不修改原编辑对象/数据；支持进入编辑后恢复阅读、动态原生弹窗重建、公式/文字/区域截图、移入浮层继续读、离开收起、Esc、跳原文和加入提问。保留页边内嵌引用与点击展开。

Host同时绑定PDF子窗口和原生React弹窗所在的外层reader窗口，限定当前PDF合法链接并通过现有来源关系和capture校验原区域；失效来源明确报错，不替换内容，异步revision避免晚到截图重开。关闭阅读器/插件清理所有监听、观察器、定时器、阅读层及浮层，恢复原编辑器。相关MutationObserver只处理批注树变化，原值未变不重建。索引和HTML风格原批注格式不变，无用户数据迁移。

5项新增浏览器回归覆盖上述交互、编辑/销毁、过期来源、异步取消、公式和无关PDF拒绝、嵌套窗口；新增缺失行为先失败后通过。最终npm test 183/183通过，114.1秒，evidence/ui-0132/tests-final.txt，完整checkJs通过。浅/深色悬停截图已目视检查。初始编辑QA错误把字符插进URI，改为Control+End；外层窗口QA补正弹窗位置，未对应生产缺陷。

v1隔离原生启动发现内容窗口不能读取特权脚本的observer options，三个选项被视为false。使用现有host.cloneInto转换选项字典后，最终v2包在隔离Zotero10.0.6首启/冷重启各17/17通过，evidence/zotero-0132-reference-v2/report-1.json、report-2.json。真实AnnotationPopup、持久链接、原编辑正文不变、实际PDF区域截图、合成pointer悬停不跳页、边界、移入保留、Esc、重开、索引冷恢复均验证。原16项继续通过，真实用户文库/配置/PDF保留，未调用外部API。

最终XPI SHA-256：0767baa50d571de3c6a721977ac030c49735da529aa81dc1da3dab1dbf0c5b85，1127049字节。原始0.9.5 XPI与baseline保留。

2026-10-23 0.13.3

## 引用预览避让原公式

用户反馈预览图片覆盖原公式。原position只根据链接边界上下展开；现读取可见PDF页、目标批注和公式区域，按当前页DOM缩放换算PDF矩形，通过iframe层级映射到预览所属文档。优先选择页外左右空白，宽度跟随可用区域；侧边不足时选择当前批注/公式并集上方或下方较大空间，限制宽高并内部滚动，避开文档助手和工具栏占用。页外候选的左边界也锁定，避免宽空白情况下又跟随正文内链接滑回页面。加载和图片解码后重新定位，不改变PDF缩放、导航或存储数据。

3个布局测试先失败后通过，覆盖页外窄/宽空白、正文内链接、窄窗口上下避让和跨iframe公式。186/186完整npm test通过，120.9秒，evidence/ui-0133/tests.txt；完整checkJs通过。page-side-preview.png已查看，浮层位于白色PDF页外。

最终包隔离Zotero10.0.6首启/冷重启各17/17通过，evidence/zotero-0133-placement-v1/report-1.json、report-2.json；原生QA使用真实当前图像批注绘制元素边界，验证currentFormulaUnobscured=true，浮层与公式矩形至少相隔8px。原悬停、实际裁剪、原文不变、页码不跳、移入/Esc/重开、索引冷恢复继续通过。真实用户文库/配置/PDF保留，未调用外部API。原图占满视口且上下均不足80px时仍有底部受限小浮层回退，不声称极端缩放下绝对零重叠。

最终XPI SHA-256：99b9afeefeb9139c41e8cd51fe92826daee1b2bee5e471c9e440bbc09ad313c2，1128347字节。原始0.9.5 XPI与baseline保留。

2026-10-25 0.13.4

## 新增文字原位公式

用户希望PDF原生新增文字支持LaTeX。读取本机reader.js，确认其使用customAnnotationLayer下的textarea.textAnnotation，以value保存comment，原生刷新会清理该层额外子节点。新增TextMath管理器，在同一PDF页的独立层显示MathML，保留原编辑对象及value/data-comment/style；只临时隐藏源文字颜色，focus恢复原编辑，blur显示新公式，原生点击/移动事件仍穿透。字号、颜色、位置、旋转和缩放跟随原字段，值不变时复用MathML，仅同步样式，原生页面层被清理后可复挂。普通文字和无效公式保留原样；不新增页边卡片。

复用原安全MathML渲染，为bridge添加默认false的plain参数，新文字用plain=true，纯文本HTML标签不作为富文本解释。原始分隔符可复制，模型comment始终是LaTeX。停用或关闭后清理显示层/观察器并恢复原字段。没有新依赖、API、存储格式或PDF导出钩子；不自动改写批注几何，渲染高度可能超出原文字框。

4项新增回归先全部失败后通过，text-math.png已目视检查。完整checkJs通过；最终npm test 190/190通过，126.1秒，evidence/ui-0134/tests-final.txt。首轮189/190，原有PDF气泡滚动等待偶发超时，单独复查通过，未修改该测试/滚动生产逻辑，最终全套重跑通过。

隔离Zotero10.0.6首启/冷重启各18/18通过，evidence/zotero-0134-text-math-v3/report-1.json、report-2.json。真实新增文字、原生input写入数据库、focus/blur、字体/旋转/位置同步、无重复页边卡片和冷恢复均确认。v1焦点断言过早，等待原生焦点事件后v2通过；v2合成input冒泡选项跨窗口未读取，v3用现有cloneInto转换选项后原生保存通过。仅调整QA，无相关生产补丁。原17项继续通过；未操作真实用户文库/配置/原PDF，未调用外部API。

最终XPI SHA-256：590abad3b6053b5c0b55a63ef4c87edca17140bc349cdb7257439c15d378796c，1130232字节。原始0.9.5 XPI与baseline保留。

2026-10-26 0.13.5

## 对话导入、导出与续聊

用户确认同时支持ChatGPT导出文件和粘贴文本。新增独立transfer转换模块与transfer-ui，入口位于对话记录页；支持插件可移植JSON、已有sidecar及可识别的ChatGPT mapping结构，标题筛选/分支选择、文字预览、取消与添加新对话。只导入可见user/assistant，代码围栏内角色文字保留，网页“你说/ChatGPT说”及英文标记支持，末尾未回答问题转草稿；LaTeX保持原始源码。导入不包含上传文件、隐藏推理/工具消息/系统角色/本地材料路径，明确提示缺失附件。导出JSON可往返，Markdown便于阅读；凭据与设置不进入导出。

导入先构造独立通过core校验的新状态，原子保存成功后才发布新增对话，失败保留原记录。同一PDF的导入按scope串行执行，写前基于最新状态构造，写后只追加新增会话，不替换其他窗口的旧会话对象；常规保存等所有当前/排队导入完成再快照，因此保留并发草稿编辑。阅读器销毁等待导入写入，避免旧状态晚到覆盖。生成期间禁止导入/切换；文件读取有尺寸/格式/消息数边界，导出拒绝live sidecar及插件材料目录。长历史每批20条展示，可展开更早消息，完整记录仍保留并进入已有压缩/上下文流程。未新增网络调用、外部依赖或存储schema。

15项专项回归先失败后通过；最终完整npm test205/205通过，133.5秒，evidence/ui-0135/tests-final.txt；完整checkJs通过。预览截图import-preview.png已查看。QA的delayed-write夹具最初误阻塞第二次保存，修正仅阻塞首写后完整通过。

隔离Zotero10.0.6首启/冷重启各19/19通过，evidence/zotero-0135-transfer-v4/report-1.json与report-2.json。真实本地读写、文件/粘贴预览、独立会话与MathML、两种导出、禁止覆盖live sidecar、冷恢复确认；下一轮模拟Responses请求确含导入旧问答和当前PDF。未做真实在线推理测试，OS选择器使用注入路径回调，用户原配置/文库/PDF保留。准备v1缺NODE_PATH，v2测试fixture漏括号；增加QA bootstrap语法预检后v3通过，没有因此改动产品代码。

独立代码复查发现并发导入可能覆盖旧状态、空未完成回答丢失并重复草稿两项Important；新增两项回归先复现失败后修复，再次复查无剩余Critical/Important。预览也显示目标PDF标题。

产物dist/margin-comments-deepseek-0.13.5.xpi，SHA256 20de24f8059fe77d78998a4230a0fc448a58ab6ac8d7296d0adab8e784915278，1138456字节。配套源码ZIP和verification-report由scripts/verify.py生成。


## 2026-10-26 — 0.13.6 performance investigation

User requested all common freeze scenarios tested. GPT-6 Luna implementer and stress agent handled scoped code/tests; parent ran original-versus-final isolated Zotero probes and reviewed lifecycle boundaries. Source changes are limited to Host toolbar observers, reference metadata signatures and item invalidation scope. Baseline preserved; live Zotero library untouched.

Initial full suite 211/212 exposed late toolbar mounting with an unresolved PDF session. Added a temporary filtered discovery observer, disconnected on transition to local observers; close/prune/stop clean all observers. Final full suite 213/213, 137.1 seconds, full checkJs passed. Independent review found no remaining actionable issues. Native first-launch and cold-run evidence and exact package hash are under evidence/zotero-0136-perf-final and dist/verification-report.json.

Measured before: 60 stream DOM batches ->60 toolbar recovery scans; 4 draft saves ->4 reference refreshes. Final first native run: both0; source validation and full20 feature steps passed. Stress test covers200 imported messages,40 display equations, incremental stream, typing and LaTeX copy. No hard freeze reproduced, so claims are restricted to unnecessary-work reduction, not complete resolution of every user-specific stall. Details: docs/2026-10-26-performance-report.md.

## 2026-10-27 — 0.13.7 composer height

User clarified that the bottom message input cannot be resized. Added an upward-growing top-edge handle with pointer capture, keyboard bounds and lifecycle cleanup. Replaced fixed180px/native corner-grip behavior with viewport/occupied-space limits; draft/caret and same-panel close/reopen height retained. No additional persistence or polling.

Two new browser regressions failed before the fix and passed after; full npm test215/215,147.3s and complete checkJs passed. Screenshot inspected. Isolated Gecko probe includes all20 existing cases plus composer resize; the initial probe incorrectly required >180px in a constrained viewport, corrected to assert available bounds while browser test separately proves >180px. Final native evidence under evidence/zotero-0137-composer-v2. Release verification in dist/verification-report.json. Details: docs/2026-10-27-composer-resize.md.

## 2026-10-27 — 0.13.8 zero-height composer

User explicitly requested removing minimum input height, full hiding and double-click default restoration. Implemented min0 and collapsed CSS state leaving only the horizontal handle; double-click/Enter restore font-aware default. Reopen/window resize preserve0, source draft/caret retained, hidden controls reappear on expansion. No polling or storage format changes.

Two new browser tests failed before the change; all4 composer tests pass after. Full suite217/217 (147.1s), complete checkJs passes, screenshot inspected. Native composer test verifies full collapse and double-click with synthetic native events. First native run exposed an existing text-math focus race (textarea stilldisabled); QA now waits for enabled state. Fresh isolated first run21/21 passes; cold/report/packaging records in evidence/zotero-0138-composer-v2 and dist/verification-report.json. Details docs/2026-10-27-composer-collapse.md.


## 2026-10-29 — 0.13.10 HTTP 400 diagnostics

User still gets400 with default reasoning, standard speed and web off. Actual online response is unavailable, so do not claim the specific rejection is fixed. Reproduced error-information loss in indexed input params, subscription capability codes, detail/string/validation-list responses; added safe structured diagnostics with request ID and request feature counts, copied on explicit click. Added explicit default-reasoning retry; failed question and sources preserved and no automatic400 retries. Retained the textarea false marker observed in user's installed0.13.9; verified native editing behavior in regression coverage.

Five request and two UI missing-behavior cases fail before and pass after; full226/226 pass146.4s, complete checkJs passes, diagnostic screenshot reviewed. Isolated native QA first draft needed its final normal-answer fixture restored for the following quote test; only QA changed for that failure. Final first-launch/cold evidence in evidence/zotero-01310-http400-v2; exact package verification in dist/verification-report.json. All inference mocked; user profile/library unchanged. See docs/2026-10-29-http400-diagnostics.md.


## 2026-10-29 — 0.13.11 opaque admission detail

User supplied400/detail-string without code or param; actual request stillpriority+web, not a confirmed standard/offline test. Reproduced0.13.10 dropping opaque detail; now retain bounded, redacted human-readable detail in transient UI/copy JSON. Redact known access token, tagged/quoted credential fields, attachment data, paths/emails and exact request echoes; preserve technical error codes. Arbitrary partial document echoes cannot be guaranteed absent; README states this. No persisted diagnostic text or automatic retry. Explicit compatible retry sets standard/default/off then re-sends current question+PDF/regions without duplicate history. Current settings are read on next request in regression; no cached-settings defect reproduced.

Attempted read-only Computer Use on running Zotero; helper detected human input, so stopped UI control without executing JS, changing settings or sending content. Isolated testing only afterwards. Five new tests bring full suite to231/231,151.2s; fullsrc checkJs passes and every packaged script/CSS matches source. Initial full run had an existing added-text focus timing failure and was stopped after final sanitizer edge-case correction; initial log preserved. Final final-package native first/cold reports are evidence/zotero-01311-admission-v5; intermediate v2 first launch also21/21 but prior hash. Actual user rejection remains unclassified until new detail captured.

Final native acceptance scope: v3 package first launch21/21; cold20/21 due cross-launch question-count QA error, corrected using per-launch questions. v4 long chain stalled after10 checks while opening a secondPDF, not counted passed. The focused admission-smoke.py keeps only the first10 checks relevant to admission/clipboard/current-PDF behavior and is the final verification target (zotero-01311-admission-v5). It does not claim later multi-PDF/transfer/reference/composer native checks; their final-report fields must remain not-run when unsupported. Production hash unchanged.

Final focused v5 first/cold10/10 both pass, exact hash unchanged; detail, explicit standard/default/off retry, single failed-question replacement, PDF context and encrypted login restart confirmed with mocked inference.

Reading summary 0.14.0: approved design and inline plan docs/2026-11-02-reading-summary-{design,plan}.md completed. Optional v2 state readingSummary, text-only incremental Manager, prioritized cancellation, native note publication, manual-edit protection/new versions and reading UI/settings delivered. RED/GREEN evidence in evidence/ui-0140. Independent review findings fixed once with regressions: interrupted publication recovery, visible manual remaining batches and import queue resume. Complete tests252/252, fullsrc checkJs, browser light/dark inspection, isolated Zotero10.0.7 first/cold11/11. No real inference or daily profile writes. See release document for precise scope.

Reading note editor0.14.1: user explicitly requested a standalone three-section note with selective in-place thematic revision. Plan docs/2026-11-02-reading-note-editor-plan.md completed. Direct Markdown protocol, legacy valid JSON support, per-PDF format migration even after all legacy checkpoints, bibliography context and reorganization action implemented. Independent read-only review completed; CRLF compatibility and author-found escaped formula spacing fixed by RED/GREEN. Final265/265 regression159.4s, fullsrc checkJs, isolated Zotero10.0.7 first/cold11/11, unchanged final XPI hash8e89ed86ab7f42c5007962b5be654caa2b97e5f96b59928ec7311701e246ce8b. No real inference/current library writes.

Notion sidebar/custom prompt0.15.0: user requested paper-associated Notion viewing and persistent editable prose instructions. Plan docs/2026-11-03-notion-sidebar-plan.md completed; Notero-format child link resolution, native remote browser portal aligned to existing sidebar, independent website session, retain/hide/destroy lifecycle, custom prompt default/save/reset/blank/restart and chat/summary application implemented. Full276/276 regression148.3s and checkJs passed; isolated Zotero10.0.7 first/cold13/13; actual public Notion login title loaded, private authentication/editing not performed. Refined outdated configuration-select assertions and synchronized an old PDF quote baseline; product quote logic unchanged. Package hashaf5a1d5819bb8ef87956773d59c6ceb225ccc35b39ffb37faa7602f450b2f6b1. Author self-review only; no available environment skills or subagent dispatch.

2026-11-04，独立双栏0.16.0完成。Notion默认左、助手默认右，标题拖动交换两侧，内缘独立缩放，独立工具栏入口及关闭重开，JSON偏好恢复。两栏改为紧凑标题和折叠菜单。独立审查复现四项边界问题，增加回归后修复取消缩放覆盖偏好、失去指针捕获后无法继续拖动、宽度超过持久化上限时跳回默认，以及停用再启用时Notion按钮的旧回调残留，复核无待处理发现。原生冷重启还复现加载状态隐藏后网页层位置未更新，补充加载完成后的定位调度。最终完整286/286通过165.7秒，全src checkJs通过；隔离Zotero10.0.7首启及冷重启各13/13通过，证据位于evidence/ui-0160和evidence/zotero-0160-docks-v4。原生拖动为合成事件，浏览器回归使用真实鼠标。AI和网页内容均使用隔离夹具。最终XPI哈希a24088ab2a6b88157444312906aefe1da9c21c7ab52f26f4d03542c59f9a35d8。

2026-11-04，跨论文研究记忆0.17.0完成。用户确认仅纳入插件已保存对话及正式摘要，批准本地文本检索、同库自动关联、最多三篇/6000字符和来源跳转/摘要导出。实现memory-core、memory-store及memory-host，接入保存、导入、正常提问、设置和历史。大历史回归复现重复校验造成约1030ms心跳间隔，复用校验后通过180ms上限检查。独立审查发现关闭启动后开启未回填、写缓存期间暂停丢任务、扫描与更新同时写目录三项P2问题，全部先复现失败，再一次性修复并复验。异常未闭合公式压测复现约724ms心跳间隔，改用线性且识别转义的扫描后，未闭合、CRLF、代码围栏及多行公式回归通过。最终完整318/318通过168.5秒，全src checkJs通过。隔离Zotero10.0.7首次启动及冷重启各14/14通过，含两篇实际PDF、正常请求跨文献来源、缓存/出处恢复、原生来源跳转、人工摘要编辑排除、开关和MD落盘。模型响应为模拟，语料关联质量仍需实际使用检验。证据在evidence/memory-0170及evidence/zotero-0170-memory-v2，包哈希981fd5183d788bf3943ee3ea4cffe96f21f2c87d35b9fa53e02eddea64ff8f2a。

2026-11-05 0.18.1: card-scoped screenshot paste and multi-image drop share the file-picker persistence flow. File/Blob/bytes input, target revalidation, queue flush and rollback covered. Fixed image-only empty highlight restoration and page locations in reliably paginated native full-text caches. Independent review finding verified RED-to-GREEN. Final full suite 357/357 (198.5s), all-src checkJs and isolated Zotero 10.0.7 first/cold launches 16/16 each passed. Native events and clipboard inputs are fixtures; actual embedded notes, sibling bytes and cold restoration verified. XPI SHA-256 f07d003608efa9aa90a080fafd3c638b920279d7b7a022b0f9690dcab7b6c635, 1195095 bytes. Previous 0.18.0 packages retained.
