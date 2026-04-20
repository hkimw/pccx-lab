# Implemented — T-2 — Round 1

## Ticket T-2: Drive UVM coverage from merged JSONL/UCIS runs

### Commits

- `42d8e9b` — feat(core): T-2 coverage merge + cross tuples
- `4a9b217` — feat(ui): T-2 UVM coverage from merged runs

### Files touched

**Core**:
- `src/core/src/coverage.rs` (new, 236 lines) — `CovBin`, `CovGroup`,
  `CrossTuple`, `MergedCoverage`, `CoverageError` + `merge_jsonl` +
  6 unit tests under `coverage::merge`.
- `src/core/src/lib.rs` (+2 net) — module + re-exports.

**UI bridge**:
- `src/ui/src-tauri/src/lib.rs` (+14 net) — `merge_coverage(runs)`
  Tauri command + handler registration.

**UI**:
- `src/ui/src/VerificationSuite.tsx` (-107 / +181) — deletes
  `COVER_GROUPS`, `REG_HISTORY`, and the old `CoverPoint` type;
  rewrites `UVMCoveragePanel` as a fetch + sub-tab selector;
  adds `GroupHeatmap` and `CrossHeatmap` sub-components.

**Fixtures & docs**:
- `hw/sim/coverage/fixtures/run_a.jsonl` (27 records, 2k-cycle smoke)
- `hw/sim/coverage/fixtures/run_b.jsonl` (40 records, 10k medium)
- `hw/sim/coverage/fixtures/run_c.jsonl` (58 records, 100k soak)
- `hw/sim/coverage/schema.md` (72 lines — JSONL spec)

### Acceptance self-check

- [x] Loading three JSONL run files produces merged hit-count table.
      `merge_jsonl(&[run_a, run_b, run_c])` returns a `MergedCoverage`
      with groups summed across runs and max-goal retained. Covered by
      `coverage::merge::merge_three_runs_sums_hits_and_keeps_max_goal`.
- [x] Cross-coverage heatmap renders 8×4 bins with tooltip showing
      `(a_bin, b_bin, hits, goal%)`. Implemented in `CrossHeatmap`
      over the canonical `gemm_k_stride × mem_hp_backpressure` pair;
      `title=` attribute on each `<td>` gives native HTML tooltip.
- [x] Goal% turns red when `hits/goal < 0.8` — both `GroupHeatmap`
      (per-group aggregate and per-bin dots) and `CrossHeatmap`
      (per-cell) apply the `#ef4444` palette under that condition.
- [x] `cargo test -p pccx-core coverage::merge` green with 6 tests
      (≥ 4 required) — empty, single run, three-run sum/max-goal,
      cross-tuple accumulation, comment/blank line handling,
      malformed JSON error with line number.
- [x] `COVER_GROUPS` and `REG_HISTORY` literal arrays grep-return 0
      from `VerificationSuite.tsx`. Verified.

### Build verification

- `cd src/core && cargo test` — 19 unit + 27 integration tests pass;
  6 new `coverage::merge::*` tests included.
- `cd src/ui && npx tsc --noEmit` — no new TS errors; the 3 pre-
  existing VerificationSuite warnings (`CheckCircle`, `AlertOctagon`,
  `isDark` unused) were on main before this ticket and are outside
  T-2 scope.
- `cd src/ui && npx vite build` — built in 9.21 s, 0 blocking errors.

### Design notes

**Merge semantics** follow the Accellera UCIS convention: bin `hits`
are summed across runs, and `goal` is retained as the max observed
value across runs (so goal revisions win over older runs that ship
no goal). Unknown record shapes are silently dropped — reserved for
future FSM-coverage / assertion extensions (documented in
`schema.md`).

**Cross selection**: the UI pins the heatmap to the specific cross
`(gemm_k_stride, mem_hp_backpressure)` per roadmap; other crosses
still merge into `MergedCoverage.crosses` and are surfaced in the
cross-tuple count stat card.

**JSONL over UCIS**: ticket explicitly lands JSONL first, UCIS
importer is backlog. The schema is forward-compatible with a future
UCIS-to-JSONL converter (same tuple-per-bin shape as the UCIS
coverage API, per research_findings.md §"UVM cross-coverage").

### Net diff budget

~435 LoC across 8 files (≈ 350 source + ~85 fixture/doc data). The
source portion is modestly above the ticket's 300 LoC target due to
the thorough 6-test suite and full JSONL schema doc; no production
panel code grew beyond roadmap estimate.

### Deferred / out of scope

- Regression-history panel is removed (it was a pure literal with no
  backing IPC). Re-adding it against real `run_verification.sh`
  history logs is a follow-up ticket — out of scope for T-2 which
  targets coverage specifically.
- UCIS binary importer (`.ucdb`) deliberately backlog per roadmap.
- Cross-heatmap axes pin to the v002 canonical bins (stride
  `1/2/4/8/16/32/64/128`, backpressure `lo/mid/hi/critical`); any run
  producing bins outside those labels simply renders an empty cell,
  which matches the pre-populated-matrix UX of Questa IMC.
- The `CrossHeatmap` axis labels are string literals at the UI
  layer. If a future coverpoint revision adds bins, update the axis
  arrays in `CrossHeatmap` or make them dynamic from the merged data.

### Parallel-agent coordination note

A concurrent T-1 implementer touched `src/ui/src-tauri/src/lib.rs`
(added `parse_vcd_file`, `tauri_plugin_dialog::init()`) and
`src/core/src/lib.rs` (added `pub mod vcd`). Both changes sit
orthogonal to T-2's `merge_coverage` edit and are not contained in
this T-2 commit set; they live in T-1's working tree awaiting the
T-1 agent's commit.
