import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useTheme } from "./ThemeContext";
import { AlertTriangle, RefreshCw, Radio, ToggleLeft, ToggleRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StageId =
  | "fetch"
  | "decode"
  | "dispatch"
  | "mac"
  | "accumulate"
  | "activation"
  | "dma_write"
  | "dma_read_weights"
  | "dma_read_acts";

interface PipelineStage {
  id: StageId;
  label: string;
  // Throughput display string (ops/cycle or GB/s depending on stage)
  throughput: string;
  // 0.0–1.0
  utilization: number;
  stalled: boolean;
  stallReason?: string;
  // Detailed metrics shown in side panel on click
  details: Record<string, string>;
}

interface PipelineStats {
  stages: PipelineStage[];
  cycleRange: { start: number; end: number };
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_STATS: PipelineStats = {
  cycleRange: { start: 0, end: 65536 },
  stages: [
    {
      id: "fetch",
      label: "Instruction Fetch",
      throughput: "1.00 inst/cyc",
      utilization: 0.88,
      stalled: false,
      details: {
        "Issue slots":    "1",
        "Fetch rate":     "1.00 inst/cyc",
        "Cache hits":     "99.2%",
        "Idle cycles":    "12%",
      },
    },
    {
      id: "decode",
      label: "Decode",
      throughput: "1.00 inst/cyc",
      utilization: 0.85,
      stalled: false,
      details: {
        "Decode rate":    "1.00 inst/cyc",
        "Stall cycles":   "15%",
        "Operand hazards":"0",
      },
    },
    {
      id: "dispatch",
      label: "Dispatch",
      throughput: "0.74 inst/cyc",
      utilization: 0.74,
      stalled: false,
      details: {
        "Dispatch rate":  "0.74 inst/cyc",
        "Queue depth":    "4",
        "Backpressure":   "26%",
      },
    },
    {
      id: "mac",
      label: "MAC Compute",
      throughput: "1024 GOPS",
      utilization: 0.92,
      stalled: false,
      details: {
        "Peak GOPS":      "1024",
        "Achieved":       "942 GOPS",
        "MAC utilization":"92%",
        "Array size":     "32x32",
        "Precision":      "INT4/INT8",
      },
    },
    {
      id: "accumulate",
      label: "Accumulate",
      throughput: "1.00 acc/cyc",
      utilization: 0.91,
      stalled: false,
      details: {
        "Accumulator depth": "32",
        "Overflow events":   "0",
        "Throughput":        "1.00 acc/cyc",
      },
    },
    {
      id: "activation",
      label: "Activation",
      throughput: "0.12 op/cyc",
      utilization: 0.12,
      stalled: false,
      details: {
        "SFU instances":  "1",
        "Function":       "ReLU/GELU",
        "Throughput":     "0.12 op/cyc",
        "Bottleneck":     "Single SFU path",
      },
    },
    {
      id: "dma_write",
      label: "DMA Write",
      throughput: "14.2 GB/s",
      utilization: 0.67,
      stalled: false,
      details: {
        "Port":           "AXI-HP1",
        "Peak BW":        "21.3 GB/s",
        "Achieved":       "14.2 GB/s",
        "Utilization":    "67%",
      },
    },
    {
      id: "dma_read_weights",
      label: "DMA Read (Weights)",
      throughput: "9.6 GB/s",
      utilization: 0.45,
      stalled: true,
      stallReason: "AXI-HP0 contention",
      details: {
        "Port":           "AXI-HP0",
        "Peak BW":        "21.3 GB/s",
        "Achieved":       "9.6 GB/s",
        "Stall cycles":   "55%",
        "Contention":     "Shared with act prefetch",
      },
    },
    {
      id: "dma_read_acts",
      label: "DMA Read (Acts)",
      throughput: "5.3 GB/s",
      utilization: 0.25,
      stalled: true,
      stallReason: "AXI-HP0 contention",
      details: {
        "Port":           "AXI-HP0",
        "Peak BW":        "21.3 GB/s",
        "Achieved":       "5.3 GB/s",
        "Stall cycles":   "75%",
        "Contention":     "Preempted by weight DMA",
      },
    },
  ],
};

// Main pipeline order (branch stages handled separately)
const MAIN_STAGE_IDS: StageId[] = [
  "fetch", "decode", "dispatch", "mac", "accumulate", "activation", "dma_write",
];
const BRANCH_STAGE_IDS: StageId[] = ["dma_read_weights", "dma_read_acts"];

// ─── Tauri IPC helper ─────────────────────────────────────────────────────────

function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const w = window as unknown as {
    __TAURI__?: {
      core?: { invoke?: (cmd: string, args: Record<string, unknown>) => Promise<T> };
      invoke?: (cmd: string, args: Record<string, unknown>) => Promise<T>;
    };
  };
  const bridge = w.__TAURI__?.core?.invoke ?? w.__TAURI__?.invoke;
  if (!bridge) return Promise.reject(new Error("Tauri IPC not available"));
  return bridge(cmd, args);
}

// ─── Util ─────────────────────────────────────────────────────────────────────

// Block width in px — fixed to allow branch column alignment
const BLOCK_W = 140;
// Index of "dispatch" in MAIN_STAGE_IDS — branch column aligns here
const DISPATCH_IDX = MAIN_STAGE_IDS.indexOf("dispatch");
// Gap between blocks
const BLOCK_GAP = 32;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface UtilBarProps {
  utilization: number;
  color: string;
  bg: string;
}
function UtilBar({ utilization, color, bg }: UtilBarProps) {
  return (
    <div style={{
      height: 4,
      borderRadius: 2,
      background: bg,
      marginTop: 6,
      overflow: "hidden",
    }}>
      <div style={{
        width: `${Math.round(utilization * 100)}%`,
        height: "100%",
        borderRadius: 2,
        background: color,
        transition: "width 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)",
      }} />
    </div>
  );
}

interface StageBlockProps {
  stage: PipelineStage;
  selected: boolean;
  onClick: (id: StageId) => void;
  onMouseEnter: (id: StageId, e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  activeColor: string;
  activeBg: string;
  theme: ReturnType<typeof useTheme>;
}

function StageBlock({
  stage, selected, onClick, onMouseEnter, onMouseLeave, activeColor, activeBg, theme,
}: StageBlockProps) {
  const isActive = !stage.stalled && stage.utilization >= 0.1;
  const borderColor = selected ? theme.accent : (stage.stalled ? theme.error : theme.borderSubtle);

  return (
    <div
      onClick={() => onClick(stage.id)}
      onMouseEnter={e => onMouseEnter(stage.id, e)}
      onMouseLeave={onMouseLeave}
      style={{
        width: BLOCK_W,
        flexShrink: 0,
        background: selected ? theme.accentBg : (stage.stalled ? theme.errorBg : activeBg),
        border: `1.5px solid ${borderColor}`,
        borderRadius: theme.radiusMd,
        padding: "8px 10px",
        cursor: "pointer",
        boxShadow: selected ? `0 0 0 2px ${theme.accent}44` : theme.shadowSm,
        transition: `border-color 0.15s ${theme.ease}, box-shadow 0.15s ${theme.ease}`,
        position: "relative",
        // Subtle pulse animation on active stages via CSS class
        animation: isActive && !stage.stalled ? "pccx-pulse 2.4s ease-in-out infinite" : "none",
      }}
    >
      {/* Stage name */}
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: theme.text,
        lineHeight: 1.3,
        marginBottom: 2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {stage.label}
      </div>

      {/* Throughput */}
      <div style={{
        fontSize: 9,
        color: theme.textMuted,
        fontFamily: theme.fontMono,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {stage.throughput}
      </div>

      {/* Utilization bar */}
      <UtilBar
        utilization={stage.utilization}
        color={activeColor}
        bg={theme.bgSurface}
      />

      {/* Utilization % label */}
      <div style={{ fontSize: 9, color: activeColor, marginTop: 2, textAlign: "right", fontFamily: theme.fontMono }}>
        {Math.round(stage.utilization * 100)}%
      </div>

      {/* Stall warning icon */}
      {stage.stalled && (
        <div style={{
          position: "absolute",
          top: 6,
          right: 7,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}>
          <AlertTriangle size={10} color={theme.warning} />
        </div>
      )}
    </div>
  );
}

// ─── Arrow ────────────────────────────────────────────────────────────────────

interface ArrowProps {
  stalled: boolean;
  theme: ReturnType<typeof useTheme>;
}
function Arrow({ stalled, theme }: ArrowProps) {
  return (
    <div style={{
      width: BLOCK_GAP,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    }}>
      <svg width={BLOCK_GAP} height={14} style={{ overflow: "visible" }}>
        <line
          x1={0} y1={7} x2={BLOCK_GAP - 6} y2={7}
          stroke={stalled ? theme.error : theme.textFaint}
          strokeWidth={1.5}
          strokeDasharray={stalled ? "4 3" : "none"}
        />
        <polygon
          points={`${BLOCK_GAP - 6},3 ${BLOCK_GAP},7 ${BLOCK_GAP - 6},11`}
          fill={stalled ? theme.error : theme.textFaint}
        />
      </svg>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  stage: PipelineStage;
  theme: ReturnType<typeof useTheme>;
  activeColor: string;
}
function DetailPanel({ stage, theme, activeColor }: DetailPanelProps) {
  return (
    <div style={{
      minWidth: 220,
      maxWidth: 280,
      background: theme.bgSurface,
      border: `0.5px solid ${theme.border}`,
      borderRadius: theme.radiusMd,
      padding: "12px 14px",
      boxShadow: theme.shadowMd,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, marginBottom: 8 }}>
        {stage.label}
      </div>

      {/* Utilization bar (large) */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: theme.textMuted }}>Utilization</span>
          <span style={{ fontSize: 10, color: activeColor, fontFamily: theme.fontMono }}>
            {Math.round(stage.utilization * 100)}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: theme.bgPanel, overflow: "hidden" }}>
          <div style={{
            width: `${Math.round(stage.utilization * 100)}%`,
            height: "100%",
            borderRadius: 3,
            background: activeColor,
            transition: `width 0.4s ${theme.ease}`,
          }} />
        </div>
      </div>

      {/* Stall reason */}
      {stage.stalled && stage.stallReason && (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          background: theme.warningBg,
          borderRadius: theme.radiusSm,
          padding: "5px 8px",
          marginBottom: 8,
        }}>
          <AlertTriangle size={11} color={theme.warning} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: theme.warningText }}>{stage.stallReason}</span>
        </div>
      )}

      {/* Detail metrics */}
      {Object.entries(stage.details).map(([key, val]) => (
        <div key={key} style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "3px 0",
          borderBottom: `0.5px solid ${theme.borderSubtle}`,
        }}>
          <span style={{ fontSize: 10, color: theme.textMuted }}>{key}</span>
          <span style={{ fontSize: 10, color: theme.text, fontFamily: theme.fontMono }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipProps {
  x: number;
  y: number;
  stage: PipelineStage;
  theme: ReturnType<typeof useTheme>;
  activeColor: string;
}
function Tooltip({ x, y, stage, theme, activeColor }: TooltipProps) {
  return (
    <div style={{
      position: "fixed",
      left: x + 12,
      top: y - 8,
      zIndex: 9999,
      background: theme.bgSurface,
      border: `0.5px solid ${theme.border}`,
      borderRadius: theme.radiusSm,
      padding: "6px 10px",
      boxShadow: theme.shadowMd,
      pointerEvents: "none",
      maxWidth: 200,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.text, marginBottom: 3 }}>
        {stage.label}
      </div>
      <div style={{ fontSize: 10, color: activeColor, fontFamily: theme.fontMono }}>
        {Math.round(stage.utilization * 100)}% util — {stage.throughput}
      </div>
      {stage.stalled && stage.stallReason && (
        <div style={{ fontSize: 10, color: theme.warning, marginTop: 3 }}>
          Stalled: {stage.stallReason}
        </div>
      )}
    </div>
  );
}

// ─── CSS animation (injected once) ───────────────────────────────────────────

const PULSE_STYLE = `
@keyframes pccx-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(0,152,255,0.00); }
  50%  { box-shadow: 0 0 0 3px rgba(0,152,255,0.14); }
  100% { box-shadow: 0 0 0 0 rgba(0,152,255,0.00); }
}
`;

// ─── Main component ───────────────────────────────────────────────────────────

type LoadStatus = "loading" | "ok" | "error";

export const PipelineDiagram = memo(function PipelineDiagram() {
  const theme = useTheme();

  const [stats, setStats]             = useState<PipelineStats>(DEMO_STATS);
  const [status, setStatus]           = useState<LoadStatus>("ok");
  const [selectedId, setSelectedId]   = useState<StageId | null>(null);
  const [tooltip, setTooltip]         = useState<{ x: number; y: number; id: StageId } | null>(null);
  const [live, setLive]               = useState(false);
  const [cycleStart, setCycleStart]   = useState(0);
  const [cycleEnd, setCycleEnd]       = useState(65536);

  // Fetch from backend; fall back to demo if unavailable
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await tauriInvoke<PipelineStats>("get_pipeline_stats", {
        cycleStart,
        cycleEnd,
      });
      setStats(result);
      setStatus("ok");
    } catch {
      // Command not yet implemented — use demo data
      setStats(DEMO_STATS);
      setStatus("ok");
    }
  }, [cycleStart, cycleEnd]);

  useEffect(() => {
    void load();
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(m => m.listen("trace-loaded", () => { void load(); }))
      .then(fn => { unlisten = fn; })
      .catch(() => { /* browser preview */ });
    return () => { unlisten?.(); };
  }, [load]);

  // Live polling
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { void load(); }, 1000);
    return () => clearInterval(id);
  }, [live, load]);

  // Build lookup maps
  const stageMap = useMemo(() => {
    const m = new Map<StageId, PipelineStage>();
    for (const s of stats.stages) m.set(s.id, s);
    return m;
  }, [stats.stages]);

  // Determine block color based on utilization
  const stageColor = useCallback((stage: PipelineStage): string => {
    if (stage.stalled || stage.utilization < 0.1) return theme.textFaint;
    if (stage.utilization >= 0.8) return theme.success;
    if (stage.utilization >= 0.5) return theme.warning;
    return theme.error;
  }, [theme.textFaint, theme.success, theme.warning, theme.error]);

  const stageBg = useCallback((stage: PipelineStage): string => {
    if (stage.stalled || stage.utilization < 0.1) return theme.bgSurface;
    if (stage.utilization >= 0.8) return theme.successBg;
    if (stage.utilization >= 0.5) return theme.warningBg;
    return theme.errorBg;
  }, [theme.bgSurface, theme.successBg, theme.warningBg, theme.errorBg]);

  const handleBlockClick = useCallback((id: StageId) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  const handleMouseEnter = useCallback((id: StageId, e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY, id });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedId(null);
    setCycleStart(0);
    setCycleEnd(65536);
  }, []);

  // Compute the left offset for the branch column (aligns under Dispatch)
  // Each main block is BLOCK_W + BLOCK_GAP wide, except the last
  const branchLeft = DISPATCH_IDX * (BLOCK_W + BLOCK_GAP);

  const selectedStage = selectedId ? stageMap.get(selectedId) : null;

  // Determine arrow stall state: stalled if the source or target block is stalled
  const mainArrowStalled = useCallback((idx: number): boolean => {
    const leftId = MAIN_STAGE_IDS[idx];
    const rightId = MAIN_STAGE_IDS[idx + 1];
    const left = stageMap.get(leftId);
    const right = stageMap.get(rightId);
    return !!(left?.stalled || right?.stalled);
  }, [stageMap]);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: theme.bgEditor,
      fontFamily: theme.fontSans,
    }}>
      {/* Inject pulse animation */}
      <style>{PULSE_STYLE}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
        background: theme.bgPanel,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>Pipeline Diagram</span>

        <div style={{ flex: 1 }} />

        {/* Cycle range */}
        <span style={{ fontSize: 10, color: theme.textMuted }}>Cycles:</span>
        <input
          type="number"
          value={cycleStart}
          onChange={e => setCycleStart(Number(e.target.value))}
          style={{
            width: 72, fontSize: 10, padding: "2px 6px",
            background: theme.bgInput, border: `0.5px solid ${theme.borderDim}`,
            borderRadius: theme.radiusSm, color: theme.text, fontFamily: theme.fontMono,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 10, color: theme.textFaint }}>–</span>
        <input
          type="number"
          value={cycleEnd}
          onChange={e => setCycleEnd(Number(e.target.value))}
          style={{
            width: 72, fontSize: 10, padding: "2px 6px",
            background: theme.bgInput, border: `0.5px solid ${theme.borderDim}`,
            borderRadius: theme.radiusSm, color: theme.text, fontFamily: theme.fontMono,
            outline: "none",
          }}
        />

        {/* Live toggle */}
        <button
          onClick={() => setLive(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", fontSize: 10,
            background: live ? theme.successBg : theme.bgSurface,
            border: `0.5px solid ${live ? theme.success : theme.borderSubtle}`,
            borderRadius: theme.radiusSm,
            color: live ? theme.success : theme.textMuted,
            cursor: "pointer",
            transition: `all 0.15s ${theme.ease}`,
          }}
        >
          {live ? <ToggleRight size={11} /> : <ToggleLeft size={11} />}
          <Radio size={9} style={{ opacity: live ? 1 : 0.4 }} />
          Live
        </button>

        {/* Reload */}
        <button
          onClick={() => void load()}
          disabled={status === "loading"}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", fontSize: 10,
            background: theme.bgSurface,
            border: `0.5px solid ${theme.borderSubtle}`,
            borderRadius: theme.radiusSm,
            color: theme.textMuted,
            cursor: status === "loading" ? "wait" : "pointer",
            transition: `all 0.15s ${theme.ease}`,
          }}
        >
          <RefreshCw size={10} style={{ animation: status === "loading" ? "spin 1s linear infinite" : "none" }} />
          Reload
        </button>

        {/* Reset View */}
        <button
          onClick={handleReset}
          style={{
            padding: "3px 8px", fontSize: 10,
            background: theme.bgSurface,
            border: `0.5px solid ${theme.borderSubtle}`,
            borderRadius: theme.radiusSm,
            color: theme.textMuted,
            cursor: "pointer",
          }}
        >
          Reset View
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflow: "auto",
        display: "flex",
        flexDirection: "row",
        gap: 0,
        padding: 24,
        alignItems: "flex-start",
      }}>
        {/* ── Diagram area ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { color: theme.success, label: ">80% util" },
              { color: theme.warning, label: "50–80%" },
              { color: theme.error,   label: "<50%" },
              { color: theme.textFaint, label: "idle" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 10, color: theme.textMuted }}>{label}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width={20} height={10}><line x1={0} y1={5} x2={20} y2={5} stroke={theme.textFaint} strokeWidth={1.5} strokeDasharray="4 3" /></svg>
              <span style={{ fontSize: 10, color: theme.textMuted }}>stalled flow</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width={20} height={10}><line x1={0} y1={5} x2={20} y2={5} stroke={theme.textFaint} strokeWidth={1.5} /></svg>
              <span style={{ fontSize: 10, color: theme.textMuted }}>active flow</span>
            </div>
          </div>

          {/* Diagram wrapper — relative for branch absolute positioning */}
          <div style={{ position: "relative", paddingBottom: 140 }}>

            {/* Main pipeline row */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap" }}>
              {MAIN_STAGE_IDS.map((id, idx) => {
                const stage = stageMap.get(id);
                if (!stage) return null;
                const color = stageColor(stage);
                const bg = stageBg(stage);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center" }}>
                    <StageBlock
                      stage={stage}
                      selected={selectedId === id}
                      onClick={handleBlockClick}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      activeColor={color}
                      activeBg={bg}
                      theme={theme}
                    />
                    {idx < MAIN_STAGE_IDS.length - 1 && (
                      <Arrow stalled={mainArrowStalled(idx)} theme={theme} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Branch: vertical connector from Dispatch down */}
            <svg
              style={{
                position: "absolute",
                top: 74,  // approx block height
                left: branchLeft + BLOCK_W / 2,
                overflow: "visible",
                pointerEvents: "none",
              }}
              width={2}
              height={40}
            >
              <line
                x1={1} y1={0} x2={1} y2={40}
                stroke={theme.textFaint}
                strokeWidth={1.5}
                strokeDasharray={
                  (() => {
                    const dw = stageMap.get("dma_read_weights");
                    const da = stageMap.get("dma_read_acts");
                    return (dw?.stalled || da?.stalled) ? "4 3" : "none";
                  })()
                }
              />
            </svg>

            {/* Branch: horizontal connector and blocks */}
            <div style={{
              position: "absolute",
              top: 114,
              left: branchLeft,
              display: "flex",
              alignItems: "flex-start",
              gap: 0,
            }}>
              {/* Horizontal bracket line */}
              <svg
                style={{
                  position: "absolute",
                  top: 38,
                  left: BLOCK_W / 2,
                  overflow: "visible",
                  pointerEvents: "none",
                }}
                width={(BLOCK_W + BLOCK_GAP) + BLOCK_W / 2}
                height={2}
              >
                <line
                  x1={0} y1={1}
                  x2={(BLOCK_W + BLOCK_GAP) + BLOCK_W / 2} y2={1}
                  stroke={theme.textFaint}
                  strokeWidth={1.5}
                  strokeDasharray={
                    (() => {
                      const dw = stageMap.get("dma_read_weights");
                      const da = stageMap.get("dma_read_acts");
                      return (dw?.stalled || da?.stalled) ? "4 3" : "none";
                    })()
                  }
                />
              </svg>

              {/* Branch stage blocks */}
              {BRANCH_STAGE_IDS.map((id, idx) => {
                const stage = stageMap.get(id);
                if (!stage) return null;
                const color = stageColor(stage);
                const bg = stageBg(stage);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "flex-start", flexDirection: "column" }}>
                    {/* Down arrow into block */}
                    <svg
                      width={BLOCK_W}
                      height={40}
                      style={{ flexShrink: 0 }}
                    >
                      <line
                        x1={BLOCK_W / 2} y1={0}
                        x2={BLOCK_W / 2} y2={32}
                        stroke={stage.stalled ? theme.error : theme.textFaint}
                        strokeWidth={1.5}
                        strokeDasharray={stage.stalled ? "4 3" : "none"}
                      />
                      <polygon
                        points={`${BLOCK_W / 2 - 4},28 ${BLOCK_W / 2 + 4},28 ${BLOCK_W / 2},36`}
                        fill={stage.stalled ? theme.error : theme.textFaint}
                      />
                    </svg>
                    <div style={{ marginRight: idx < BRANCH_STAGE_IDS.length - 1 ? BLOCK_GAP : 0 }}>
                      <StageBlock
                        stage={stage}
                        selected={selectedId === id}
                        onClick={handleBlockClick}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        activeColor={color}
                        activeBg={bg}
                        theme={theme}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Stage summary table ──────────────────────────────────────── */}
          <div style={{
            marginTop: 16,
            background: theme.bgSurface,
            border: `0.5px solid ${theme.borderSubtle}`,
            borderRadius: theme.radiusMd,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "6px 12px",
              borderBottom: `0.5px solid ${theme.borderSubtle}`,
              fontSize: 10,
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: "uppercase" as const,
              letterSpacing: 0.5,
            }}>
              Stage Summary
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: theme.textMuted, borderBottom: `0.5px solid ${theme.borderSubtle}` }}>
                  <th style={{ textAlign: "left", padding: "5px 12px" }}>Stage</th>
                  <th style={{ textAlign: "right", padding: "5px 12px" }}>Throughput</th>
                  <th style={{ textAlign: "right", padding: "5px 12px" }}>Utilization</th>
                  <th style={{ textAlign: "left", padding: "5px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.stages.map(stage => {
                  const color = stageColor(stage);
                  return (
                    <tr
                      key={stage.id}
                      onClick={() => handleBlockClick(stage.id)}
                      style={{
                        borderBottom: `0.5px solid ${theme.borderSubtle}`,
                        background: selectedId === stage.id ? theme.accentBg : "transparent",
                        cursor: "pointer",
                        transition: `background 0.1s ${theme.ease}`,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = selectedId === stage.id ? theme.accentBg : theme.bgHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = selectedId === stage.id ? theme.accentBg : "transparent")}
                    >
                      <td style={{ padding: "5px 12px", color: theme.text }}>{stage.label}</td>
                      <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: theme.fontMono, color: theme.textMuted }}>
                        {stage.throughput}
                      </td>
                      <td style={{ padding: "5px 12px", textAlign: "right" }}>
                        <span style={{ color, fontFamily: theme.fontMono }}>{Math.round(stage.utilization * 100)}%</span>
                      </td>
                      <td style={{ padding: "5px 12px" }}>
                        {stage.stalled ? (
                          <span style={{ color: theme.warning, display: "flex", alignItems: "center", gap: 4 }}>
                            <AlertTriangle size={9} />
                            {stage.stallReason ?? "stalled"}
                          </span>
                        ) : (
                          <span style={{ color: color }}>
                            {stage.utilization < 0.1 ? "idle" : stage.utilization >= 0.8 ? "active" : "underutilized"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Selected stage detail panel ──────────────────────────────── */}
        {selectedStage && (
          <div style={{ marginLeft: 20, flexShrink: 0, paddingTop: 36 }}>
            <DetailPanel
              stage={selectedStage}
              theme={theme}
              activeColor={stageColor(selectedStage)}
            />
          </div>
        )}
      </div>

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip && (() => {
        const stage = stageMap.get(tooltip.id);
        if (!stage) return null;
        return (
          <Tooltip
            x={tooltip.x}
            y={tooltip.y}
            stage={stage}
            theme={theme}
            activeColor={stageColor(stage)}
          />
        );
      })()}
    </div>
  );
});
