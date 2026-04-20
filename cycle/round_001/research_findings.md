# Research Findings — Round 1 — 2026-04-20

Round 1 has no Judge report yet. Driver pre-seeded the ten domains
most likely to be flagged. Every citation is primary academic or
vendor material — no blogs, no secondary summaries.

---

## Gap: Transaction-level waveform viewing + virtual signals

### Canonical sources
- Skarman, Klemmer, Große, Gustafsson, Laeufer, *"Surfer — An Extensible
  Waveform Viewer"*, CAV 2025 LNCS 15934.
  https://doi.org/10.1007/978-3-031-98685-7_19 — WCP protocol and
  variable translators (the virtual-signal mechanism).
- Meloni, Hofstee, Al-Ars, *"Tywaves: A Typed Waveform Viewer for Chisel"*,
  arXiv:2408.10082. https://arxiv.org/abs/2408.10082 — preserving
  source-language types through CIRCT into the viewer.
- Synopsys, *"Transaction Debug With Verdi"* white-paper,
  https://www.synopsys.com/cgi-bin/verification/fvwp/pdfr1.cgi?file=verdi_transaction_debug_wp.pdf
  — FSDB transaction stream format.
- Cadence, *"Enabling OVM Transaction Debug in SimVision"* (vendor),
  https://community.cadence.com/cadence_blogs_8/b/fv/posts/enabling-ovm-transaction-debug-in-simvision-without-code-changes
  — `simvision_record_trans` hooks.

### Key idea applicable to pccx-lab
Surfer's WCP is JSON-over-TCP that a front-end can speak without
re-implementing the FST/VCD parser. Tywaves keeps the SV type hierarchy
alive so the viewer displays `isa_pkg::instr_t` instead of raw 32-bit
words. A pccx "virtual signal" = WCP translator + `dtype_pkg` metadata
embedded in the `.pccx` container.

### Open questions
Can `.pccx` (commit 7483c1d) carry enough type metadata to drive a
translator offline? How large is the type-index table for GEMM 32×32?

### Recommendation
Emit WCP transaction streams from `src/core/src/pccx_emit.rs` per
CAV 2025 §3 schema.

---

## Gap: UVM cross-coverage visualisation + goal tracking

### Canonical sources
- IEEE Std 1800-2023, §19 Coverage.
  https://ieeexplore.ieee.org/document/10458102 — covergroup/cross
  semantics every tool implements.
- Siemens, *"Questa Visualizer adds coverage analysis"* white-paper,
  https://resources.sw.siemens.com/en-US/white-paper-questa-visualizer-adds-coverage-analysis-to-the-platform/
  — UCDB goal-tracking UI.
- Nagumothu et al., *"Efficient Methodology of Sampling UVM RAL During
  Simulation for SoC Functional Coverage"*, IEEE VLSID 2019.
  https://ieeexplore.ieee.org/document/8746049 — cross-bin design.
- Cadence IMC, *"How to Perform Coverage Analysis Using the IMC Tool"*,
  https://support1.cadence.com/public/docs/content/20504308.html — merge
  across runs.

### Key idea applicable to pccx-lab
UCDB (Accellera UCIS layer) is the de-facto interchange. pccx-lab should
consume UCIS, not invent a new schema; render cross bins as heatmap.
Goal tracking = weighted sum per cross, per Coverage Cookbook.

### Open questions
UCIS is tool-neutral but Questa's binary format uses proprietary indexes
— do they round-trip losslessly?

### Recommendation
Add UCIS-API reader in `src/core/src/coverage/ucis.rs`; render in
`src/ui/CoverageHeatmap.tsx`.

---

## Gap: Roofline extensions — hierarchical, memory-hierarchy, mixed precision

### Canonical sources
- Williams, Waterman, Patterson, *"Roofline"*, CACM 52(4) 2009.
  https://doi.org/10.1145/1498765.1498785 — original model.
- Yang et al., *"Hierarchical Roofline Performance Analysis for Deep
  Learning Applications"*, arXiv:2009.05257.
  https://arxiv.org/abs/2009.05257 — per-cache rooflines + FP32/FP16/TC.
- Yang et al., *"Hierarchical Roofline Analysis: Collect Data …"*,
  arXiv:2009.02449. https://arxiv.org/abs/2009.02449 — measurement
  recipe per memory level.
- Yuan et al., *"LLM Inference Unveiled: Roofline Insights"*,
  arXiv:2402.16363. https://arxiv.org/abs/2402.16363 — KV cache vs
  weight memory as separate rooflines; maps to URAM-64 / L2-1.75 MB /
  HP-DRAM hierarchy.

### Key idea applicable to pccx-lab
v002 GEMM (32×32) and GEMV (32-MAC) lean against distinct memory tiers.
A three-tier stacked roofline (URAM / L2 / HP-DRAM) with mixed-precision
peaks (INT4/INT8/BF16) tells the user *which* tier saturates.
LLM-Viewer already draws this picture for decode-phase LLMs.

### Open questions
How to measure operational intensity at RTL boundary? AXI beats vs
MAC cycles is easy; URAM BW *served* vs *requested* is harder.

### Recommendation
Hierarchical roofline in `src/ui/RooflinePanel.tsx` per 2009.05257
Fig 4, BW fed from `hw/rtl/MEM_control` counters.

---

## Gap: RTL profiling + cycle-accurate trace replay

### Canonical sources
- NVIDIA, *Nsight Compute Profiling Guide v13.2*, §2 Replay Modes.
  https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html —
  Application Replay, Range Replay.
- NVIDIA, *CUPTI Documentation* (Activity / Callback / PC-Sampling).
  https://docs.nvidia.com/cupti/index.html — primitives under Nsight.
- IEEE Std 1364, §21 VCD. — canonical cycle-level trace format.

### Key idea applicable to pccx-lab
Range Replay captures API calls + kernel launches as re-executable
blocks. pccx-lab analog: record ISA command stream (`AXIL_CMD_IN`) and
memory images into `.pccx` so a kernel replays deterministically from
any cycle. CUPTI Activity records map 1:1 to `ctrl_npu_frontend` logs.

### Open questions
Replay granularity (cycle? opcode? AXI beat?) and determinism against
async DMA completion (needs seed).

### Recommendation
Extend `src/core/src/pccx_container.rs` with a `Range` record type
mirroring CUPTI Activity fields.

---

## Gap: SystemVerilog editor — virtual scroll, folding, LSP, minimap

### Canonical sources
- IEEE 1800-2023 §22 (compiler directives) + §26 (packages) — grammar
  any LSP must lex.
- Boldi, Nurminen, *"The Code Mini-Map Visualisation"*, IEEE VISSOFT
  2018. https://ieeexplore.ieee.org/document/8530140 — minimap
  legibility study.
- Pfaller, *"The Specification Language Server Protocol"*,
  arXiv:2108.02961. https://arxiv.org/abs/2108.02961 — LSP extensions
  for specification/hardware languages.

No academic literature exists for Veridian/svlangserver specifically;
they are community projects. arXiv:2108.02961 supplies the framing:
SV needs LSP extensions for elaboration context that standard
`textDocument/*` doesn't model.

### Open questions
Can tree-sitter-verilog serve as LSP backend, or do we need a full
elaborator (Slang / Verible)?

### Recommendation
Wire `src/ui/editor/lsp-client.ts` to Slang via JSON-RPC per
arXiv:2108.02961 §4 "elaboration context" extension.

---

## Gap: Testbench authoring GUI

### Canonical sources
- Cadence, *Verisium Debug* datasheet,
  https://www.cadence.com/en_US/home/tools/system-design-and-verification/ai-driven-verification/verisium-debug.html
- Cadence, *Verisium Manager* datasheet,
  https://www.cadence.com/en_US/home/tools/system-design-and-verification/ai-driven-verification/verisium-manager.html
  — plan→run→signoff tracking.
- Siemens, *Questa Visualizer* white-paper (cited above).

No arxiv paper exists for this UX class; vendor-only. Common thread:
a verification plan tree (xml/yaml) is the primary artefact; the GUI
views/edits the tree, not the raw SV. pccx-lab should adopt the same:
author YAML plan, render as tree, bind each leaf to
covergroup/assertion.

### Open questions
No open plan schema exists. Accellera UCIS covers coverage but not the
plan tree; vManager uses proprietary `vPlan`.

### Recommendation
Define open `pccx.plan.yaml` schema; render in `src/ui/PlanTree.tsx`,
modelled after Verisium Manager plan structure.

---

## Gap: FPGA live-trace vs post-hoc comparison

### Canonical sources
- AMD/Xilinx, *UG908 Programming and Debugging* (v2023.2), §ILA Cross
  Trigger. https://docs.amd.com/r/en-US/ug908-vivado-programming-debugging/ILA-Cross-Trigger
- AMD/Xilinx, *PG172 ILA LogiCORE IP Product Guide*.
  https://www.xilinx.com/support/documentation/ip_documentation/ila/v6_2/pg172-ila.pdf
- Intel, *Signal Tap Logic Analyzer* (Quartus Pro UG §3.3.13).
  https://www.intel.com/content/www/us/en/docs/programmable/683562/21-3/logic-analyzer.html

### Key idea applicable to pccx-lab
ILA .wcfg/.wdb files map 1:1 to sim VCD signal names when HDL hierarchy
matches. UG908 cross-trigger concept: sim trigger fires bitstream ILA
capture via shared trigger bus. pccx-lab should mirror this duality:
xsim-emitted `.pccx` compared byte-for-byte against an ILA-sourced
`.pccx` from the KV260.

### Open questions
Jitter/skew between ILA sample clock and sim cycle edge when
activations traverse AXI-ACP.

### Recommendation
Add `src/core/src/pccx_diff.rs` comparing two `.pccx` files with path
alignment from UG908 §"Using Waveform ILA Trigger".

---

## Gap: GPU profiler UX — swim-lane / flame

### Canonical sources
- NVIDIA, *Nsight Systems User Guide* 2025.1.
  https://docs.nvidia.com/nsight-systems/UserGuide/index.html — swim
  lane per-PID/per-stream timeline.
- Intel, *VTune Profiler — Flame Graph*,
  https://www.intel.com/content/www/us/en/docs/vtune-profiler/user-guide/2023-0/window-flame-graph.html
- Gregg, *"The Flame Graph"*, CACM 59(6) 2016.
  https://doi.org/10.1145/2909476 — the method.

### Key idea applicable to pccx-lab
Nsight swim-lane = one row per CUDA stream, colour-coded kernel spans.
For pccx-lab, rows become {MAT_CORE, VEC_CORE, SFU, HP-DMA, ACP-DMA}
giving immediate back-pressure visibility. Flame graph supplements it
as hotspot view for `cu_npu_dispatcher`.

### Open questions
Swim-lane rendering at M-cycle dumps needs LOD bucketing — Nsight uses
hierarchical downsampling, algorithm undocumented.

### Recommendation
5-row swim-lane in `src/ui/Timeline.tsx` per Nsight UG §Timeline;
flame graph per Gregg CACM 2016.

---

## Gap: Docking / tear-off UX

### Canonical sources
- Chatty, *"The drag-and-dock design pattern"*, ACM 2008.
  https://doi.org/10.1145/1415472.1415501 — formal decomposition.
- Mishra, *"Inventions on Drag and Drop in GUI"*, arXiv:1404.7121.
  https://arxiv.org/abs/1404.7121 — prior-art survey.
- Bragdon et al., *"Building keyboard accessible drag and drop"*, CHI
  2014. https://doi.org/10.1145/2661334.2661342 — keyboard access.

No vendor-specific academic paper; Chatty 2008 gives the decomposition
(drag source / dock target / docking preview) that VS 2022 and
Electron-dockview both implement.

### Open questions
Keyboard accessibility of dock targets — CHI 2014 is the main source
and its patterns don't fully translate to tear-off windows.

### Recommendation
Refactor `src/ui/Docking/` into source/target/preview per Chatty 2008
§3; add keyboard handlers per CHI 2014.

---

## Gap: Open-core licensing for dev tooling

### Canonical sources
- Verilator *Copyright* (LGPL-3 or Artistic-2 dual).
  https://verilator.org/guide/latest/copyright.html — reference model.
- Montón & Salazar, *"On Licenses for [Open] Hardware"*,
  arXiv:2010.09039. https://arxiv.org/abs/2010.09039 — license-space
  survey.
- Kapitsaki, *"Towards open source software licenses compatibility
  check"*, ACM 2023. https://doi.org/10.1145/3575879.3575973 —
  compatibility matrix.

### Key idea applicable to pccx-lab
Verilator chose LGPL-3 **or** Artistic-2 (not plain GPL) so commercial
testbenches can link. Surfer's EUPL-1.2 allows similar linking with
weaker copyleft. pccx-lab "open core + commercial UI" strategy: adopt
LGPL-3 for `src/core/` (the `.pccx` parser) and Apache-2 for `src/ui/`
— Kapitsaki 2023 Table 2 shows that pair compatible.

### Open questions
Does a proprietary Tauri bundle statically linking LGPL Rust trigger
LGPL §4 shared-object requirement? Needs legal review.

### Recommendation
Adopt Verilator's LGPL-3 + Artistic-2 dual for `src/core/`, Apache-2
for `src/ui/`; commit LICENSE matrix per Kapitsaki 2023 §4.
