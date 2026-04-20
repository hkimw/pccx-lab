import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTheme } from "./ThemeContext";
import {
  Activity, ZoomIn, ZoomOut, Maximize2, Search, Download,
  Filter, X, Crosshair,
} from "lucide-react";

// ─── Signal model ────────────────────────────────────────────────────────────

type Radix = "bin" | "oct" | "hex" | "dec" | "ascii";

interface Event {
  /** Pico-second timestamp (matches xsim resolution). */
  t: number;
  /** Value. For wires: 0/1/'x'/'z'. For buses: number (stored as decimal). */
  v: number | string;
}

interface Signal {
  id:    string;
  name:  string;
  scope: string;       // hierarchical path — ctrl / mat / cvo / mem …
  width: number;       // 1 for wires, N for buses
  radix: Radix;
  events: Event[];
}

interface Group {
  id: string;
  name: string;
  expanded: boolean;
  children: Signal[];
}

// ─── Realistic demo workload — KV260 / pccx v002 one GEMV dispatch ───────────

function makeDemo(): Group[] {
  // 250 MHz AXI-Lite + 400 MHz core_clk, expressed in ps (resolution 1 ps).
  // 1 tick = 2500 ps on the AXI side, 2500 ps / 1.6 on the core side, but we
  // simplify and put every transition on an integer cycle.
  const CLK_HI = 1;
  const CLK_LO = 0;
  const N_CYC  = 200;

  const clkEvents: Event[] = [];
  const coreEvents: Event[] = [];
  for (let c = 0; c <= N_CYC; c++) {
    clkEvents.push({ t: c * 2, v: c % 2 ? CLK_HI : CLK_LO });
    coreEvents.push({ t: c * 1, v: c % 2 ? CLK_HI : CLK_LO });
  }

  const ctrl: Signal[] = [
    { id: "clk",          name: "clk",          scope: "ctrl", width: 1,  radix: "bin", events: clkEvents  },
    { id: "rst_n",        name: "rst_n",        scope: "ctrl", width: 1,  radix: "bin",
      events: [{ t: 0, v: 0 }, { t: 6, v: 1 }] },
  ];

  const axil: Signal[] = [
    { id: "s_axil_awvalid", name: "s_axil_awvalid", scope: "axil", width: 1, radix: "bin",
      events: step01(N_CYC, [10, 80, 140]) },
    { id: "s_axil_awready", name: "s_axil_awready", scope: "axil", width: 1, radix: "bin",
      events: step01(N_CYC, [11, 81, 141]) },
    { id: "s_axil_awaddr",  name: "s_axil_awaddr",  scope: "axil", width: 32, radix: "hex",
      events: bus(N_CYC, [ [10, 0x40000010], [12, "Z"], [80, 0x40000014], [82, "Z"], [140, 0x4000001C], [142, "Z"] ]) },
    { id: "s_axil_wdata",   name: "s_axil_wdata",   scope: "axil", width: 32, radix: "hex",
      events: bus(N_CYC, [ [12, 0xDEADBEEF], [14, "Z"], [82, 0xCAFEBABE], [84, "Z"], [142, 0x12345678], [144, "Z"] ]) },
    { id: "s_axil_wvalid",  name: "s_axil_wvalid",  scope: "axil", width: 1, radix: "bin",
      events: step01(N_CYC, [12, 82, 142]) },
    { id: "s_axil_wready",  name: "s_axil_wready",  scope: "axil", width: 1, radix: "bin",
      events: step01(N_CYC, [13, 83, 143]) },
  ];

  const frontend: Signal[] = [
    { id: "raw_instruction",     name: "raw_instruction",     scope: "frontend", width: 64, radix: "hex",
      events: bus(N_CYC, [
        [16, 0x000012345_6789ABCn ], [18, "Z"],    // OP_GEMV
        [84, 0x100012345_6789ABCn ], [86, "Z"],    // OP_GEMM
        [144, 0x2000A_BC0DEEF12n ], [146, "Z"],    // OP_MEMCPY
      ])},
    { id: "kick",               name: "kick",                 scope: "frontend", width: 1, radix: "bin",
      events: step01(N_CYC, [17, 85, 145]) },
    { id: "fetch_PC_ready",     name: "fetch_PC_ready",       scope: "frontend", width: 1, radix: "bin",
      events: [{ t: 0, v: 1 }] },
  ];

  const decoder: Signal[] = [
    { id: "OUT_GEMV_valid", name: "OUT_GEMV_valid",  scope: "decoder", width: 1, radix: "bin",
      events: step01(N_CYC, [18, 20]) },
    { id: "OUT_GEMM_valid", name: "OUT_GEMM_valid",  scope: "decoder", width: 1, radix: "bin",
      events: step01(N_CYC, [86, 88]) },
    { id: "OUT_memcpy_valid", name: "OUT_memcpy_valid", scope: "decoder", width: 1, radix: "bin",
      events: step01(N_CYC, [146, 148]) },
    { id: "OUT_op_x64",     name: "OUT_op_x64",      scope: "decoder", width: 60, radix: "hex",
      events: bus(N_CYC, [
        [18,  0x0012345_6789ABCn], [20, "Z"],
        [86,  0x0012345_6789ABCn], [88, "Z"],
        [146, 0x00A_BC0DEEF12n  ], [148, "Z"],
      ])},
  ];

  const mac: Signal[] = [
    { id: "mac_state", name: "mac_state",  scope: "mac", width: 3, radix: "dec",
      events: [
        { t: 0,   v: "IDLE"    },
        { t: 24,  v: "FETCH_W" },
        { t: 38,  v: "COMPUTE" },
        { t: 74,  v: "DRAIN"   },
        { t: 79,  v: "IDLE"    },
        { t: 92,  v: "FETCH_W" },
        { t: 98,  v: "COMPUTE" },
        { t: 132, v: "DRAIN"   },
        { t: 136, v: "IDLE"    },
      ]},
    { id: "weight_valid", name: "weight_valid",  scope: "mac", width: 1, radix: "bin",
      events: step01(N_CYC, [24, 74, 92, 132]) },
    { id: "p_accum[47:0]", name: "p_accum",       scope: "mac", width: 48, radix: "hex",
      events: (() => {
        const out: Event[] = [{ t: 0, v: 0 }];
        let acc = 0;
        for (let c = 38; c < 74; c += 2) { acc += Math.floor(Math.random() * 512); out.push({ t: c, v: acc }); }
        out.push({ t: 74, v: acc });
        for (let c = 98; c < 132; c += 2) { acc += Math.floor(Math.random() * 512); out.push({ t: c, v: acc }); }
        out.push({ t: 132, v: acc });
        return out;
      })() },
    { id: "mac_stall",    name: "mac_stall",      scope: "mac", width: 1, radix: "bin",
      events: step01(N_CYC, [38, 42, 70, 74, 98, 100, 130, 132]) },
  ];

  const cvo: Signal[] = [
    { id: "cvo_op", name: "cvo_op",  scope: "cvo", width: 3, radix: "dec",
      events: [
        { t: 0,   v: "idle"    },
        { t: 54,  v: "reduce"  },
        { t: 66,  v: "recip"   },
        { t: 72,  v: "idle"    },
        { t: 114, v: "exp"     },
        { t: 124, v: "scale"   },
        { t: 130, v: "idle"    },
      ]},
    { id: "cvo_valid", name: "cvo_valid",  scope: "cvo", width: 1, radix: "bin",
      events: step01(N_CYC, [54, 72, 114, 130]) },
  ];

  const mem: Signal[] = [
    { id: "hp0_bw",    name: "hp0_bw",     scope: "mem", width: 8, radix: "dec",
      events: bus(N_CYC, [ [0, 0], [24, 128], [74, 0], [92, 128], [132, 0] ]) },
    { id: "l2_access", name: "l2_access",  scope: "mem", width: 1, radix: "bin",
      events: step01(N_CYC, [22, 38, 72, 90, 132, 140]) },
  ];

  return [
    { id: "ctrl",     name: "Control",                  expanded: true,  children: ctrl     },
    { id: "axil",     name: "AXI-Lite (s_axil)",        expanded: false, children: axil     },
    { id: "frontend", name: "NPU Frontend",             expanded: true,  children: frontend },
    { id: "decoder",  name: "Decoder (ctrl_npu_decoder)", expanded: false, children: decoder },
    { id: "mac",      name: "MAT_CORE · GEMM MAC",      expanded: true,  children: mac      },
    { id: "cvo",      name: "CVO SFU",                  expanded: false, children: cvo      },
    { id: "mem",      name: "MEM_control",              expanded: false, children: mem      },
  ];
}

// ─── Helpers for demo data ──────────────────────────────────────────────────

function step01(_total: number, toggles: number[]): Event[] {
  // Starts at 0, flips at each listed cycle (pulse = 1 cycle).
  const out: Event[] = [{ t: 0, v: 0 }];
  let v = 0;
  for (const c of toggles) {
    v = v ? 0 : 1;
    out.push({ t: c, v });
  }
  return out;
}

function bus(_total: number, patt: [number, number | bigint | string][]): Event[] {
  void _total;
  return patt.map(([t, v]) => ({ t, v: typeof v === "bigint" ? v.toString() : (v as number | string) }));
}

// ─── Radix formatting ───────────────────────────────────────────────────────

function formatValue(v: number | string, radix: Radix, width: number): string {
  if (typeof v === "string") {
    if (v === "Z" || v === "z" || v === "X" || v === "x") return v.toUpperCase();
    const n = parseSafe(v);
    if (n == null) return v; // treat as opaque label (e.g. state name)
    return renderNumber(n, radix, width);
  }
  return renderNumber(v, radix, width);
}

function parseSafe(s: string): bigint | null {
  try {
    if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
    if (/^[0-9a-fA-F]+$/.test(s) && s.length > 6)  return BigInt("0x" + s);
    if (/^-?\d+$/.test(s)) return BigInt(s);
  } catch { /* fallthrough */ }
  return null;
}

function renderNumber(n: number | bigint, radix: Radix, width: number): string {
  const bn = typeof n === "bigint" ? n : BigInt(Math.trunc(n));
  switch (radix) {
    case "bin":   return "0b" + bn.toString(2).padStart(Math.min(width, 16), "0");
    case "oct":   return "0o" + bn.toString(8);
    case "hex":   {
      const hexDigits = Math.max(1, Math.ceil(width / 4));
      return "0x" + bn.toString(16).toUpperCase().padStart(hexDigits, "0");
    }
    case "dec":   return bn.toString(10);
    case "ascii": {
      const bytes: string[] = [];
      let x = bn;
      while (x > 0n) {
        bytes.unshift(String.fromCharCode(Number(x & 0xffn)));
        x = x >> 8n;
      }
      return "\"" + bytes.join("").replace(/[^ -~]/g, ".") + "\"";
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WaveformViewer() {
  const theme = useTheme();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [groups, setGroups] = useState<Group[]>(makeDemo);
  const [filter, setFilter] = useState("");
  const [zoom, setZoom]     = useState(6);       // pixels per tick
  const [offset, setOffset] = useState(0);       // tick offset (left edge)
  const [cursorA, setCursorA] = useState<number | null>(50);
  const [cursorB, setCursorB] = useState<number | null>(120);
  const [selectedSig, setSelectedSig] = useState<string | null>(null);
  const [globalRadix, setGlobalRadix] = useState<Radix>("hex");
  const [dragState, setDragState] = useState<null | {
    kind: "pan" | "cursorA" | "cursorB";
    startX: number;
    startOffset: number;
  }>(null);

  // ─── Layout constants ─────────────────────────────────────────────────────
  const NAME_W    = 240;
  const HEADER_H  = 36;
  const GROUP_H   = 26;
  const ROW_H     = 24;

  // Flatten groups respecting expansion + filter.
  const rows = useMemo(() => {
    const out: Array<
      | { kind: "group"; group: Group }
      | { kind: "signal"; sig: Signal }
    > = [];
    const needle = filter.trim().toLowerCase();
    const matches = (s: Signal) =>
      !needle ||
      s.name.toLowerCase().includes(needle) ||
      s.scope.toLowerCase().includes(needle);
    for (const g of groups) {
      const kids = g.children.filter(matches);
      if (needle && kids.length === 0) continue;
      out.push({ kind: "group", group: g });
      if (g.expanded) for (const s of kids) out.push({ kind: "signal", sig: s });
    }
    return out;
  }, [groups, filter]);

  const totalTicks = useMemo(() => {
    let m = 0;
    for (const g of groups) for (const s of g.children) for (const ev of s.events) if (ev.t > m) m = ev.t;
    return Math.max(m, 200);
  }, [groups]);

  // ─── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cont   = containerRef.current;
    if (!canvas || !cont) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = cont.clientWidth, ch = cont.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    canvas.width  = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width  = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    // Background split
    ctx.fillStyle = theme.bgSurface;
    ctx.fillRect(0, 0, NAME_W, ch);
    ctx.fillStyle = theme.bgPanel;
    ctx.fillRect(NAME_W, 0, cw - NAME_W, ch);

    // Top timeline ruler
    ctx.fillStyle = theme.bgEditor;
    ctx.fillRect(0, 0, cw, HEADER_H);
    ctx.strokeStyle = theme.border;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H); ctx.lineTo(cw, HEADER_H);
    ctx.moveTo(NAME_W, 0);   ctx.lineTo(NAME_W, ch);
    ctx.stroke();

    const tickToX = (t: number) => NAME_W + (t - offset) * zoom;

    // Ruler ticks
    ctx.fillStyle = theme.textMuted;
    ctx.strokeStyle = theme.borderDim;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const step = pickRulerStep(zoom);
    const firstTick = Math.ceil(offset / step) * step;
    for (let t = firstTick; tickToX(t) < cw; t += step) {
      const x = tickToX(t);
      if (x < NAME_W - 1) continue;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H - 6);
      ctx.lineTo(x, HEADER_H);
      ctx.stroke();
      ctx.fillText(`${t} cyc`, x + 3, 4);
      // Vertical grid line
      ctx.strokeStyle = theme.borderDim;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    // Rows
    let y = HEADER_H;
    ctx.textBaseline = "middle";
    for (const row of rows) {
      if (row.kind === "group") {
        ctx.fillStyle = theme.bgHover;
        ctx.fillRect(0, y, cw, GROUP_H);
        ctx.fillStyle = theme.textDim;
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(`${row.group.expanded ? "▾" : "▸"}  ${row.group.name}`, 12, y + GROUP_H / 2);
        ctx.strokeStyle = theme.border;
        ctx.beginPath(); ctx.moveTo(0, y + GROUP_H); ctx.lineTo(cw, y + GROUP_H); ctx.stroke();
        y += GROUP_H;
      } else {
        const s = row.sig;
        const active = selectedSig === s.id;

        if (active) {
          ctx.fillStyle = theme.accentBg;
          ctx.fillRect(0, y, cw, ROW_H);
        }

        // Signal name column
        ctx.fillStyle = active ? theme.accent : theme.textDim;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(s.name, 22, y + ROW_H / 2);
        // Width badge
        if (s.width > 1) {
          ctx.fillStyle = theme.textFaint;
          ctx.textAlign = "right";
          ctx.fillText(`[${s.width - 1}:0] ${s.radix}`, NAME_W - 8, y + ROW_H / 2);
          ctx.textAlign = "left";
        } else {
          ctx.fillStyle = theme.textFaint;
          ctx.textAlign = "right";
          ctx.fillText(s.radix, NAME_W - 8, y + ROW_H / 2);
          ctx.textAlign = "left";
        }

        // Separator
        ctx.strokeStyle = theme.borderDim;
        ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(cw, y + ROW_H); ctx.stroke();

        // Clip right side
        ctx.save();
        ctx.beginPath(); ctx.rect(NAME_W, y, cw - NAME_W, ROW_H); ctx.clip();

        if (s.width === 1) drawWire(ctx, s, y, ROW_H, tickToX, theme, cw);
        else              drawBus (ctx, s, y, ROW_H, tickToX, theme, cw, globalRadix);

        ctx.restore();
        y += ROW_H;
      }
      if (y > ch) break;
    }

    // Cursors
    const drawCursor = (t: number | null, tag: "A" | "B", colour: string) => {
      if (t == null) return;
      const x = tickToX(t);
      if (x < NAME_W - 1 || x > cw + 1) return;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colour;
      ctx.fillRect(x - 9, 0, 18, 14);
      ctx.fillStyle = "#000";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText(tag, x, 2);
      ctx.textAlign = "left";
    };
    drawCursor(cursorA, "A", theme.warning);
    drawCursor(cursorB, "B", theme.info);
  }, [rows, zoom, offset, cursorA, cursorB, selectedSig, globalRadix, theme, totalTicks]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [draw]);

  // ─── Mouse handling ───────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < NAME_W) {
      // Name column — handle group toggle + signal select
      const y = e.clientY - r.top;
      handleNameClick(x, y);
      return;
    }
    const t = (x - NAME_W) / zoom + offset;
    const dA = cursorA == null ? Infinity : Math.abs(t - cursorA) * zoom;
    const dB = cursorB == null ? Infinity : Math.abs(t - cursorB) * zoom;
    if (dA < 8)        setDragState({ kind: "cursorA",  startX: e.clientX, startOffset: cursorA ?? 0 });
    else if (dB < 8)   setDragState({ kind: "cursorB",  startX: e.clientX, startOffset: cursorB ?? 0 });
    else if (e.shiftKey) setCursorB(Math.max(0, Math.round(t)));
    else if (e.altKey)   setCursorA(Math.max(0, Math.round(t)));
    else                 setDragState({ kind: "pan", startX: e.clientX, startOffset: offset });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    if (dragState.kind === "pan") {
      setOffset(Math.max(0, dragState.startOffset - dx / zoom));
    } else {
      const newT = Math.max(0, dragState.startOffset + dx / zoom);
      if (dragState.kind === "cursorA") setCursorA(Math.round(newT));
      else                               setCursorB(Math.round(newT));
    }
  };

  const onMouseUp = () => setDragState(null);

  const handleNameClick = (_x: number, y: number) => {
    let cy = HEADER_H;
    for (const row of rows) {
      if (row.kind === "group") {
        const h = GROUP_H;
        if (y >= cy && y < cy + h) {
          setGroups(g => g.map(gg => gg.id === row.group.id ? { ...gg, expanded: !gg.expanded } : gg));
          return;
        }
        cy += h;
      } else {
        if (y >= cy && y < cy + ROW_H) {
          setSelectedSig(s => s === row.sig.id ? null : row.sig.id);
          return;
        }
        cy += ROW_H;
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < NAME_W) return;
    const t = (x - NAME_W) / zoom + offset;
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const newZoom = Math.min(60, Math.max(0.25, zoom * factor));
      setOffset(Math.max(0, t - (x - NAME_W) / newZoom));
      setZoom(newZoom);
    } else {
      setOffset(o => Math.max(0, o + e.deltaX / zoom + (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY / zoom : 0)));
    }
  };

  // ─── Derived: selected signal value at each cursor ────────────────────────
  const selectedSignal = useMemo(() => {
    if (!selectedSig) return null;
    for (const g of groups) for (const s of g.children) if (s.id === selectedSig) return s;
    return null;
  }, [groups, selectedSig]);

  const valueAt = (s: Signal | null, t: number | null): string => {
    if (!s || t == null) return "—";
    let cur: Event | null = null;
    for (const ev of s.events) { if (ev.t <= t) cur = ev; else break; }
    if (!cur) return "—";
    return formatValue(cur.v, s.radix, s.width);
  };

  const setRadixForSignal = (id: string, r: Radix) =>
    setGroups(gs => gs.map(g => ({ ...g, children: g.children.map(s => s.id === id ? { ...s, radix: r } : s) })));

  const cycleRadix = (id: string) => {
    const order: Radix[] = ["hex", "dec", "bin", "oct", "ascii"];
    setGroups(gs => gs.map(g => ({ ...g, children: g.children.map(s => {
      if (s.id !== id) return s;
      const idx = (order.indexOf(s.radix) + 1) % order.length;
      return { ...s, radix: order[idx] };
    })})));
  };

  const applyGlobalRadix = (r: Radix) => {
    setGlobalRadix(r);
    setGroups(gs => gs.map(g => ({ ...g, children: g.children.map(s => s.width > 1 ? { ...s, radix: r } : s) })));
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.bgPanel }}>
      {/* Top toolbar */}
      <div className="flex items-center px-3 shrink-0 gap-2"
           style={{ height: 44, borderBottom: `1px solid ${theme.border}`, background: theme.bgEditor }}>
        <Activity size={15} style={{ color: theme.accent }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Waveform Analyser</span>
        <span style={{ fontSize: 10, color: theme.textMuted }}>
          {groups.reduce((n, g) => n + g.children.length, 0)} signals ·
          {" "}{totalTicks.toLocaleString()} cyc range
        </span>

        <div className="flex-1" />

        {/* Signal filter */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
          background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4,
        }}>
          <Search size={11} style={{ color: theme.textMuted }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="filter signals / scope…"
            style={{
              width: 180, fontSize: 11, padding: "1px 2px",
              background: "transparent", border: "none", outline: "none", color: theme.text,
            }}
          />
          {filter && (
            <button onClick={() => setFilter("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.textMuted, padding: 0 }}>
              <X size={10} />
            </button>
          )}
        </div>

        {/* Global radix */}
        <div style={{ display: "inline-flex", gap: 2, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, padding: 2 }}>
          {(["bin", "oct", "hex", "dec", "ascii"] as Radix[]).map(r => (
            <button
              key={r}
              onClick={() => applyGlobalRadix(r)}
              title={`Set all buses to ${r.toUpperCase()}`}
              style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 3,
                background: globalRadix === r ? theme.accent : "transparent",
                color: globalRadix === r ? "#fff" : theme.textMuted,
                border: "none", cursor: "pointer", fontWeight: globalRadix === r ? 700 : 500,
              }}
            >{r.toUpperCase()}</button>
          ))}
        </div>

        <button onClick={() => setZoom(z => Math.min(60, z * 1.3))} style={iconBtn(theme)}>
          <ZoomIn size={12} />
        </button>
        <button onClick={() => setZoom(z => Math.max(0.25, z / 1.3))} style={iconBtn(theme)}>
          <ZoomOut size={12} />
        </button>
        <button onClick={() => { setZoom(6); setOffset(0); }} style={iconBtn(theme)}>
          <Maximize2 size={12} />
        </button>
        <button style={iconBtn(theme)}>
          <Download size={12} /> VCD
        </button>
      </div>

      {/* Cursor readout bar */}
      <div className="flex items-center px-3 shrink-0 gap-4"
           style={{ height: 26, borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface, fontSize: 10 }}>
        <div style={{ color: theme.textMuted }}>
          <Crosshair size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
          drag the canvas to pan · <strong>Alt</strong>-click = cursor A · <strong>Shift</strong>-click = cursor B · Ctrl-scroll = zoom
        </div>
        <div className="flex-1" />
        <Readout tag="A" colour={theme.warning} cycle={cursorA} value={valueAt(selectedSignal, cursorA)} sig={selectedSignal} />
        <Readout tag="B" colour={theme.info}    cycle={cursorB} value={valueAt(selectedSignal, cursorB)} sig={selectedSignal} />
        {cursorA != null && cursorB != null && (
          <span style={{ color: theme.accent, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
            Δ = {Math.abs(cursorB - cursorA).toLocaleString()} cyc
          </span>
        )}
      </div>

      {/* Per-signal radix strip (appears when a bus is selected) */}
      {selectedSignal && selectedSignal.width > 1 && (
        <div className="flex items-center px-3 shrink-0 gap-2"
             style={{ height: 26, borderBottom: `1px solid ${theme.borderDim}`, background: theme.bg, fontSize: 10 }}>
          <Filter size={10} style={{ color: theme.textMuted }} />
          <span style={{ color: theme.textMuted }}>
            Selected: <strong style={{ color: theme.accent }}>{selectedSignal.scope}.{selectedSignal.name}</strong>
            {" "}[{selectedSignal.width - 1}:0]
          </span>
          <span style={{ color: theme.textMuted }}>radix</span>
          {(["bin","oct","hex","dec","ascii"] as Radix[]).map(r => (
            <button
              key={r}
              onClick={() => setRadixForSignal(selectedSignal.id, r)}
              style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: selectedSignal.radix === r ? theme.accentBg : "transparent",
                color: selectedSignal.radix === r ? theme.accent : theme.textMuted,
                border: `1px solid ${selectedSignal.radix === r ? theme.accent : theme.border}`,
                cursor: "pointer",
              }}
            >{r.toUpperCase()}</button>
          ))}
          <button
            onClick={() => cycleRadix(selectedSignal.id)}
            style={{
              fontSize: 10, padding: "1px 8px", borderRadius: 3,
              background: "transparent", color: theme.textMuted,
              border: `1px solid ${theme.border}`, cursor: "pointer",
            }}
            title="Cycle through radixes"
          >cycle →</button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: dragState?.kind === "pan" ? "grabbing" : "default" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

// ─── Draw helpers ────────────────────────────────────────────────────────────

function drawWire(
  ctx: CanvasRenderingContext2D,
  s: Signal,
  yTop: number,
  h: number,
  x: (t: number) => number,
  theme: ReturnType<typeof useTheme>,
  cw: number,
) {
  if (s.events.length === 0) return;
  const lo = yTop + h * 0.78;
  const hi = yTop + h * 0.22;
  ctx.strokeStyle = s.name === "clk" ? theme.accent : "#22c55e";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  let lastY = s.events[0].v === 1 ? hi : lo;
  ctx.moveTo(x(0), lastY);
  for (const ev of s.events) {
    const xt = x(ev.t);
    const yv = typeof ev.v === "string"
      ? (yTop + h / 2)
      : (ev.v === 1 ? hi : lo);
    ctx.lineTo(xt, lastY);
    ctx.lineTo(xt, yv);
    lastY = yv;
  }
  ctx.lineTo(cw, lastY);
  ctx.stroke();
}

function drawBus(
  ctx: CanvasRenderingContext2D,
  s: Signal,
  yTop: number,
  h: number,
  x: (t: number) => number,
  theme: ReturnType<typeof useTheme>,
  cw: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _globalRadix: Radix,
) {
  const lo = yTop + h * 0.78;
  const hi = yTop + h * 0.22;
  const mid = yTop + h / 2;

  for (let i = 0; i < s.events.length; i++) {
    const cur  = s.events[i];
    const next = s.events[i + 1];
    const x1 = x(cur.t);
    const x2 = next ? x(next.t) : cw;
    if (x2 < 0 || x1 > cw) continue;
    const drawX = Math.max(0, x1);
    const drawW = Math.min(cw, x2) - drawX;
    if (drawW <= 0) continue;

    if (cur.v === "Z" || cur.v === "z") {
      ctx.strokeStyle = theme.warning;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(drawX, mid); ctx.lineTo(drawX + drawW, mid); ctx.stroke();
      continue;
    }
    if (cur.v === "X" || cur.v === "x") {
      ctx.fillStyle = "rgba(239,68,68,0.22)";
      ctx.fillRect(drawX, hi, drawW, lo - hi);
      continue;
    }

    // Hexagon outline
    ctx.fillStyle = theme.bgHover;
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1;
    const slant = Math.min(4, drawW / 2);
    ctx.beginPath();
    ctx.moveTo(x1, mid);
    ctx.lineTo(x1 + slant, hi);
    ctx.lineTo(x2 - slant, hi);
    ctx.lineTo(x2, mid);
    ctx.lineTo(x2 - slant, lo);
    ctx.lineTo(x1 + slant, lo);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Label
    if (drawW > 28) {
      ctx.save();
      ctx.beginPath(); ctx.rect(drawX, hi, drawW, lo - hi); ctx.clip();
      ctx.fillStyle = theme.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(formatValue(cur.v, s.radix, s.width), (drawX + drawX + drawW) / 2, mid);
      ctx.restore();
    }
  }
}

function pickRulerStep(zoom: number): number {
  // Target ~100 px per major tick.
  const target = 100;
  const raw    = target / zoom;
  const mag    = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return mag * 10;
}

function Readout(
  { tag, colour, cycle, value, sig }:
  { tag: string; colour: string; cycle: number | null; value: string; sig: Signal | null }
) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 12, height: 12, background: colour, color: "#000", fontSize: 9, fontWeight: 700, textAlign: "center", lineHeight: "12px", borderRadius: 2 }}>{tag}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", color: colour }}>
        {cycle == null ? "—" : `${cycle} cyc`}
      </span>
      {sig && (
        <span style={{ fontFamily: "ui-monospace, monospace", color: "inherit" }}>
          = {value}
        </span>
      )}
    </span>
  );
}

function iconBtn(theme: ReturnType<typeof useTheme>) {
  return {
    display: "inline-flex" as const, alignItems: "center" as const, gap: 4,
    fontSize: 10, padding: "4px 8px",
    color: theme.textMuted, background: theme.bgSurface,
    border: `1px solid ${theme.border}`, borderRadius: 4,
    cursor: "pointer" as const,
  };
}
