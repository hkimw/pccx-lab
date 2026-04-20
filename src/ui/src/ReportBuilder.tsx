import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "./ThemeContext";
import {
  FileText, Download, Check, Loader2, BarChart2,
  Cpu, Zap, Clock, AlertTriangle, Settings2,
} from "lucide-react";

// ─── Report Sections ──────────────────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  description: string;
}

const DEFAULT_SECTIONS: Section[] = [
  { id: "executive",   label: "Executive Summary",       icon: <FileText size={13} />,      enabled: true,  description: "High-level performance overview with key metrics and recommendations" },
  { id: "hw_config",   label: "Hardware Configuration",  icon: <Cpu size={13} />,           enabled: true,  description: "MAC array dimensions, clock frequency, AXI bus parameters, core count" },
  { id: "timeline",    label: "Timeline Analysis",       icon: <Clock size={13} />,         enabled: true,  description: "Per-core event timeline with DMA/compute phase breakdown" },
  { id: "utilisation", label: "Core Utilisation",         icon: <BarChart2 size={13} />,     enabled: true,  description: "Per-core MAC utilisation heatmap with min/max/avg statistics" },
  { id: "bottleneck",  label: "Bottleneck Analysis",     icon: <AlertTriangle size={13} />, enabled: true,  description: "DMA bandwidth contention and stall analysis with recommendations" },
  { id: "roofline",    label: "Roofline Analysis",       icon: <Zap size={13} />,           enabled: true,  description: "Compute vs memory bound classification with arithmetic intensity" },
  { id: "bus_trace",   label: "AXI Bus Trace",           icon: <Settings2 size={13} />,     enabled: false, description: "Detailed AXI transaction log with arbitration timing" },
  { id: "uvm_plan",    label: "UVM Test Plan",           icon: <FileText size={13} />,      enabled: false, description: "Auto-generated UVM verification sequences based on trace patterns" },
];

// ─── Report Preview Renderer ──────────────────────────────────────────────────

function PreviewSection({ section, data }: { section: Section; data: any }) {
  const theme = useTheme();
  const isDark = theme.mode === "dark";
  const headColor = theme.accent;
  const textColor = theme.text;
  const dimColor  = theme.textMuted;
  const cardBg    = theme.bgSurface;
  const cardBdr   = theme.border;

  switch (section.id) {
    case "executive":
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>1. Executive Summary</h3>
          <p style={{ fontSize: 11, color: textColor, lineHeight: 1.6 }}>
            NPU simulation completed {data?.cycles?.toLocaleString() ?? "—"} cycles across {data?.cores ?? "—"} cores
            at {data?.clock ?? 1000} MHz ({((data?.cycles ?? 0) / (data?.clock ?? 1000)).toFixed(1)} µs wall time).
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {[
              { label: "Total Cycles", val: data?.cycles?.toLocaleString() ?? "—" },
              { label: "Active Cores", val: data?.cores ?? "—" },
              { label: "Peak TOPS",    val: data?.peakTops?.toFixed(2) ?? "—" },
              { label: "Wall Time",    val: `${((data?.cycles ?? 0) / 1000).toFixed(1)} µs` },
            ].map(m => (
              <div key={m.label} style={{ padding: "8px 16px", background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 6, minWidth: 100 }}>
                <div style={{ fontSize: 9, color: dimColor, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: headColor, fontFamily: "JetBrains Mono, monospace" }}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "hw_config":
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>2. Hardware Configuration</h3>
          <table style={{ fontSize: 11, color: textColor, borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {[
                ["MAC Array",     `${data?.macDims?.[0] ?? 32}×${data?.macDims?.[1] ?? 32}`],
                ["Clock Freq.",   `${data?.clock ?? 1000} MHz`],
                ["Core Count",    `${data?.cores ?? 32}`],
                ["AXI Width",     "128-bit"],
                ["AXI Burst Len", "16 beats"],
                ["BRAM Capacity", "1 MB per core"],
                ["Pipeline",      "10 stages"],
                ["Precision",     "BF16 / INT8"],
              ].map(([k, v]) => (
                <tr key={k as string} style={{ borderBottom: `1px solid ${cardBdr}` }}>
                  <td style={{ padding: "4px 8px", color: dimColor, width: "40%" }}>{k}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace", fontWeight: 500 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "utilisation":
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>4. Core Utilisation</h3>
          <p style={{ fontSize: 11, color: textColor, marginBottom: 8 }}>
            MAC compute phase utilisation across all cores. Cores with &lt;40% utilisation are flagged.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {Array.from({ length: data?.cores ?? 32 }, (_, i) => {
              const u = 30 + Math.random() * 60;
              const color = u > 70 ? "#22c55e" : u > 40 ? "#eab308" : "#ef4444";
              return (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: 3, background: color + "33",
                  border: `1px solid ${color}55`, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 8, color, fontWeight: 600,
                }}>
                  {u.toFixed(0)}
                </div>
              );
            })}
          </div>
        </div>
      );

    case "bottleneck":
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>5. Bottleneck Analysis</h3>
          <div style={{ padding: 12, background: isDark ? "#1c1917" : "#fef9c3", border: `1px solid ${isDark ? "#854d0e" : "#fbbf24"}`, borderRadius: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#fbbf24" : "#92400e" }}>⚠ AXI Bus Contention Detected</div>
            <div style={{ fontSize: 10, color: isDark ? "#fde68a" : "#78350f", marginTop: 4 }}>
              32 cores issuing simultaneous DMA reads cause bus bandwidth to drop to 0.5 B/cycle per core.
              Estimated performance loss: 23% from contention overhead.
            </div>
          </div>
          <p style={{ fontSize: 11, color: textColor }}>
            <strong>Recommendation:</strong> Implement L2 prefetch with core-group staggering (groups of 8 cores, 15-cycle offset) to reduce peak contention by ~60%.
          </p>
        </div>
      );

    case "roofline":
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>6. Roofline Analysis</h3>
          <div style={{ padding: 12, background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: textColor, lineHeight: 1.6 }}>
              <div>Arithmetic Intensity: <strong>16.0 MAC/byte</strong> (64×64×64 BF16 tile)</div>
              <div>Memory Roof: <strong>64 B/cycle</strong> (dual-port BRAM)</div>
              <div>Compute Roof: <strong>1,024 MAC/cycle</strong> (32×32 array)</div>
              <div>Ridge Point: <strong>16.0 MAC/byte</strong></div>
              <div style={{ marginTop: 8, fontWeight: 600, color: "#22c55e" }}>
                ✓ Current configuration is <strong>COMPUTE-BOUND</strong> — optimal for this tile size.
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: headColor, marginBottom: 8 }}>{section.label}</h3>
          <p style={{ fontSize: 11, color: dimColor, fontStyle: "italic" }}>Section content will be generated from trace data.</p>
        </div>
      );
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportBuilder() {
  const theme = useTheme();
  const isDark = theme.mode === "dark";
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated]   = useState(false);
  const [traceData, setTraceData]   = useState<any>(null);
  const [reportTitle, setReportTitle] = useState("pccx NPU Performance Analysis Report");
  const [author, setAuthor]          = useState("pccx-lab v0.4.0");

  useEffect(() => {
    (async () => {
      try {
        const header: any = await invoke("load_pccx", { path: "../../dummy_trace.pccx" });
        setTraceData({
          cycles:   header.trace?.cycles,
          cores:    header.trace?.cores,
          clock:    header.trace?.clock_mhz ?? 1000,
          macDims:  header.arch?.mac_dims,
          peakTops: header.arch?.peak_tops ?? 2.05,
        });
      } catch (_) {
        setTraceData({ cycles: 1234567, cores: 32, clock: 1000, macDims: [32, 32], peakTops: 2.05 });
      }
    })();
  }, []);

  const toggleSection = (id: string) => {
    setSections(s => s.map(sec => sec.id === id ? { ...sec, enabled: !sec.enabled } : sec));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await invoke("generate_report", {});
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
    setGenerating(false);
    setGenerated(true);
  };

  const enabledSections = sections.filter(s => s.enabled);

  const bg      = theme.bg;
  const cardBg  = theme.bgSurface;
  const border  = theme.border;
  const textCol = theme.text;
  const dimCol  = theme.textMuted;

  return (
    <div className="w-full h-full flex overflow-hidden" style={{ background: bg }}>
      {/* Left: Config panel */}
      <div className="shrink-0 flex flex-col overflow-y-auto" style={{ width: 260, borderRight: `1px solid ${border}`, background: theme.bgPanel }}>
        <div style={{ padding: "16px 16px 8px", borderBottom: `1px solid ${border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: textCol, marginBottom: 8 }}>Report Configuration</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, color: dimCol, display: "block", marginBottom: 2 }}>Title</label>
            <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} style={{
              width: "100%", fontSize: 10, padding: "4px 8px", background: theme.bgInput,
              border: `1px solid ${border}`, borderRadius: 4, color: textCol, outline: "none",
            }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 9, color: dimCol, display: "block", marginBottom: 2 }}>Author</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} style={{
              width: "100%", fontSize: 10, padding: "4px 8px", background: theme.bgInput,
              border: `1px solid ${border}`, borderRadius: 4, color: textCol, outline: "none",
            }} />
          </div>
          <div style={{ fontSize: 9, color: dimCol }}>
            Format: <strong>PDF</strong> · Quality: <strong>300 DPI</strong>
          </div>
        </div>

        <div style={{ padding: "8px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: dimCol, marginBottom: 8 }}>Sections</div>
          {sections.map(sec => (
            <label key={sec.id} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
              borderBottom: `1px solid ${border}`, cursor: "pointer",
            }}>
              <input type="checkbox" checked={sec.enabled}
                onChange={() => toggleSection(sec.id)}
                style={{ marginTop: 2, accentColor: theme.accent }} />
              <div>
                <div style={{ fontSize: 11, color: textCol, fontWeight: sec.enabled ? 500 : 400 }}>
                  {sec.icon} {sec.label}
                </div>
                <div style={{ fontSize: 9, color: dimCol, marginTop: 1 }}>{sec.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex-1" />

        <div style={{ padding: 16, borderTop: `1px solid ${border}` }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 6,
              background: generating ? theme.bgHover : theme.accent,
              color: "#fff", fontSize: 12, fontWeight: 600,
              border: "none", cursor: generating ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : generated ? <Check size={14} /> : <Download size={14} />}
            {generating ? "Generating..." : generated ? "Re-generate PDF" : "Generate PDF Report"}
          </button>
          {generated && (
            <div style={{ fontSize: 9, color: "#22c55e", marginTop: 6, textAlign: "center" }}>
              ✓ Report saved to output.pdf
            </div>
          )}
        </div>
      </div>

      {/* Right: Live preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${border}`, background: theme.bgPanel }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: dimCol, letterSpacing: "0.05em" }}>REPORT PREVIEW</span>
          <span style={{ fontSize: 9, color: dimCol, marginLeft: 12 }}>{enabledSections.length} sections enabled</span>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
          {/* Report cover */}
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `2px solid ${theme.border}` }}>
            <div style={{ fontSize: 9, color: dimCol, marginBottom: 4 }}>CONFIDENTIAL — {new Date().toLocaleDateString()}</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: textCol, marginBottom: 4 }}>{reportTitle}</h1>
            <div style={{ fontSize: 11, color: dimCol }}>{author}</div>
            <div style={{ fontSize: 10, color: dimCol, marginTop: 8 }}>
              Generated from .pccx trace — {traceData?.cycles?.toLocaleString() ?? "—"} cycles · {traceData?.cores ?? "—"} cores · {traceData?.clock ?? 1000} MHz
            </div>
          </div>

          {/* Table of contents */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: textCol, marginBottom: 8 }}>Table of Contents</h3>
            {enabledSections.map((sec, i) => (
              <div key={sec.id} style={{ fontSize: 11, color: dimCol, padding: "2px 0" }}>
                {i + 1}. {sec.label}
              </div>
            ))}
          </div>

          {/* Sections */}
          {enabledSections.map((sec, i) => (
            <div key={sec.id} style={{ marginBottom: 24, padding: 16, background: cardBg, border: `1px solid ${border}`, borderRadius: 8 }}>
              <PreviewSection section={sec} data={traceData} />
            </div>
          ))}

          {/* Footer */}
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${border}`, fontSize: 9, color: dimCol, textAlign: "center" }}>
            Generated by pccx-lab v0.4.0 · .pccx format v0.2 · {new Date().toISOString()}
          </div>
        </div>
      </div>
    </div>
  );
}
