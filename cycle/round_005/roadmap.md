# Roadmap — Round 5 — 2026-04-20

## Top 3 for THIS round (must land before next judge pass)

### T-1: Wire `SynthStatusCard` to `load_timing_report` (close R4 T-2)

- Why: Judge R-5 Top-5 #1, Dim-6. `vivado_timing.rs` parser landed
  R4 with 4 tests, but `SynthStatusCard.tsx:72` still invokes
  `load_synth_report`; `implemented_T2.md:53-55` deferred the UI
  consumer. Cheapest grade bump: Dim-6 D → C without a parser line.
- Files:
  - `src/ui/src/SynthStatusCard.tsx` (~120 LoC) — add second
    `useEffect` calling `tauriInvoke<TimingReport>("load_timing_report",
    { path: timingPath })`; split render into top "Utilisation"
    grid (keeps `load_synth_report`) and bottom "Timing" block
    rendering `domains[]` (per-clock `wns/tns/failing_endpoints`)
    + `worst_endpoint` row. UG949 §4 visual grouping.
  - `src/ui/src/SynthStatusCard.tsx` — export `TimingReport`
    interface mirroring `vivado_timing::TimingReport` at
    `src/core/src/vivado_timing.rs:15`.
  - `src/ui/src/App.tsx` (~15 LoC) — plumb `timingPath` default
    to `hw/sim/reports/kv260_timing_post_impl.rpt` (fixture from
    R4 T-2); loud-fallback "N/A" pill on `rejected` per R4
    `(synthetic)` pattern.
- Acceptance:
  - `rg "load_timing_report" src/ui/src/SynthStatusCard.tsx` ≥ 1.
  - `rg "load_synth_report" src/ui/src/SynthStatusCard.tsx` ≥ 1
    (utilisation half retained; not a rip-and-replace).
  - `rg "TimingReport" src/ui/src/SynthStatusCard.tsx` ≥ 2
    (interface + state type).
  - `npx vite build` succeeds with zero new TS errors.
  - Bottom half renders at least one `<tr>` per clock domain when
    fixture loads; error branch shows "N/A" not blank.
- Citations: research_findings.md
  **"SynthStatusCard migrates to `load_timing_report`"** (Tauri 2.0
  `invoke` + UG906 / UG949 timing-summary column layout).
- Owner: ui.
- Estimated diff size: S (~150 LoC).

### T-2: Monaco editor migration — retire the 4-round regex tokenizer

- Why: Judge R-5 Top-5 #2, Dim-8. `CodeEditor.tsx:196 SV_KEYWORDS`
  + `:205 HighlightedCode` + `:284 setInterval` are R2-era
  placeholders flagged in R3, R4, R5. 4-round backlog is a
  credibility tax vs VS Code / JetBrains. Monarch DFA is entirely
  client-side (no LSP, no WASM). Dim-8 B → B+.
- Files:
  - `src/ui/package.json` (~4 LoC) — add `@monaco-editor/react@^4.7`
    + `monaco-editor@^0.52` to `dependencies`.
  - `src/ui/src/CodeEditor.tsx` (~-140 / +230 LoC net +90) —
    replace `HighlightedCode` (`:205`) + `SV_KEYWORDS` (`:196`) +
    fake `setInterval` simulation (`:284`) with a
    `<Editor language="systemverilog" theme="vs-dark" onMount={…}>`
    mount. `onMount` registers the Monarch grammar once via
    `monaco.languages.register` + `setMonarchTokensProvider`.
  - `src/ui/src/monarch_sv.ts` (new, ~150 LoC) — Monarch
    `IMonarchLanguage` with IEEE 1800-2017 §B keyword table
    (module/endmodule/always_ff/logic/typedef/…), operator set,
    numeric-literal rule `'[bhodBHOD][0-9a-fA-F_xzXZ?]+`, line +
    block comments, string escapes. Distilled from
    `tree-sitter-verilog/grammar.js`.
  - `src/ui/vite.config.ts` (~10 LoC) — `optimizeDeps.include:
    ['monaco-editor']` + `worker: { format: 'es' }` so the Monaco
    web-worker bundles under Tauri's `asset://` origin (research
    finding open-question #1).
- Acceptance:
  - `rg "@monaco-editor/react" src/ui/package.json` ≥ 1.
  - `rg "HighlightedCode|SV_KEYWORDS" src/ui/src/CodeEditor.tsx`
    → 0.
  - `rg "monaco\\.languages\\.setMonarchTokensProvider"
    src/ui/src/monarch_sv.ts` ≥ 1.
  - `npx vite build` succeeds (Monaco adds ~2 MB to bundle but
    tree-shakes).
  - Ctrl+F opens Monaco's built-in find widget in the editor
    (observable at runtime — judge can spot-check dev build).
- Citations: research_findings.md
  **"Monaco editor migration for `CodeEditor.tsx` — 4-round debt"**
  (Monarch DFA guide + IEEE 1800-2017 §B + tree-sitter-verilog).
- Owner: ui.
- Estimated diff size: L (~380 LoC net).

### T-3: Finish Math.random|Math.sin dragnet — 9 → ≤ 2 via `useLiveWindow`

- Why: Judge R-5 Top-5 #3, Dim-7. R4 cut 20 → 9 but the tail is
  the visible half: Waveform p_accum, Timeline durations,
  ReportBuilder util grid, ExtensionManager install bar, + Canvas/
  HardwareVisualizer pulses. Shared `useLiveWindow` hook
  centralises the R4 IPC so future UI churn can't re-seed RNGs.
- Files:
  - `src/ui/src/hooks/useLiveWindow.ts` (new, ~60 LoC) —
    `useSyncExternalStore` adapter per React 18 docs; subscribes
    to a module-level `LiveWindowStore` that polls
    `invoke("fetch_live_window", { fromCy, toCy })` at 500 ms
    cadence and fan-outs to subscribers. Returns
    `{ sample, synthetic }`.
  - `src/ui/src/WaveformViewer.tsx` (~30 LoC) — replace `:132,134`
    `Math.floor(Math.random() * 512)` with `sample.waveform[c % 64]`;
    when `synthetic`, show R4-pattern `(synthetic)` pill in header.
  - `src/ui/src/Timeline.tsx` (~30 LoC) — replace `:86,88`
    `[300,200,150,80,50][tid-1] + Math.floor(Math.random()*100)`
    with deterministic bucket reduction from `sample.events_per_tid`;
    add empty-state overlay (FlameGraph R4 pattern) when reducer
    returns 0 spans.
  - `src/ui/src/ReportBuilder.tsx` (~15 LoC) — replace `:105`
    `30 + Math.random() * 60` with `sample.mac_util * 100`.
  - `src/ui/src/ExtensionManager.tsx` (~10 LoC) — replace `:55`
    `current + 4 + Math.random() * 6` with fixed `current + 20`
    (Yuan 2014 deterministic fixture).
  - `src/ui/src/CanvasView.tsx` (~15 LoC) — keep `:165,171`
    `Math.sin` pulses but gate with `animated={isPlaying}` guard +
    inline `// ornamental — W3C WAAPI` comment per research finding
    pattern 3.
  - `src/ui/src/HardwareVisualizer.tsx` (~10 LoC) — same `isPlaying`
    guard on `:486` busy-dot pulse; annotate ornamental.
- Acceptance:
  - `rg "Math.random|Math.sin" src/ui/src` ≤ 2 (residuals:
    CanvasView ornamental pulses, gated on `isPlaying`).
  - `rg "Math.random" src/ui/src` → 0.
  - `rg "useLiveWindow" src/ui/src` ≥ 4 (Waveform + Timeline +
    ReportBuilder + hook itself).
  - `rg "useSyncExternalStore" src/ui/src/hooks/useLiveWindow.ts`
    ≥ 1.
  - `npx vite build` succeeds.
- Citations: research_findings.md
  **"Finish Math.random|Math.sin dragnet (9 → ≤ 2)"** (React 18
  `useSyncExternalStore` + Perfetto loud-fallback + Yuan OSDI 2014).
- Owner: ui.
- Estimated diff size: M (~250 LoC net).

## Backlog (do not attempt this round)

- **Real `pccx_cli` benchmark (judge R-5 Top-5 #4)** — deferred
  to R6 T-4; blocked on pccx-FPGA CLI `--workload` schema audit.
- **`LICENSE_SCOPE.md` (judge R-5 Top-5 #5)** — deferred to R6
  T-5; docs-only ~200 LoC, parked while R5 slots are code-heavy.
- **`hw_layout.rs` emitter (Dim-5, 2-round ghost)** — cleanup,
  not grade lift; revisit post-Monaco.
- **Dim-2 ISA reg-file / pipe-stage UI** — needs Whisper reg-file
  dump research round first.
- **FlameGraph hover `api_name` tooltip (Dim-3 residual)** —
  30-LoC polish; fold into R6 if budget allows.
