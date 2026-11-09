# 0.19.1：Notion 网页恢复

### 故障与修复

Zotero 10.0.8 的网页子进程退出后，原生浏览器元素可能继续留在窗口中，但 `frameLoader.remoteTab` 已失效。旧版复用该元素调用 `loadURI()` 时，Gecko 在 `maybeCancelContentJSExecution` 处报错。Notion 视图同时保留了已加载链接，关闭重开同一页面时会跳过重试。

0.19.1 在导航前异步等待网页容器和远程对象就绪。检测到曾就绪的远程对象丢失或收到崩溃事件时，下次加载会重建网页容器；就绪检查与导航之间发生同类竞态时，最多恢复一次。失败加载会使链接缓存失效，便于通过栏目菜单刷新，或关闭后重新打开。替换容器时移除旧监听，并取消过期加载，避免旧回调覆盖当前状态。

健康网页继续复用原有实例，保留关闭重开和切换助手视图时的网页状态。恢复过程沿用原有网页配置，不清理 Cookie、登录凭据、会话记录或 PDF 数据；失效进程中的临时网页状态仍可能丢失。

### 安装与使用

从本版 Releases 下载 `margin-comments-deepseek-0.19.1.xpi`，在 Zotero“工具 → 插件 → 从文件安装插件”覆盖安装，随后完全退出并重新打开 Zotero。无需先删除旧版。再次打开 PDF 的 Notion 栏；遇到加载失败时，可使用标题栏菜单中的“重新检测 / 刷新”，或关闭后重新打开该栏。

### 实际验证

完整 `npm test` 通过 399/399 项，`npm run typecheck` 通过。新增回归覆盖远程网页对象丢失后的刷新、初始化期间等待对象就绪，以及 Notion 失败后重开且保留助手草稿。旧代码已在回归及隔离 Zotero 中复现相同的 `remoteTab is null` 异常。

最终 XPI 在隐藏运行的独立 Zotero 10.0.8 配置中通过故障注入：仅停止该隔离实例所属的测试网页子进程，再刷新本机测试页，确认浏览器容器重建、页面重新载入、测试 Cookie 保留。测试仅在初次响应设置 Cookie，重建后同时检查请求头与网页读数，避免重新设置 Cookie 导致假阳性。脚本在停止进程前核对父进程的独立配置路径、隐藏启动参数和子进程归属。

使用最终 XPI 的首启、冷重启验收各通过 13/13 项。其中 Notion 项检查关联附件识别、顶级网页隔离、禁止 iframe 的页面载入、左右双栏拖动和宽度调整、PDF 搜索共存、关闭重开复用健康网页、显式刷新，以及冷启动 Cookie 和栏目位置恢复。其余项目检查助手工具栏、会话恢复、复制粘贴、公式、附件、阅读位置和摘要等兼容行为。

首启验收报告使用 `done` 表示完成。最初的外层等待脚本误读为 `phase`，因此在报告已全部通过后仍超时；已按正确字段核验原始报告，并完成第二次冷启动验收。原始报告没有被改写以规避此判定错误。

自动化仅访问本机测试网页；AI、账户授权和系统剪贴板使用隔离替代。没有登录真实 Notion 私有页面、编辑用户笔记、调用真实 AI，或修改用户正在使用的 Zotero 配置。真实 Notion 登录和编辑需安装后实际确认。本次解决进程失效后的恢复缺陷，最初网页进程退出的原因尚未确定。

### 证据与复现

本地原始证据位于 `evidence/notion-0191-validation/npm-test.log`、`evidence/notion-0191-repro-v2/report.json`、`evidence/notion-0191-package-green-v2/report.json` 及 `evidence/notion-0191-native-final/report-1.json`、`report-2.json`。这些本地测试配置由 Git 忽略；发布附件提供不含配置与凭据的验证摘要。

运行以下命令会生成新的隔离配置并自动隐藏启动测试实例；每次使用不同的 `--run-name`，保留已有证据。

```powershell
npm run typecheck
npm test
python scripts/notion-recovery-smoke.py --run-name notion-recovery-check-001 --xpi dist/margin-comments-deepseek-0.19.1.xpi
```

`scripts/notion-smoke.py --run-name notion-sidebar-check-001` 可准备双栏与冷启动验收配置。使用 `-headless -no-remote -profile` 指向生成的独立配置依次启动两次，分别检查报告的 `done`、`steps[].ok` 和安装包摘要。测试扩展会在完成后退出自己的实例。
