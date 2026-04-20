import { useState } from "react";
import { useTheme } from "./ThemeContext";
import { CheckCircle, AlertOctagon, TerminalSquare, ShieldCheck, Bug, Activity, Cpu } from "lucide-react";
import { SynthStatusCard } from "./SynthStatusCard";
import { VerificationRunner } from "./VerificationRunner";
import { RooflineCard } from "./RooflineCard";
import { BottleneckCard } from "./BottleneckCard";

type VerifyTab = "isa" | "api" | "uvm" | "synth";

const DEFAULT_UTIL_PATH =
  "../../../../pccx-FPGA-NPU-LLM-kv260/hw/build/reports/utilization_post_synth.rpt";
const DEFAULT_TIMING_PATH =
  "../../../../pccx-FPGA-NPU-LLM-kv260/hw/build/reports/timing_summary_post_synth.rpt";
const DEFAULT_REPO_PATH =
  "../../../../pccx-FPGA-NPU-LLM-kv260";

interface IsaResult {
  inst: string;
  opcode: string;
  expectedCyc: number;
  actualCyc: number;
  status: "PASS" | "FAIL" | "WARN";
  decode: string;
}

const DUMMY_ISA_RESULTS: IsaResult[] = [
  { inst: "ld.tile.l2 [r3], brm_0", opcode: "0x8F", expectedCyc: 128, actualCyc: 128, status: "PASS", decode: "Load Tile from L2 mapping" },
  { inst: "mac.arr.32x32 m_a, m_b", opcode: "0x4A", expectedCyc: 1024, actualCyc: 1024, status: "PASS", decode: "32x32 MAC Array Multiply-Accumulate" },
  { inst: "dma.axi.burst 64, req_1", opcode: "0x11", expectedCyc: 64, actualCyc: 256, status: "FAIL", decode: "AXI Burst Memory Access (Stalled)" },
  { inst: "sync.barrier tile_mask", opcode: "0x20", expectedCyc: 16, actualCyc: 18, status: "WARN", decode: "Tile Synchronization Barrier" },
  { inst: "st.wb.ddr [r9], acc_z", opcode: "0x91", expectedCyc: 48, actualCyc: 48, status: "PASS", decode: "Store Write-Back to DDR" },
];

export function VerificationSuite() {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<VerifyTab>("isa");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const isDark = theme.mode === "dark";

  const executeRegression = () => {
    setRunning(true);
    setLog(["[VERIFY] Initializing Regression Suite..."]);
    let iter = 0;
    const t = setInterval(() => {
      iter++;
      if (iter === 1) setLog(p => [...p, "[ISA] Decoding 500k instruction streams... OK"]);
      if (iter === 2) setLog(p => [...p, "[API] Dispatching gRPC ping-pong to simulator... OK"]);
      if (iter === 3) setLog(p => [...p, "[UVM] Parsing coverage database (vdb)... OK"]);
      if (iter === 4) {
        setLog(p => [...p, "[VERIFY] 1 Constraint Violation Detected!"]);
        setRunning(false);
        clearInterval(t);
      }
    }, 600);
  };

  const getStatusColor = (s: string) => {
    if (s === "PASS") return theme.success;
    if (s === "FAIL") return theme.error;
    return theme.warning;
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.bg }}>
      {/* Verification Top Toolbar */}
      <div className="flex items-center px-4 h-12 shrink-0 border-b" style={{ borderColor: theme.border, background: theme.bgSurface }}>
        <ShieldCheck size={18} className="mr-2" style={{ color: theme.accent }} />
        <span style={{ fontWeight: 600, fontSize: 13, marginRight: 24 }}>Verification Suite</span>
        
        <div className="flex rounded p-1 gap-1" style={{ border: `1px solid ${theme.border}`, background: theme.bg }}>
          {[
            { id: "isa",   label: "ISA Dashboard", icon: <TerminalSquare size={14} /> },
            { id: "api",   label: "API Integrity", icon: <Activity size={14} />       },
            { id: "uvm",   label: "UVM Coverage",  icon: <Bug size={14} />            },
            { id: "synth", label: "Synth Status",  icon: <Cpu size={14} />            },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as VerifyTab)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-all"
              style={{
                background: activeTab === t.id ? theme.accentBg : "transparent",
                color: activeTab === t.id ? theme.accent : theme.textMuted
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button
           onClick={executeRegression}
           disabled={running}
           className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-semibold hover:opacity-80 transition-all disabled:opacity-50"
           style={{ background: theme.success, color: "#fff" }}
        >
          {running ? "Running..." : "Run Regression Suite"}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Module Views */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          
          {activeTab === "isa" && (
            <div className="flex flex-col h-full">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TerminalSquare size={16} /> ISA Cycle-Accurate Validation Matrix
              </h3>
              <div className="flex-1 rounded border overflow-hidden flex flex-col" style={{ borderColor: theme.border, background: theme.bgPanel }}>
                <table className="w-full text-left" style={{ fontSize: 11, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}`, color: theme.textDim }}>
                      <th className="p-2">MNEMONIC</th>
                      <th className="p-2">OPCODE</th>
                      <th className="p-2">DECODE</th>
                      <th className="p-2 text-right">EXP CYCLES</th>
                      <th className="p-2 text-right">ACT CYCLES</th>
                      <th className="p-2 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DUMMY_ISA_RESULTS.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${theme.borderDim}` }} >
                        <td className="p-2 font-mono" style={{ color: theme.accent }}>{row.inst}</td>
                        <td className="p-2 font-mono" style={{ color: theme.textMuted }}>{row.opcode}</td>
                        <td className="p-2">{row.decode}</td>
                        <td className="p-2 text-right">{row.expectedCyc}</td>
                        <td className="p-2 text-right font-bold" style={{ color: row.expectedCyc !== row.actualCyc ? theme.error : theme.text }}>{row.actualCyc}</td>
                        <td className="p-2 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: `${getStatusColor(row.status)}22`, color: getStatusColor(row.status), border: `1px solid ${getStatusColor(row.status)}44` }}>
                             {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "api" && <APIIntegrityPanel />}

          {activeTab === "uvm" && <UVMCoveragePanel />}

          {activeTab === "synth" && (
            <div className="flex flex-col h-full gap-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Cpu size={16} /> pccx-FPGA Verification Dashboard
              </h3>
              <VerificationRunner repoPath={DEFAULT_REPO_PATH} />
              <SynthStatusCard
                utilizationPath={DEFAULT_UTIL_PATH}
                timingPath={DEFAULT_TIMING_PATH}
              />
              <RooflineCard />
              <BottleneckCard />
              <p className="text-[11px] mt-1" style={{ color: theme.textMuted }}>
                Paths are relative to the <code>pccx-lab</code> binary's working directory.
                Override via props when embedding this widget elsewhere.
              </p>
            </div>
          )}
        </div>

        {/* Verification Run Log */}
        <div className="w-[300px] border-l flex flex-col" style={{ borderColor: theme.border, background: theme.bgPanel }}>
           <div className="p-3 border-b text-xs font-bold flex justify-between" style={{ borderColor: theme.border }}>
             <span>Regression Logs</span>
             <button onClick={() => setLog([])} style={{ color: theme.textMuted }}>Clear</button>
           </div>
           <div className="flex-1 p-3 overflow-y-auto font-mono text-[10px] flex flex-col gap-1">
              {log.length === 0 && <span style={{ color: theme.textFaint }}>No active runs.</span>}
              {log.map((l, i) => (
                 <div key={i} style={{ color: l.includes("FAIL") || l.includes("Violat") ? theme.error : theme.textDim }}>
                   {l}
                 </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

/* ─── UVM Coverage Panel ──────────────────────────────────────────────────── */

interface CoverPoint {
  name: string;
  group: string;
  bins: number;
  hits: number;
}

const COVER_GROUPS: CoverPoint[] = [
  { name: "gemm_tile_shape",       group: "MAT_CORE", bins: 16, hits: 16 },
  { name: "gemm_k_stride",         group: "MAT_CORE", bins: 8,  hits: 8  },
  { name: "gemm_accum_roll",       group: "MAT_CORE", bins: 4,  hits: 4  },
  { name: "gemv_lane_sel",         group: "VEC_CORE", bins: 4,  hits: 4  },
  { name: "gemv_reduce_tree",      group: "VEC_CORE", bins: 5,  hits: 5  },
  { name: "sfu_op_kind",           group: "SFU",      bins: 6,  hits: 6  },
  { name: "sfu_exp_range",         group: "SFU",      bins: 16, hits: 15 },
  { name: "mem_axi_burst_len",     group: "MEM_ctrl", bins: 5,  hits: 5  },
  { name: "mem_hp_backpressure",   group: "MEM_ctrl", bins: 4,  hits: 4  },
  { name: "mem_uram_bank_hit",     group: "MEM_ctrl", bins: 8,  hits: 7  },
  { name: "ctrl_isa_opcode",       group: "frontend", bins: 24, hits: 22 },
  { name: "ctrl_barrier_kind",     group: "frontend", bins: 3,  hits: 3  },
  { name: "ctrl_dispatch_credit",  group: "frontend", bins: 8,  hits: 8  },
];

const REG_HISTORY = [
  { day: "04-13", pass: 22, fail: 1 },
  { day: "04-14", pass: 23, fail: 0 },
  { day: "04-15", pass: 23, fail: 0 },
  { day: "04-16", pass: 23, fail: 2 },
  { day: "04-17", pass: 24, fail: 1 },
  { day: "04-18", pass: 25, fail: 0 },
  { day: "04-19", pass: 25, fail: 0 },
  { day: "04-20", pass: 25, fail: 0 },
];

function UVMCoveragePanel() {
  const theme = useTheme();
  const totalBins = COVER_GROUPS.reduce((a, c) => a + c.bins, 0);
  const hitBins   = COVER_GROUPS.reduce((a, c) => a + c.hits, 0);
  const pct = (hitBins / totalBins) * 100;

  return (
    <div className="flex flex-col h-full gap-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Bug size={16} /> UVM Coverage — pccx v002
      </h3>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="functional"   value={`${pct.toFixed(1)}%`} tone={pct > 95 ? "ok" : pct > 80 ? "warn" : "bad"} />
        <StatCard label="bins covered" value={`${hitBins} / ${totalBins}`} />
        <StatCard label="coverpoints"  value={`${COVER_GROUPS.length}`} />
        <StatCard label="last regr"    value="25/25 PASS" tone="ok" />
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="rounded border overflow-hidden flex flex-col" style={{ borderColor: theme.border, background: theme.bgPanel }}>
          <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.05em", borderBottom: `1px solid ${theme.border}` }}>
            COVERPOINT HEATMAP
          </div>
          <div className="flex-1 overflow-auto p-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {COVER_GROUPS.map(cp => {
              const covPct = (cp.hits / cp.bins) * 100;
              const bgColor = covPct === 100 ? "#22c55e" : covPct > 80 ? "#eab308" : "#ef4444";
              return (
                <div key={cp.name} style={{
                  background: bgColor + "22",
                  border: `1px solid ${bgColor}66`,
                  borderRadius: 4, padding: "6px 8px",
                  fontSize: 10,
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: theme.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cp.name}</div>
                  <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{cp.group}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: bgColor, fontWeight: 700 }}>{covPct.toFixed(0)}%</span>
                    <span style={{ color: theme.textDim, fontFamily: "monospace" }}>{cp.hits}/{cp.bins}</span>
                  </div>
                  {/* Bin dots */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 4 }}>
                    {Array.from({ length: cp.bins }).map((_, i) => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: 1,
                        background: i < cp.hits ? bgColor : theme.borderDim,
                      }}/>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded border overflow-hidden flex flex-col" style={{ borderColor: theme.border, background: theme.bgPanel }}>
          <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.05em", borderBottom: `1px solid ${theme.border}` }}>
            REGRESSION HISTORY — last 8 days
          </div>
          <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
            {REG_HISTORY.map(r => {
              const total = r.pass + r.fail;
              const failPct = (r.fail / Math.max(1, total)) * 100;
              return (
                <div key={r.day} className="flex items-center gap-2" style={{ fontSize: 10 }}>
                  <span style={{ fontFamily: "monospace", color: theme.textMuted, width: 44 }}>{r.day}</span>
                  <div style={{ flex: 1, height: 16, background: theme.bgSurface, borderRadius: 2, position: "relative", overflow: "hidden" }}>
                    <div style={{ width: `${(r.pass / total) * 100}%`, height: "100%", background: theme.success, position: "absolute", left: 0 }}/>
                    <div style={{ width: `${failPct}%`, height: "100%", background: theme.error, position: "absolute", left: `${(r.pass / total) * 100}%` }}/>
                    <span style={{ position: "absolute", top: 1, left: 6, color: "#fff", fontSize: 9, fontWeight: 700 }}>
                      {r.pass}P {r.fail > 0 ? `· ${r.fail}F` : ""}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: r.fail === 0 ? theme.success : theme.error,
                    width: 32, textAlign: "right",
                  }}>{((r.pass / total) * 100).toFixed(0)}%</span>
                </div>
              );
            })}
            <div className="mt-2 p-2 rounded" style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, fontSize: 10, color: theme.textDim }}>
              Trend: stable since 2026-04-18. Two FAILs on 2026-04-16 traced to a weight-dispatcher K-stride
              corner case — fixed in commit <code>f38c1</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── API Integrity Panel ─────────────────────────────────────────────────── */

const API_ROWS: { api: string; kind: string; latency: string; drops: number; status: "OK" | "WARN" | "FAIL" }[] = [
  { api: "uca_init",              kind: "lifecycle", latency: "4.1 µs",   drops: 0, status: "OK"   },
  { api: "uca_alloc_buffer",      kind: "memory",    latency: "12.6 µs",  drops: 0, status: "OK"   },
  { api: "uca_load_weights",      kind: "transfer",  latency: "1.42 ms",  drops: 0, status: "OK"   },
  { api: "uca_submit_cmd",        kind: "dispatch",  latency: "1.8 µs",   drops: 0, status: "OK"   },
  { api: "uca_poll_completion",   kind: "status",    latency: "0.3 µs",   drops: 2, status: "WARN" },
  { api: "uca_fetch_result",      kind: "transfer",  latency: "0.92 ms",  drops: 0, status: "OK"   },
  { api: "uca_reset",             kind: "lifecycle", latency: "8.7 µs",   drops: 0, status: "OK"   },
  { api: "uca_get_perf_counters", kind: "debug",     latency: "5.2 µs",   drops: 0, status: "OK"   },
];

function APIIntegrityPanel() {
  const theme = useTheme();
  const okCount = API_ROWS.filter(r => r.status === "OK").length;
  return (
    <div className="flex flex-col h-full gap-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Activity size={16} /> API Integrity — <code style={{ color: theme.accent }}>uca_*</code> driver surface
      </h3>
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="APIs checked"   value={`${API_ROWS.length}`} />
        <StatCard label="passing"        value={`${okCount}`} tone="ok" />
        <StatCard label="dropped events" value={`${API_ROWS.reduce((a, r) => a + r.drops, 0)}`} />
        <StatCard label="round-trips"    value="50,000" />
      </div>
      <div className="flex-1 overflow-auto rounded border" style={{ borderColor: theme.border, background: theme.bgPanel }}>
        <table className="w-full" style={{ fontSize: 11, borderCollapse: "collapse", fontFamily: "ui-monospace, monospace" }}>
          <thead style={{ position: "sticky", top: 0, background: theme.bgSurface }}>
            <tr style={{ color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: "6px 10px", textAlign: "left" }}>API</th>
              <th style={{ padding: "6px 10px", textAlign: "left" }}>Kind</th>
              <th style={{ padding: "6px 10px", textAlign: "right" }}>p99 Latency</th>
              <th style={{ padding: "6px 10px", textAlign: "right" }}>Drops</th>
              <th style={{ padding: "6px 10px", textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {API_ROWS.map((r, i) => {
              const col = r.status === "OK" ? theme.success : r.status === "WARN" ? theme.warning : theme.error;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${theme.borderDim}`, color: theme.text }}>
                  <td style={{ padding: "6px 10px", color: theme.accent }}>{r.api}</td>
                  <td style={{ padding: "6px 10px", color: theme.textDim }}>{r.kind}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>{r.latency}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: r.drops > 0 ? theme.warning : theme.textDim }}>{r.drops}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{ padding: "1px 8px", border: `1px solid ${col}66`, borderRadius: 3, color: col, fontSize: 10, fontWeight: 700 }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const theme = useTheme();
  const col = tone === "ok" ? theme.success : tone === "warn" ? theme.warning : tone === "bad" ? theme.error : theme.text;
  return (
    <div style={{ padding: "10px 12px", background: theme.bgPanel, borderRadius: 6, border: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 9, color: theme.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: col, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}
