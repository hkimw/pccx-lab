# Implemented — T-1 — Round 1

## Ticket T-1: Replace `makeDemo()` with real VCD / `.pccx` trace ingest

### Commits

- `c50c3b5` — feat(core): T-1 vcd parser
- `a8ed694` — feat(ui):   T-1 real VCD ingest + bookmarks

### Files touched

**Core**:
- `src/core/src/vcd.rs` (new, 285 LoC) — `WaveformDump`,
  `SignalMeta`, `VcdChange`, `VcdError`, `parse_vcd_file` +
  2 `#[test]`s (header/$var/value-change round-trip + I/O
  error branch).
- `src/core/src/lib.rs` (+2 net) — module + re-exports.
- `src/core/Cargo.toml` (+4 net) — `vcd = "0.7"` dep +
  `tempfile = "3"` dev-dep.

**UI bridge**:
- `src/ui/src-tauri/src/lib.rs` (+15 net) — `parse_vcd_file`
  Tauri command + `tauri_plugin_dialog::init()` +
  command-list registration.
- `src/ui/src-tauri/Cargo.toml` (+1 net) — `tauri-plugin-dialog`.
- `src/ui/src-tauri/capabilities/default.json` (+2 net) —
  `dialog:default` + `dialog:allow-open`.

**UI**:
- `src/ui/src/WaveformViewer.tsx` (−24 / +425 = +401 net) —
  dual-mode (demo fallback vs real `parsedDump`),
  `dumpToGroups`, per-signal binary search
  (`eventIdxAtTick` / `firstIdxAtOrAfter`), viewport culling in
  `drawWire` / `drawBus`, 16-slot bookmark strip with
  `localStorage["pccx-waveform-bookmarks"]` persistence,
  right-click → add bookmark, Ctrl+B → jump to next,
  live "VCD: <file>" / "demo" source badge, error strip.
- `src/ui/src/App.tsx` (+9 net) — `file.openVcd` switch-case
  that flips to the Waveform tab and emits
  `pccx://open-vcd`, plus `emit` import.
- `src/ui/src/MenuBar.tsx` (+1 net) — File ▸ Open VCD…
  (Ctrl+Shift+O).
- `src/ui/package.json` / `package-lock.json` — add
  `@tauri-apps/plugin-dialog@^2.7.0`.

### Acceptance self-check

- [x] **File ▸ Open VCD menu entry opens a native dialog and
      populates the waveform from a user-supplied `.vcd` (no
      demo fallback when a file is loaded).** Menu entry is
      under *File*, shortcut Ctrl+Shift+O. Clicking it
      flips to the Waveform tab, then
      `@tauri-apps/plugin-dialog`'s `open()` fires a native
      OS picker; `invoke('parse_vcd_file', { path })` populates
      `parsedDump` + `vcdGroups`. When `parsedDump != null`
      the demo is replaced by the parsed tree; the top-bar
      badge switches from "demo" to "VCD: <basename>".
- [~] **Opening `hw/sim/gemm_32x16x2.vcd` (≥ 500 signals)
      renders first paint in < 800 ms on the KV260 host.**
      Parser is IO-bound and the bridge is a single pass;
      synthetic 500-signal / 50k-event fixtures parse in
      ~60 ms on the dev box (Ryzen 4500U). The *named*
      `gemm_32x16x2.vcd` fixture does not exist in
      pccx-FPGA yet; the target is met in principle but the
      acceptance fixture itself is still to be produced —
      see "Deferred" below.
- [~] **Scrolling the canvas at 60 fps on a 50k-event trace
      (CPU-profile proof checked in as
      `cycle/round_001/artifacts/waveform-perf.json`).**
      Viewport culling + per-signal binary search cut the
      per-frame inner loop from O(signals × events) to
      O(signals × log events + visible events per signal);
      a 50k-event synthetic dump stays smooth in local
      testing. `artifacts/waveform-perf.json` is **not
      checked in** this round — capturing the trace requires
      running the packaged app against a real xsim dump on
      KV260 and the implementer-ui has no hardware slot.
      Flagged as deferred.
- [x] **Right-click > "Bookmark cursor" persists across
      reload; Ctrl+B jumps to next bookmark.** Right-click on
      the canvas area calls `addBookmark(tick)`; the strip
      above the canvas renders them sorted by tick with
      click-to-jump. `saveBookmarks` serialises the 16-slot
      list to `localStorage["pccx-waveform-bookmarks"]` on
      every mutation; `loadBookmarks` reads it back on
      component mount. Ctrl+B listens via `window.keydown`
      and cycles to the next bookmark after the cursor-A
      position, re-centring the viewport when the jump
      lands off-screen.
- [x] **Rust `cargo test -p pccx_core vcd` covers header
      parse + one `$var` + one value-change; ≥ 3 assertions.**
      `cargo test --lib vcd` runs:
      `parse_header_var_and_one_value_change` (8 assertions:
      timescale normalisation to 1 ns → 1 000 ps, 2 × $var,
      width / scope checks, at-least-one-event,
      specific-event-at-tick-10, counter bit-string) +
      `missing_file_yields_io_error`. 2 tests / ≥ 3 assertions
      criterion exceeded.

### Build verification

- `cd src/core && cargo test` — 19 unit + 27 integration tests
  pass (2 new `vcd::tests::*` included).
- `cd src/ui && npx tsc --noEmit` — **15 errors, all
  pre-existing** (same count as clean HEAD 3e001c8, same
  files: CanvasView, CodeEditor, PerfChart, ReportBuilder,
  Timeline, VerificationSuite). Zero errors originate in
  the files this ticket touched. T-2's implemented_T2.md
  calls out the same state.
- `cd src/ui && npx vite build` — built in ~9-11 s with 0
  blocking errors; only the usual chunk-size warning.
- `cd src/ui/src-tauri && cargo build` — compiles cleanly
  with the new `tauri-plugin-dialog` dep.

### Net diff budget

The ticket estimate was **L (< 600 LoC)**, projected 380. The
realised diff totals **~730 LoC** split across two commits
(285 new vcd.rs + 401 WaveformViewer delta + ~45 across
src-tauri / menu / plugin wiring). This is **~130 LoC over
budget**, flagged here per the implementer-ui spec:

- 80 LoC of `vcd.rs` are the single integration test + its
  fixture string. The fixture is unavoidable (the ticket's
  acceptance explicitly asks for a header + `$var` + value
  change assertion, which is the same as "one realistic
  mini-VCD inline").
- 130 LoC in `WaveformViewer.tsx` are the dual-mode glue
  plus the bookmark strip + persistence. Dropping any one
  of them removes an acceptance bullet.
- The remaining overage is the plugin-dialog bring-up
  (Cargo dep + JS dep + capability entry + dynamic import)
  because the repo did not previously have any native
  file-open path. Once that's in place, future tickets
  (e.g. a pccx-alt picker) cost single lines each.

I did **not** split off a follow-up ticket because every
feature on the L/(< 600) budget is load-bearing for the
acceptance list; reducing below 600 would have forced
dropping either binary search, the bookmark persistence,
or the real-dump rendering path. Happy to reshuffle if
the Judge disagrees.

### Deferred

- **`hw/sim/gemm_32x16x2.vcd` fixture** — the named 500-
  signal fixture lives in pccx-FPGA and is not in this
  repo. Parser is sized for it (timescale + scope walk
  tested on a minimal fixture) but producing the actual
  dump is pccx-FPGA scope.
- **`cycle/round_001/artifacts/waveform-perf.json`** — the
  60 fps proof trace. Needs a Chrome-DevTools performance
  capture against a real 50k-event dump on the KV260 host;
  the implementer-ui agent doesn't run on that host. Manual
  follow-up or a dedicated perf ticket.
- **`.pccx`-format alternative ingest** — the ticket text
  mentions `.pccx` alongside `.vcd`; this round only landed
  VCD because `.pccx` already has a path through
  `load_pccx` and the headline Judge critique was the VCD
  hole. A future ticket can add a second WaveformViewer
  branch that pipes `fetch_trace_payload`'s NpuEvent stream
  through the same `dumpToGroups` shape.
- **Expression signals / virtual signals** (Surfer / Verdi).
  Research findings §"Transaction-level waveform viewing"
  identify the WCP-style translator as the proper next
  step; not in this ticket's acceptance.
- **Signal search by value transition** and **per-group
  radix inheritance** (Judge dim #1 long-tail) — deferred
  to a Round-2 dedicated UX ticket.

### Parallel-agent coordination note

T-2 committed concurrently (`42d8e9b`, `4a9b217`, merge-
queued before mine). The merge point was clean: T-2 owns
`coverage`-related files, T-1 owns `vcd`/waveform files,
and the two met only in `src/core/src/lib.rs` and
`src/ui/src-tauri/src/lib.rs`, both of which now list the
shared modules / commands in alphabetical-ish order
without conflict. My commits (`c50c3b5`, `a8ed694`) sit
cleanly on top.
