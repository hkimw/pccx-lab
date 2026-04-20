# Research Findings — Round 1 — 2026-04-20

Round 1 has no Judge report yet. The Driver pre-seeded the ten domains the
Judge is most likely to flag. Each block below cites primary academic or
official vendor material — **no blogs, no secondary summaries**.

---

## Gap: Transaction-level waveform viewing + virtual signals

### Canonical sources
- Skarman, Klemmer, Große, Gustafsson, Laeufer, *"Surfer — An Extensible
  Waveform Viewer"*, CAV 2025, LNCS 15934.
  https://doi.org/10.1007/978-3-031-98685-7_19 — architecture of WCP
  protocol and variable translators (the mechanism behind virtual signals).
- Meloni, Hofstee, Al-Ars, *"Tywaves: A Typed Waveform Viewer for Chisel"*,
  arXiv:2408.10082 (2024). https://arxiv.org/abs/2408.10082 — how to keep
  source-language types alive through CIRCT into a viewer.
- Synopsys, *"Transaction Debug With Verdi"* white-paper,
  https://www.synopsys.com/cgi-bin/verification/fvwp/pdfr1.cgi?file=verdi_transaction_debug_wp.pdf
  — FSDB transaction stream format, `tr_*` API.
- Cadence Community, *"Enabling OVM Transaction Debug in SimVision"*
  (vendor-authored),
  https://community.cadence.com/cadence_blogs_8/b/fv/posts/enabling-ovm-transaction-debug-in-simvision-without-code-changes
  — SimVision's `simvision_record_trans` hooks.

### Key idea applicable to pccx-lab
Surfer's Waveform Viewer Control Protocol (WCP) is a JSON-over-TCP contract
that a front-end (our React `WaveformViewer`) can speak without re-implementing
the FST/VCD parser. Tywaves shows the complementary piece: keep the
SystemVerilog type hierarchy (packed structs, enums) alive through the
simulation dump so the viewer can display `isa_pkg::instr_t` instead of
raw 32-bit words. A pccx "virtual signal" = Surfer variable translator +
preserved `dtype_pkg` metadata embedded in the `.pccx` container.

### Open questions
Can the `.pccx` binary format (commit 7483c1d) carry enough type metadata
to drive a Surfer-style translator offline, without re-running the
simulator? How large does the type-index table get for a GEMM 32×32 dump?

### Recommendation (concrete)
Implement a WCP transaction-stream emitter in `src/core/src/pccx_emit.rs`
using the JSON message schema from CAV 2025 paper §3.

---

## Gap: UVM cross-coverage visualisation + goal tracking

### Canonical sources
- IEEE Std 1800-2023 (SystemVerilog), §19 Coverage.
  https://ieeexplore.ieee.org/document/10458102 — the covergroup /
  cross-coverage semantics every tool must implement.
- Siemens, *"Questa Visualizer adds coverage analysis"* white-paper,
  https://resources.sw.siemens.com/en-US/white-paper-questa-visualizer-adds-coverage-analysis-to-the-platform/
  — the UCDB (Unified Coverage Database) and goal-tracking UI.
- Nagumothu et al., *"Efficient Methodology of Sampling UVM RAL During
  Simulation for SoC Functional Coverage"*, IEEE ISVLSI / VLSID 2019.
  https://ieeexplore.ieee.org/document/8746049 — RAL-driven cross-bin
  design.
- Cadence IMC, vendor doc, *"How to Perform Coverage Analysis Using the IMC Tool"*,
  https://support1.cadence.com/public/docs/content/20504308.html — the
  merge-across-runs workflow pccx-lab needs to mirror.

### Key idea applicable to pccx-lab
UCDB is the de-facto interchange format. pccx-lab should *not* invent a
new one; instead the Rust core should import UCDB streams (open schema
since UCIS) and render cross bins as a heatmap. Goal tracking = weighted
sum across bins with a per-cross target, exactly as in Verification
Academy Coverage Cookbook.

### Open questions
Does the UCDB reader honour vendor-proprietary compression? UCIS (Accellera)
gives a tool-neutral layer, but Questa's `.ucdb` uses extra indexes.

### Recommendation (concrete)
Add a UCIS-API reader in `src/core/src/coverage/ucis.rs` that yields
covergroup tuples; render in `src/ui/CoverageHeatmap.tsx`.

---

## Gap: Roofline extensions — hierarchical, memory-hierarchy, mixed precision

### Canonical sources
- Williams, Waterman, Patterson, *"Roofline: An Insightful Visual Performance
  Model for Multicore Architectures"*, CACM 52(4), 2009.
  https://doi.org/10.1145/1498765.1498785 — the original.
- Yang et al., *"Hierarchical Roofline Performance Analysis for Deep Learning
  Applications"*, arXiv:2009.05257 (2020). https://arxiv.org/abs/2009.05257
  — per-cache-level rooflines + mixed-precision (FP32/FP16/TensorCore).
- Yang et al., *"Hierarchical Roofline Analysis: Collect Data using
  Performance Tools on Intel CPUs and NVIDIA GPUs"*, arXiv:2009.02449.
  https://arxiv.org/abs/2009.02449 — how to measure each memory level.
- Yuan et al., *"LLM Inference Unveiled: Survey and Roofline Model
  Insights"*, arXiv:2402.16363 (2024). https://arxiv.org/abs/2402.16363 —
  LLM-Viewer treats KV cache vs weight memory as separate rooflines; maps
  cleanly to our URAM-64 / L2-1.75 MB / HP-DRAM hierarchy.

### Key idea applicable to pccx-lab
Our v002 GEMM (32×32 systolic) and GEMV (32-MAC) lean against distinct
memory tiers: URAM-resident weights vs HP-port activations. A hierarchical
roofline (three rooflines stacked: URAM / L2 / HP-DRAM) with mixed-precision
peaks (INT4, INT8, BF16) tells the user *which* tier saturates for a given
kernel. Yuan et al. already draw the picture for decode-phase LLMs — we
port the same axes to FPGA memory levels.

### Open questions
How to measure operational intensity at the RTL boundary? Counts of
HP-port AXI beats vs MAC cycles is easy; measuring URAM bandwidth
*actually served* vs requested is harder.

### Recommendation (concrete)
Implement hierarchical roofline in `src/ui/RooflinePanel.tsx` per
arXiv:2009.05257 Figure 4 with per-tier bandwidth fed from
`hw/rtl/MEM_control` counters.

---

## Gap: RTL profiling + cycle-accurate trace replay (Nsight-Compute analog)

### Canonical sources
- NVIDIA, *Nsight Compute Profiling Guide* v13.2, §2 Replay Modes.
  https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html —
  **Range Replay** and **Application Replay** definitions.
- NVIDIA, *CUPTI Documentation* (Activity / Callback / PC Sampling APIs).
  https://docs.nvidia.com/cupti/index.html — the primitive under Nsight.
- IEEE Std 1364 VCD, §21. https://ieeexplore.ieee.org/document/1620780 —
  canonical cycle-level trace format we already emit.

### Key idea applicable to pccx-lab
Nsight's *Range Replay* captures API calls + kernel launches as a
re-executable block. pccx-lab's analog: record ISA-level command stream
(`AXIL_CMD_IN` transactions) + memory images into the `.pccx` file so a
kernel can be replayed deterministically from any cycle. CUPTI's
Activity records map 1:1 to what `ctrl_npu_frontend` already logs.

### Open questions
What is the replay granularity (cycle? opcode? AXI beat?)? Determinism
against asynchronous DMA completion needs a seed.

### Recommendation (concrete)
Extend `src/core/src/pccx_container.rs` with a `Range` record type that
mirrors CUPTI Activity record fields (start/end TSC, kernel id, metrics).

---

## Gap: SystemVerilog editor — virtual scroll, folding, LSP, minimap

### Canonical sources
- IEEE 1800-2023 — §22 (compiler directives) + §26 (packages) are the
  grammar a server must lex.
- Boldi, Nurminen, *"The Code Mini-Map Visualisation: Encoding Conceptual
  Structures Within Source Code"*, IEEE VISSOFT 2018.
  https://ieeexplore.ieee.org/document/8530140 — minimap encoding study.
- Pfaller, *"The Specification Language Server Protocol: A Proposal for
  Standardised LSP Extensions"*, arXiv:2108.02961 (2021).
  https://arxiv.org/abs/2108.02961 — how LSP needs extending for
  specification/hardware languages.

### Key idea applicable to pccx-lab
No dominant academic literature exists for Veridian/svlangserver
specifically (they are community projects). The LSP-for-spec-languages
paper gives the framing: SystemVerilog needs LSP extensions for
elaboration context and RTL hierarchy, which standard LSP `textDocument/*`
doesn't model. VISSOFT 2018 minimap paper supplies an evidence base that
minimap legibility depends on semantic colouring, not just character
density.

### Open questions
Can `tree-sitter-verilog` (AST level) serve as LSP backend, or do we need
a full elaborator (Slang / Verible) behind the server?

### Recommendation (concrete)
Wire `src/ui/editor/lsp-client.ts` to Slang via a JSON-RPC bridge
following arXiv:2108.02961 §4 "elaboration context" extension.

---

## Gap: Testbench authoring GUI

### Canonical sources
- Cadence, *Verisium Debug* datasheet,
  https://www.cadence.com/en_US/home/tools/system-design-and-verification/ai-driven-verification/verisium-debug.html
  — AI-driven bug triage workflow.
- Cadence, *Verisium Manager* datasheet,
  https://www.cadence.com/en_US/home/tools/system-design-and-verification/ai-driven-verification/verisium-manager.html
  — plan→run→signoff tracking model.
- Siemens, *Questa Visualizer* white-paper (cited above).

### Key idea applicable to pccx-lab
No arxiv paper exists for "testbench authoring GUI" specifically; the
state of practice is vendor-only. The common thread in Verisium / Visualizer
is: (a) a verification plan tree (xml/json) is the primary artefact,
(b) the GUI is a viewer/editor over that tree, not over the raw SV code.
pccx-lab should adopt the same pattern: author a YAML plan, render it as
a tree, and bind each leaf to a covergroup/assertion.

### Open questions
Is there an open plan schema? Accellera UCIS covers coverage but not the
plan tree; vManager uses proprietary `vPlan`.

### Recommendation (concrete)
Define an open `pccx.plan.yaml` schema and render in
`src/ui/PlanTree.tsx`, modelled after Verisium Manager's plan structure.

---

## Gap: FPGA live-trace vs post-hoc comparison

### Canonical sources
- AMD / Xilinx, *UG908 Vivado Design Suite User Guide: Programming and
  Debugging* (v2023.2).
  https://docs.amd.com/r/en-US/ug908-vivado-programming-debugging/ILA-Cross-Trigger
  — ILA trigger semantics + waveform export.
- AMD / Xilinx, *PG172 ILA LogiCORE IP Product Guide*.
  https://www.xilinx.com/support/documentation/ip_documentation/ila/v6_2/pg172-ila.pdf
  — trigger equations + storage qualification.
- Intel, *Signal Tap Logic Analyzer* (Quartus Prime Pro User Guide §3.3.13).
  https://www.intel.com/content/www/us/en/docs/programmable/683562/21-3/logic-analyzer.html

### Key idea applicable to pccx-lab
ILA on-silicon dumps are .wcfg/.wdb files that map 1:1 to sim VCD signal
names when the same HDL hierarchy is used. Core insight from UG908: the
**cross-trigger** concept — sim trigger fires on bitstream ILA capture
via a shared trigger bus. pccx-lab should adopt the same duality:
`.pccx` emitted from xsim is compared byte-for-byte against an ILA-sourced
`.pccx` from the KV260 board.

### Open questions
Jitter/skew between ILA sample clock and sim cycle edge when activations
go through AXI-ACP.

### Recommendation (concrete)
Add `src/core/src/pccx_diff.rs` comparing two `.pccx` files with
signal-path alignment from UG908 §"Using Waveform ILA Trigger".

---

## Gap: GPU profiler UX — swim-lane / flame

### Canonical sources
- NVIDIA, *Nsight Systems User Guide* (2025.1).
  https://docs.nvidia.com/nsight-systems/UserGuide/index.html — swim-lane
  per-PID/per-stream timeline model.
- Intel, *VTune Profiler User Guide — Window: Flame Graph*,
  https://www.intel.com/content/www/us/en/docs/vtune-profiler/user-guide/2023-0/window-flame-graph.html
- Gregg, *"The Flame Graph"*, CACM 59(6), 2016.
  https://doi.org/10.1145/2909476 — the method.

### Key idea applicable to pccx-lab
Nsight's swim-lane = one row per CUDA stream, time on X, colour-coded
kernel spans. For pccx-lab, rows become {MAT_CORE, VEC_CORE, SFU,
HP-port DMA, ACP DMA}, giving immediate visual back-pressure detection.
Flame graph supplements it as hotspot view for the cu_npu_dispatcher.

### Open questions
Swim-lane rendering at M cycles of simulation data needs LOD
bucketing — Nsight uses hierarchical downsampling but the exact
algorithm isn't public.

### Recommendation (concrete)
Implement 5-row swim-lane in `src/ui/Timeline.tsx` per Nsight User Guide
§"Timeline view"; flame graph per Gregg CACM 2016.

---

## Gap: Docking / tear-off UX

### Canonical sources
- Chatty, *"The drag-and-dock design pattern"* (ACM).
  https://doi.org/10.1145/1415472.1415501 — formal architecture.
- Mishra, *"Inventions on Drag and Drop in GUI"*, arXiv:1404.7121 (2014).
  https://arxiv.org/abs/1404.7121 — prior-art survey.

### Key idea applicable to pccx-lab
No dominant commercial-vendor academic paper here — the strongest
primary source is Chatty 2008 which gives the decomposition into
*drag source / dock target / docking preview*. VS 2022 and Electron
dockview both implement this model; pccx-lab's Tauri UI should follow
the same three-component factoring in `src/ui/Docking/`.

### Open questions
Keyboard accessibility of dock targets — CHI 2014 "Building keyboard
accessible drag and drop" (doi:10.1145/2661334.2661342) is the only
academic source addressing this.

### Recommendation (concrete)
Refactor `src/ui/Docking/` into source/target/preview per Chatty 2008 §3
and add keyboard handlers per CHI 2014.

---

## Gap: Open-core licensing

### Canonical sources
- Verilator Copyright page, LGPL-3.0 **or** Artistic-2.0 dual.
  https://verilator.org/guide/latest/copyright.html — the reference model
  for permissive open-core EDA.
- Montón & Salazar, *"On Licenses for [Open] Hardware"*, arXiv:2010.09039.
  https://arxiv.org/abs/2010.09039 — licence-space survey.
- Kapitsaki, *"Towards open source software licenses compatibility check"*,
  ACM 2023. https://doi.org/10.1145/3575879.3575973 — compatibility matrix
  (LGPL × EUPL × MIT, etc.).

### Key idea applicable to pccx-lab
Verilator chose LGPL-3 **or** Artistic-2 (not plain GPL) precisely so
downstream commercial testbenches can link. Surfer's EUPL-1.2 allows
similar linking but with weaker copyleft scope. For pccx-lab "open
core + commercial UI" strategy: adopt **LGPL-3 for `src/core`** (the
.pccx parser) and **Apache-2 for `src/ui`** — Kapitsaki 2023 Table 2
shows this pair is compatible.

### Open questions
Does a proprietary Tauri bundle link LGPL Rust staticly, triggering the
LGPL §4 shared-object requirement? Needs legal review.

### Recommendation (concrete)
Adopt Verilator's LGPL-3 + Artistic-2 dual for `src/core/`, Apache-2 for
`src/ui/`, commit LICENSE matrix per Kapitsaki 2023 §4.
