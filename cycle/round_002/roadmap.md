# Roadmap — Round 2 — 2026-04-20

## Top 3 for THIS round (must land before next judge pass)

### T-1: Replace `DUMMY_ISA_RESULTS` + `API_ROWS` with real IPC-backed traces

- Why: Dimensions 2 (ISA, **D**) and 3 (API, **D+**) are pinned by
  sibling literals that Round-1 T-2 cherry-picked around. No grade
  lift above D is possible until `VerificationSuite.tsx` stops
  inventing data; cheapest two-dimension jump on the board.
- Files:
  - `src/core/src/isa_replay.rs` (new, ~160 LoC) — walk the `isa_pkg`
    opcode stream from a loaded `.pccx`, apply the pipeline-latency
    table, emit `Vec<IsaDiffRow { pc, op, expected_cycle,
    actual_cycle, status }>`. Minimal subset: decode + issue order;
    no reg-file model (backlog).
  - `src/uvm_bridge/src/api_ring.rs` (new, ~80 LoC) — fixed-capacity
    ring that records every `uca_*` entry/exit and flushes to the
    `.pccx` event stream.
  - `src/ui/src-tauri/src/lib.rs:522-541` — register
    `validate_isa_trace(path)` and `list_api_calls(path)` as thin
    wrappers over the above crates.
  - `src/ui/src/VerificationSuite.tsx:42-48` — delete
    `DUMMY_ISA_RESULTS`; `useEffect` → `invoke("validate_isa_trace")`.
  - `src/ui/src/VerificationSuite.tsx:383-392` — delete `API_ROWS`;
    `useEffect` → `invoke("list_api_calls")`.
  - `src/ui/src/VerificationSuite.tsx:57-72` — rip the
    `executeRegression` `setInterval` (no backing IPC).
- Acceptance:
  - `rg "DUMMY_ISA_RESULTS|API_ROWS" src/ui/src/` returns **0** hits.
  - `rg "setInterval" src/ui/src/VerificationSuite.tsx` returns **0** hits.
  - `cargo test -p pccx_core isa_replay::` passes ≥ 3 unit tests
    (empty trace, single-op trace, opcode-with-stall trace).
  - Loading `hw/sim/fixtures/smoke.pccx` in the UI populates the ISA
    table with ≥ 1 row whose `expected_cycle != actual_cycle` (proves
    data is not mocked).
  - Invoking `list_api_calls` on a fixture emits ≥ 1 `uca_*` row
    whose timestamp is within ±1 ms of the `.pccx` event stream
    timestamp for the same call (proves ring → stream fidelity).
- Citations: research_findings.md Gap 2 (Spike `--log-commits` diff
  pattern; IEEE 1800-2017 §20.14 UVM `uvm_analysis_port` mirror for
  `uca_*`).
- Owner: core + ui
- Estimated diff size: **M** (~380 LoC net — 240 Rust / 140 TSX)

---

### T-2: Implement `export_vcd` + `export_chrome_trace` IPCs (kill the stealth fake)

- Why: Judge flagged a **regression disguised as a fix**
  (`App.tsx:225-242` invokes commands missing from
  `src-tauri/src/lib.rs:522-541`; errors even cite this judge report).
  Hits dimension 7 (profile, **B-**) and dimension 1 (waveform, **C+**)
  via one export path — cheapest integrity repair on the board.
- Files:
  - `src/core/src/vcd_writer.rs` (new, ~140 LoC) — emit IEEE 1364-2005
    §18 VCD from `fetch_trace_payload` output; integration test
    asserts golden round-trip via `pccx_core::vcd::parse_vcd_file`.
  - `src/core/src/chrome_trace.rs` (new, ~90 LoC) — emit Chrome Trace
    Event Format JSON duration events per Google spec.
  - `src/ui/src-tauri/src/lib.rs:522-541` — register `export_vcd` and
    `export_chrome_trace` in `invoke_handler!`.
  - `src/ui/src/FlameGraph.tsx:85-196` — delete the 110-row Gemma
    `spans` literal; `useEffect` → `fetch_trace_payload` → parse into
    Chrome-Trace duration events (shared shape with exporter).
  - `src/ui/src/FlameGraph.tsx:41-54` — if `loadRunB` stays synthetic
    this round, gate behind `import.meta.env.DEV` and prefix toolbar
    label with "(synthetic)".
- Acceptance:
  - `rg '"export_vcd"|"export_chrome_trace"' src/ui/src-tauri/src/lib.rs`
    returns ≥ 2 hits (proves registration).
  - `cargo test -p pccx_core vcd_writer::roundtrip` passes — written
    VCD re-parses to structurally equal `TraceEvent` vec.
  - `cargo test -p pccx_core chrome_trace::schema` passes — output
    JSON validates against a minimal Chrome-Trace schema test
    (`ph`, `ts`, `dur`, `name` required on every event).
  - File → Export → `export.vcd` produces a file that loads back in
    the Waveform panel without error (manual bullet).
  - `rg "N_LAYERS = 10" src/ui/src/FlameGraph.tsx` returns **0**
    hits.
  - Dropping the exported `chrome_trace.json` into
    `https://ui.perfetto.dev` renders ≥ 1 slice (manual bullet).
- Citations: research_findings.md Gap 5 (IEEE 1364-2005 §18 VCD;
  Google Chrome Trace Event Format; Gregg, "The Flame Graph," ACM
  Queue 2018).
- Owner: core + ui
- Estimated diff size: **M** (~300 LoC net — 230 Rust / 70 TSX)

---

### T-3: `docs/getting-started.md` + accessibility pass (aria-labels + shortcut map)

- Why: Dimensions 8 (UI/UX, **B-**) and 9 (Docs, **B**) have been
  static two rounds; `aria-*` count in `src/ui/src/**` is 0 outside
  assets and no tutorial exists. Both trivially falsifiable → any
  honest effort lands points. Skipping Monaco (L-sized solo) keeps
  the round on budget while opening two new fronts.
- Files:
  - `docs/getting-started.md` (new, ~120 lines) — three-step
    walkthrough per VS Code `vscode.walkthroughs` contract: (1) run
    `hw/sim/run_verification.sh` in sibling pccx-FPGA, (2) open the
    `.pccx` + `.vcd` in pccx-lab, (3) walk one bookmark, one
    cross-coverage cell, one `detect_bottlenecks` recommendation.
    Embed 4 of the 13 existing screenshots.
  - `docs/index.rst` — add `getting-started` to toctree top.
  - `src/ui/src/useShortcuts.ts` (new, ~60 LoC) — single source for
    every `window.keydown`; exports
    `SHORTCUT_MAP: { key, description, scope }[]` consumed by a new
    `<kbd>?` help overlay.
  - `src/ui/src/**/*.tsx` — add `aria-label` to every icon-only
    `<button>` (svg-or-emoji only). Est. 40-60 buttons across
    `App`, `FlameGraph`, `WaveformViewer`, `HardwareVisualizer`,
    `VerificationSuite`, `CodeEditor`.
  - No changes to `src/core/`.
- Acceptance:
  - `docs/getting-started.md` exists, is ≥ 80 lines, contains ≥ 4
    screenshot references, and renders in the Sphinx build
    (`sphinx-build -W docs/ _build/` exits 0).
  - `rg 'aria-label' src/ui/src/ --type tsx | wc -l` ≥ **30** hits
    (up from 0).
  - `rg '<button' src/ui/src/ --type tsx` and
    `rg '<button[^>]*aria-label' src/ui/src/ --type tsx` yield a
    ratio ≥ 0.9 (≥ 90% of buttons labelled).
  - `src/ui/src/useShortcuts.ts` exports `SHORTCUT_MAP` with ≥ 10
    entries covering the existing Ctrl+B / Ctrl+F / Ctrl+Shift+D
    bindings the judge already verified.
  - Pressing `?` (or `F1`) in the running app opens a modal listing
    every `SHORTCUT_MAP` entry (manual bullet).
- Citations: research_findings.md Gap 4 (WCAG 2.2 SC 2.1.1 Keyboard;
  WAI-ARIA 1.2 §5.2.8.4 `aria-label`; ARIA APG `treegrid`; VS Code
  accessibility docs).
- Owner: docs + ui
- Estimated diff size: **M** (~280 LoC net — 120 docs / 160 TSX)

---

## Backlog (do not attempt this round)

- **Monaco + SV semantic tokens** (Gap 1) — L alone, new npm dep and
  Veridian LSP sidecar; parks at dim-8 B-.
- **HardwareVisualizer auto-layout via ELK.js** (Gap 3) — dim-5 C+
  moved +0.5 this round; waits behind T-1's `fetch_trace_payload`
  surface.
- **UCIS coverage export / trend line** — dim-4 jumped +2 to B-;
  multi-round project.
- **ASIC signoff (dim-6 F)** — no path under 400 LoC.
- **60-fps waveform perf artifact** — deferred Round 1; capture after
  T-2's `export_chrome_trace` lands.
- **FlameGraph `loadRunB` real alt-run compare** — gated synthetic
  in T-2; promote to `load_pccx_alt(path)` next round.

(Word count: ~780.)
