# Margin Comments + DeepSeek 0.10.1

面向 Zotero 10.0.x，在用户提供的 LaTeX custom 0.9.5 上增加区域提问和手动编号引用。保留页边批注、自动保存、原公式预览、类型筛选及便签图标设置。

## 安装与使用

1. Zotero → 工具 → 插件 → 右上角齿轮 → 从文件安装插件，选择 `dist/margin-comments-deepseek-0.10.1.xpi`。这是同一插件的升级包，会替换已安装的定制版；原始 XPI 保留，卸载本版后可以重新安装原包。
2. 打开 PDF，点击工具栏“阅读助手”→“DeepSeek 设置”。填写自己的 API Key，模型默认 `deepseek-flash`。密钥仅在本次 Zotero 会话中保存，重启后重新输入。连接测试只获取模型列表，不发送 PDF。
3. 使用 Zotero 的图片/区域批注工具框选内容，右键“向 DeepSeek 提问”。核对材料截图，输入问题并发送；可停止、重试、复制回答，或预览编辑后明确保存为笔记/追加到批注。
4. 在前文框选公式及说明，右键“标记为引用来源”，输入类型“公式”和编号 `6.30`。段落、图、表也可编号。
5. 到当前页的页边评论点击“插入引用”，或在批注右键“插入前文引用”。输入 `6.30`，核对候选页码，选择“插入到此批注”。重复编号会列出多个候选。
6. 点击评论中的来源链接，在阅读助手中展开原公式截图，当前 PDF 不跳页。可固定对照、跳转原文或加入提问，同时解释两处材料。

PDF 实际页码与书内页码分别保存。未装插件时，批注仍包含可读编号和 Zotero 原文链接。

## 数据与限制

- 仅点击发送时上传面板列出的图片及本会话先前提交的材料/问题；不上传整本 PDF。显式“添加当前页”会加入该页作为材料。补充文字只采用完全包含在区域内的文本项，纯扫描件直接使用截图。
- 每次最多 8 个区域；截图最长边最多 2400 像素；总请求约 12 MiB、文字约 60000 字符的本地预检。超过时提示缩小范围/新会话，不静默截断。模型截断或网络中断的回答标记未完成。
- 编号目录、引用关联和草稿位于 Zotero 数据目录下 `margin-comments-assistant/<libraryID>-<attachmentKey>.json`，通过临时文件原子替换。它们仅在本机保存，不承诺 Zotero Sync；明确保存的原生笔记/批注由 Zotero 管理。
- 截图为最多 16 项的内存缓存，退出后释放；清空缓存不会删除索引或笔记。文件大小/修改时间变化后拒绝旧定位，需在引用目录中选择“重新关联”，再框选正确区域。
- API Key 不写入该目录、批注、笔记或日志。官方地址固定为 `https://api.deepseek.com`。默认模型的图像输入依据 [DeepSeek 官方文档](https://api-docs.deepseek.com/guides/vision/)，实际账户调用还需配置密钥验收。
- 同一 PDF 多窗口共享目录与会话状态，同时只允许一个生成请求。不同 PDF 的材料和会话隔离。
- Zotero 10.0.6 强制要求清单中的 `update_url`，本包保留该字段，指向保留域名 `updates.invalid`，不会下载未经适配的上游版本；更新检查可能提示无法连接，未来升级需手动安装新包。
- 无整书 OCR 或自动编号定位；本版依赖用户手动圈选。PDF.js 阅读器内部接口有版本依赖，兼容范围限定 Zotero 10.0.x。

## 开发与构建

`baseline/` 为原始包的解包内容，保持不变。`src/` 为新增模块；`scripts/build.py` 只在生成目录中应用检查过的衔接补丁。无需恢复或覆盖整个打包脚本。

需要 Python 3.12+、Node 24、Chrome，以及 `package.json` 中的开发依赖。项目不需要运行时 npm 依赖；安装 XPI 即可。

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
