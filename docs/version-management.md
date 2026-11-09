# 版本管理

### 历史来源

本仓库于2026年11月9日从保留的44组源码 ZIP 和 XPI 建立 Git 历史，覆盖0.10.0至0.19.0。每个 `v版本号` 标签对应当时归档中的源码快照，标签说明记录原始源码包和安装包的 SHA-256。导入提交的时间表示归档入库时间，原始开发过程中的逐次提交未保存在这些 ZIP 中。

版本说明见根目录的 `CHANGELOG.md`，完整目录和文件摘要见 `releases/versions.json`。安装包和原始源码 ZIP 保存在 GitHub Releases，各版本还附有 `SHA256SUMS.txt`。现有资料没有0.13.9的完整归档，因此没有为它补造标签。

### 安装和回退

在仓库的 Releases 页面选择版本，下载名称以 `.xpi` 结尾的安装包，再通过 Zotero 的“工具 → 插件 → 从文件安装插件”安装。日常使用优先选择最新版本。不同版本的数据兼容要求见对应发布说明；0.19.0页面图片使用版本3存储格式，安装旧版本前需保留现有数据备份。

要查看某个历史版本的源码，可从该版 Releases 下载原始源码 ZIP，或克隆仓库后检出标签：

```powershell
git clone https://github.com/Yuxuan-Liang-git/zotero-margin-assistant.git
cd zotero-margin-assistant
git switch --detach v0.18.2
```

准备在某个版本上修改时，使用 `git switch -c 分支名 v0.18.2` 创建开发分支。当前稳定版本由 `main` 维护。

### 后续发布

先同步 `main`，再为功能或修复建立独立分支。完成修改后，根据影响更新 `package.json` 中的版本，并在 `CHANGELOG.md` 和 README 中说明变化及适用的验证结果。构建命令为 `python scripts/build.py`，开发依赖通过 `npm install` 安装；源码类型检查为 `npm run typecheck`，自动回归为 `npm test`。原生 Zotero 验收使用新生成的隔离配置。

将完成的变更合入 `main` 后，为该次发布创建带说明的版本标签：

```powershell
git tag -a v0.19.1 -m "Release 0.19.1"
git push origin main
git push origin v0.19.1
```

随后在 GitHub Releases 选择该标签，填写变更说明，上传对应 XPI、源码 ZIP 和 `SHA256SUMS.txt`。校验文件逐行使用“SHA-256、两个空格、文件名”的格式。已发布标签和下载包保留；进一步修复使用新的版本号发布。最新版本发布完成后更新版本目录，并在 Releases 中设为 Latest。

### 本地目录

Git 跟踪源码、测试、文档和版本目录。`build/`、`dist/`、`evidence/`、本地开发工具和环境凭据由 `.gitignore` 排除；本地历史安装包仍保存在 `dist/`，GitHub 对应下载入口位于 Releases。仓库包含已有的 KaTeX、marked 和 pdf-lib 许可证文件，随源码及安装包保留。
