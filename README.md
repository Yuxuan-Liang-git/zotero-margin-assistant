# Margin Comments + DeepSeek + ChatGPT 0.11.3

面向 Zotero 10.0.x，在用户提供的 LaTeX custom 0.9.5 上增加 DeepSeek API / ChatGPT 订阅文档提问和手动编号引用。保留页边批注、自动保存、原公式预览、类型筛选及便签图标设置。

## 安装与使用

1. Zotero → 工具 → 插件 → 右上角齿轮 → 从文件安装插件，选择 `dist/margin-comments-deepseek-0.11.3.xpi`，随后重启 Zotero。这是同一插件的升级包，会替换已安装的定制版；原始 XPI 保留，卸载本版后可以重新安装原包。此功能无需安装 Edge Zotero Connector。
2. Zotero → 设置 → 页边批注 → **DeepSeek 区域提问**。填写 API Key，点击“应用设置”；模型默认 `deepseek-flash`。阅读器工具栏“DeepSeek / ChatGPT”打开右侧文档助手，其“设置”按钮也打开这页。密钥经 Zotero 的系统密钥库加密后保存在本机，重启后自动恢复；设置页留空并应用只调整模型，点击“清除密钥”会删除已保存密钥。连接测试只获取模型列表，不发送 PDF。
3. 打开 PDF 后点击工具栏“DeepSeek / ChatGPT”，直接输入问题即可：每轮自动读取当前 PDF 的文字层；较短文档提供全文，长文档按问题选取相关片段，面板显示本轮范围。纯扫描件自动加入当前页截图，不必手动传入。也可框选区域或选中文字，右键“向 DeepSeek 提问”补充指定内容。Enter 发送，Shift+Enter 换行；中文输入法选字时 Enter 不发送。材料读取期间禁用发送，读取失败在侧栏中提示。回答支持 Markdown、LaTeX，可连续追问、停止、重试、复制，或预览编辑后明确保存为笔记/追加到批注。点击“新会话”另开一段独立聊天，点击“对话记录”切换本 PDF 的历史聊天及草稿；每份 PDF 有自己的列表。文献条目下会生成“DeepSeek 对话历史”笔记子项，双击可直接打开对应 PDF 的侧栏对话列表。拖动侧栏左边缘调整宽度，关闭后恢复 PDF 空间，点击工具栏“DeepSeek / ChatGPT”可重开。重启后恢复阅读器按钮与当前 PDF 的聊天列表。
4. 在前文框选公式及说明，右键“标记为引用来源”，输入类型“公式”和编号 `6.30`。段落、图、表也可编号。文字可直接选中后右键“标记选中文字为引用来源”，也可对已有高亮或下划线右键标记。
5. 到当前页的页边评论点击“插入引用”，或在批注右键“插入前文引用”。输入 `6.30`，核对候选页码，选择“插入到此批注”。重复编号会列出多个候选。
6. 插入后，原公式截图自动显示在对应页边批注下方，沿用该批注的显示侧，随页面一起滚动，当前 PDF 不跳页。可收起，点击评论中的来源链接重新展开，或“跳转原文”“加入提问”，同时解释两处材料。来源批注移动、删除或 PDF 文件变化时提示重新定位。
7. 要直接引用一段文字，先有目标页边批注，再选择原文并右键“引用选中文字到页边批注”。检查原文，选择目标批注，可修改默认编号“文字1”，点击“引用到此批注”。完整文字段显示在批注中；包含标准 LaTeX 分隔符的文字可显示为公式。原 PDF 中的普通公式可保留原排版截图。文字选择会建立高亮作为可回溯来源；无需手动框选截图。
8. 在页边评论底部点击“插入图片”，选择本地 PNG、JPEG、GIF 或 WebP（最多 10 MiB）。图片直接显示在该评论下方，并写入该 PDF 专用的 Zotero 笔记，同时在 PDF 同目录的 `margin-comments-images/` 保存独立副本。原图片不变。点击“打开图片笔记”查看；有父文献的 PDF，笔记放在该文献下，独立 PDF 则创建带 PDF 原文链接的独立笔记。重启后图片关联仍保留。
9. 显示公式中的直接 LaTeX 换行 `\\` 会自动按多行公式渲染；已有 `aligned`、`gathered` 或矩阵环境保留原结构。
10. 文档助手支持选择文字后 Ctrl+C、输入框 Ctrl+V、Ctrl+X、Ctrl+A 和右键编辑菜单。选中渲染公式的任意部分后复制，默认复制该公式完整的 LaTeX 源码与原分隔符；混选文字和公式时保留文字并将公式转换回 LaTeX。公式右键“复制公式 LaTeX”无需先选中。回答下方“复制”仍复制完整原始 Markdown/LaTeX。此功能处理已有 LaTeX 渲染公式，不对 PDF 截图自动做公式 OCR。

11. 助手多行输入框支持方向键移动光标、Shift+方向键选字、Ctrl+方向键按词移动，以及 Home/End 行首行尾。0.10.10 修复 Zotero 将方向键截获为阅读器焦点导航的问题；继续保留 Enter 发送、Shift+Enter 换行和中文输入法选字。

12. 使用 ChatGPT：设置 → 页边批注 → **文档助手 · DeepSeek / ChatGPT**，点击 **Continue with ChatGPT**，在系统浏览器的 OpenAI 官方页面登录并授权。无需 OpenAI API Key。返回 Zotero 后会显示账户及可用模型；侧栏选择“ChatGPT 订阅”即可直接针对 PDF 交互。可添加/切换账户或工作区、刷新模型、退出当前账户；同一注册重新授权复用原 client ID。登录凭据加密保存在本机并自动刷新，重启后恢复。首次授权会提示使用订阅；“管理用量”打开 ChatGPT 用量设置。此官方接入使用 Codex / ChatGPT Work 的共享订阅额度，会与 Codex 使用竞争同一额度，不是独立的普通网页聊天额度；详情见 [Sign in with ChatGPT 官方说明](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)。此功能不读取 ChatGPT 网页历史，插件里的对话仍由本地按 PDF 保存。切换服务会继续使用当前对话，若希望独立上下文请新建会话。

13. ChatGPT 侧栏和设置页均可选择“思考强度”：轻量 Light（low）、中等 Medium、高 High、超高 Extra High（xhigh）、最大 Max，按模型支持显示。模型目录的明确限制优先；当前 GPT-6 / GPT-5.6 家族在缺少目录档位时按官方模型资料补齐，旧版三档缓存可升级。Codex 的 Ultra 包含多智能体调度，本助手没有该调度器，不把 Ultra 伪装成普通推理参数。设置加密保存，重启恢复。DeepSeek 保留原思考模式。
14. 独立的“生成速度”提供标准 Standard、快速 Fast、极速 Ultrafast。快速/极速保持所选思考强度，会加快共享额度消耗。目录明确给出速度档位时遵从目录；目录缺少信息时，已知支持模型提供尝试选项。Ultrafast 仅对 GPT-6 Astra / GPT-6.1 Sol 提供，仍需符合账户与工作区资格。速度档位被拒绝时显示具体 HTTP 状态及安全的参数名，并提供“以标准模式重试”；点击才重发，沿用原问题与历史且不重复插入问题。不会自动重复付费请求。回答完成后显示服务端回传的实际档位，降档明确提示，未回传则显示未确认。摘要使用标准速度与低强度以减少额外用量。切换模型会将其不支持的已选档位恢复为默认/标准。参见 [官方速度与额度说明](https://learn.chatgpt.com/docs/agent-configuration/speed)及 [模型档位说明](https://learn.chatgpt.com/docs/models)。

PDF 实际页码与书内页码分别保存。未装插件时，批注仍包含可读编号和 Zotero 原文链接。

## 数据与限制

- 仅点击发送时向当前选择的服务（DeepSeek 或 OpenAI）提交提问：请求包含自动读取的当前 PDF 文字/相关片段（纯扫描件为当前页截图）、显式添加的所选材料及本会话先前提交的问题/材料。不会把 PDF 文件作为附件上传，但短 PDF 的完整文字层会作为上下文发送。页边插入的图片只保存在本地和 Zotero 笔记，不自动加入聊天请求。面板显示全文/片段页码或当前页截图，读取失败会提示。
- 每次最多 8 个区域；截图最长边最多 2400 像素；总请求约 12 MiB、文字约 60000 字符的本地预检。旧对话达到阈值后会调用当前选择的服务生成摘要，最近几轮原文继续提供给模型；单轮文档文字预算最多约 24000 字符。摘要和已压缩位置按 PDF 存储，完整原始问答仍保留在本地 JSON，可在侧栏查看。若摘要失败，不会丢弃原始记录。普通回答的输出上限已提高到 65536 tokens（当前 DeepSeek 思考模式的默认量级）；达到模型上限或网络中断时仍标记未完成，输入“请继续”会带上已收到的部分回答。流式生成约每 180 毫秒按完整块更新 Markdown/公式，已提交块不因后续字符重新渲染；未闭合公式先显示原文，闭合后渲染，最终统一整理一次。选中文字时暂缓重绘，避免打断复制。
- 编号目录、引用关联、图片关联、每份 PDF 的对话列表与草稿位于 PDF 同目录下 `margin-comments-assistant-<libraryID>-<attachmentKey>.json`，通过临时文件原子替换。首次打开 PDF 时会将旧数据目录中的 JSON 复制到 PDF 旁，旧文件保留不删除；若 PDF 旁已有文件，优先使用它。旧版单段聊天仍会迁移为列表，并在 PDF 旁生成 `.json.v1.bak` 备份。它们仅在本机保存，不承诺 Zotero Sync；明确保存的原生笔记/批注由 Zotero 管理。原生笔记图片使用 Zotero 的嵌入图片附件方式，图片同步占用 Zotero Storage 配额，详见 [官方笔记说明](https://www.zotero.org/support/notes)。PDF 旁边的图片副本不属于插件的同步范围。
- 截图为最多 16 项的内存缓存，退出后释放；清空缓存不会删除索引或笔记。文件大小/修改时间变化后拒绝旧定位，需在引用目录中选择“重新关联”，再框选正确区域。
- ChatGPT 登录的 access/refresh/ID token 和账户信息作为一个 `OSKeyStore` 加密记录保存在本机 Zotero 首选项 `margincomments.chatgptCredentials`；稳定主机标识另存 `margincomments.chatgptHost`。令牌不写入 PDF 旁的 JSON、批注、笔记、源码或日志。退出会尝试撤销当前账户的续期会话并清除本地令牌，保留该账户的注册映射；远程撤销未确认时会提示到 ChatGPT 设置中断开应用。模型来自当前账户返回的目录。参见 [OpenAI 官方订阅接入说明](https://developers.openai.com/siwc/token-sharing-open-source)。
- DeepSeek API Key 不写入该目录、批注、笔记或日志；经 Zotero `OSKeyStore` 加密后写入本机 Zotero 首选项，只能在当前操作系统用户环境下恢复。原先的会话密钥不会自动回填，升级后需输入一次。官方地址固定为 `https://api.deepseek.com`。默认模型的图像输入依据 [DeepSeek 官方文档](https://api-docs.deepseek.com/guides/vision/)，实际账户调用还需配置密钥验收。
- 同一 PDF 多窗口共享目录与会话状态，同时只允许一个生成请求。不同 PDF 的材料和对话列表隔离；新会话不继承上一段对话的问答，但每轮仍会自动读取当前 PDF。
- Zotero 10.0.6 强制要求清单中的 `update_url`，本包保留该字段，指向保留域名 `updates.invalid`，不会下载未经适配的上游版本；更新检查可能提示无法连接，未来升级需手动安装新包。
- 无整书 OCR 或自动编号定位；扫描件对话默认只能读取当前页截图，不能据此声称已通读整书。公式编号引用仍由用户手动框选/选文字并标记。长文档提供片段，不保证每轮覆盖所有页面。PDF.js 阅读器内部接口有版本依赖，兼容范围限定 Zotero 10.0.x。
- 选中文字依赖 PDF 的文字层，纯扫描图仍使用区域截图。Markdown 解析器 Marked 17.0.5 随插件离线打包并保留 MIT 许可证；远程图片不自动加载，原 HTML 不作为活动内容执行。

## 开发与构建

`baseline/` 为原始包的解包内容，保持不变。`src/` 为新增模块；`scripts/build.py` 只在生成目录中应用检查过的衔接补丁。无需恢复或覆盖整个打包脚本。

需要 Python 3.11+、Node 24、Chrome，以及 `package.json` 中的开发依赖。项目不需要运行时 npm 依赖；安装 XPI 即可。

```powershell
npm install
npm test
npm run typecheck
python scripts/verify.py
```

测试浏览器默认 Windows Chrome 路径；测试中的 Python 路径可通过 `ZMA_PYTHON` 指定。项目构建会清理自身的 `build/` 生成目录，不要把手写文件放进去。

`dist/` 包含 XPI、构建报告、检查报告及源码 ZIP。验收证据与尚未完成的实机步骤详见 `docs/acceptance.md`。

## 来源

基线：用户提供 `margin-comments-latex-custom-0.9.5.xpi`，SHA-256 `875A363693CA0CFC53A414CDDD966286B8BA0FE821148EC278CBF0602673B1CA`。

上游参考：[XiaoDuComrade/zotero-margin-comments](https://github.com/XiaoDuComrade/zotero-margin-comments)。此本地定制基线与公开版本不同。本项目为私有定制交付，保留随基线附带的 KaTeX 许可证。
