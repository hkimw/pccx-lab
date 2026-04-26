import { useState, useMemo, useCallback, useEffect, memo } from "react";
import { useTheme } from "./ThemeContext";
import { BarChart3, ChevronRight, ChevronDown, Search, AlertTriangle } from "lucide-react";

// ─── Tree definition ──────────────────────────────────────────────────────────

interface LeafDef {
  kind: "leaf";
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  warnBelow?: number;   // value below this = warning
  warnAbove?: number;   // value above this = warning
  errorBelow?: number;  // value below this = error
  errorAbove?: number;  // value above this = error
}

interface GroupDef {
  kind: "group";
  id: string;
  label: string;
  children: TreeDef[];
}

type TreeDef = LeafDef | GroupDef;

const METRIC_TREE: TreeDef[] = [
  {
    kind: "group", id: "compute", label: "Compute",
    children: [
      { kind: "leaf", id: "mac_util", label: "MAC Utilization", unit: "%", min: 0, max: 100, warnBelow: 50, errorBelow: 20 },
      { kind: "leaf", id: "pipeline_stalls", label: "Pipeline Stalls", unit: "cycles", min: 0, max: 100000, warnAbove: 10000, errorAbove: 50000 },
      { kind: "leaf", id: "compute_throughput", label: "Compute Throughput", unit: "TOPS", min: 0, max: 8, warnBelow: 1 },
      { kind: "leaf", id: "active_cycles", label: "Active Cycles", unit: "cycles", min: 0, max: 1000000 },
    ],
  },
  {
    kind: "group", id: "memory", label: "Memory",
    children: [
      { kind: "leaf", id: "dma_read_bw", label: "DMA Read Bandwidth", unit: "GB/s", min: 0, max: 20, warnBelow: 4 },
      { kind: "leaf", id: "dma_write_bw", label: "DMA Write Bandwidth", unit: "GB/s", min: 0, max: 20, warnBelow: 2 },
      { kind: "leaf", id: "buffer_hit_rate", label: "Buffer Hit Rate", unit: "%", min: 0, max: 100, warnBelow: 70, errorBelow: 40 },
      { kind: "leaf", id: "cache_misses", label: "Cache Misses", unit: "", min: 0, max: 1000000, warnAbove: 50000, errorAbove: 200000 },
    ],
  },
  {
    kind: "group", id: "sync", label: "Synchronization",
    children: [
      { kind: "leaf", id: "barrier_stalls", label: "Barrier Stalls", unit: "cycles", min: 0, max: 100000, warnAbove: 5000, errorAbove: 20000 },
      { kind: "leaf", id: "systolic_stalls", label: "Systolic Stalls", unit: "cycles", min: 0, max: 100000, warnAbove: 8000, errorAbove: 30000 },
      { kind: "leaf", id: "sync_overhead", label: "Sync Overhead", unit: "%", min: 0, max: 100, warnAbove: 20, errorAbove: 40 },
    ],
  },
  {
    kind: "group", id: "power", label: "Power (estimated)",
    children: [
      { kind: "leaf", id: "dynamic_power", label: "Dynamic Power", unit: "mW", min: 0, max: 5000, warnAbove: 3000, errorAbove: 4500 },
      { kind: "leaf", id: "leakage_power", label: "Leakage Power", unit: "mW", min: 0, max: 500 },
      { kind: "leaf", id: "total_power", label: "Total Power", unit: "mW", min: 0, max: 5500, warnAbove: 3500, errorAbove: 5000 },
    ],
  },
];

// ─── Value severity ───────────────────────────────────────────────────────────

type Severity = "good" | "warn" | "error" | "neutral";

function getSeverity(leaf: LeafDef, value: number | null): Severity {
  if (value === null) return "neutral";
  if (leaf.errorBelow !== undefined && value < leaf.errorBelow) return "error";
  if (leaf.errorAbove !== undefined && value > leaf.errorAbove) return "error";
  if (leaf.warnBelow !== undefined && value < leaf.warnBelow) return "warn";
  if (leaf.warnAbove !== undefined && value > leaf.warnAbove) return "warn";
  return "good";
}

// ─── IPC bridge ───────────────────────────────────────────────────────────────

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

// ─── Leaf row ─────────────────────────────────────────────────────────────────

interface LeafRowProps {
  leaf: LeafDef;
  value: number | null;
  selected: boolean;
  onSelect: (id: string) => void;
  theme: ReturnType<typeof useTheme>;
}

const LeafRow = memo(function LeafRow({ leaf, value, selected, onSelect, theme }: LeafRowProps) {
  const sev = useMemo(() => getSeverity(leaf, value), [leaf, value]);

  const sevColor = {
    good: theme.success,
    warn: theme.warning,
    error: theme.error,
    neutral: theme.textFaint,
  }[sev];

  const fillPct = useMemo(() => {
    if (value === null) return 0;
    const range = leaf.max - leaf.min;
    if (range === 0) return 0;
    return Math.max(0, Math.min(100, ((value - leaf.min) / range) * 100));
  }, [value, leaf]);

  const displayValue = value !== null
    ? (value >= 1000 ? value.toLocaleString() : value % 1 === 0 ? String(value) : value.toFixed(2))
    : "---";

  return (
    <div
      onClick={() => onSelect(leaf.id)}
      style={{
        display: "flex", flexDirection: "column", gap: 3,
        padding: "5px 10px 5px 28px",
        cursor: "pointer",
        background: selected ? theme.accentBg : "transparent",
        borderLeft: selected ? `2px solid ${theme.accent}` : "2px solid transparent",
        transition: `background 0.1s ${theme.ease}`,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = theme.bgGlassHover; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {sev === "error" && <AlertTriangle size={10} style={{ color: theme.error, marginBottom: 1, flexShrink: 0 }} />}
        <span style={{ fontSize: 11, color: theme.text, flex: 1 }}>{leaf.label}</span>
        <span style={{
          fontSize: 11, fontFamily: theme.fontMono,
          color: sevColor, fontWeight: 600,
        }}>{displayValue}</span>
        {leaf.unit && (
          <span style={{ fontSize: 9, color: theme.textFaint }}>{leaf.unit}</span>
        )}
      </div>
      {/* Min/max range bar */}
      <div style={{
        height: 3, borderRadius: 2,
        background: theme.bgSurface,
        overflow: "hidden",
      }}>
        <div style={{
          width: `${fillPct}%`,
          height: "100%",
          background: sevColor,
          borderRadius: 2,
          transition: `width 0.25s ${theme.ease}`,
        }} />
      </div>
    </div>
  );
});

// ─── Group row ────────────────────────────────────────────────────────────────

interface GroupRowProps {
  group: GroupDef;
  expanded: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof useTheme>;
}

const GroupRow = memo(function GroupRow({ group, expanded, onToggle, theme }: GroupRowProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 10px",
        width: "100%", border: "none", cursor: "pointer",
        background: "transparent",
        color: theme.text,
        textAlign: "left",
        transition: `background 0.1s ${theme.ease}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = theme.bgGlassHover)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {expanded
        ? <ChevronDown size={12} style={{ color: theme.textMuted, flexShrink: 0 }} />
        : <ChevronRight size={12} style={{ color: theme.textMuted, flexShrink: 0 }} />}
      <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>{group.label}</span>
    </button>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export const MetricTree = memo(function MetricTree() {
  const theme = useTheme();

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(METRIC_TREE.map(g => g.id))
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [values, setValues] = useState<Record<string, number | null>>({});

  // Load metric values from IPC if available; fall back to null (shows "---")
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await tauriInvoke<Record<string, number>>("get_metric_snapshot", {});
        if (!cancelled) setValues(data);
      } catch {
        // No IPC command or trace not loaded — show placeholder "---"
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch when a trace-loaded event fires
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(m => m.listen("trace-loaded", async () => {
        try {
          const data = await tauriInvoke<Record<string, number>>("get_metric_snapshot", {});
          setValues(data);
        } catch { /* no op */ }
      }))
      .then(fn => { unlisten = fn; })
      .catch(() => { /* browser preview */ });
    return () => { unlisten?.(); };
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const normalizedFilter = filter.toLowerCase();

  // Filter: flatten leaf labels matching the query
  const visibleGroups = useMemo<TreeDef[]>(() => {
    if (!normalizedFilter) return METRIC_TREE;
    return METRIC_TREE.flatMap(node => {
      if (node.kind !== "group") return [];
      const matchedChildren = node.children.filter(
        c => c.kind === "leaf" && c.label.toLowerCase().includes(normalizedFilter)
      );
      if (matchedChildren.length === 0) return [];
      return [{ ...node, children: matchedChildren }];
    });
  }, [normalizedFilter]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
      background: theme.bg, color: theme.text,
      fontFamily: theme.fontSans,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px 8px",
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
        flexShrink: 0,
      }}>
        <BarChart3 size={14} style={{ color: theme.accent }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>NPU Metrics</span>
      </div>

      {/* Search */}
      <div style={{
        padding: "6px 10px",
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: theme.bgInput,
          border: `0.5px solid ${theme.borderDim}`,
          borderRadius: theme.radiusSm,
          padding: "4px 8px",
        }}>
          <Search size={11} style={{ color: theme.textFaint, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter metrics..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent", fontSize: 11,
              color: theme.text,
              fontFamily: theme.fontSans,
            }}
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              style={{
                border: "none", background: "transparent",
                color: theme.textFaint, cursor: "pointer",
                fontSize: 11, lineHeight: 1, padding: 0,
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Root label */}
        <div style={{
          padding: "6px 10px",
          fontSize: 10, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: 0.5,
          color: theme.textFaint,
        }}>
          NPU Metrics
        </div>

        {visibleGroups.map(node => {
          if (node.kind !== "group") return null;
          const isExpanded = normalizedFilter ? true : expanded.has(node.id);

          return (
            <div key={node.id}>
              <GroupRow
                group={node}
                expanded={isExpanded}
                onToggle={() => toggleGroup(node.id)}
                theme={theme}
              />
              {isExpanded && node.children.map(child => {
                if (child.kind !== "leaf") return null;
                return (
                  <LeafRow
                    key={child.id}
                    leaf={child}
                    value={values[child.id] ?? null}
                    selected={selected === child.id}
                    onSelect={setSelected}
                    theme={theme}
                  />
                );
              })}
            </div>
          );
        })}

        {visibleGroups.length === 0 && (
          <div style={{ padding: "16px 14px", fontSize: 11, color: theme.textFaint }}>
            No metrics match "{filter}"
          </div>
        )}
      </div>

      {/* Selected metric info bar */}
      {selected && (() => {
        // Find the selected leaf def
        let foundLeaf: LeafDef | null = null;
        for (const node of METRIC_TREE) {
          if (node.kind === "group") {
            for (const child of node.children) {
              if (child.kind === "leaf" && child.id === selected) {
                foundLeaf = child;
                break;
              }
            }
          }
          if (foundLeaf) break;
        }
        if (!foundLeaf) return null;
        const val = values[foundLeaf.id] ?? null;
        const sev = getSeverity(foundLeaf, val);
        const sevColor = { good: theme.success, warn: theme.warning, error: theme.error, neutral: theme.textFaint }[sev];
        return (
          <div style={{
            borderTop: `0.5px solid ${theme.borderSubtle}`,
            padding: "8px 14px",
            display: "flex", flexDirection: "column", gap: 3,
            flexShrink: 0,
            background: theme.bgSurface,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Selected
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: theme.text }}>{foundLeaf.label}</span>
              <span style={{ fontSize: 13, fontFamily: theme.fontMono, fontWeight: 700, color: sevColor }}>
                {val !== null ? val.toLocaleString() : "---"}
                {foundLeaf.unit && <span style={{ fontSize: 9, color: theme.textFaint, marginLeft: 3 }}>{foundLeaf.unit}</span>}
              </span>
            </div>
            <div style={{ fontSize: 10, color: theme.textFaint }}>
              Range: {foundLeaf.min.toLocaleString()} – {foundLeaf.max.toLocaleString()} {foundLeaf.unit}
            </div>
          </div>
        );
      })()}

      {/* Footer hint */}
      <div style={{
        borderTop: `0.5px solid ${theme.borderSubtle}`,
        padding: "5px 14px",
        fontSize: 9, color: theme.textFaint,
        flexShrink: 0,
      }}>
        Click a metric to highlight. Loads live values when trace is open.
      </div>
    </div>
  );
});

export default MetricTree;
