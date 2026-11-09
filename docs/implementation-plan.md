# Zotero Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek region questions and manually numbered, cross-page references to custom Margin Comments 0.9.5.

**Architecture:** Preserve the packaged baseline, add small plain JavaScript modules, and apply narrowly checked integration patches during the reproducible build. Native image annotations remain the source of PDF coordinates. Host code owns storage, credentials and API requests; reader UI presents materials and results.

**Tech Stack:** JavaScript/JSDoc, Node test runner, Python zipfile builder, PDF.js in Zotero, Playwright for isolated UI tests.

**Spec:** `docs/superpowers/specs/2026-10-12-zotero-deepseek-region-references-design.md`

## Global Constraints

- Zotero `10.0` to `10.0.*`; preserve original add-on ID and baseline functionality.
- Official endpoint `https://api.deepseek.com`, default model `deepseek-flash`; session-only API key.
- Native PDF coordinates, attachment/library isolation, versioned atomic local persistence.
- Only explicit Send uploads regions; only explicit Save writes notes/comments.
- No whole-book OCR, automatic uploads, credential logging, or original package modification.
- Local index/drafts do not promise Zotero Sync. Real API and actual Zotero GUI acceptance remain distinct from simulation tests.

## Review Focus

- Rotated, clipped, offscreen PDF regions must use the source page's viewport.
- Duplicate numbering and deleted/replaced sources must not silently select a different source.
- Links must survive rich-text editing without accepting arbitrary URLs or script attributes.
- Chunked UTF-8/SSE and cancellation must preserve partial answers with a visible incomplete state.
- Corrupt local JSON and concurrent writes must preserve previous data and block silent overwrite.

### Task 1: Reproducible baseline and core

**Files:** `zotero-margin-assistant/{baseline/,src/core.js,tests/core.test.cjs,scripts/build.py,package.json}`.
**Interfaces:** `normalizeNumber(text): string`, `ReferenceIndex.add/find/remove`, `sourceLink(source,groupID): string`, `parseSourceLink(text): object|null`, `LocalStore.load/save(scope,data): Promise`.

- [ ] Write core tests for equivalent number inputs, attachment isolation, duplicates, safe links, disk corruption, and serialized atomic writes; run RED.
- [ ] Implement validated core records and storage adapter; run GREEN.
- [ ] Copy unchanged baseline; create deterministic patch-and-package builder that refuses unmatched patches and removes upstream automatic update URL.

### Task 2: Region capture and source references

**Files:** `src/{capture.js,references.js,host.js,assistant.css}`, `tests/{capture.test.cjs,browser.test.cjs}`.
**Interfaces:** `captureRegion(pdfDocument,source,document): Promise<Material>`, `References.renderStored/readStored`, `Host.resolveSource/preview/insertReference`.

- [ ] Write failing capture tests with independently derived rotated/clipped bounds; write browser reference editing roundtrip and unsafe-link tests; run RED.
- [ ] Implement single-page PDF.js render with cropping, size limits and per-file-fingerprint memory cache, optional region text extraction.
- [ ] Implement numbering/type form, directory/disambiguation, pinned screenshot previews, jump/add material, source repair and invalidation.
- [ ] Patch existing rich-text boundary and add per-card Insert Reference action; verify roundtrip and baseline rich text behavior GREEN.

### Task 3: DeepSeek and question panel

**Files:** `src/{deepseek.js,panel.js}`, `content/assistant-settings.xhtml`, `tests/{deepseek.test.cjs,browser.test.cjs}`.
**Interfaces:** `DeepSeekClient.generate(messages,{signal,onDelta}): Promise<string>`, `buildMessages(history,question,materials): messages`, `Panel.addMaterial/send/saveAnswer`.

- [ ] Write failing multi-image/history payload, streaming/chunk splitting, 401/429/network, abort, size-budget and per-PDF session tests; run RED.
- [ ] Implement official-only request transport, host session credentials, settings connection test and incremental SSE parsing.
- [ ] Implement screenshot/question panel, stop/retry, LaTeX, explicit editable save preview, source-linked native note/comment saves and draft restoration.
- [ ] Verify canceled results remain incomplete, unsent material removal and failed questions remain recoverable; run GREEN.

### Task 4: Integration, package and delivery

**Files:** `src/host.js`, `scripts/{build.py,verify.py}`, `tests/integration.test.cjs`, `README.md`, `docs/acceptance.md`.
**Interfaces:** `Host.start/stop`, reader toolbar/context menu, native item save and lifecycle cleanup.

- [ ] Write failing host integration tests for menu actions, isolated readers, readonly saves and cleanup; run RED.
- [ ] Integrate bootstrap lifecycle; restore readers opened before activation; cancel requests on reader close/unload.
- [ ] Run all tests, syntax/static checks, build XPI, verify manifest/assets and preserved baseline changes, inspect standalone UI screenshot.
- [ ] Conduct fresh review and fix actionable issues with regression tests. Document exact verified scope and remaining Zotero/API acceptance; deliver XPI plus buildable source.

No Git commit steps: this workspace is not a repository; preserve evidence in a per-plan ledger. Execution is authorized by the user's 2026-10-13 “允许执行”; proceed in the current session.
