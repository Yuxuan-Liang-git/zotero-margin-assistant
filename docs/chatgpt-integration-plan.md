# ChatGPT subscription integration

User authorizes integrating the previously verified subscription flow into the current XPI. Continue inline without requesting the same authorization again.

Goal: choose DeepSeek or ChatGPT in the existing PDF assistant, sign in through the official system-browser flow, select account-specific models, retain PDF-local history and encrypted credentials across restart.

Design: native Gecko loopback HttpServer, WebCrypto PKCE/OIDC validation, protected per-registration credentials in one OSKeyStore-encrypted preference, stable host ID, serial token refresh, explicit account selection/reauthorization/logout. Responses HTTP uses store=false, stream=true, full local history and instructions; omit unsupported output limits and remote conversation IDs. Existing PDF text/image capture, summary compaction and LaTeX/clipboard editing are shared. No external runtime, API key, browser cookies or ChatGPT web-history access.

Implementation sequence:
- [x] Add failing auth/session tests: signature/state/nonce/account validation, encrypted restart, refresh rotation/concurrency, logout and cancellation.
- [x] Implement chatgpt-auth.js and injected native loopback adapter.
- [x] Add failing Responses tests: text/images, assistant history, model catalog, completion/error/partial stream and refresh.
- [x] Implement chatgpt.js and host provider routing; snapshot client during each request and compaction.
- [x] Add sidebar provider/model and settings account/login/logout/usage UI, with browser regression tests.
- [x] Build 0.11.0, run full regression/type/syntax checks, isolated native startup and cold restart with mocked OAuth/network. Document actual-user sign-in acceptance separately.

Sources: OpenAI SIWC sign-in, profiles-and-sessions, models-and-inference, preview-limitations, ui-ux-guidelines; official openai/sign-in-with-chatgpt-devkit oauth.ts and responses.ts.
