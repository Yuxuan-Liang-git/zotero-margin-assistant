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

### 提交说明

提交标题采用 `type(scope): 具体变化`，直接说明新增能力、修复结果或文档目的。常用类型包括 `feat`、`fix`、`perf`、`refactor`、`docs` 和 `chore`，作用域使用 `reader`、`history`、`auth`、`pdf-images` 等模块名。例如：

```text
feat(pdf-images): 支持原图查看、页面贴图与带图导出
fix(auth): 明确授权配置错误并重试临时连接失败
docs(readme): 说明项目定位、安装配置与数据边界
```

一次提交围绕一个可审阅的变化。正文补充触发场景、用户可见的结果及适用的验证；存在迁移、兼容限制或未验证的服务能力时一并说明。避免仅以“更新”“修复问题”或“恢复快照”作为标题。历史归档提交在正文保留来源说明，标题描述该版本实际带来的变化；这些标题不能还原已经缺失的原始开发过程。

2026年11月9日补充历史提交和标签说明时，已先保存完整 Git bundle，并逐版核对新旧源码树一致；发布附件保持原文件。该次整理改变了提交 ID。此前已经克隆旧历史的开发者应先保存本地工作，再重新克隆或按备份有选择地迁移自己的提交。后续日常开发不重写已发布历史。

### 后续发布

先同步 `main`，再为功能或修复建立独立分支。完成修改后，根据影响更新 `package.json` 中的版本，并在 `CHANGELOG.md` 中说明变化及适用的验证结果；README 保持为当前功能入口，详细操作放在使用指南。纯文档修改无需提高插件版本号。构建命令为 `python scripts/build.py`，开发依赖通过 `npm install` 安装；源码类型检查为 `npm run typecheck`，自动回归为 `npm test`。原生 Zotero 验收使用新生成的隔离配置。

将完成的变更合入 `main` 后，为该次发布创建带具体变更说明的版本标签。以下命令仅示范命名，版本号和说明应以实际发布内容为准：

```powershell
git tag -a v0.19.1 -m "v0.19.1: 修复页面图片导出取消后的状态恢复"
git push origin main
git push origin v0.19.1
```

随后在 GitHub Releases 选择该标签，填写变更说明，上传对应 XPI、源码 ZIP 和 `SHA256SUMS.txt`。校验文件逐行使用“SHA-256、两个空格、文件名”的格式。已发布标签和下载包保留；进一步修复使用新的版本号发布。最新版本发布完成后更新版本目录，并在 Releases 中设为 Latest。

### 本地目录

Git 跟踪源码、测试、文档和版本目录。`build/`、`dist/`、`evidence/`、本地开发工具和环境凭据由 `.gitignore` 排除；本地历史安装包仍保存在 `dist/`，GitHub 对应下载入口位于 Releases。仓库包含已有的 KaTeX、marked 和 pdf-lib 许可证文件，随源码及安装包保留。
