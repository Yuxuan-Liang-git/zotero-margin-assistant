# Task 5: Final native acceptance and delivery documentation

## Outcome and frozen package

Task 5 implementation, native acceptance, performance, Chinese documentation and scoped self-review are complete. Whole-branch independent review and publication remain root-owned. Branch `feat/cloud-embedding-rag-0200`, starting Task 5 HEAD `0847f1038ae7f317339ea188a764db57552d402f`. No publication, push, catalog edit, tag or user-profile operation was performed.

Final XPI: `dist/margin-comments-deepseek-0.20.0.xpi`, SHA-256 `ecea7c3bd4257f01fab6a057eb65f31856cc3613aeec56cd2a0be909b610aa7e`. Protected `dist/margin-comments-deepseek-0.19.2.xpi` remains `c271a80c487d02b6462fdb656ffc5010e6692d9744f7cd7cd2ea30bda09054ea`. The final build hash is identical to both native reports and runner verification JSON.

Owned deliverables: `scripts/cloud-rag-smoke.py`, `tests/fixtures/cloud-rag-bootstrap.js`, root-authored `scripts/benchmark-rag.cjs` (minimal 512-page alignment plus explicit pageSize reporting), `docs/2026-11-10-cloud-rag-release.md`, README, CHANGELOG and user guide. Two reproduced native issues justified the limited production edits below; no APIs, vector format, namespaces, candidate limits, thresholds, pricing choices or deadlines changed.

## Native runner, boundaries and actual APIs

`python scripts/cloud-rag-smoke.py --run-name cloud-rag-0200-native9-final` PASS. The default evidence fixture used `evidence/cloud-rag-0200-perf3-default96/synthetic-vectors.sqlite`, created earlier solely from synthetic vectors. The runner copies the final XPI into a fresh evidence directory, installs it through actual AddonManager if absent, creates a separate QA extension, and launches `C:\Program Files\Zotero\zotero.exe -headless -no-remote -profile <fresh evidence profile>` with CREATE_NO_WINDOW. It requires `phase=done`, every case ok, exact XPI hash, actual child process ID and native process exit before the next cold launch. No actual desktop, clipboard, user profile, library or private credentials were read or modified.

Native reports: `evidence/cloud-rag-0200-native9-final/report-1.json` (10/10, process 28928), `report-2.json` (8/8, process 52064), `verification.json` (passed true). Zotero 10.0.8; both processes exited. Requests with authored material: `request-1.json` and `request-2.json` beside those reports. PDF A contains CurrentDocumentAnchor, PDF B has two English pages with the damping/passivity evidence on pageIndex 1, PDF C provides a lexical fallback. B is a real native journalArticle parent + linked attachment, never a user paper and never given a chat sidecar.

Only `manager.client.fetch` is substituted for Embedding: it validates the actual POST/model/input count/UTF-8 bounds and returns native window Response objects with deterministic float vectors and actual indices/model. It maps the Chinese damping query and English damping sentence to the same axis, with unrelated material on another axis. `host.selectedClient` is substituted at the external answer-generation boundary so the real `panel.send` builds all messages without inference calls. Actual Profiles, Zotero Prefs, OSKeyStore encrypt/decrypt, independent SQLite, Store, coordinator, runtime, shipped Worker, SDT, native preferences and source navigation stay active. Fixed fixture keys are never included in reports; raw encrypted preferences are checked in memory, never printed.

Actual manager/API usage: `host.memory.embedding`, `host.settingsAPI().embedding`, `state/watch/apply/test/clearKey/setEnabled/pilot/build/pause/clearIndex`; `manager.work` is awaited for builds, `manager.runtime.constructor/createWorker` creates independent native performance runtimes. UI is loaded through `Zotero.Utilities.Internal.openPreferences('margin-comments-preferences')` and its actual pane container. IDs under `zma-embedding-`: enabled, preset, endpoint, model, key, apply, test, clear-key, pilot, build, pause, clear-index, status, max-input, batch-size, rpm, threshold. Visibility is native pane/container and DOM control validation, not a pixel screenshot assessment.

For PDF extraction, `Zotero.SDT.getPack/getReader/getCatalog/getPageBlocks` returns the actual second-page target. First-launch setup removes only the guarded optional Fulltext cache inside the isolated data directory before rebuilding through the real adapters. Cold launch does not remove caches or force rebuilds, keeping provenance authoritative. Navigation uses `host.memory.openSource` and polls the actual reader internal `primaryViewState.pageIndex===1`.

## Native cases and observed behavior

| Case | First launch | Cold launch |
| --- | --- | --- |
| Installation/start without upload; cold encrypted A key, same 7 vectors and paused task restoration | ok | ok |
| Native model/password controls, unsaved model edit survives status notifications, unsaved-action guard | ok | ok |
| UI save/test A fixed string; new B empty key isolated; B key save/test/clear; return A encrypted key and tested profile | ok | ok |
| Real SDT page-aware committed B source, same native library/parent/attachment, B history absent | ok | ok |
| Explicit pilot completed, 7 committed sources/segments, B body actually embedded | ok | prior cache restored |
| Raw Chinese question with no common literal terms includes English B page 2 in actual A request; current A body present; native source jump; no B history | ok | ok |
| Controlled offline fetch and hanging 8s fetch both preserve current A and C lexical source; explicit query cancellation and late replies ignored | ok | ok |
| Configuration change cancels unresolved connection test, late callback cannot test endpoint B, valid A vectors retained | ok | ok |
| Full synthetic native SQLite/Worker scan with default production paging | ok | first launch measurement only |
| Explicit full mode paused before restart; host.stop leaves runtime closed, Worker null, zero pending RPC/query controllers, no build/test controller | ok | ok |

Both launches query successfully while the background task is paused. No first bulk upload occurs on install/start/save/test/enable/open. The first material batch is only after explicit pilot authorization. Native corpus validation uses actual committed PDF provenance; exclusions for current PDF and active conversation remain enforced. Formal-summary noteKey/native-note qualification, draft/incomplete/pendingText/memorySources/Notion exclusion, source mutation and pilot-cohort breadth matrices remain additionally covered by the full existing integration/adapter suite; the native fixture does not claim to reproduce every matrix case.

## Reproduced failures and minimal changes

The TDD, writing-good-tests, systematic debugging and verification-before-completion instructions were applied. No speculative redesign occurred.

Native1 timed out waiting for the UI fixed-string test. The fixture initially clicked Test before the asynchronous save action settled; waiting for Test enabled removed that timing ambiguity. Native2 still failed after one fixed-string POST, proving the production client path was reached. Native3/4-red captured `EmbeddingResponseError` at `src/embedding-client.js:60`. Native4-red reported genuine response chunk `instanceof Uint8Array=false`, window Uint8Array=true, ArrayBuffer.isView=true, tag=[object Uint8Array], byteLength=5. The sandbox constructor was rejecting a real window-realm byte array.

The vm-based cross-realm regression failed with the same response error (12 pass, 1 fail; `evidence/cloud-rag-0200/task5-cross-realm-red.log`). Minimal Client fix: use the intrinsic TypedArray tag getter plus ArrayBuffer.isView to accept genuine Uint8Array across realms, rejecting other byte views, DataView and spoofed objects. Existing byte ceiling, UTF-8, model, dimension, finite-number and identity checks remain unchanged. Focused GREEN 13/13: `task5-cross-realm-green.log`. Native5 then passed actual key and SDT cases.

Native5 pilot paused when pending local-index refresh notifications arrived, matching the explicit pilot refresh policy. The fixture now lets local indexing settle before explicit pilot; no policy change. Native7 cold2 deliberately deleted cache files and rebuilt source fingerprints before asserting old vector provenance; this fixture error was corrected by leaving cold2 source caches/index untouched. Final cold2 now verifies restored sources strictly, without relaxing validation.

Native6 measured production-original page128 with fresh Worker: cold aborted at 8025ms after 341 pages, next interrupted-cache search aborted at 8008ms after 288 pages, fresh 32KiB fixture fully scanned at 7447ms. These timeout reports are preserved; intermediate runtime.stats may stay0 on abort and are not claimed as full scans. Native7-page512 used a new Runtime/Worker and passed cold7447/warm5354/tiny6662ms. The only performance production edit is Runtime's default page size128→512, still within its existing1024-row cap; candidateLimit 96, per-paper diversity, scoring,128MiB cache and8000ms deadline unchanged.

The bounded paging regression exercised a 1100-row real-Worker tail search with at most4 bounded SQLite reads; before the change it failed (13 pass/1 fail, `task5-page512-red.log`), after change14/14 passed (`task5-page512-green.log`). Existing cancellation, supersession, late callback, overflow and exact score tests also passed. Native8 ran while npm/Node performance work overlapped and hit the tiny-fixture deadline; this scheduling mistake is preserved as negative evidence, prompted no production change, and was replaced by serial uncontended final native9. No force-GC or budget extension was used.

## Final full-scale measurements

Dataset: 69,240 unique deterministic normalized float32 vectors, each 1024-dimensional. Source DB file bytes 425,766,912; actual dimension 1024, candidateLimit 96, pageSize 512. All final trials scan 69,240 and return id 69240 / score 1 from the uncached tail. (The multiplication is 69,240 rows by1024 dimensions; database bytes include SQLite and Base64.)

| Runtime and cache | Duration ms | Pages | Max heartbeat gap ms | Charged cache bytes / rows |
| --- | ---: | ---: | ---: | --- |
| Native fresh Runtime/Worker,128MiB | 7617 | 137 | 45 | 134213648 /28888 |
| Native warm same Runtime,128MiB | 5239 | 80 | 153 | 134213648 /28888 |
| Native fresh Runtime/Worker,32KiB | 6626 | 137 | 34 | 32522 /7 |
| Node fresh Runtime/Worker,128MiB | 4638 | 137 | 41 | 134213648 /28888 |
| Node warm same Runtime,128MiB | 3254 | 80 | 35 | 134213648 /28888 |
| Node fresh Runtime/Worker,32KiB | 4933 | 137 | 39 | 32522 /7 |

Final serial Node command: `node scripts/benchmark-rag.cjs cloud-rag-0200-perf5-final512` PASS, report `evidence/cloud-rag-0200-perf5-final512/report.json`, log `evidence/cloud-rag-0200/task5-node-perf-final512.log`. Node v24.14.1, setup2439ms, processMaxRss454,619,136B. Perf3-default96 remains earlier final128 evidence; perf2limit1 is diagnostic only, never used as final default evidence. Root harness is included with only page512 alignment and explicit pageSize metadata.

The native report explicitly records cold workerExistedAtStart=false and zero cache, warm=true with28888 cached rows, tiny=false/zero cache. This is fresh runtime/cache, not disk-cold SQLite/OS cache. Native parent resident before cold scan791,408,640B; sampled peaks cold1,926,230,016B, warm1,949,863,936B, tiny2,304,614,400B. This includes all allocations in the sampled Zotero parent process, not only vectors; separate content processes and unsampled peaks are outside the observation. The128MiB cache is a charged Worker retention bound, not total-process memory. No GC forcing was performed.

The maximum512-row main page estimate is5,726,208B (UTF-16 encoded strings plus scalar metadata). Structured clone can simultaneously retain an additional similarly sized Worker message page; up to512 decoded1024-float vectors add2,097,152 backing bytes if retained during page handling. Rough combined in-flight backing estimate13,549,568B excludes engine/object/allocator/SQLite overhead and retained cache. Measured total process memory is reported separately above.

All scan deadlines remain8000ms. Controlled hanging-query cases returned lexical fallback while preserving A PDF; full-panel elapsed values are in native reports (~8.2s including document preparation and rendering). Native cold kernel7617ms leaves little budget for real query embedding/network; slower devices, active workloads or cloud latency can legitimately trigger fallback. These results do not guarantee an end-to-end cloud SLA or genuine scientific relevance.

## Frozen verification, documentation and self-review

`npm test > evidence/cloud-rag-0200/task5-npm-test-final.log 2>&1` PASS503/503, failures0/cancelled0/skipped0,252271.3489ms; this command rebuilt the XPI and ran the full suite. `npm run typecheck > evidence/cloud-rag-0200/task5-typecheck-final.log 2>&1` PASS, no diagnostics. Final native9 and Node perf5 were performed serially after that suite. Whitespace check `git -c core.whitespace=cr-at-eol diff --check` clean after removing trailing test blank lines; that cleanup changed no test behavior. Hash rechecked after native and performance runs; old0.19.2 exact protected hash rechecked.

README/guide/changelog/release notes use supplied Chinese prose preferences and cover separate Key, default provider/model, explicit trial/full build, pause/restart/current PDF priority, independent vector location/derived-only clear, OCR/64MiB coverage, hours for initial large builds, source authority, three summary sections, cloud-vs-local responsibilities and real-cloud quality limits. No unrelated writing samples were retrieved. Earlier memory navigation guidance was verified against current Host/native behavior.

Self-review checked the diff scope, fresh-profile guards, report/hash binding, real native boundaries, no private data in synthetic request logs, no B sidecar, fresh/warm cache distinction, negative timeout evidence, cache-vs-total resident distinction, unmodified8s/96candidate limits, protected0.19.2 hash, accurate Chinese documentation and final suite/typecheck. Only the two documented native fixes alter production. No further speculative changes are proposed. Root should independently review this commit and whole branch before publishing assets.

## Remaining limits

No real Embedding/provider/inference request was made, and no user Key/library was accessed. Real cross-language scientific relevance, default threshold calibration, provider model behavior, billing/quota, network latency and other platforms remain unverified until the user supplies their own Key in Zotero. Native high parent resident and narrow cold-scan latency margin are disclosed; fallback remains the safety boundary. SourceZIP/catalog/checksums/release upload/download verification are intentionally root-owned follow-up deliverables.
