# PDF 图片阅读、放置与导出实施计划

使用 superpowers:executing-plans 在当前会话逐项实现，最后进行一次独立审查。用户已批准书面设计并要求实现，沿用当前项目的内联执行与源码 ZIP 交付方式。

目标为可读的大图查看器、可持久调整的 PDF 页面图片，以及其他阅读器可见的带图 PDF 导出。技术栈为现有 JavaScript、Zotero 10、PDF.js、pdf-lib 和独立 Worker。依据为 `docs/superpowers/specs/2026-11-05-page-images-design.md`。

### 全局约束

原生图片笔记与 PDF 同目录副本继续复用，每图最多10 MiB，格式为 PNG、JPEG、GIF、WebP。页面坐标使用 PDF 原始坐标，涵盖四种页面旋转与非零裁剪框。页面图片保存与导出使用相同位置。导出为新 PDF，先包含原生标注，再合成图片。保存失败与取消有一致结果，大段 PDF 合成放到 Worker。新版0.19.0，基线为0.18.2源码 ZIP。

### 文件和接口

`src/image-viewer.js` 负责大图查看，`ImageViewer(doc).show(src,trigger)` 与 `destroy()`，由 Host 按阅读器管理。`margin-references.js` 提供缩略图点击和可访问的“查看原图”入口，复用 `ImageManager.readImage()`。

`src/page-image-core.js` 定义页面放置及坐标数学。记录为 `{id,imageID,pageIndex,matrix:[a,b,c,d,e,f],locked,fingerprint}`，matrix 将图像的单位正方形映射到 PDF 坐标。只接受有限、正面积、正交轴的变换。导出由旋转角和两轴长度还原同一变换。`cleanPlacement(record)`、`fromViewport(...)`、`toViewport(record,viewport)` 及移动/等比缩放函数集中在该模块。

`core.js` 接受新存储版本3，并保留旧版本1、2读取。无新页面功能的既有状态可继续返回版本2，产生页面图片后切换到3。`LocalStore` 在首次发布版本3前保留权威旧文件的 `.v2.bak`，已有 `.v1.bak` 继续使用。更新对本地数据版本进行判断的导入与研究检索入口。

`images.js` 保留 `importImage(reader,annotationKey,input,state,commit)`，增加页面目标 `{pageIndex,fingerprint}` 的分支。页面资产以 `sourcePageIndex` 代替必需的 `annotationKey`，其余资产字段一致。`core.pickImage` 兼容两类目标，页面资产仍写入同一专用图片笔记和目录。位置集合为 `state.pageImages`，只引用存在的资产ID。

`src/page-images.js` 的 `PageImages(host,reader,session)` 管理页面图层、选择、拖动、缩放、锁定、移除、粘贴、拖入与右键位置。`menu(append)` 加入操作，`insert(inputs,point)` 与 `place(record,point)` 复用资产，`refresh()` 和 `destroy()` 管理生命周期。Host 在原有读者恢复、布局与变更入口调用，不在文档助手/Notion/文本编辑区处理图片粘贴。

`src/page-image-export.js` 管理导出快照、图片归一化、Zotero 原生中间导出、Worker 和原子发布。`exportPDF(host,reader,snapshot,target)` 输出带图 PDF；`content/pdf-image-worker.js` 用打包的 pdf-lib 处理数据。PNG、普通JPEG直接嵌入，EXIF、GIF、WebP按显示方向与首帧归一化。输出临时文件完成后发布，源路径受保护。

### 任务一 原图查看

- [x] 在 `tests/image-viewer.test.cjs` 先覆盖点击真实批注图片打开大图、密集文字宽图原尺寸、缩放/平移、Esc/关闭与焦点恢复，以及重复打开和销毁。观察失败。
- [x] 实现查看器并接入 Host、缩略图、CSS及模块加载顺序。原图仅解码到查看器，控件与图片各自布局。
- [x] 运行 `node --test tests/image-viewer.test.cjs tests/margin-images.test.cjs`，预期全部通过，查看宽公式截图。

### 任务二 数据和坐标

- [x] 在 `tests/page-image-core.test.cjs` 与既有图片/存储测试先覆盖矩阵往返、四方向、裁剪框、边界等比缩放、无效值、旧数据读取、迁移备份失败、旧版本覆盖保护、页面目标导入与失败补偿，观察失败。
- [x] 实现坐标、版本3、备份和页面资产目标。页面目标在异步读取后与提交前验证页码、源身份和可写性。定位记录只引用成功提交的图片资产。
- [x] 运行相关 core、images、transfer、memory 测试，预期全部通过。

### 任务三 页面交互

- [x] 在 `tests/page-images.test.cjs` 先覆盖右键/粘贴/拖入正常入口、已有批注资产放置、拖动、缩放、锁定/解锁、多图、重建恢复、只读、源变化、失败回滚，以及与聊天保存并发，观察失败。
- [x] 实现 `PageImages` 和 Host 生命周期、菜单、资产查看。拖动期间按帧更新，松开后一次持久化，Esc恢复旧位置。页面目标随图片读取复验；移除放置后保留可复用的资产。
- [x] 运行页面及既有 PDF 搜索/输入/图片测试，预期通过，检查 PDF 搜索与正常文本粘贴。

### 任务四 导出和交付

- [x] 在 `tests/page-image-export.test.cjs` 先创建含文字、标注、旋转与裁剪框的真实 PDF，验证导出后 PDF.js 像素位置与图片方向；覆盖 PNG/JPEG/GIF/WebP/EXIF、取消、源路径保护、读取/写入失败和快照一致性，观察失败。
- [x] 实现后台 Worker、资源/许可证打包、原生标注中间导出与原子发布，增加紧凑导出菜单。
- [x] 进行一次独立整项代码审查，实质问题补失败回归后修复。运行完整 `npm test` 和全部 src checkJs，预期零失败。
- [x] 在隔离 Zotero 验证真实图片笔记、页面拖动/锁定、关闭/重开及冷重启、Worker 导出与独立 PDF 渲染，核对源 PDF 哈希。
- [x] 更新版本、使用说明、验证脚本，确定性构建0.19.0 XPI，核对原基线并生成源码 ZIP 与验证报告。

### 审查重点

必须检查正在拖动时源文件被替换或关闭阅读器的状态提交，页面旋转与裁剪框的查看/导出一致性，快速拖动并同时保存聊天的覆盖问题，旧插件遇到版本3的保护，以及正文/文档助手/Notion的粘贴事件归属。各项由对应任务的回归固定，原生检查补充跨窗口文件、事件和 Worker 行为。
