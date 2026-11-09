# 页边批注图片输入实施计划

使用writing-plans组织实现，随后使用executing-plans在当前会话连续完成，最终进行一次独立审查。用户已选择粘贴与拖入，保存方式已有明确批准，直接完成相应实现、验证和打包。依据为 [设计](../specs/2026-11-05-margin-image-input-design.md)。现有0.18.0源码归档作为回溯基线。

### 任务一 图片输入与持久化

修改 `src/images.js`，复用 `AttachmentManager.readInput(input)`，保留文件路径调用，接受 `{bytes}` 和File/Blob。每张上限10 MiB，格式验证、串行保存及回滚继续生效。加入目标重验及 `flush()`，在Host停用时等待队列。

- [x] 先写失败测试，覆盖内存输入、跨窗口字节、超限和错误格式、读取期间目标删除或停用、保存失败补偿。
- [x] 实现并运行 `node --test tests/images.test.cjs` 到GREEN。

### 任务二 卡片事件与正常入口

新增 `src/margin-images.js`，导出 `install(host, session, runtime, insert)`，绑定当前卡片的paste、dragover、dragleave和drop。Host增加共享 `insertMarginImages(session,runtime,inputs)`，供文件按钮与事件调用。复用10 MiB剪贴板读取预算，正文编辑使用既有逻辑。增加拖入反馈和状态文字，更新模块加载顺序。

- [x] 先写失败浏览器测试，包含真实文件对象、粘贴事件、一次操作一张、多个图片、纯文本/公式、只读和卡片重建。
- [x] 实现并验证所有入口复用同一持久化流程，查看实际布局截图。

### 任务三 审查与交付

- [x] 独立审查整项变更，对实质问题补RED→GREEN回归。
- [x] 跑完整测试和全src checkJs，在隔离Zotero验证真实图片笔记、同目录副本、卡片重建及冷重启。
- [x] 更新0.18.1说明、验证脚本和最终哈希，交付XPI与源码归档。

### 审查重点

原生编辑器停止冒泡时仍能处理图片。文本粘贴与读写权限正确。一个粘贴动作不重复导入。异步读取期间的删除、停用和写入失败有一致结果。卡片重建后图片恢复且监听器不累积。
