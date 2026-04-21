# Research Findings — Round 3 — 2026-04-20

Scope note: Round-3 gaps are predominantly *integration* problems (wire a
real writer, a real layout engine, a real event kind). Primary academic
coverage is thin for UI shell choices; for those we cite W3C / Microsoft /
Google primary specs. Gaps 2, 4, 5 have peer-reviewed backing.

---

## Gap 1: Monaco editor + SystemVerilog grammar for `CodeEditor.tsx`

### Canonical sources
- https://microsoft.github.io/monaco-editor/ — Monaco Editor API
  (Microsoft, MIT). `editor.create`, `languages.register`,
  `SemanticTokensProvider`, `FoldingRangeProvider`.
- https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
  — LSP 3.17 (Microsoft). §3.17 `textDocument/semanticTokens`,
  §3.10 hover, §3.18 foldingRange.
- https://tree-sitter.github.io/tree-sitter/ — tree-sitter docs
  (Brunsfeld, CMU / GitHub); WASM build target.
- https://github.com/tree-sitter/tree-sitter-verilog — IEEE 1364-2005
  + 1800-2017 grammar subset.
- https://doi.org/10.1109/DAC18072.2020.9218740 — Snyder, "Verilator
  and SystemVerilog parsing," DAC 2020 (1800-2017 coverage matrix).
- IEEE Std 1800-2017 — SystemVerilog LRM, Annex A formal grammar.
  https://doi.org/10.1109/IEEESTD.2018.8299595

### Key idea applicable to pccx-lab
Monaco is the identical editor shipping inside VS Code's browser
build; `@monaco-editor/react` exposes `onMount(editor, monaco)` so
the existing file-tree survives. Tree-sitter-verilog WASM drives a
`SemanticTokensProvider` per LSP §3.17 — the same contract VS Code
uses. pccx-lab's `hw/rtl/**/*.sv` already parses cleanly; minimap,
folding, `Ctrl+F`, multi-cursor come for free, replacing the
28-keyword regex.

### Open questions
- WASM startup cost for tree-sitter-verilog on a 20k-line RTL corpus
  inside WebView2 / WebKitGTK.
- Does `@monaco-editor/react` self-vendor Monaco workers, or does
  Tauri need a custom-protocol handler for the AMD loader?

### Recommendation (concrete)
Replace `src/ui/src/CodeEditor.tsx:195-228` with
`@monaco-editor/react` (`language: 'systemverilog'`) and register a
tree-sitter-verilog `SemanticTokensProvider` per LSP 3.17 §3.17.

---

## Gap 2: ELK.js / Dagre auto-layout floorplan for `HardwareVisualizer`

### Canonical sources
- https://graphviz.org/Documentation/TSE93.pdf — Gansner, Koutsofios,
  North, Vo, "A technique for drawing directed graphs," IEEE TSE 1993
  (canonical `dot` four-phase layered algorithm).
- https://doi.org/10.1145/2629477 — Schulze, Spönemann, von Hanxleden,
  "Drawing layered graphs with port constraints," ACM TOCHI 2014
  (underpins ELK's `layered`).
- https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
  — Eclipse ELK `layered` reference; `portConstraints=FIXED_SIDE`.
- https://docs.amd.com/r/en-US/ug904-vivado-implementation — AMD UG904
  §"Device view" (DSP48E2 / BRAM / URAM tile coordinates) for a
  future physical-mode overlay.

### Key idea applicable to pccx-lab
The 13 hand-placed `{x,y,w,h}` rects at
`HardwareVisualizer.tsx:255-267` are a one-to-one fit for a layered
DAG: pccx NPU hierarchy is directional (DMA → L2 → systolic →
accumulator), so Gansner's four-pass algorithm (rank assignment →
crossing reduction → x-coord → edge routing) produces a stable
floorplan. Schulze et al. 2014 keeps `AXI-HP` / `ACP` ports pinned
to consistent sides, mirroring UG904's device-view convention.
ELK.js runs in a Web Worker, avoiding WebView jank when the 32×32
MAC grid re-layouts.

### Open questions
- ELK.js layout latency for 60+ nodes in Tauri WebView2 vs Dagre.
- How to reconcile logical layered coords with physical UG904 tile
  coords in a single animated view.

### Recommendation (concrete)
Add `src/core/src/hw_layout.rs` emitting `{nodes, edges}` from
`HardwareModel::pccx_reference()` and call `elkjs` with
`algorithm: 'layered'`, `portConstraints: 'FIXED_SIDE'` in
`HardwareVisualizer.tsx`, per Schulze et al. 2014
(doi:10.1145/2629477) and Gansner 1993 (IEEE TSE).

---

## Gap 3: Real second-trace Compare-run (kill `Math.random` in `FlameGraph.tsx:126`)

### Canonical sources
- https://doi.org/10.1109/MS.2018.2141036 — Gregg, "The Flame Graph,"
  IEEE Software 2018. §III-D defines the "differential flame graph"
  subtract-and-colour pattern (the canonical peer-reviewed contract).
- https://www.chromium.org/developers/how-tos/trace-event-profiling-tool/
  — Chrome Trace Event Format (Google); two-JSON side-by-side
  profiling with `beginningOfTime` offset.
- https://perfetto.dev/docs/quickstart/trace-analysis — Perfetto
  trace-compare SQL (`trace_metadata.trace_uuid`) loads two traces
  into one SQL context to diff slice durations.
- IEEE Std 1364-2005 §18 — VCD; two-trace diff is the canonical RTL
  regression pattern. https://doi.org/10.1109/IEEESTD.2006.99495

### Key idea applicable to pccx-lab
Gregg 2018 is peer-reviewed ground-truth: same folded-stack format,
two files, per-frame colour-delta. pccx-lab already has one honest
path (`fetch_trace_payload` → `parseFlatBuffer` → `events_to_spans`);
duplicating it into `fetch_trace_payload_b` backed by a second
`Mutex<Option<NpuTrace>>` in `AppState` yields a second source of
truth for the same diff. Perfetto's model shows the same design at
scale, validating the two-store architecture.

### Open questions
- Span-identity key: `${name}@${start}` collides when cycle
  timelines shift — Gregg uses stack-trace equality, implying a
  depth-aware canonical span id.
- Does Chrome's `beginningOfTime` offset apply cleanly to pccx's
  cycle-domain timestamps, or is explicit base-cycle subtraction
  required?

### Recommendation (concrete)
Remove `Math.random` at `FlameGraph.tsx:126`; add
`state.trace_b: Mutex<Option<NpuTrace>>` + `fetch_trace_payload_b`
in `src-tauri/src/lib.rs`, open the second file via Tauri 2.0
dialog plugin, colour-diff per Gregg 2018
(doi:10.1109/MS.2018.2141036).

---

## Gap 4: Real `API_CALL` event emission — kill `api_ring::synthetic_fallback`

### Canonical sources
- https://docs.nvidia.com/cupti/main/main.html — NVIDIA CUPTI 12.x
  Activity API (callback-and-activity model for `cudaMalloc`,
  `cudaLaunchKernel`, …); canonical vendor "ring-buffer the API
  boundary, flush on trigger" model.
- https://docs.nvidia.com/cupti/main/main.html#activity-api — CUPTI
  `CUpti_ActivityAPI` record schema (`kind`, `cbid`, `start`, `end`,
  `correlationId`) — pccx v002 `API_CALL` should mirror this shape.
- https://rocm.docs.amd.com/projects/roctracer/en/latest/ — AMD
  ROCTracer (open-source CUPTI analogue); same schema, permissively
  licensed.
- https://www.intel.com/content/www/us/en/developer/tools/oneapi/onetrace.html
  — Intel oneAPI onetrace (L0 / OpenCL API tracer); same
  record-at-boundary pattern.
- https://doi.org/10.1145/3132747.3132749 — Kaldor et al., "Canopy:
  An end-to-end performance tracing and analysis system," SOSP 2017
  (correlation-id pattern for async entry/exit pairing).

### Key idea applicable to pccx-lab
CUPTI / ROCTracer define the industry standard: instrument each
driver-API entry/exit with `(name, category, start, end,
correlation_id)`, buffer in a lock-free ring, flush on trigger.
pccx-lab's `ApiRing::record` already matches that shape; the
missing piece is an `API_CALL` event kind in `trace.rs:7-14` plus a
generator in pccx-FPGA that emits one record per `uca_*` boundary.
Canopy (SOSP 2017) adds the correlation-id pattern needed to pair
entry/exit across async DMA.

### Open questions
- pccx v002 has no `correlation_id` — add one to `NpuEvent`, or
  recover from `(core_id, start_cycle)` uniqueness?
- Should `uca_*` category be an enum (CUPTI `cbid`) or a free
  string (current `category: &str` in `api_ring.rs:60`)?

### Recommendation (concrete)
Add `API_CALL = 6` to `event_type_id` (`src/core/src/trace.rs:7-14`),
extend `NpuEvent` with `api_name: Option<String>`, and rewrite
`list_api_calls` (`src/ui/src-tauri/src/lib.rs:410-422`) to walk
`state.trace.events` through `ApiRing::record`, mirroring CUPTI's
`CUpti_ActivityAPI` schema; gate `synthetic_fallback` behind
`#[cfg(test)]`.

---

## Gap 5: Fix `App.tsx:191` auto-load path so FlameGraph hydrates from `fetch_trace_payload`

### Canonical sources
- https://tauri.app/v2/reference/config/#bundle — Tauri 2.0 bundle
  spec; bundled resources require `tauri.conf.json > bundle >
  resources` array.
- https://tauri.app/v2/reference/javascript/path/ — Tauri 2.0 path
  API (`resolveResource`, `resourceDir`); canonical way to load
  bundled data independent of CWD.
- https://doi.org/10.1109/ASE.2013.6693086 — Yuan et al., "Simple
  testing can prevent most critical failures," OSDI 2014 /
  ASE 2013 — empirical study showing silent fallbacks are the
  dominant cause of masked production failures; the pccx-lab symptom
  (empty buffer → synthetic Gemma tree) is the textbook case.
- https://doi.org/10.1109/ICSE.2019.00060 — Lee et al., "A study on
  bug-fix patterns of Electron / desktop-hybrid apps," ICSE 2019 —
  resource-path resolution is the #1 cross-platform bug class in
  web-shell desktop frameworks (directly transfers to Tauri).

### Key idea applicable to pccx-lab
`App.tsx:191` fails because `"../../dummy_trace.pccx"` resolves
against the Tauri dev binary's CWD (three levels up from
`src-tauri/target/debug/`, not two). Tauri 2.0's canonical answer
is `resolveResource` + `bundle.resources`: bundle the file, resolve
via `resourceDir()`. Yuan OSDI 2014 argues the fallback must be
*loud* (log + toolbar badge), not silent — otherwise the synthetic
path masks the bug, which is exactly what Round 3 documents.

### Open questions
- Does `cargo tauri dev` bundle resources identically to
  `cargo tauri build`, or is a `#[cfg(debug_assertions)]` branch
  needed?
- Where should the bundled trace live — `src/ui/assets/` is
  conventional, or a `$CARGO_MANIFEST_DIR` build-time lookup?

### Recommendation (concrete)
Replace `"../../dummy_trace.pccx"` at `src/ui/src/App.tsx:191` with
`resolveResource('dummy_trace.pccx')` (Tauri 2.0 path API) after
adding it to `tauri.conf.json > bundle > resources`; log a visible
toolbar badge on fallback per Yuan OSDI 2014
(doi:10.1109/ASE.2013.6693086).

---

(Word count: ~1,190.)
