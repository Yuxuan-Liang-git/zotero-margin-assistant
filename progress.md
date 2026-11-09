# SDD ledger — plan: docs/superpowers/plans/2026-10-13-zotero-assistant.md

Authorization: user approved execution 2026-10-13; inline execution.
Ruling: use a dedicated source directory and preserved XPI baseline rather than git worktree — cwd has no repository, spec forbids creating one — cost: no commit history, use file hashes and reproducible build.
Ruling: original packed JS cannot recover original TS exactly; preserve it as baseline with checked build-time hooks and use small JS/JSDoc modules — avoids losing custom math behavior.
Pre-flight: Task 2 consumes core source/link/schema interfaces; matches Task 1.
Pre-flight: Task 3 consumes capture materials and native source identifiers; matches Task 2.
Pre-flight: Task 4 consumes Host/Panel lifecycle; matches Tasks 2/3.

Task 1: complete — five initial RED core tests → GREEN; added stable repair and whole-page identity regressions. Preserved original unpacked baseline; deterministic checked build patches.
Task 2: complete — rotation/clipping/capture/reference tests RED → GREEN; original rich editor roundtrip and MathML tested in Chrome. Real PDF.js pixel tests pass for normal/rotated offscreen pages. User scan local preview inspected.
Task 3: complete — payload/stream/errors/incomplete tests RED → GREEN; browser question panel joint-material send and independent PDF sessions tested. Key owned by host session, fixed endpoint.
Task 4: code/package complete — native-boundary simulated tests RED → GREEN; readonly, menu, lifecycle verified. Actual Zotero GUI/API acceptance remains pending as explicitly documented in docs/acceptance.md; no account key available and no native UI tool.
Review: fresh read-only Astra reviewer under requesting-code-review skill. Findings fixed with regression tests: same-PDF snapshot overwrite, external reader unload, close-during-init race, new unsent draft loss, out-of-region line extraction, finish_reason:length completeness.
Ruling: retain reliable complete text-item boxes only — source line-origin filtering included text outside selected area — cost: omit partially intersecting text while image remains complete.
Ruling: per-scope shared state plus generation mutex — serialized file writes alone do not protect independent snapshots — cost: only one live generation per PDF across reader windows.
Ruling: model length truncation remains incomplete and can be saved only with explicit incomplete marker — DONE describes protocol termination, not full answer.
Ruling: skip installing into active Zotero/data directory during build delivery — neither GUI interaction nor API credentials available — cost: user performs documented real-environment acceptance.
Final verification: 29/29 tests, 0 failures, TypeScript checkJs exit 0, packaged JS syntax/resources exit 0, original SHA and baseline bytes verified. XPI SHA256 06cb1ee08bb6f19cbe40309642ea2dc62f9da783e545dd1765df62a70dd82360, 1042152 bytes. Real API and Zotero GUI explicitly unverified.

2026-10-13 installation incident: user observed 0.10.0 rejected by Zotero. Installed runtime 10.0.6 requires nonempty applications.zotero.update_url; original baseline contains it, builder removed it. Reproduced the exact error by executing the installed Extension.sys.mjs manifest guard (RED). Version 0.10.1 restores mandatory metadata with HTTPS reserved .invalid URL to retain manual update policy. No change to compatibility range, library, or installed profile. Original and rejected packages retained.

2026-10-13 reader/settings incident: reproduced actual Gecko page wrapper missing getViewport; Cu.waiveXrays exposes method. Native renderer verified from installed bundle and requires Cu.cloneInto input arrays into renderer's own global. Added explicit native preferences API fields and route all settings buttons there. RED→GREEN tests for page unwrap, native renderer clone boundary, independent preferences input and settings route. Real Zotero10.0.6 isolated smoke v4: all 5 steps passed, 1280x1200 PNG generated, panel material shown, native password entry/apply/clear passed. No actual user library/key/API request. Native screenshot visually inspected. Focused independent review found no additional actionable issues before final native clone adjustment.
