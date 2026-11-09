# 验收记录

日期：2026-10-27。交付版本：0.13.7。目标 Zotero：10.0.x。下方旧版本记录保留为历史验收证据。

## 0.13.7：输入框高度

新增输入框上沿横向拖动手柄，向上扩大/向下缩小，按可用窗口空间约束，关闭再打开当前侧栏保留高度。支持键盘、指针取消与监听清理，拖动保留草稿和光标。

两项新浏览器测试先失败后通过；完整回归215/215通过（147.3秒），全src checkJs通过。浏览器真实鼠标拖动超过旧180像素上限、小窗口收缩、Home/End与取消/销毁通过，截图已检查。`evidence/ui-0137/tests-final.txt`、`resize-red.txt`、`resize-green.txt`保存证据。原生隔离Zotero21项功能与冷启动结果位于 `evidence/zotero-0137-composer-v2/report-1.json`、`report-2.json`，其指针事件为合成事件；真实拖动由浏览器测试覆盖。初轮原生探针与实际可用高度冲突的断言已修正，详见 `docs/2026-10-27-composer-resize.md`。

## 0.13.6：重复刷新与工具栏监听

完整回归 213/213 通过（137.1 秒），全 src checkJs 通过。首轮 211/212 暴露延迟工具栏挂载回归，修复后保留原测试并增加临时发现监听切换/清理测试；初轮失败和最终结果分别保存于 `evidence/ui-0136/tests-initial.txt`、`tests-final.txt`。独立复核未发现剩余问题。

在隔离 Zotero 10.0.6 配置中，对照旧包测试 60 次流式 DOM 更新及 4 次草稿保存，新版消除了由此触发的 60 次工具栏恢复扫描和 4 次引用刷新。来源索引变更、来源修改/删除、工具栏替换和晚挂载仍保留必要处理。原生完整操作与冷重启证据位于 `evidence/zotero-0136-perf-final/report-1.json`、`report-2.json`，安装包校验按实际 SHA256 关联这两次运行。

浏览器压力测试覆盖 200 条消息导入、逐批展示完整历史、40 个显示公式、复制 LaTeX、流式输出期间继续输入；没有丢弃历史或简化正文。未在测试文档中复现整窗卡死，本次仅确认重复工作减少，不声明已覆盖全部 PDF/其他插件组合。详见 `docs/2026-10-26-performance-report.md`。

## 0.13.4：新增文字的 LaTeX

4项新增浏览器回归先全部失败，修复后通过：原位混排/源码与原编辑器保留、焦点/光标/IME与blur重渲染、字号/颜色/位置/旋转/只读和页面层重建、普通/非法公式/纯文本标签及关闭清理。完整npm test最终190/190通过，126.1秒，`evidence/ui-0134/tests-final.txt`；完整checkJs通过。`evidence/ui-0134/text-math.png`已目视检查，混排文字、行内公式和独立分数在原位置以原颜色显示。首轮全套189/190，仅既有PDF气泡滚动用例偶发等待超时，单独复查通过；未改动该测试或生产滚动代码，最终完整重跑通过。

隔离Zotero10.0.6首启/冷重启各18/18通过：`evidence/zotero-0134-text-math-v3/report-1.json`、`report-2.json`，与最终XPI哈希一致。新增项在真实textAnnotation textarea上创建混排公式，通过原生input处理器保存修改后的LaTeX，focus恢复源码、blur显示新公式，调整字体/旋转后位置匹配，强制显示text类型仍无页边卡片，重启后源数据与公式继续恢复。原始value、data-comment及模型comment均保持LaTeX，不写入MathML。

v1的focus断言在原生焦点事件完成前执行；等一个事件循环后v2确认原生焦点与显示切换正确。v2合成input事件未将冒泡参数转换到PDF内容窗口，未到达原生window监听；v3使用现有cloneInto转换事件选项后，bubbles=true、原生data-comment更新、数据库保存和冷恢复全部通过。以上修正仅测试脚本，生产代码未为此改动。原生事件为合成，真实用户文库/配置/PDF未改，未调用外部API。

这是插件阅读显示层，未更改原生PDF导出；显示内容可能超出原文字框的原生高度，插件不自动改写批注几何。原0.9.5包及baseline保留。最终XPI SHA-256：`590abad3b6053b5c0b55a63ef4c87edca17140bc349cdb7257439c15d378796c`，1130232字节。

## 0.13.3：预览位置避让

3项新布局回归先复现遮挡，再修复并通过：页外侧边空白（包括宽空白且链接在正文内的边界）、窄窗口避开当前批注、原生弹窗文档与嵌套PDF公式坐标换算。186/186完整npm test通过，120.9秒，`evidence/ui-0133/tests.txt`；完整checkJs通过。`evidence/ui-0133/page-side-preview.png`已目视检查，浮层完整位于白色PDF页外。

隔离Zotero10.0.6首启和冷重启各17/17通过：`evidence/zotero-0133-placement-v1/report-1.json`、`report-2.json`。新增原生断言从真实当前图像批注的绘制元素取得公式边界，确认浮层不相交且至少相隔8px，currentFormulaUnobscured=true；原悬停、原批注保留、实际裁剪、页码不跳、边界/移入/Esc/重开、索引冷恢复等断言继续通过。合成pointer在真实阅读器执行，未操作用户文库/配置或调用外部API。

原图占满视口、上下均不足80px时有受限的小浮层回退，无法保证任意极端缩放下完全零重叠；通常布局优先页外，再避让当前选区。没有改动原生PDF缩放、导航和数据。

最终XPI SHA-256：`99b9afeefeb9139c41e8cd51fe92826daee1b2bee5e471c9e440bbc09ad313c2`，1128347字节。

## 0.13.2：前文引用悬停与原生批注阅读层

183/183完整回归通过，114.1秒，`evidence/ui-0132/tests-final.txt`；完整checkJs通过。新增5项覆盖图片悬停不跳页、浮层移入/离开/Esc、原生阅读安全链接及编辑恢复/销毁、失效来源与晚到截图、文字公式及无关PDF拒绝、PDF子窗口绑定后外层原生弹窗可用。最初3项缺失行为和后补的跨窗口用例均先失败后通过。编辑恢复测试原先误用End把新增文字插入URI中，改为Control+End在整段末尾编辑；跨窗口测试补上与实际弹窗一致的覆盖定位，避免测试页面的背景截获鼠标。

浅/深色 `evidence/ui-0132/reference-hover-light.png`、`reference-hover-dark.png` 已目视检查，来源标题、放大截图、关闭及操作按钮完整可见。浏览器截图使用示例公式画布；真实PDF截图由下述原生验证核对。

隔离Zotero10.0.6首启及冷重启各17/17通过：`evidence/zotero-0132-reference-v2/report-1.json`、`report-2.json`，与最终XPI哈希一致。新增项在真实React AnnotationPopup中加载持久化链接，确认原生编辑内容未改、阅读层安全链接、实际PDF区域截图解码、合成pointer悬停不跳页、浮层视口边界、移入后保留、Esc关闭、原生弹窗重开及来源索引冷恢复。此前16项继续通过，未修改真实用户配置、文库或原PDF，未调用外部API。

v1原生测试发现PDF内容窗口无法读取特权脚本的MutationObserver options，报三个观察选项均为false；使用现有cloneInto将字典传入目标窗口后，v2首启和冷重启通过。此错误未在Chrome同权限测试中出现，保留原始失败证据。

最终XPI SHA-256：`0767baa50d571de3c6a721977ac030c49735da529aa81dc1da3dab1dbf0c5b85`，1127049字节。原始0.9.5 XPI与baseline保留。

## 0.13.1：中文公式与加粗渲染

只读核对截图对应历史，公式实际有完整的反斜杠方括号；根因是 KaTeX strict:error 拒绝数学模式中的中文顿号。只放行 unicodeTextInMathMode 字形诊断，保留非法命令回退、trust:false 和尺寸/展开上限。中文加粗的闭合标点紧接正文时由独立 Marked inline 扩展识别，旧历史和流式共用，原始回答及公式 LaTeX 不改写。

3个新增故障回归先全部失败，修复后通过；真实侧栏补充完整长公式的320/420px浅/深色排版测试。`npm test` 最终178/178通过，107.4秒，`evidence/ui-0131/tests-final.txt`；完整checkJs通过。`cjk-light-320.png`、`cjk-dark-420.png` 等截图已目视检查，长公式限定在自身横向滚动区域，代码和转义标记保持原文。

首轮完整回归的 PDF 气泡滚动测试在固定80ms后偶发未完成定位，单独复查通过；测试改为等待相同的实际60px坐标变化，保留2px误差断言及超时。最终完整回归通过，未改动滚动生产逻辑。

隔离 Zotero10.0.6 首启和冷重启各16/16通过：`evidence/zotero-0131-rendering-v3/report-1.json`、`report-2.json`，与最终 XPI 哈希一致。新增原生项确认中文标点公式、紧接正文的加粗、原始 LaTeX 属性、历史答案卡重绘、代码及非法命令原文保留；流式中文用浏览器回归验证，原生此前的流式数学项继续通过。v1/v2的新增QA分别因未定义测试变量和误选答案标题而失败，已修正测试脚本；未为此修改生产代码。未修改真实用户配置/文献库或原PDF，未调用外部推理服务。

最终 XPI SHA-256：`1e8125a2f980280c566f5e5ff076c10ed564682de78664be7eba6f5d6968e86e`，1123503字节。

## 0.13.0：插件内按需联网、来源与配图

沿用当前插件/PDF 工作流；ChatGPT 设置新增自动/关闭联网与配图开关。单元及浏览器新增引用元数据过滤/JSON恢复、数学与编号链接、请求工具与摘要无工具、错误不自动重发、来源点击、配图像素、明确关闭搜索后重试不重复问答、设置保存及 Host 重建恢复/生成互斥。

完整174/174回归通过，95.0秒，`evidence/ui-0130/tests-final.txt`；完整 checkJs 通过。补充验证同一引用标记的多个来源都可点击（先失败后修正）、Unicode 偏移及引用不插入公式内部。最终 XPI 与首启/冷重启报告的 SHA-256 一致。

隔离 Zotero 10.0.6 首次启动及冷重启各15/15通过：`evidence/zotero-0130-web-v2/report-1.json`、`report-2.json`。新增 automatic-web-sources-and-images 核对真实 ChatGPT 客户端的请求参数、来源/图像事件解析、原生链接导航、PDF同目录 JSON、关闭重开恢复、冷启动设置/历史恢复及明确点击后的重试。原14项验收继续通过。原生离线 QA 用 CSP 阻止所有外部图像网络，验证图像元数据/来源与失败回退；浏览器回归另使用受控 HTTP 图像验证实际720px图像加载。浅/深色截图 `evidence/ui-0130/web-light.png`、`web-dark.png` 已目视检查，公式、文中链接、来源、图像说明、输入框均完整。

本轮未调用真实账户，不证明当前用户账户已开放搜索或检索图像，也不验证搜索质量和外网图像站点可达性。未修改用户真实 Zotero 配置/文献库或原 PDF，未消耗订阅额度；安装后可直接提问测试，如被拒绝使用明确的关闭联网重试入口。

## 0.12.8：修复隐藏/未渲染 PDF 锚点报错

用户截图显示 anchor.getBoundingClientRect is not a function。已在浏览器中复现：PDF 页面尚未渲染时 source 编号隐藏，选取回退锚点的 logical AND 表达式返回 false。可选链仅处理 null/undefined，因而仍调用 false 上不存在的方法。该边界是0.12.7验收遗漏，修复为显式 null 表示缺少元素，使用条件选择 DOM 边界或既有 PDF viewport 回退区域；不通过全局异常捕获掩盖问题。

新测试先得到同一 TypeError（QuoteBubbles.position），修复后在 adapter.page 返回 undefined、编号隐藏情况下，验证新增气泡、输入批注、收起、重开后保留内容及矩形位于 viewport 内。164/164完整回归通过，96.3秒，evidence/ui-0128/tests.txt；完整checkJs通过。

隔离 Zotero10.0.6 首次启动及冷重启各14/14通过：evidence/zotero-0128-anchor-fallback-v1/report-1.json、report-2.json。原生PDF测试临时置空 page lookup，明确执行无页面锚点的定位分支，再恢复；unrenderedPageFallback=true，气泡无报错且仍在PDF可视区域内。文字/截图批注联合提交、本地草稿冷恢复及前13项原生验收继续通过。未操作真实用户文献库/配置，推理使用合成响应，未提交论文或消耗账户额度。

最终XPI SHA-256：80e08665c7a4055e6e83f6976bd65d076749bdfacb90fa07a857992e77d04c2d，1117414字节。原始0.9.5 XPI与baseline保留。

## 0.12.7：PDF 原文/区域气泡批注提问

PDF 文字选择右键新增“批注并提问（选中文字）”，原有高亮/下划线/图像区域右键新增“批注并提问”。气泡和编号直接显示在 PDF 子窗口内，点击外部收起，空批注移除，有内容可通过 PDF 编号或输入框编号重开编辑。文字选区采用冻结快照，不添加永久高亮，包含只读库的选择提问；已有区域保留原生批注，气泡预览实际截图，不覆盖原批注内容。

PDF 草稿与对话批注可混合保存、一次发送，传入页码/原文/截图和逐条评论；每次发送前校验来源并重新 capture。按原规则对已失效来源明确省略而非替换，文本标作原选区快照。未知读取错误、容量超限或失败仍保留草稿。PDF 材料与其他附件/区域合计最多8项，总批注20条，沿用既有体积和文字预算。临时文字来源不会被列为保存答案到原生批注的目标。草稿 JSON 保存 source 元数据及原文/评论，不写 Base64 图像。

163/163 全套回归通过（92.0秒，evidence/ui-0127/tests-final.txt），完整 checkJs 通过。新增入口/只读快照/文件指纹验证及跨 PDF iframe 气泡、文字与截图联合发送回归先失败后通过。新增滚动60px、页面缩放0.8倍、关闭/重开和原选区编号跟随的断言已单独重新执行并通过；截图预览使用有效图像并目视检查，evidence/ui-0127/pdf-region-bubble.png 和 pdf-collapsed.png。旧菜单测试仅把新增入口导致的数量3更新为4，原类型和生命周期断言保留。

隔离 Zotero10.0.6 首次启动与同配置冷重启各14/14通过：evidence/zotero-0127-pdf-bubbles-v4/report-1.json、report-2.json。实际 PDF document 中气泡、原生区域截图、编号可视位置、无永久高亮、文字/截图/评论单次联合请求、PDF同目录元数据草稿及冷恢复均确认；前13项原生验收继续通过。v1/v2 发现 PDF 窗口无法读取特权脚本坐标数组（Permission denied to access property 0），改为逐点传数值后通过；DOM 包装器需在 QA 解除 Xray 后核对对象身份。v3 的几何 QA 仍在此前完整PDF测试留下的后台标签中，帧暂停导致 requestAnimationFrame 不运行，编号尚未定位；QA 改为先选择目标 PDF 标签并 focus 后，在全新 v4 配置完成首启及冷重启。最终源码的浏览器全套、checkJs和目标几何检查均完成。未操作真实用户配置/文库、未修改原 PDF；推理为合成响应，未提交论文或消耗账户额度。

XPI SHA-256：9467217c64ec00195b8636563e5f2065f6d250cd3dc24acc0bb65ab3f39b8381，1117412字节。原始0.9.5 XPI与baseline保留。

## 0.12.6：多条引用批注气泡与合并发送

按用户“参考 ChatGPT 批注交互”要求，对话选区右键“引用并批注提问”在选区附近打开非模态气泡。点击外部（包括嵌套 PDF 页面）或收起：空/空白批注自动移除，有内容则保留编号锚点及输入框上方编号入口。点击可重开编辑/删除，最多20条同时待发送，只展开一条；选择原文与气泡预览支持 LaTeX。源消息不插入标记文本，不改变原回答。

气泡不再把每条引用与评论逐次追加到输入框。发送时一次合并输入框问题和所有有内容的批注，可只发批注。发送失败/停止时草稿保留，成功才清空待发送气泡；已发出的原文与批注仍保存在本次用户消息中。原 v2 JSON 增加可选 draftQuotes 字段，保持老数据兼容；按 PDF/会话隔离保存、切换恢复、关闭及重启保留。引用/批注长度及总体请求容量继续有检查。

验证：批注交互回归先观察旧实现缺少气泡、表单遮挡问题导致失败，加入新实现后通过；新增 PDF 子 frame 外部点击先复现仍展开，再绑定嵌套文档捕获事件修正。161/161 全套测试通过，90.8 秒，evidence/ui-0126/tests.txt；完整 checkJs 通过。真实 MathML 选区转精确 LaTeX、编号重开、删除/清空、双批注一次发送、仅批注发送、失败保留、面板重建、会话隔离、JSON 往返及旧历史兼容均检查。浅/深主题、320px/20px 和 440px/14px 气泡/收起截图在 evidence/ui-0126/，已目视检查，气泡限于侧栏范围，输入框保持可用。

隔离 Zotero 10.0.6 首次启动与冷重启均13/13通过：evidence/zotero-0126-bubbles-v2/report-1.json、report-2.json。原生 MathML 右键引用、PDF 外部点击、空批注删除、非空收起重开编辑、两条批注合并单次调用、失败保留及成功清空均通过；单独会话持久保存两条批注及公式到 PDF 同目录 JSON，冷重启逐条核对恢复。此前12项原生检查继续通过。v1 冷重启的旧迁移 QA 写死总会话数2，加入第三个批注验收会话后触发“Original chat not restored”；已仅从该 QA 数量中排除明确定义的第三个测试会话，保留所有原历史/草稿/备份校验，在全新 v2 隔离配置重做首启及冷重启。产品 XPI 未因此变化。真实用户文献库、配置、系统剪贴板和原 PDF 均未改动；在线 OAuth/推理使用合成响应，未消耗账户额度。

最终 XPI SHA-256：489aeac20beb5c030485791b3c81a9851373e1718d5afbf512da9460fcbc7c94，1115702 字节。原始 0.9.5 XPI 与 baseline 未修改。

## 0.12.5：阅读布局、字号与原生文字批注

新增 设置 → 页边批注 → 文档助手 → 阅读外观，支持 12–24 px 整数字号，默认 14 px。预览、助手正文/公式/输入框即时更新，保存在 Zotero Prefs，重启恢复，不改变 PDF。更新只写面板 CSS 变量，不重建聊天和输入 DOM，草稿及选区保留。

聊天区移除服务、模型、账户、思考强度、速度下拉框及登录/用量按钮，统一使用原生设置页。五个页头图标分别为新会话、记录、引用、设置、关闭；输入框固定在底部，发送和停止按钮切换。当前模型保留为简洁状态。消息采用轻边框/用户气泡、图标动作及折叠文档范围，保留不完整材料标记，不隐藏来源覆盖问题。

用户明确“新增文字”指 PDF 添加文本。构建时仅过滤 text 类型的页边卡片，并移除相应显示复选框；原条目及 PDF 页面文字不删改。高亮/下划线中的前文文字引用与其他批注保留。即使 forcedKeys 主动定位也不重复显示。

验证：157/157 全套测试通过，87.2 秒，evidence/ui-0125/tests.txt；checkJs 通过。真实 MathML 的浅深主题、320/420/540 px 宽度和 14/20/24 px 字号共 18 组布局无横向溢出，保留至少 200 px 消息阅读区，截图在 evidence/ui-0125/。新增字体测试先观察缺失偏好/控件导致失败，再实现后通过。

隔离 Zotero 10.0.6 首次启动及冷重启各 12/12 通过：evidence/zotero-0125-appearance-v3/report-1.json 与 report-2.json。新增检查在 Gecko 里绑定真实设置片段，触发字号 change，确认 18/20 px 应用、草稿选区保留，冷重启确认 20 px 恢复；创建真实 text 批注，强制 reveal 后确认无页边卡片、原文字和条目仍在。此前完整 PDF、来源失效、搜索、附件、历史、剪贴板、LaTeX、阅读位置和账户配置恢复验收继续通过。在线推理为合成数据，未提交论文、未消耗账户额度；真实文献库及用户配置未修改。v1 QA 准备时遗漏 NODE_PATH 导致 pdf-lib 缺失；v2 设置页整份 XML 包含外部声明而无法直接导入，修正 QA 为带 namespace 的真实设置片段后在全新 v3 配置完成首启与冷重启。两次均为 QA 问题，产品构建未因此改变。

XPI SHA-256：424fb0c27daa08fc6d6795c224bd0a58d99294c732125d856a82d3f831c31ef1，1112643 字节。原始 0.9.5 XPI 和 baseline 未修改。

## 0.12.4：关闭重开后完整 PDF 重新输入

关闭侧栏的实现只隐藏 DOM，不清空会话；新增浏览器回归确认关闭重开后同一会话、未发送草稿和历史回答保留，下一条问题仍调用 documentContext() 并加入最新背景。用户进一步截图显示实际问题为：相关文字节选覆盖多页，但页面图像仅第 7 页，其他图像因请求大小省略；模型明确说明式 (26) 不在已收到的材料中。其 Cho 2018 论文原文件仅 851593 字节、8 页，整份文件比重复携带整页 PNG 更适合当前需求。未把这一问题解释为“清空历史”或单纯通过提示词要求模型假装看到了公式。

ChatGPT 对不超过 20 页、文件不超过 6 MiB且编码后符合本轮剩余自动材料预算的文档，每轮直接加入原始 PDF 的 file_data；复用已有 input_file 映射。自动材料预算最高约 4 MiB、仍服从 8 项与整轮 12 MiB 限制，因此并非所有 6 MiB 文件都能自动加入。原文件大小在读前检查，字节签名检查，读取后核对文件版本；内存仅缓存至多 3 份编码，退出清理。关闭重开后同一文件会重新附带，丢弃内存缓存后则重新读取；不创建附件副本、不自动保存二进制到历史。只有手动附件继续按原有副本机制保存。

面板明确显示“已附带完整 PDF 文件（共 N 页）”；对应提问保存 pdfContext 的文件名、大小和页数，不保存 Base64。整份文件只放在最新一问，旧问答继续携带；同一来源的重复截图在请求中去重，保留原历史与来源说明。DeepSeek、长书和空间不足时继续文字/页图回退，明确提示范围。较大自动 PNG 仅在更小时改用 JPEG 质量 0.9，保持像素尺寸；显式手动图不修改。该路径不构成长扫描书籍的全文 OCR 索引，也未宣称所有公式识别准确。

通过官方文件输入文档核对 PDF 文件兼含文字和页面图像的处理方式：https://developers.openai.com/api/docs/guides/file-inputs 。既有订阅请求不增加不支持的 Files 上传调用，仍采用已实现的 Base64 input_file 结构；此轮未调用真实账户做在线识别。

153/153 完整回归通过（80.5 秒，evidence/zotero-0124-whole-v1/tests.txt），完整 checkJs 通过。新增原文件直接编码/读前预算、短文档全文件与长文档回退、同一请求仅一份原文件、重复截图去重、关闭重开后文档和历史仍在、元数据持久化不含文件体、JPEG 像素尺寸及黑白笔画像素等回归。

隔离 Zotero 10.0.6 首次启动与冷重启各 11/11 通过：evidence/zotero-0124-whole-v2/report-1.json、report-2.json。使用该 8 页论文的本地副本，逐字节核对实际 Responses input_file.file_data 与原 PDF 一致；两次发送之间关闭/重开面板并清空文档和文件编码缓存，确认再读再附带、原回答进入后续请求、磁盘 JSON 只有安全元数据。此前图像公式、搜索框、失效来源、附件和账户配置验收继续通过。v1 冷重启因 QA 脚本在多个 PDF 标签恢复期间取到尚未创建的 reader 而未执行；修正 QA 等待后使用全新 v2 配置完成首次/冷重启验收，产品 XPI 未因此改动。推理响应为合成数据，不向外提交论文、不消耗在线额度；正式用户配置、文库和原 PDF 未改动。在线模型对式 (26) 的识别与解答仍待实际使用验证。

最终 XPI SHA-256：`80734c7797263ba0a620e67905eda1c2293fda0de88114020e4141b610e37da5`，1110462 字节。

## 0.12.3：PDF 搜索框与失效来源恢复

用户确认被遮挡的是 PDF 内 Ctrl+F 搜索框。检查当前安装的 Zotero 10.0.6 app/omni.ja：阅读区使用 class="split-view"，原插件仅给旧版 #split-view 预留助手宽度，因此阅读区及其中的 .find-popup 仍伸到侧栏下方。浏览器回归在原生 class 结构下先复现 viewRight=1440、searchRight=1425、sideLeft=1020，搜索框命中测试失败；CSS 同时兼容 id 与 class 后通过。未改变原生搜索框层级或重新实现查找逻辑。

发送流程还会对所有未压缩历史引用再次捕获，旧区域移动/删除或文件版本变化时的校验异常使整轮对话提前终止。真实用户最近历史元数据有 5 个来源实例，其保存的文件大小/修改时间指纹与当前 PDF 一致，因此未将实际原因武断归为文件改动。正式 SQLite 被占用、只读本机 API 不可达，未修改文库、强开数据库或改动用户历史。

现在 Host 将已改变/已删除来源明确标记 SOURCE_STALE / SOURCE_MISSING；直接读取、引用展示的严格校验保留。聊天发送仅对这两类已知来源失效进行省略：历史原问题、回答和来源记录不改写；本轮不重新关联到新区域，并向模型说明材料未读取。当前待发送材料若失效，显示“本轮未发送”，保留移除按钮且不显示旧预览，用户可移除后重新选择。状态与背景提示说明省略数量，当前问题的 sourceWarnings 在清洗后保存为可选历史字段，重启后可读。未知渲染错误、附件错误、跨 PDF 来源错误和取消请求不按失效来源处理，仍停止并保留草稿。

146/146 完整回归通过（71.5 秒，evidence/zotero-0123-find-v2/tests.txt），完整 checkJs 通过。新增原生 class 阅读区搜索框可见/输入、侧栏调整宽度/关闭/重开及搜索词保留回归；新增历史与当前引用同时失效仍可提问、原历史不变、省略说明保存、失效图像不进入请求，以及未知材料错误仍中止发送的回归。Host 单元测试同时核对改变和删除来源的错误代码。

最终 XPI 在隔离 Zotero 10.0.6 首次启动及冷重启各 10/10 通过（evidence/zotero-0123-find-v2/report-1.json、report-2.json，版本和 SHA-256 匹配）。使用真实 Ctrl+F 弹窗与输入框命中/焦点校验，侧栏加宽后搜索框右沿 445、侧栏左沿 460，关闭后 PDF 宽度恢复，重开搜索词保留。另创建真实 QA 图片批注并移动区域，确认严格失效检测生效、旧问答和来源保持、当前失效材料未替换发送、合成回答继续完成、省略说明写入同目录 JSON；冷重启后的已有失效来源也不再阻塞之前的账户/附件验收。所有在线推理为合成响应，未调用正式账户，日常 Zotero 配置和文库未改动。v1 隔离报告仅验证加入失效来源修复前的搜索布局，不作为最终包验收。

最终 XPI SHA-256：`204f11185caf2f418ab57662d3684faaeadcc3650d3985bd674f623d5f58877f`，1108672 字节。

## 0.12.2：文字层存在时仍读取图片公式

根因：document.choose() 以当前页是否有任何文字决定 needsImage，混合 PDF 的正文可提取时，栅格公式和乱码公式被当作已读取而不附带图片。以真实 pdf-lib + PNG 公式样本先复现：正文可提取，图片中的 e(t) = y(t) - H u(t) 不在文字索引中，旧版不请求页面图片；新增回归先失败。

现在每轮在文字层之外自动附带当前页及少量相关页图像，每轮最多 3 页、约 4 MiB 自动材料，服从与手动附件合计 8 个及总请求 12 MiB 上限。优先当前页、明确 PDF 页码、文字关键词匹配；短文档尝试覆盖全部页面，纯扫描长文档无匹配时补充邻页。渲染顺序执行，捕获前后检查取消，缺页/容量省略明确显示；无文字且所有图像读取失败时终止，不假装读到了正文。图像材料不重复嵌入文字层，防止额外膨胀文字上下文。

UI 和模型输入分别标明文字覆盖与实际图像覆盖，不将“完整文字层”等同于所有公式已读取。automaticPage 来源标记随本地历史保存，旧自动截图在后续提问仅保留来源说明，不重新渲染或反复上传；本轮截图按问题刷新。显式选取的材料和附件继续按原流程保留。长扫描件尚无全文 OCR 索引，跨页图像公式须翻到目标页或指定 PDF 页码，页码指 PDF 顺序而非印刷页码。

143/143 项完整回归通过（67.9 秒，evidence/zotero-0122-vision-v2/tests.txt），完整 checkJs 通过。包含真实混合 PDF、相关页选择、限额和取消、无法读取的扫描件、实际请求图像数与历史去重、来源标记序列化及 UI 覆盖说明。原附件粘贴用例的固定 80 ms 等待在完整运行中出现异步时序失败；单项复查通过，改为等待导入完成条件后完整回归通过。

隔离 Zotero 10.0.6 首次启动和冷重启各 8/8 通过：evidence/zotero-0122-vision-v2/report-1.json、report-2.json。真实阅读器渲染器捕获图文页面，人工查看 mixed-page-1.png 确认公式像素存在；每轮实际请求包含正文与两张自动页面图片，来源标记保存。原生账户选择/密钥、附件、引用、复制与 LaTeX、阅读位置回归继续通过。首次 QA 脚本有截图输出变量名错误（v1），已修正后使用全新 v2 配置验证，非产品错误。推理为合成响应，不消耗在线额度；未验证在线模型的公式识别准确率，正式文库与配置未改动。

最终 XPI SHA-256：`a1495b92143f345b54c4e6b1bcf311119f28c629e063a63a5b977c5da9677294`，1108111 字节。

## 0.12.1：回答完成后的阅读位置

定位到 send() 的 finally 在最终 Markdown/LaTeX 渲染后无条件设置 messages.scrollTop=scrollHeight，导致长回答结束后只见末尾。现在完整回答默认按当前回答卡片的开头定位，使用本容器的几何偏移计算，不滚动 PDF 或外部页面。生成过程中若有滚轮、触摸、指针或阅读导航按键操作，则停止自动跟随，最终渲染后恢复原 scrollTop；选中本次回答也保留位置。失败/停止的部分回答保留位置，每轮临时输入监听器在 finally 清理。

先用两项浏览器回归复现长回答结尾定位与手动阅读被重置，再修复。完整 137/137 项回归通过（67.0 秒），完整 checkJs 通过。最终 XPI SHA-256：`2d49daec40f70239eb88ece1e6540b7a666d93edbd32b03084695f2c97c60ca8`，1106725 字节。隔离 Zotero 10.0.6 首次启动和冷重启各 7/7 通过，见 evidence/zotero-0121-scroll-v1/report-1.json、report-2.json；新增原生步骤确认完成时长回答标题可见、手动阅读位置在后续流式块与最终渲染后保持，原账户/附件/引用验收继续通过。推理与剪贴板来源使用合成数据，不消耗在线额度，正式配置和文库未改动。

## 0.12.0：压缩节流、对话附件与引用批注

定位到旧 compactionTarget 在超过 12 条消息（约 6 轮）或 16000 字符时触发，短问答也会持续触发。改为尚未压缩内容量超过 30000 字符才触发；最近原文通常保留在约 14000 字符内，批次上限由 8 条/18000 字符调为 24 条/24000 字符，减少分散的小摘要请求。极大单条完整回答仍可压缩，未完成回答继续保护；完整历史与已压缩位置继续保存。新增短对话不按轮数压缩、压缩后多轮空间回归。

输入框支持粘贴图片与 PDF、拖放及原生多文件选择。复制文件/截图的 Ctrl+V 支持注入的原生剪贴板读取路径，浏览器粘贴事件读取 FileList；只对提问框启用附件处理，预览编辑框保留原文字粘贴。附件魔数验证、单文件 6 MiB、生成文件名路径限制和每轮合计 8 个材料；完整请求继续受 12 MiB/60000 字符预检约束。副本位于当前 PDF 同目录 margin-comments-chat-files，历史与草稿只记录受校验的元数据，省去 JSON 内的大块 Base64。ChatGPT 使用 input_file/file_data 接收 PDF，图片使用 input_image；DeepSeek 图片兼容，PDF 在发送前明确提示改用 ChatGPT。不使用 Files API，不在粘贴时联网，明确发送才提交。原文件与移除待发送项后的副本均保留。

对话选区右键新增“引用并批注提问”。先用既有公式复制逻辑把 MathML 选区恢复完整 LaTeX，再预览并填写注释，点击“加入问题”追加到原草稿；取消不发送，切换会话后拒绝把旧表单写入错误会话。保留既有 Enter、IME、复制/粘贴和流式 Markdown 行为。

测试先复现缺少附件存储/请求字段/粘贴入口、短对话过度压缩及右键动作缺失，再逐项修复。Gecko 原生测试发现合成 ClipboardEvent 会清掉传入 FileList（源列表 2、事件列表 0），因此原生验收通过 Ctrl+V 处理器注入合成文件回调；浏览器测试另行验证 ClipboardEvent/FileList 分支。原生 File.arrayBuffer() 跨窗口 Promise 仍产生 constructor 权限错误，改为主窗口原生 FileReader 读取 Blob，保留非原生适配器的 unwrap 路径，并增加先失败后通过的回归。

最终完整 135/135 项回归通过（66.4 秒），完整 checkJs 通过。最终包 SHA-256：`9088db5c80ea546eb33cd8fa4ae3d689093c3dc20f98db3db898514f5288582e`，1106439 字节。隔离 Zotero 10.0.6 首次启动与冷重启各 6/6 通过，见 evidence/zotero-0120-attachments-v7/report-1.json、report-2.json。新增原生步骤验证真实 FileReader、磁盘副本、待发送草稿、重启后附件随追问恢复、PDF/图片请求字段、公式 LaTeX 与注释进入问题；OAuth/推理响应及文件剪贴板来源采用合成数据，未改动系统剪贴板、正式配置或用户资料库。Windows 实际剪贴板格式与真实在线 PDF 模型推理仍由用户安装后验收，不将模拟响应等同于真实账号验收。

接口依据：[文件输入](https://developers.openai.com/api/docs/guides/file-inputs)、[SIWC 预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

## 0.11.3：加速拒绝与标准模式恢复

用户报告 Fast 请求出现 HTTP 400，而同一问题切到 Standard 后成功，已把实际故障隔离到速度参数路径。旧版丢弃了服务端 error.param/error.code，无法凭截图区分 fast 别名兼容与授权不允许，不能据此断言具体权限原因，也不能把 Codex 中可用等同于该第三方订阅授权可用。

Fast 的请求使用兼容的 priority 值，UI 与实际返回值继续统一为 Fast。HTTP/SSE 错误只保留 HTTP 状态和白名单参数/错误码；原始 message 仅用于内存中的字段分类，不展示、保存或打印服务端回显。识别 service_tier 拒绝后提供“以标准模式重试”按钮，用户点击才切换并发送；沿用历史且替换失败问答，不重复插入用户问题。输入或当前会话已变化时只切换标准，保留草稿并让用户发送，避免覆盖编辑。部分回答继续保留且不会自动重复推理。

新增四项回归先失败再修复：HTTP 加速拒绝与安全错误诊断、其他输入错误不误判、SSE 部分回答拒绝、显式标准重试不重复问题。完整 125/125 通过（63.8 秒），完整 checkJs 通过。最终 XPI SHA-256：`92557543e20d2fc2caa5bd021ff6db061da8c93aef5504f09f9c89e113bd2fc7`，1102107 字节。隔离 Zotero 10.0.6 首次与冷重启各 5/5 通过，见 `evidence/zotero-0113-speed-rejection-v1/report-1.json`、`report-2.json`，包括合成 HTTP 400 service_tier 拒绝、无自动重发、点击标准重试成功、实际档位显示与加密设置恢复。此次仍是合成 OAuth/推理响应，不消耗真实订阅用量；没有证明当前账户在线 Fast/Ultrafast 已可用，正式配置和资料库未改动。

依据：[官方 Fast 与 priority 别名](https://developers.openai.com/api/docs/guides/fast-mode)、[服务档位不被允许的错误](https://developers.openai.com/api/docs/guides/error-codes)。

## 0.11.2：对齐思考档位、快速与极速

官方模型文档确认 Light 对应 low、Extra High 对应 xhigh，Max 为单任务更深推理，Ultra 包含多智能体调度；后者不作为普通 reasoning 参数提供。0.11.1 的缺省三档缓存会对当前 GPT-6/GPT-5.6 家族补齐至 Max；新的目录元数据有优先权并带版本标记，避免以后把服务端明确限制误认为旧缓存。

ChatGPT 增加独立速度选择：标准 default、快速 fast、极速 ultrafast；保持所选思考强度。账户目录明确列出的速度优先，缺省时按官方模型支持提供尝试选项，Ultrafast 仅限 GPT-6 Astra/GPT-6.1 Sol 且仍需账户及工作区资格。默认明确请求标准，摘要使用标准及低强度；模型切换/目录刷新清理不支持的已选控制项。参数与凭据共同加密保存，退出保留控制项；请求不自动重发以规避速度拒绝。response.completed 回传的实际 service_tier 用于显示确认结果，priority 正规化为 Fast，降档与未确认均明确提示。

新增回归先复现三档缺失、速度未传递/未持久化、设置页无速度选择和模型切换残留控制项，再修复。完整回归 121/121 通过（70.9 秒），完整 checkJs 通过。最终 XPI SHA-256：`bd55f3bdbde03dc658f73238f2092bf9e1179b1e35663a9624551544e56a88e3`，1101496 字节。Zotero 10.0.6 隔离配置首次启动和冷重启各 5/5 通过，见 `evidence/zotero-0112-speed-v2/report-1.json` 与 `report-2.json`：xhigh/Fast 请求独立生效、Max 选项存在、Ultra 参数排除、确认档位显示、冷启动保存设置，流式数学与复制/编辑继续通过。在线 OAuth/模型/推理均使用合成响应，本次不消耗真实额度；不据此声称当前账户具备 Ultrafast 权限或已经测得在线加速。正式 Zotero 配置和资料库未改动。

依据：[官方模型控制](https://learn.chatgpt.com/docs/models)、[Codex/Work 速度](https://learn.chatgpt.com/docs/agent-configuration/speed)、[SIWC 模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[订阅接入限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[Ultrafast API](https://developers.openai.com/api/docs/guides/ultrafast-mode)。额外只读核对了本机当日 Codex 模型缓存的档位结构；插件没有导入该缓存或凭据，也不依赖 Codex 安装。

## 0.11.1：思考强度与流式公式

侧栏和原生设置页新增 ChatGPT 思考强度：模型默认及支持的低/中/高等档位。目录明确提供额外档位时才显示；已知推理模型兼容常用三档。仅发送受支持的 reasoning.effort，摘要优先低强度；选择随账户加密保存。界面与说明明确标出官方 SIWC 使用 Codex / ChatGPT Work 共享订阅额度，并提供管理用量入口。

流式 Markdown/LaTeX 约每 180 毫秒处理完整块，每次最多提交两块；已提交内容不随后续 token 重绘。未闭合的数学和代码保持原文，公式闭合后显示；选区存在时推迟重绘，结束后统一整理一次。长段落按有界片段处理，避免每个 token 重建整篇回答。

完整自动回归 116/116 通过（73.8 秒），完整 checkJs 通过。最终包 SHA-256：`176779476d09e5df150e5f136b72a3a7f3b90fe651b12f3b77262ff1b2e180bf`，1099621 字节。Zotero 10.0.6 隔离配置首次启动和冷重启各 5/5 通过，见 `evidence/zotero-0111-stream-v1/report-1.json` 和 `report-2.json`。延迟结束的合成 SSE 验证回答仍在生成时 MathML 已存在、请求包含所选 high 强度、冷启动恢复该选择；账户、对话、编辑按键和复制兼容检查继续通过。OAuth/模型/推理响应使用替身，本次不消耗在线额度；最终包真实账户推理仍需安装后验收，正式配置及资料库未改动。

## 0.11.0：ChatGPT 订阅接入

现有侧栏支持 DeepSeek API / ChatGPT 订阅选择、当前账户可用模型选择和用量入口。原生设置页提供 Continue with ChatGPT、其他账户/工作区、重新授权、刷新模型、取消登录和退出。系统浏览器授权使用新 state/nonce/PKCE、稳定主机标识和官方动态客户端注册；返回的 ID token 使用官方 JWKS 做 RS256/ES256 签名与 issuer/audience/azp/subject/nonce/时间验证。每份账户注册与其 client ID 分别保存，令牌经 OSKeyStore 加密后作为一个首选项记录更新；刷新串行，退出等待刷新后撤销最新续期令牌，清除本地令牌并保留注册信息。撤销未确认时提示到 ChatGPT 设置断开应用。

ChatGPT 请求使用公开 Responses 端点和账户 OAuth token，无需 OpenAI API Key。使用 instructions、完整本地 input、store=false、stream=true，省略 SIWC 不支持的 max_output_tokens、previous_response_id 等字段。图文材料、自动 PDF 上下文、旧对话摘要、Markdown/LaTeX、复制和选区编辑沿用原逻辑。仅 response.completed 视为完成，订阅额度错误、断线和 incomplete 保留部分回答。当前请求固定所选账户的客户端，生成期间禁止更换服务/模型/账户。

独立审查发现跨账户切换会使已轮换的刷新令牌丢失，以及拒绝回答流会变成空白完成；均先用回归复现再修复。账户切换不再丢弃其他注册的刷新结果，正常退出等待已发起的刷新提交加密存储；refusal delta/done 按消息部分显示一次。审查复核无未解决的阻塞问题。新回归覆盖 PKCE/身份校验、加密重启、刷新并发、刷新中退出、模型目录、请求图文和参数、额度错误/不完整流、401 单次刷新、服务路由和原生设置选值。完整 112/112 项测试通过（67.7 秒），JavaScript 类型检查通过。原生测试发现 Gecko HttpServer 的私有 _start(..., 127.0.0.1) 没有登记 IPv4 identity；先复现回调被原生 HTTP 400 拒绝，再用公开 start(-1) 的 loopback 行为修复并增加回归。

最终包 SHA-256：`e37a38019ef561c56ff9e2f4088cafeb146de73851f09ad2e3f3b4870ae8591f`，1096531 字节。独立 Zotero 10.0.6 配置中，同一最终包首次启动和冷重启各通过 5 项检查，见 `evidence/zotero-0110-chatgpt-v6/report-1.json` 与 `report-2.json`；验证真实本机 HTTP 回调、错误 state 拒绝、WebCrypto 签名、系统加密、串行刷新、账户模型、自动读取真实夹具 PDF、Markdown/MathML，以及重启后恢复账户/模型和本地历史。OAuth/JWKS/模型/推理均为合成响应，系统剪贴板使用替身，不改动用户正式配置和文库。

此前真实订阅原型验证另见 `docs/chatgpt-subscription-verification.md`；新版 XPI 的实际账户登录和在线推理仍需用户安装后验收，首次需要重新授权。无浏览器 Cookie 抓取、无网页历史导入、无外部运行时依赖。

## 0.10.10：助手输入框方向键与选字

本机 Zotero 10.0.6 的 `resource/reader/reader.js` 中，`FocusManager._handleKeyDown` 在 window capture 阶段拦截方向键，其排除条件只有 `[contenteditable], input[type="text"], .preview-popup`，遗漏了 textarea；`isTextBox` 同样不识别 textarea。给助手创建的多行输入框添加其识别的 `contenteditable="true"` 标记，保留原生 textarea 的输入、选区、IME 和浏览器默认按键行为，不模拟光标移动，不更改阅读器全局处理函数。预览编辑和引用说明的多行框共用此修复。

新增真实浏览器按键回归，使用同样的阅读器 capture 拦截条件：修复前 ArrowLeft 后选区仍为 4，预期为 3，测试失败；修复后左右键、Shift 选区、emoji 跨字符移动、Ctrl+Shift 按词选区、上下行、Home/End、Shift+Enter 换行及 IME/Enter 发送均通过，输入框外的阅读器事件仍保留。

完整自动回归：94/94 项通过、0 失败，耗时 223.5 秒。完整 JavaScript 类型检查、最终包资源与语法检查通过；原始 XPI 与 baseline 字节保持一致。

最终 XPI SHA-256：`bbc7c0a00ec99d654b1dfc4d6a99b903ef17fdc94a093480626cf5cc3fca581d`。完整 JavaScript 类型检查通过。同一最终 XPI 在独立 Zotero 配置中首次启动、冷重启，各通过 4 项检查；`evidence/zotero-01010-caret-v1/report-1.json` 与 `report-2.json` 分别记录 24 种方向键/Home/End 与 Shift/Ctrl 组合事件均未被取消、焦点保持，以及剪贴板、草稿、历史切换、工具栏及设置检查。原生 Zotero 按键检查使用合成事件，实际光标移动和选区由 Chrome 的真实按键回归验证；系统剪贴板桥使用替身，未修改用户正式文库或配置。

## 0.10.9：文档助手剪贴板与公式 LaTeX

助手增加独立复制、剪切、粘贴、全选及右键菜单。复制渲染公式时优先读取渲染前保存的原始 LaTeX，混选文字与公式不复制 MathML 的隐藏 annotation 或重复公式。只选公式的一部分也复制完整公式。关闭侧栏和销毁面板后不接管 PDF 自身的复制事件。Zotero 自带阅读器在 window capture 阶段复制选中的批注，且复制事件可能以 body 为目标；助手因此在 document 阶段按自身选区覆盖该结果，并通过 Zotero 的剪贴板工具读写文字。粘贴通过 input 事件同步对话草稿。

最终包 SHA-256：`1e3bed783e186b8d79ba9223ec00f283f9a6d44e25134cde16fc77d544258c6f`。93/93 项自动回归测试及完整 JavaScript 类型检查通过。独立 Zotero 10.0.6 配置使用同一个最终 XPI 首启并冷重启，两个不同进程各自通过 4 项检查，见 `evidence/zotero-0109-clipboard-v4/report-1.json` 和 `report-2.json`。原生测试使用真实 Gecko 阅读器 DOM 与事件，系统剪贴板桥在测试中替换为本地捕获函数，以免覆盖用户的当前剪贴板；未在用户正式文献库执行 GUI 操作。

另已完成真实 ChatGPT 订阅 OAuth 和一句不含 PDF 的 Responses 请求验证，见 `docs/chatgpt-subscription-verification.md`。该验证原型尚未集成至 XPI 的登录和模型切换界面。

## 0.10.6：每份 PDF 多段对话与密钥持久保存

每份 PDF 的本地 JSON 现保存独立对话列表、活动对话、每段消息与草稿。侧栏“对话记录”切换历史，“新会话”从空白消息开始；同一 PDF 的不同段聊天不会互相覆盖。旧版单段对话在首次读取时迁移到列表，写入新版状态前在同目录保留原始 JSON 字节的 `.json.v1.bak` 副本。DeepSeek 密钥经 Zotero OSKeyStore 加密后存入本机首选项，模型一并保存；清除操作删除密钥。旧版未持久保存的会话密钥无法自动迁移，升级后需输入一次。

75/75 项自动回归测试及 JavaScript 类型检查通过，覆盖旧数据迁移、原文件备份、对话切换/草稿恢复、密钥加密保存/失败回滚和设置页交互。独立 Zotero 10.0.6 配置使用同一个 0.10.6 XPI 首启并冷重启两次，三个不同 Zotero 进程各自通过 3 项检查：加密密钥与模型恢复、两段对话及原始备份、工具栏重开及设置页注册。另一个独立 Zotero 配置完成 10/10 项原生阅读器检查，覆盖扫描裁剪、当前页、同侧引用、Markdown/公式、原生文字引用菜单以及异步 API 设置。验收脚本使用虚构密钥与本地 PDF，未访问用户正式配置、文献库或 DeepSeek 服务；报告在 `evidence/zotero-0106-conversation-qa/report-1.json` 至 `report-3.json` 和 `evidence/zotero-0106-native-final/report.json`，包校验见 `dist/verification-report.json`。

另外用 Zotero 的 AddonManager 在独立配置中从活动的 0.10.5 升级到 0.10.6，同时加载 Notero。升级后插件活动且安装器无错误；冷重启后 API 设置页可见。升级当场已经打开的设置窗口仍停留在 Notero 页面，需关闭窗口并重启 Zotero 才能看到新插件的设置页。报告见 `evidence/zotero-0106-upgrade/report-1.json` 与 `report-2.json`。

## 当前 PDF、重启、Enter、多行公式及图片

每轮发送自动读取当前 PDF 文字层。较短文档提供全文，长文档按问题挑选片段并显示页码；空文字层使用当前页截图，未实现整本扫描件 OCR。对话 JSON 不持久化整本提取文字。实际三页测试 PDF 包含尚未显示的末页，模拟客户端断言首末页内容均在自动请求中；扫描样本自动得到 1592 像素宽的当前页截图。Enter 发送，Shift+Enter 换行；中文输入法组合输入不触发发送。

重启反馈未证明单一用户配置根因。新增回归复现了 PDF 会话尚未就绪且工具栏迟挂载的缺口；恢复逻辑现在先挂工具栏，再等待 PDF 会话，监听工具栏替换并保持一个可用按钮。主窗口使用当前窗口而非仅保留安装时的窗口引用；引导脚本转发窗口加载/卸载。独立审查发现发送时创建 AbortController 失败会留下 busy/锁，已先建 controller 再改变状态，回归通过。

直接显示公式中的顶层 LaTeX `\\` 自动包装为 gathered/aligned，已有环境和矩阵保留。用户给出的偏导数样例在原插件桥接和 Zotero Gecko 中均显示为两行 MathML。

页边评论新增“插入图片”按钮。使用本机 FilePicker 选择 PNG/JPEG/GIF/WebP，限制 10 MiB；副本写到 PDF 同目录 `margin-comments-images/`，原文件保留。原生笔记通过 `Attachments.importEmbeddedImage` 建立嵌入附件，使用 `data-attachment-key` 关联图片，记录 PDF 原文链接。图片显示在原页边评论的同侧，重启后恢复，可打开对应图片笔记。按 PDF 串行导入，防止不同卡片并发覆盖同一笔记；本地索引提交失败会恢复已有笔记及内存图片状态，并清理本次创建内容。新测试先复现两个笔记/遗漏失败回滚，再修复。

当前验证结果和 SHA-256 详见 `dist/verification-report.json`、`docs/native-runtime-verification.json`、`docs/native-restart-verification.json`。69/69 回归测试、JavaScript 类型检查通过；实际安装的 Zotero 10.0.6 运行测试使用独立配置和数据，真实 DeepSeek API 被模拟替代。文件选择器接口核对本机源码，原生按钮验证通过注入本地测试图片路径完成，不声称测试了物理文件对话框操作。

最终 0.10.5 XPI SHA-256 为 `6127ef2bc4d60bbfaae1c4fe91a4d61749eb92f523736b712c07344931d62a30`，1074801 字节。原有功能 10 项原生检查通过；同一配置首启 6 项及两次冷重启各 5 项检查通过，期间未覆盖/重装 XPI。每次实际进程不同，均恢复同一个 PDF 和同一个图片笔记/嵌入附件，图片宽 256 像素，副本 1821 字节与源文件完全一致，`Zotero.Notes.getExportableNote` 解析出嵌入图片。

之前反复创建的新测试配置触发了 `https://www.zotero.org/start` 首次使用页；正确的开关是 `extensions.zotero.firstRun2`。两个 QA 脚本已关闭首次使用页及 Office 自动安装，重启验收复用同一份配置和安装包。正式用户配置和文献库未改动。

## Markdown、侧栏重开与文字引用

0.10.3 的回答只有公式渲染，没有 Markdown 块解析，因此标题、粗体、列表显示为原符号。0.10.4 用离线 Marked lexer 解析并逐节点创建受限 DOM，保留原 MathML 渲染。代码块不解析公式；原 HTML 和远程图片不成为活动内容，危险协议链接不生成可点击链接。首次实机测试又发现 Zotero script-loader 的 `_globalThis` 上下文不同于标准全局，解析器实际加载在后者；新增作用域回归并修复后原生标题、粗体、列表、公式全部通过。

普通关闭重开的反馈在 0.10.3 隔离测试中未复现，但脱离文档的缓存面板确实无法由原工具栏重开。0.10.4 检查缓存面板的文档与连接状态，重新挂载节点；PDF 内层 frame 卸载也不再将整个阅读器标成永久关闭。真实外层阅读器关闭仍释放资源。

文字来源现使用原生高亮/下划线的所选文字并保存其定位。选中文字右键可标记来源，或直接选目标页边批注进行引用；文字段及可识别 LaTeX 公式显示在关联批注内。旧图片来源仍显示截图。文字来源更新或失效时拒绝旧定位，问答请求仅包含所选文字。

`evidence/zotero-0104-native-menu/report.json` 记录最终包的 10 项 Zotero 10.0.6 隔离测试，全部通过：扫描裁剪、侧栏可见性、工具栏三次关闭/重开及脱离节点恢复、同侧图片引用、两轮 Markdown/MathML 模拟回答、API 设置、原生文字菜单引用、来源变化失效。文字菜单测试实际经过 PDFView 菜单创建、customEvent、Reader 的 cloneInto、原生 XUL menuitem.doCommand、引用表单保存及页边显示链路。选择数据是隔离注入样本，未声称验证物理鼠标选择；没有实际 API 请求。报告副本见 `docs/native-runtime-verification.json`。

51/51 回归测试及 JavaScript 类型检查通过。新测试先观察失败再修复，覆盖 Markdown 结构/公式/活动内容拒绝、脚本上下文差异、面板重新挂载、文字存储与变化失效、选择快照和菜单入口。独立只读审查未发现已确认的 Critical/Important 问题；指出的随机编号已改成可读的“文字1、文字2…”。

## 页边引用和 DeepSeek 侧栏修复

0.10.2 的实际阅读器测试重现了“提问未弹出”：面板的样式没有在 Gecko 阅读器中生效。虽然 `hidden=false`，面板仍是 `position:static`，高度 1458 像素，超出 527 像素的阅读器窗口。此前只验证 hidden 和材料数量不足以证明窗口可见。0.10.3 将 CSS 内容直接注入阅读器并使用 HTML 命名空间创建节点。

引用改为直接显示在关联的原页边批注下方，与该批注同侧；不需要打开聊天窗口。插入和重开会自动加载截图，点击来源链接可重新展开。DeepSeek 改为可调宽度的右侧固定侧栏，保留 PDF 空间，输入框和发送按钮固定在底部，历史对话独立滚动。区域提问会先显示侧栏再读取材料。

最终本机 Zotero 10.0.6 隔离测试 `evidence/zotero-ui-release-final/report.json` 八步全部通过：实际扫描件截图、当前页、可见侧栏及 PDF 空间恢复、原生页边引用、原生发送按钮的两轮模拟对话、设置密码输入/应用/清除、来源移动后的旧图移除。侧栏为 fixed/flex，420 × 487 像素，完整位于 1000 × 527 的阅读器窗口；引用截图宽 240 像素，位于宽 264 像素的右侧批注内。对话的 API 被本机模拟替代，未发送真实请求。报告记录安装包 SHA-256，与最终交付一致；副本见 `docs/native-runtime-verification.json`。

44/44 回归测试通过。新增回归覆盖读取材料前打开侧栏、关闭恢复 PDF 宽度、侧栏拖动、已有批注补装引用、异步刷新并发、失效来源不复用旧图，以及来源定位/截图未读完不能发送。读完前阻止发送的修复避免“界面后来显示截图，但已发请求没有截图”。原生 item 通知使来源变化刷新关联卡片，重复展示前也验证原定位。

## Zotero 10 阅读器与设置修复

0.10.1 在用户实机出现 `page.getViewport is not a function`。本次以独立配置、独立数据目录启动安装的 Zotero 10.0.6，用样本扫描页实际复现：插件层通过 Promise 取得的页面对象看不到 `getViewport`，解除 Gecko Xray 包装后该方法存在。直接将插件数组传给阅读器渲染器也会触发 `Permission denied to access property length`。0.10.2 优先调用阅读器的 `renderRegionCrops`，通过 `cloneInto` 将坐标放入渲染器所属的窗口；回退页渲染路径解除返回对象的 Xray 包装。

DeepSeek 的密码输入、模型、应用设置、连接测试和清除密钥现直接出现在“设置 → 页边批注”。面板按钮也打开同一原生设置页。

此前 Gecko 测试结果见 `evidence/zotero-smoke-v4/report.json`：区域截图 1280 × 1200 像素（397522 字节 PNG）、当前页材料、原生设置页的密码输入与清除通过；该次没有验证面板几何可见性。最终 0.10.3 的可见性和按钮验证见上述 release 报告。测试不读取真实用户文献库，不调用 DeepSeek，不使用真实 API Key。

## 安装失败修复

用户实机安装 0.10.0 被拒绝。读取本机 Zotero 10.0.6 的 `omni.ja/modules/Extension.sys.mjs`，发现安装器明确要求非空 `applications.zotero.update_url`。0.10.0 为避免上游覆盖而删除该字段，导致 `applications.zotero.update_url not provided`。0.10.1 恢复必填字段并采用保留域名的 HTTPS 地址，修复元数据被拒绝的原因。回归测试直接执行本机模块中的对应校验分支，旧清单失败、新清单通过；此验证不代表完整 GUI 或 API 验收。

## 已验证

- 新模块的 JavaScript 类型检查（TypeScript 5.9.3 `allowJs/checkJs/noEmit`）和 XPI 内所有脚本的语法检查。
- 核心、界面与清单回归测试，实际数量见 `evidence/final-tests-0104.txt`；原插件真实打包脚本参与富文本/公式回归测试。
- 编号等价输入、类型和附件隔离、重复候选、重新关联的稳定标识、只读保存限制、已有评论追加保存。
- 损坏 JSON 保留并阻止覆盖、串行写入及凭据排除；同一附件多窗口共享状态、生成互斥。
- 真实 PDF.js 的原生 PDF 坐标裁剪，含未显示页面、90 度旋转、预期尺寸和 RGB 像素断言；越界矩形拒绝。
- 补充文字行必须完全包含在所选矩形内；截断行不会作为文字材料提交。
- 引用链接经过原评论编辑器保存/重开仍存在；粘贴的脚本地址与事件属性拒绝；原粗体及 MathML 公式渲染继续有效。
- 两张图片出现在同一次模拟请求中；显式发送前不调用客户端；不同附件会话隔离。
- 流式 UTF-8 跨块、401/402/429/500、网络中断、取消、模型长度截断、未发送的新追问保留。
- 已打开阅读器关闭及面板初始化过程中关闭均正确清理，防止重新挂载过期面板。
- 构建输出可重复；旧生成文件清除；基线只修改清单、引导脚本和必需的主脚本衔接；其他资源保持字节一致。
- 原 0.9.5 XPI 及解包基线未改动，构建校验对照原文件 SHA-256。

## 本机视觉检查

从用户《系统辨识》扫描件提取实际 PDF 第 100 页，在本机以相同区域捕获模块渲染上下两个区域，再放入助手界面检查。更新的 `evidence/assistant-preview.png` 已查看：原文、同侧图片与文字公式引用、右侧 Markdown/表格回答、问题框与操作按钮完整可见。扫描演示编号为“示例A/B”，另有明确标为演示的文字公式，未声称它们就是 (6.30)/(7.41)，未调用 DeepSeek。

该界面在独立 Chrome 测试页运行，不能等同 Zotero 实机验收。扫描件样本不放入 XPI 或源码 ZIP；原 PDF 不变，未上传。

## 仍需真实环境验收

本次在独立测试配置中完成 Zotero 10.0.6 的截图与设置实测，未修改用户当前配置或文献库，未读取账户凭据、未调用付费 DeepSeek API。用户可按 README 安装到当前配置并输入密钥，无需把密钥发送到聊天。

1. 在 Zotero 10.0.x 安装 XPI，检查原页边批注、引线、类型筛选、自动保存、LaTeX 和便签设置。
2. 在扫描 PDF 的真实公式 (6.30) 框选并标记，然后在 (7.41) 页边批注输入编号引用；检查当前页展开、缩放/旋转和跳转。
3. 重启 Zotero，检查目录与引用恢复、已保存批注存在、DeepSeek 密钥仍可用，并切换两段对话检查各自历史和草稿；测试重复编号选择及删除/重新关联来源。
4. 配置密钥后，实际发送两处截图，并追问一次；核对流式结果及来源。模拟测试通过只证明请求与状态处理，不能证明账户/模型的真实调用已成功。
5. 明确保存为原生笔记及追加批注，检查原评论没有丢失；关闭独立阅读器窗口时停止生成。

6. 点击页边“插入图片”，核对对应 Zotero 笔记、PDF 同目录副本及重启后的图片显示。纯扫描 PDF 默认只用当前页截图；全文问题需另行 OCR。

当前验证报告在 `dist/verification-report.json`，0.10.6 冷重启原始报告在 `evidence/zotero-0106-conversation-qa/`；旧版日志保留在 `evidence/final-tests-0105.txt`。
# 2026-10-26 — 0.13.5 conversation transfer

- Full `npm test`: 205/205 passed, 133.5 s; `evidence/ui-0135/tests-final.txt`. Nine codec and six UI/I/O regressions added, including RED before implementation, failed-save rollback, reader-close/import concurrency, and bounded long-history display.
- All src JavaScript checkJs passed. Archive/resource/script syntax and original 0.9.5 baseline preservation verified by `scripts/verify.py`.
- Native Zotero 10.0.6 isolated first launch and cold restart: 19/19 each; `evidence/zotero-0135-transfer-v4/report-1.json`, `report-2.json`. Both use shipped XPI hash `20de24f8059fe77d78998a4230a0fc448a58ab6ac8d7296d0adab8e784915278`.
- New native step `conversation-import-export`: actual local ChatGPT-style mapping JSON read, candidate selection, preview with no state mutation, additive import, native MathML, pasted role preview/cancel, real JSON/Markdown writes, byte-preserving live-sidecar overwrite rejection, imported history restored after restart. Synthetic next Responses request contains both imported messages and the actual current PDF input_file.
- Paths chosen by an injected file-picker callback in automated native QA; OS dialog visual operation remains user acceptance. Existing installed FilePicker module was inspected for modeSave/returnReplace/defaultString/defaultExtension support. No live account inference or external import calls; no user-library/profile/PDF changes.
- `evidence/ui-0135/import-preview.png` viewed: compact history-based dialog, editable title, clearly separated user/assistant blocks and confirm/cancel actions; no clipping in the 420px dock.
- QA-only corrections: initial preparation lacked NODE_PATH, second QA package had a missing fixture object brace. Added generated-bootstrap syntax preflight; v3 passed. A delayed-save test fixture initially delayed the final close write as well; corrected its gate, then all regression tests passed. These failures did not require production workarounds.
- Independent review found two Important edge cases, both fixed RED-to-GREEN and re-reviewed: transactions are serialized per PDF, publish only the addition, and defer normal saves until pending imports finish; empty incomplete native answers preserve their pair and retry draft. Destination document title is now shown. No remaining Critical/Important findings in the re-review.
- Limits: JSON file 16 MiB; paste input 2 MiB characters; imported conversation 200 messages, 100000 characters per message and 1000000 total; previews clipped, storage retains accepted full text. Existing long local conversations can still be exported. Portable export omits attachment bytes/source associations and quote drafts; missing material warning included. ZIP/HTML/share-link/Markdown file import unsupported. ChatGPT export internals are not a guaranteed stable interface.

