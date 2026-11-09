# ChatGPT 订阅授权验证（2026-10-18）

使用 OpenAI 官方 Sign in with ChatGPT 流程进行独立验证：用户在官方页面选择账户并授权，本地回调校验 state、PKCE、ID token 签名、issuer、audience、nonce 和过期时间。取得订阅权限后读取账户模型列表，并发起一句不含文献内容的测试请求。

本次报告 `evidence/chatgpt-plan-probe/report.json` 显示：

- `verified: true`，已收到 `response.completed`。
- `id_token_validated: true`。
- 账户返回 7 个可用模型；本次测试使用 `gpt-6-luna`。
- `credentials_persisted: false`；OAuth 凭据仅在一次性测试进程内存中使用，没有写入报告或 PDF 数据文件。

这证明该账户在本次授权下可以用订阅完成请求。当前 0.10.9 XPI 包含复制、粘贴和公式 LaTeX 复制修复，尚未把此登录原型接入插件的模型提供商、凭据刷新和设置界面。正式接入时仍须完整实现授权、加密凭据持久化、刷新、退出、用量错误提示，以及由插件维护的每份 PDF 对话历史。

依据：

- [官方订阅授权流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [模型选择与完成事件](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [订阅调用限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
