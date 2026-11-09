# 版本历史

本仓库于2026年11月9日从44份保留的源码归档恢复版本快照。Git 导入提交和 GitHub 归档发布日期记录本次整理时间；原始开发过程中的逐次提交未保存在 ZIP 中。原始 XPI、源码 ZIP 和 SHA-256 校验文件见各版 Releases。

当前推荐版本为 [v0.19.0](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.19.0)。详细管理方式见 [版本管理](docs/version-management.md)，机器可读目录见 [versions.json](releases/versions.json)。现有资料没有0.13.9的完整归档，未为它创建标签。

### v0.19.0

增加原图查看器。点击页边图片或“查看原图”，可适应窗口、按100%原尺寸阅读、放大缩小和拖动平移，Esc关闭。PDF 页面右键可插入或粘贴图片，也可聚焦页面后按 Ctrl+V，或直接拖入本地图片。选中图片后可拖动、等比缩放、锁定或移除页面放置，位置在重新打开和重启后恢复。页边批注中的已有图片可通过“放到 PDF 页面”复用。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.19.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.19.0)

### v0.18.2

修正 ChatGPT 登录前读取授权配置失败时的笼统提示。现在区分连接失败、超时、HTTP 状态、无效 JSON 和具体配置校验字段，临时读取失败时自动重试一次。覆盖安装后完全重启 Zotero，在“设置→页边批注→ChatGPT 订阅”点击“Continue with ChatGPT”重试。排查结果与验证范围

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.2)

### v0.18.1

支持在页边批注中按 Ctrl+V 粘贴截图，也可把一张或多张本地图片拖入对应批注。图片随即显示在该批注下方，并保存到 PDF 专用的 Zotero 图片笔记和 PDF 同目录的 `margin-comments-images/`。支持 PNG、JPEG、GIF、WebP，每张最多10 MiB，批注底部显示导入结果。仅含图片的空白批注也能在重新打开 PDF 后恢复。覆盖安装后完全重启 Zotero。使用说明与验收

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.1)

### v0.18.0

将研究记忆扩展到整个个人文献库，覆盖全部分类中的书目信息、PDF文字、普通Zotero笔记和文字标注。未建立聊天记录的论文也能参与本地检索，回答中的出处可以打开条目、原笔记或PDF页面。后台优先同步元数据和已有缓存，再逐篇提取缺少的文字。设置中提供覆盖数量、暂停、继续、重建和研究笔记导出。纯扫描件显示需要OCR，单个PDF自动提取上限为64 MiB，正文使用独立分段索引覆盖长文献后半部分。覆盖安装后完全重启Zotero。使用说明与验收

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.0)

### v0.17.0

增加跨论文研究记忆。默认在同一Zotero文献库内检索已完成的问答和正式阅读摘要，讨论A时可联系此前阅读B的相关内容。每轮按剩余上下文预算选取最多三篇论文、6000字符，回答中的阅读来源可点击返回原论文和会话。索引在后台分批建立，设置中集中提供开关、状态、重建和研究笔记Markdown导出。网页端可将导出的摘要加入ChatGPT项目资料后继续讨论。首版采用本地文本检索，实际论文中的跨语言同义关联需要结合使用效果检验。使用说明和验证范围

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.17.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.17.0)

### v0.16.0

将 Notion 和文档助手分成可以同时显示的独立栏目，默认 Notion 在左、助手在右，PDF 在中间。拖动任一标题栏到窗口的目标半边可交换左右位置，拖动各栏内侧边缘可单独调宽。位置和宽度随偏好保存，各栏也可单独关闭和重新打开。两栏顶部均采用一行紧凑标题栏，操作收进“⋯”菜单，减少常驻控件占用。也可聚焦标题栏后按 Alt + 左右方向键切换位置。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.16.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.16.0)

### v0.15.0

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.15.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.15.0)

### v0.14.1

将阅读摘要改为可独立阅读的笔记，按“文章内容、关键公式解释、补充讨论”组织。根据新增理解决定是否更新，并将解释、纠正或补充融入对应章节，要求交代必要符号与条件，去除问答过程和更新日志。改为直接接收 Markdown，减少长公式的 JSON 转义失败；旧摘要即使已经处理完全部历史，也可以点击“重新整理”，自动更新开启时会在空闲后重组。人工改写继续保留，失败不清空正文或进度。安装时覆盖旧版并完全重启 Zotero。详见整理方式与验证边界。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.14.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.14.1)

### v0.14.0

增加每份 PDF 的阅读摘要笔记，跨会话整理已经追问过的难点、推导条件、公式联系与待解决问题。顶部笔记图标打开摘要；已有摘要在重开助手时直接显示。完整回答后空闲20秒增量更新，前台提问优先；模型判断无新理解时保持原文。自动更新会使用当前 AI 服务的额度，可在设置中关闭，仍可手动整理。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.14.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.14.0)

### v0.13.11

修正上一版仍丢失未知 `detail` 文字的问题。失败回答可展开“服务端错误说明”，复制诊断也包含脱敏后的文字摘录（最多2000字符）；会移除已知令牌、带标签的凭据、附件数据、路径/邮箱，以及能匹配的完整请求文本回显。说明只保留在本次失败界面，不写入对话文件。服务端可能回显文档片段，分享诊断前可先展开查看；不把脱敏当作所有任意回显都已消除的保证。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.11) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.11)

### v0.13.10

补齐 ChatGPT HTTP 400 的错误诊断：识别订阅能力错误、`detail` 字符串、字符串错误及带索引的输入校验位置，分别提示 PDF/文件、图片、联网、速度或思考强度拒绝。在失败回答处点击“复制错误诊断”，可复制 HTTP 状态、已识别的错误代码和字段、请求 ID、返回格式及模型/档位/材料数量；不包含正文、附件字节、文件名、账户或凭据，不保存到对话文件。服务端明确拒绝思考强度时可点击“使用默认思考强度重试”；仅由点击触发，不自动重复付费请求或移除材料。失败问题、附件/选区及历史保留。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.10) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.10)

### v0.13.8

取消输入框最小高度：向下拖动上沿横线可以把输入区和按钮完全收起，只保留横线。双击横线恢复默认大小（随当前字号调整）；也可聚焦横线后按 Enter 恢复，Home 收起。收起期间保留草稿和光标，窗口调整及关闭/重开侧栏不会自动展开。向上拖动横线可直接重新展开。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.8)

### v0.13.7

修复底部消息输入框高度难以调整的问题：拖住输入框上沿中央的短横线，向上拉高、向下缩小；可点击/Tab 聚焦横线后使用上下方向键微调，Home/End 调到当前允许的最小/最大高度。移除旧版固定的180像素上限，按窗口与附件等实际占用空间限制高度，保留回答区和发送按钮。调整时保留草稿与光标，关闭再打开同一个侧栏保留当前高度；高度为当前侧栏的界面状态，不写入对话记录。安装时覆盖旧版并完全重启 Zotero。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.7)

### v0.13.6

减少后台重复刷新：工具栏监听限定在工具栏及其直接父容器，不再因每次流式回答更新扫描整个阅读器；仅在来源索引、引用或图片记录变化时刷新页边引用；普通条目更新只刷新相关 PDF，删除事件仍保留保守失效检查。工具栏被重建时自动重新绑定，关闭阅读器时清理监听。对话存储格式、API 配置及公式渲染规则不变。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.6)

### v0.13.5

增加对话导入/导出，入口在助手顶部的“对话记录”，不占用主聊天工具栏。选择“导入对话”，可以选择解压后的 ChatGPT `conversations.json`、插件导出的 JSON 或既有本地历史 JSON；也可直接粘贴问答。文件中有多段对话时按标题筛选，只选择需要的一段；包含分支时沿当前分支导入，无当前分支标识时列出可选路径。预览标题、角色、文字和遗漏附件提示，确认后为当前 PDF 新建独立对话，保留原有记录。随后的提问同时使用导入历史与当前 PDF，按既有规则压缩长上下文；结束时尚未回答的提问放入输入框草稿。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.5)

### v0.13.4

支持 PDF“新增文字/添加文本”中的 LaTeX：例如输入 `参数 \(y=Hu+e\)`，独立公式输入 `\[\frac{a}{b}\]`。结束原生编辑后在原位置自动显示公式，再次进入编辑时显示源码；可文字/公式混排。公式跟随原批注的字号、颜色、位置、缩放和旋转，不重复显示为页边卡片。普通文字、未完成或不支持的公式保留原样；全部 LaTeX 仍保存在原生批注中，不写入 MathML。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.4)

### v0.13.3

调整引用浮层的位置：优先使用可见 PDF 页面两侧的空白，按可用宽度缩小浮层；两侧不足时，避开当前批注及公式选区，放在其上方或下方，限制宽高并允许内部滚动。兼容 PDF 子窗口与外层原生批注窗口的坐标，避开已打开的文档助手区域。不改变 PDF 缩放、原文、引用索引或对话。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.3)

### v0.13.2

为前文引用增加悬停预览：鼠标移到页边批注或 Zotero 原生批注弹窗中的引用链接上，稍作停留即可查看来源公式、截图或文字，不跳离当前页；鼠标可移入浮层继续查看，移出链接和浮层后收起，Esc关闭。浮层支持“跳转原文”和“加入提问”。文字引用中的 LaTeX 继续渲染。已有的引用链接和本地索引可直接使用，不需要重建。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.2)

### v0.13.1

修复包含中文顿号等标点的合法 LaTeX 公式回退为源码，以及 `**中文句子。**后文` 未加粗的问题。流式回答和旧历史重新打开时均使用修复后的渲染；原回答和公式 LaTeX 不改写，代码块、转义标记及非法公式仍按原文保留。超长公式可在公式区域横向滚动查看。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.1)

### v0.13.0

保留当前插件和自动读取 PDF 的方式，为 ChatGPT 增加按需联网检索、可点击的文中来源及最多3张带出处的检索配图。设置 → 页边批注 → 文档助手中可调整“联网搜索”和“展示检索配图”，默认自动/开启；这些选项不占用聊天顶部。回答先给直观解释，再按需要展开概念、公式和例子。外部资料和论文原文分别标明，配图来自检索结果，不是生成图片。来源、图片地址与说明随本地对话保存，重开可恢复。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.0)

### v0.12.8

修复 PDF 选区暂不可见或页面尚未渲染时，气泡报 `anchor.getBoundingClientRect is not a function` 的问题。无可见编号时使用 PDF 可视区域回退位置，仍可编辑和收起。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.8)

### v0.12.7

将批注气泡扩展到 PDF：选中文字后右键“批注并提问（选中文字）”，或对已有高亮/下划线/框选区域右键“批注并提问”。气泡在 PDF 选区旁打开，区域可预览截图；点击外部收起，编号留在页面，也可从输入框旁重开。PDF 批注与对话批注可混合一次发送，原文/截图和对应批注一并提供；文字选区不自动创建永久高亮。草稿保存在原有 PDF 同目录 JSON，关闭或重启可恢复。PDF 选区与手动附件/区域材料合计每轮仍最多8项，超过会明确提示并保留草稿；其他容量限制沿用原规则。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.7)

### v0.12.6

将“引用并批注提问”改为就地气泡，支持多条批注收起、重开、编辑、删除、本地草稿恢复和一次合并发送。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.6)

### v0.12.5

调整文档助手排版：顶部只保留新会话、对话记录、引用目录、设置和关闭入口，阅读区使用更轻的问答布局，底部保留附件、当前页和发送/停止。服务、模型、账户、思考强度、速度、登录和用量管理统一移至设置；底部仅显示当前模型。文档输入范围改为可展开的提示，部分材料未加入时仍有明显标记。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.5)

### v0.12.4

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.4)

### v0.12.3

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.3)

### v0.12.2

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.2)

### v0.12.1

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.1)

### v0.12.0

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.0)

### v0.11.3

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.3)

### v0.11.2

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.2)

### v0.11.1

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.1)

### v0.11.0

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.0)

### v0.10.10

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.10) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.10)

### v0.10.9

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.9) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.9)

### v0.10.8

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.8)

### v0.10.7

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.7)

### v0.10.6

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.6)

### v0.10.5

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.5)

### v0.10.4

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.4)

### v0.10.3

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.3)

### v0.10.2

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.2)

### v0.10.1

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.1)

### v0.10.0

从保留的源码 ZIP 和 XPI 恢复的历史发布快照。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.0)
