# Conversation Transfer Implementation Plan

> Execute inline with superpowers:executing-plans. User selected both file and paste import on 2026-10-26; this implements the preceding proposal.

**Goal:** Continue exported web conversations in the current PDF; export portable JSON and readable Markdown.
**Architecture:** A pure transfer codec validates bounded inputs; Host supplies local file I/O; a separate transfer UI manages selection and preview through Panel. Existing LocalStore remains the only conversation store.
**Tech Stack:** Existing JavaScript, Gecko file picker/IOUtils, Node tests, browser UI tests, isolated Zotero QA.
**Spec:** docs/2026-10-26-conversation-transfer-proposal.md

## Constraints and review focus

- Do not modify baseline or the user's live Zotero data. No new network requests, dependency or credential export.
- Limits: 16 MiB JSON file, 2 MiB pasted text, 200 messages per imported conversation, 100,000 UTF-16 characters per message and 1,000,000 overall. Reject above limits before persistence; preview clipped, selected conversation only.
- Branches must follow parent links; invalid/cyclic paths reject. Never merge unrelated branches.
- Skip hidden/tool/system/developer messages; warn when source media or PDF materials are absent.
- Merge adjacent same-role textual segments with blank lines. Require a user first; move an unanswered final user message to draft so existing paired compaction stays valid.
- Cancel, bad JSON and save failure must preserve existing state and active conversation. Export cannot replace the live sidecar, PDF or attachment paths.
- Reject unknown schema versions. Exact LaTeX and Unicode text survive a native JSON round trip.

## Tasks

### 1. Transfer codec
Files: new src/transfer.js, tests/transfer.test.cjs.
Interfaces: parseJSON(raw) -> candidate array; parseText(raw,title) -> prepared conversation; prepare(candidate) -> title/history/draft/warnings; exportJSON(conversation), exportMarkdown(conversation); importState(state,prepared) -> validated new state.
- [x] Write tests for round trip, active branch, branch choice, hidden and media messages, paste/code fences, invalid/oversize/cyclic input, incomplete pairs and no mutation.
- [x] Run to RED, implement codec, then GREEN.

### 2. File I/O and preview UI
Files: new src/transfer-ui.js; modify src/host.js, panel.js, assistant.css, scripts/build.py, package.json; new tests/transfer-ui.test.cjs.
Interfaces: Host.readConversationFile() -> raw string or null, writeConversationFile(text,extension,title) -> boolean; TransferUI(panel).open(), exportConversation(id,format); Panel.commitImport(prepared) -> saved new conversation.
- [x] Test UI preview/cancel, text and file import, failure rollback, busy guards and export filtering. Observe RED.
- [x] Add import/export only on history page; file chooser stays injectable in tests. Prevent overwrite of source PDF/sidecar and remove no files.
- [x] Verify imported history reaches next synthetic request with current PDF, and native draft persists.

### 3. Package and verification
Files: new scripts/transfer-smoke.py; modify scripts/verify.py, README.md, docs/acceptance.md, progress.md; version 0.13.5.
- [x] Full npm test, checkJs and deterministic XPI/resource/baseline checks.
- [x] Isolated Zotero first launch + cold restart: import real local JSON and text preview, exports, safe write guard, next mocked inference includes imported messages and current PDF, restored history. Native file picker itself remains a manual acceptance step; QA injects chosen paths.
- [x] Inspect UI screenshot and report exact evidence; produce dist XPI and source ZIP.

No Git commit steps: project currently has no Git repository. Existing user authorization covers inline implementation; no additional execution-method question.

Review additions: per-PDF Host transaction serialization and additive publication preserve concurrent drafts; native incomplete empty answers survive round trips. Both reproduced RED, fixed, and independently re-reviewed. Final full suite 205/205; checkJs green.
