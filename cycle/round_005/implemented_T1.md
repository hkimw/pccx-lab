# Implemented — UI — Round 5

## Ticket T-1: Wire `SynthStatusCard` to `load_timing_report`

- Commit: `aa01ed5` — `feat(ui): T-1 SynthStatusCard consumes load_timing_report`
- Files touched:
  - `src/ui/src/SynthStatusCard.tsx` (+105 / −3 net +102)
- Acceptance self-check:
  - [x] `rg "load_timing_report" src/ui/src/SynthStatusCard.tsx` ≥ 1
    → **3 hits** (IPC `invoke`, doc comment, this bullet's target
    check).
  - [x] `rg "load_synth_report" src/ui/src/SynthStatusCard.tsx` ≥ 1
    → **1 hit** (utilisation half retained, not a rip-and-replace).
  - [x] `rg "TimingReport" src/ui/src/SynthStatusCard.tsx` ≥ 2
    → **6 hits** (interface decl + doc comment + state type +
    invoke generic + ClockDomain refs).
  - [x] `npx vite build` succeeds — 17.75 s, 3.87 MB main chunk,
    zero new TS errors on SynthStatusCard.tsx (pre-existing TS6133
    unused-imports on other files — CanvasView, CodeEditor,
    ReportBuilder, Timeline — are pre-existing and orthogonal to
    this ticket; stash-reverify confirmed identical list on main).
  - [x] Bottom timing section renders `<tr>` per `clock_domains[i]`
    when fixture loads; catch branch sets `err` + clears
    `timing`, showing the shared error pill rather than a blank.

## What landed

1. `import { invoke } from "@tauri-apps/api/core"` (matches the
   13-file repo-wide pattern already established in
   `Timeline.tsx`, `App.tsx`, etc.).
2. Exported TS interfaces `TimingReport` + `ClockDomain` mirroring
   `src/core/src/vivado_timing.rs:15,23` field-for-field
   (`wns_ns: f32` → `number`, `clock_domains: Vec<ClockDomain>` →
   `ClockDomain[]`). Tauri 2.0 `serde_json` serialisation carries
   this across the bridge losslessly — no DTO layer.
3. Second `useEffect` — runs on `[timingPath, autoLoad]`, guards
   against empty `timingPath`, uses a `cancelled` flag to avoid
   React-double-invocation races in StrictMode dev.
4. Shared `err: string | null` state — both the `load_synth_report`
   catch branch and the `load_timing_report` catch branch write to
   it; the existing `status.kind === "error"` pill now reads
   `err ?? status.message` so either failure path surfaces through
   one UI boundary (research-findings Gap-1 "shared error boundary"
   recommendation).
5. New timing section rendered unconditionally below the
   `status.kind === "ok"` block (so it survives even if the
   utilisation IPC fails) — UG949 §4 visual grouping:
   - Header row: WNS / TNS / failing-endpoints counter; negative
     WNS/TNS renders in `theme.error` per PrimeTime convention.
   - Per-clock-domain `<table>` with `name / period_ns / wns_ns /
     tns_ns` columns; per-cell colour gated on sign so `core_clk`
     vs `axi_clk` at the KV260 fixture's 250 MHz / 100 MHz speeds
     renders with per-clock violation context.

## Deferred

Nothing from the T-1 scope. The `App.tsx` call-site default-path
plumbing (roadmap line 22: `timingPath` default →
`hw/sim/reports/kv260_timing_post_impl.rpt`) was **out of T-1's
explicit scope** per "Scope: NO changes to `SynthStatusCard` call
sites — props stay the same." If R6 wants the default path wired
in `VerificationSuite.tsx:207`, that's a ≤ 5-LoC follow-up —
trivially additive, does not affect card contract.

## Notes

- The 10 TS6133 unused-import errors flagged by `tsc --noEmit` are
  pre-existing on `main` (confirmed via `git stash` reverify) and
  come from `CanvasView.tsx:6-10`, `CodeEditor.tsx:2,193`,
  `ReportBuilder.tsx:318,464`, `Timeline.tsx:366`. Not in T-1
  scope; parallel R5 T-2/T-3 tickets may clean them up.
- Parallel-agent drift: `src/ui/package.json` and `package-lock.json`
  have uncommitted `@monaco-editor/react` + `monaco-editor`
  additions from the T-2 Monaco agent in flight. Left alone — not
  T-1's concern.
- Net diff 102 LoC — under the 150 LoC ceiling.
