# HTTP 400 诊断缺口

用户截图显示 ChatGPT 请求 HTTP 400、空的未完成回答和保留的 PDF 选区。用户确认标准速度、模型默认思考强度、关闭联网后仍失败。本轮没有真实失败请求的服务端响应，因此不能认定具体请求根因已修复。

只读核对实际配置：当前安装 0.13.9，其 ChatGPT、授权和 Host 脚本与工作区 0.13.8 相同；panel 仅原生 textarea 的 contenteditable 标记不同。本版保留实际安装的 false 标记，并纳入两项原生编辑/缩放后的光标回归，避免更新时撤销用户当前版本的编辑行为。没有修改真实配置或文库。

已复现的代码缺口：错误字段仅接纳少量顶层参数，忽略 `input[0].content[1].file_data` 等索引路径、订阅能力代码、验证位置数组，以及字符串错误/部分 detail 文本中的参数；请求 ID 和返回结构没有保留。界面因而只能提示通用 HTTP 400。

0.13.10 在边界处识别这些返回格式，保留已知安全代码、结构化字段、请求 ID、返回结构与仅计数的请求配置。失败回答提供“复制错误诊断”；未知原因明确标记未知。原始服务端文本只用于识别已知字段，不显示或持久保存，避免复制文档或授权回显。诊断不进入历史文件。对明确的思考强度拒绝，提供点击后使用模型默认的重试，沿用既有失败问答替换逻辑。没有自动重试 400、自动改模型、删除附件或切换计费方式。

5项请求回归与2项界面回归验证缺失行为后通过。完整 npm test 226/226（146.4秒），全 src checkJs 通过，诊断界面截图已查看。证据：`evidence/ui-01310`。

隔离原生测试使用实际 PDF、Gecko 和模拟 OAuth/Responses，包含 detail 字符串思考强度拒绝及默认重试、带索引文件校验、诊断复制、草稿保留与既有21项功能。第一版 QA 在新增失败请求后没有恢复供下一步使用的公式答案，导致 composer-attachments-quotes 夹具找不到公式；修正 QA 最后补充一次正常模拟回答，未因此改动产品代码。最终首启/冷重启结果在 `evidence/zotero-01310-http400-v2`，测试不调用真实在线推理，用户本次 HTTP 400 仍需在安装后复制新的诊断确认。

依据：

- [OpenAI：错误返回与恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [OpenAI：订阅接入限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
