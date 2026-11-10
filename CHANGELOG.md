# 更新日志

这里记录各版本带来的功能、修复和行为变化。本次版本为 0.20.0，安装和操作见 [使用指南](docs/user-guide.md)。

现有44个历史版本于2026年11月9日从保留的源码 ZIP 和 XPI 整理入库，覆盖0.10.0至0.19.0。Git 提交和归档发布日期表示整理时间，原始逐次开发提交未保存在这些 ZIP 中。版本说明依据归档 README、开发记录及源码差异整理；现有资料缺少0.13.9的完整归档，因此没有创建对应标签。

各版 Releases 保留原始 XPI、源码 ZIP 和 SHA-256 校验文件。机器可读目录见 [versions.json](releases/versions.json)，后续提交与发布规范见 [版本管理](docs/version-management.md)。

### v0.20.0 · 增加独立 Embedding 的全库语义检索

增加按需配置的云端语义检索，默认使用 SiliconFlow 的 `BAAI/bge-m3`，支持自定义兼容 HTTPS 端点。Embedding Key 与对话服务分别管理，经系统密钥库加密并按完整端点隔离。用户测试连接、启用后明确试建二十篇或建立全库，安装、保存和打开 PDF 不会触发首次全库上传。

本机在独立 `vectors-v1.sqlite` 中保存派生向量与进度，支持暂停、冷重启保持暂停和当前 PDF 优先处理。检索保留来源身份与页号，跨语言候选可进入实际对话请求；失效来源被剔除，语义检索超出八秒或断网时使用有效本地结果，当前 PDF 材料继续保留。正式阅读摘要继续按文章内容、关键公式解释和补充讨论组织。

关闭研究记忆总开关会取消正在进行的检索，并停止后台任务和所有跨文献来源；Embedding 密钥仍保留。语义输入保留有界的问题、当前标题和近期主题；词面与向量两路命中按各自最佳排名合并。已完成的全库索引暂停后发生资料更新时，点击继续即可扫描新增资料。增加最多 32 条、60 秒的运行期查询向量缓存，按完整有界输入、当前 PDF 指纹和模型空间区分，失败或取消不缓存。

隔离 Zotero 原生验收发现并修复有效响应字节流跨环境时被误拒绝的问题。受控向量和合成资料用于检查真实加密、数据库、Worker、来源导航与性能；真实服务的中英文召回质量、阈值与费用仍需用户填入自己的 Key 后核对。完整回归 513/513、类型检查通过，同包隔离复测 11/11 与 9/9 通过；同时保留同包首次冷扫描八秒超时的失败记录，不把八秒视为性能保证。最终安装包哈希、具体结果和限制见 [0.20.0 验证说明](docs/2026-11-10-cloud-rag-release.md)。

### v0.19.2 · 拦截通用问法造成的跨论文误召回

修复“这篇论文讲了啥”、纯符号和公式编号追问因匹配其他论文旧问题而带入无关材料的问题。查询先识别完整文档指代和通用问法，无有效主题词时跳过全库检索；保留“条件数”、电流 `current`、明确科学主题及题名和 DOI 的检索能力。原有索引分词、会话文件和阅读摘要保持兼容。

405 项完整回归及类型检查通过，聚焦回归 27/27。最终安装包的真实记录只读重放显示：所报告通用问题的检索来源从 3 条变为 0 条；既有摘要的三个主章节保留，未找到给定无关论文标记。

[下载与说明](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.19.2) · [修复范围](docs/2026-11-09-memory-query-relevance-release.md)

### v0.19.1 · 修复 Notion 网页进程失效后无法重开

修复 Zotero 10.0.8 中 Notion 网页进程退出后，刷新时报 `remoteTab is null` 且关闭重开仍无法加载的问题。加载前异步等待网页容器就绪；检测到失效进程时重建容器，并清除失败链接的加载缓存。健康网页仍保留关闭重开时的页面状态，Cookie 沿用原配置。

399 项自动回归及类型检查通过；隔离 Zotero 10.0.8 首启、冷重启各 13 项通过，最终安装包另通过进程失效恢复和测试 Cookie 保留验证。真实 Notion 私有登录和编辑未自动验证，最初网页进程退出的原因仍待观察。

[下载与说明](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.19.1) · [验证范围](docs/2026-11-09-notion-browser-recovery-release.md)

### v0.19.0 · 支持原图查看、页面贴图与带图导出

增加原图缩放和平移查看器，以及 PDF 页面图片的拖动、等比缩放、锁定和位置恢复。通过独立 Worker 导出带图片的新 PDF，补齐版本3迁移备份、并发保存保护和页面重绘后的图层恢复。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.19.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.19.0)

### v0.18.2 · 明确授权配置错误并重试临时连接失败

区分授权配置读取中的连接、超时、HTTP、JSON 和元数据错误。对临时 GET 失败共享一次重试，并保留安全的具体错误信息。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.2)

### v0.18.1 · 支持页边批注粘贴和拖入图片

将截图粘贴和多图拖入接入现有图片保存流程，保留原生图片笔记及 PDF 同目录副本。修复仅有图片的空白批注在重开后的显示。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.1)

### v0.18.0 · 将检索扩展到整个个人文献库

为个人文献库的元数据、PDF 正文、笔记和文字标注建立 SQLite 分段索引。支持后台处理、暂停和覆盖状态，并保留不同附件和来源位置。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.18.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.18.0)

### v0.17.0 · 检索已读论文的会话与正式摘要

在本地建立已完成问答和正式阅读摘要的索引，讨论当前论文时引入其他论文的相关内容。保留来源跳转、预算限制和研究笔记导出。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.17.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.17.0)

### v0.16.0 · 分离 Notion 与助手并支持左右拖动

让 Notion 和文档助手作为独立栏目同时显示，可分别关闭、调整宽度和左右位置。保存栏目偏好，并将操作收进紧凑菜单以保留阅读空间。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.16.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.16.0)

### v0.15.0 · 打开关联笔记并保存自定义提示词

复用文献下的 Notero 链接，在阅读器旁打开独立的 Notion 网页会话。增加可持久保存的自定义提示词，并统一应用到对话和阅读摘要。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.15.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.15.0)

### v0.14.1 · 将摘要整理为可独立阅读的主题笔记

将摘要组织为文章内容、关键公式解释和补充讨论，按主题融入新的理解。直接接收 Markdown，支持重整旧摘要并保留人工编辑的版本。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.14.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.14.1)

### v0.14.0 · 自动维护独立的论文阅读摘要

为每份 PDF 汇总各段会话中的理解，保存为独立 Zotero 笔记。支持空闲后增量整理、无变化跳过、前台提问优先，以及人工修改保护。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.14.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.14.0)

### v0.13.11 · 保留脱敏错误说明并支持兼容参数重试

保留经过脱敏和长度限制的服务端错误文字。增加标准速度、模型默认思考和关闭联网的显式重试，并保持 PDF 上下文及单份问题记录。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.11) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.11)

### v0.13.10 · 补齐 HTTP 400 诊断与显式重试入口

识别服务返回的 detail、参数和输入校验位置，提示文件、图像、联网或思考设置的拒绝。提供安全诊断复制和显式默认思考重试，保留问题与材料。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.10) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.10)

### v0.13.8 · 支持收起输入区与双击恢复高度

允许把输入区连同按钮完全收起，只保留调整手柄。双击手柄或使用键盘恢复默认高度，并保持草稿、光标及当前收起状态。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.8)

### v0.13.7 · 允许拖动调整消息输入框高度

支持从输入框上沿拖动调整高度，并按可用空间限制尺寸。增加键盘微调，在调整和侧栏重开时保留草稿与光标。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.7)

### v0.13.6 · 减少工具栏扫描与重复引用刷新

将工具栏监听限定在相关容器，避免流式回答每次更新都扫描阅读器。只在来源、引用或图片关联变化时刷新对应卡片，并清理关闭阅读器后的监听。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.6)

### v0.13.5 · 导入导出 ChatGPT 与本地会话

支持导入 ChatGPT 导出 JSON、插件会话 JSON 和带角色标记的粘贴文本。提供预览、会话筛选、缺失附件提示，以及 JSON 和 Markdown 导出。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.5)

### v0.13.4 · 在 PDF 新增文字批注中渲染公式

在原生文字批注位置提供 LaTeX 阅读显示，重新编辑时恢复源码。跟随原批注的字号、颜色、缩放和旋转，避免重复显示为页边卡片。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.4)

### v0.13.3 · 将预览浮层移到原文空白处

优先使用 PDF 页边空白布置引用预览，空间不足时避开当前公式和批注。修正嵌套阅读器坐标转换，限制浮层尺寸并支持内部滚动。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.3)

### v0.13.2 · 悬停预览前文公式、图片和文字

为页边及原生批注中的来源链接提供悬停预览，保留跳转原文和加入提问操作。渲染文字来源中的 LaTeX，并处理来源失效及浮层关闭。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.2)

### v0.13.1 · 修复中文公式标点与相邻 Markdown 加粗

修复合法中文标点使 LaTeX 回退为源码，以及加粗标记紧邻正文时未生效的问题。保留公式原始源码、代码块和转义内容，允许超长公式横向阅读。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.1)

### v0.13.0 · 增加联网检索、来源链接与解释配图

为 ChatGPT 文档对话加入按需联网检索、可点击引用和带出处的检索图片。保存来源元数据，并在服务拒绝联网能力时提供显式离线重试。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.13.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.13.0)

### v0.12.8 · 处理未渲染选区的气泡定位

修复选区不可见或页面尚未渲染时调用无效锚点产生的错误。使用阅读器可视区域作为回退位置，保留气泡编辑与收起交互。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.8)

### v0.12.7 · 支持 PDF 文字和区域批注提问

将批注气泡扩展到 PDF 选中文字、高亮和区域截图。保留独立批注草稿、来源定位及图像，可与对话批注一起发送。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.7)

### v0.12.6 · 增加可折叠的多条对话批注气泡

将引用批注改为贴近选中文字的气泡。空白批注在外部点击后关闭，非空批注可收起和重开，支持保存多条草稿并一次提交。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.6)

### v0.12.5 · 精简聊天布局并将服务配置移入设置

收紧助手标题栏和输入区布局，将账户、模型、思考强度及速度等配置集中到设置。保留当前模型和输入范围提示，减少阅读界面的常驻控件。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.5)

### v0.12.4 · 重开后重新附带 PDF 并标明覆盖范围

对符合页数、大小及请求预算的文档，每轮重新加入原始 PDF 文件。保留关闭侧栏前的会话，去重重复来源图像，并对回退输入显示实际覆盖范围。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.4)

### v0.12.3 · 避让 PDF 搜索栏并隔离失效引用

适配原生 split-view 布局，使 PDF 搜索框在侧栏调整时保持可用。来源移动或删除时明确省略失效材料并保留原历史，让其他有效材料可以继续参与对话。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.3)

### v0.12.2 · 为图片公式补充页面视觉输入

修复 PDF 存在文字层时遗漏图片公式的问题，为当前页和相关页补充有预算限制的截图。记录实际文字与图像覆盖范围，刷新本轮自动页图并避免重复上传旧图。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.2)

### v0.12.1 · 回答完成后保留从头阅读的位置

取消回答结束后无条件滚到末尾的行为。默认对齐新回答开头；用户已经滚动、选字或开始阅读时，保留其阅读位置。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.1)

### v0.12.0 · 支持附件粘贴与引用批注提问

支持为当前 PDF 粘贴、选择或拖入 PDF 和图片附件，并将选中的对话及批注加入草稿。调整上下文压缩阈值，使用原生 FileReader 处理跨窗口附件读取。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.12.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.12.0)

### v0.11.3 · 修正 Fast 参数并提供标准模式重试

将快速模式映射为兼容的请求参数，保留安全的 HTTP/SSE 错误字段。服务拒绝时提供显式标准模式重试，保留材料和草稿，避免重复追加问题。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.3)

### v0.11.2 · 增加速度档位并保存账户偏好

对齐可用模型的思考强度选项，引入独立速度设置和账户能力校验。加密保存偏好，并展示服务端实际返回的速度档位及降级情况。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.2)

### v0.11.1 · 增加思考强度与流式公式渲染

按账户保存模型支持的思考强度，并传递到请求。按完整内容块节流渲染 Markdown 和公式，使回答尚未结束时即可阅读已完成的部分。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.1)

### v0.11.0 · 接入账户授权与订阅文档对话

增加 PKCE/OIDC 账户授权、本地回调、加密凭据和模型选择，接入带当前 PDF 材料的流式 Responses 对话。处理凭据刷新、退出、拒绝回答及重启恢复。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.11.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.11.0)

### v0.10.10 · 恢复侧栏方向键与原生光标选择

处理 Zotero 焦点管理器拦截 textarea 方向键的问题。保留浏览器原生光标移动、Shift 选字、按词导航、多行编辑和输入法行为。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.10) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.10)

### v0.10.9 · 恢复复制粘贴并复制公式 LaTeX

为助手阅读区和输入框补齐复制、粘贴、剪切及右键编辑操作。复制渲染公式时恢复原始 LaTeX 和分隔符，并保留混选文字；另记录 ChatGPT 账户接入的验证结果。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.9) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.9)

### v0.10.8 · 压缩长对话并保留完整本地历史

按待发送历史的轮数与体积生成承接摘要，将摘要和近期问答组合为模型输入。记录已经压缩的范围，完整问答仍保留在本地。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.8) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.8)

### v0.10.7 · 将对话随 PDF 保存并添加文献入口

将会话数据保存到 PDF 同目录，从原数据位置迁移现有记录并保留旧文件。在文献下增加对话历史入口，可打开对应 PDF 的侧栏会话列表。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.7) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.7)

### v0.10.6 · 增加多会话与加密密钥持久化

为每份 PDF 保存可切换的会话、标题和草稿，并迁移旧版单段历史。使用系统密钥存储加密保存 DeepSeek 凭据，恢复重启后的密钥与模型偏好。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.6) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.6)

### v0.10.5 · 自动读取当前 PDF 并保存批注图片

为提问自动准备当前 PDF 的文字或页图，补充 Enter 发送和多行 LaTeX 显示。增加批注图片导入、PDF 同目录副本和原生图片笔记，并处理启动恢复与保存失败回滚。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.5) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.5)

### v0.10.4 · 支持 Markdown 回答与文本右键引用

加入 Markdown 与公式共同渲染，修复侧栏关闭后重开及重新挂载。支持选中文字、高亮和下划线作为引用来源，并在页边显示保存的原文内容。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.4) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.4)

### v0.10.3 · 增加文档助手侧栏与同侧页边引用

将对话改为可调宽的固定阅读侧栏，并把前文截图显示在对应页边批注中。处理旧卡片挂载、来源失效和材料读取竞态，关闭侧栏后恢复 PDF 阅读空间。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.3) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.3)

### v0.10.2 · 显示 API 配置并修复 Gecko 区域截图

将 API 输入和应用操作接入原生设置页，统一各设置入口。修复 Gecko 包装对象和跨窗口参数边界导致的 PDF 区域截图失败。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.2) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.2)

### v0.10.1 · 补回 Zotero 插件清单必需的更新地址

修复构建时移除 update_url 导致 Zotero 10.0.6 拒绝安装的问题。恢复清单必需字段，使用保留域名维持手动升级方式，并保留安装兼容性回归。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.1) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.1)

### v0.10.0 · 接入 DeepSeek 选区提问与编号引用

在 LaTeX 页边批注基线上增加 DeepSeek API 配置、区域材料截图、流式问答和手动编号目录。保存来源定位与跳转链接，支持引用前文公式、段落及图表。

[下载与归档](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/releases/tag/v0.10.0) · [版本源码](https://github.com/Yuxuan-Liang-git/zotero-margin-assistant/tree/v0.10.0)
