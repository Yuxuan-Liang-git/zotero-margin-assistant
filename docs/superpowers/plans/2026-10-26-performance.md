# 0.13.6 performance investigation

User requests testing all common workflows because Zotero sometimes freezes after installing the plugin.

1. Reproduce unnecessary observer, reference, and conversation work with bounded browser fixtures; record baseline counts and main-thread delays before changes.
2. Apply targeted fixes with regression coverage. Preserve native PDF editing, source validation, history durability, import synchronization, clipboard and scroll behavior.
3. Exercise opening/scrolling PDF, editing/saving annotations, streaming, switching/importing chats, and cold restart in an isolated Zotero profile. No live library writes or actual API requests.
4. Run the complete test suite, type check, deterministic build/archive verification; review the final changes and package 0.13.6 with measured findings and limitations.

Ownership: parent diagnoses and verifies native behavior/release; GPT-6 Luna performance_0136 handles host/observer hot paths; GPT-6 Luna stress_0136 handles conversation/stream stress and any proven bottleneck there. Baseline is immutable; this directory is not a Git checkout.

Status: implementation and review complete. Full regression 213/213 and checkJs pass; final native first launch and cold restart each pass20/20. Release/archive verification is recorded in dist/verification-report.json. Idle self-trigger loop was not reproduced. Confirmed toolbar scan/reference refresh amplification fixed; preserved late-toolbar discovery after a full-suite regression exposed that boundary. All timings are fixture measurements, not a guarantee about the user's PDFs or other plugins.
