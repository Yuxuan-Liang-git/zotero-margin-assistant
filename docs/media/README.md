# README 展示素材

这些素材用于展示 Zotero Margin Assistant 0.19.0 的阅读流程。PDF、对话、阅读摘要和关系图均为本项目自编示例，不对应已发表论文，也不代表真实 AI 服务的生成结果。

## 录制方式

`reading-workspace.png` 和 `reading-summary.png` 展示原文、页边引用与文档助手；`formula-reference.gif` 展示悬停预览及加入提问；`page-images.gif` 展示页面图片的插入、拖动、等比缩放和锁定。两个 GIF 分别附有同名 PNG 静态预览。

素材通过无头 Chromium 在后台录制。助手、公式渲染、引用预览和页面图片使用项目的实际组件及样式，PDF 由自编 HTML 生成。录制环境使用现有测试适配器模拟 Zotero 文件与笔记存储；这些画面属于组件演示，未对真实 Zotero 文献库进行操作，也未请求 AI 服务。原生 Zotero 功能的验收范围见对应版本发布说明。

## 展示方式参考

参考 [Notero](https://github.com/dvanoni/notero) 在介绍后展示核心流程 GIF、[Better Notes](https://github.com/windingwind/zotero-better-notes) 将全景图和局部功能图配合使用，以及 [Open WebUI](https://github.com/open-webui/open-webui) 在安装说明前直观展示交互的方式。参考内容为 README 的组织方法，仓库中的演示图均来自本项目。

## 重新录制

需要 Node.js、Python、Windows Chrome，以及项目的开发依赖。先安装 `npm install` 所列依赖，并准备 0.19.0 的 XPI；原始发布包可从 Releases 获取。后台运行：

```powershell
node scripts/capture-readme.cjs
python scripts/encode-readme-gifs.py
```

截图写入 `docs/media/`，原始帧与录制报告写入被 Git 忽略的 `evidence/readme-media-background/`。GIF 编码还需要 Python Pillow。`example-paper.html`、`example-dialogue.json` 与 `reading-diagram.png` 是公开演示输入，修改这些文件即可更新示例内容。脚本采用无头模式，不占用桌面窗口。

本次录制画面为 1440 × 1000，保留完整分辨率，GIF 使用有限调色板压缩。新增版本改变组件或布局后，应重新录制，并同步更新本说明中的版本号。
