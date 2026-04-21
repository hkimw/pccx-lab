import { useMemo, useRef, useState, useEffect } from "react";
import { useTheme } from "./ThemeContext";
import {
  Database, Search, Eye, ArrowRight, Star,
} from "lucide-react";

// ─── Memory region model (pccx v002 KV260 layout) ────────────────────────────

type AccessKind = "read" | "write";

interface Region {
  id:    string;
  label: string;
  start: number;
  size:  number;
  colour: string;
  note?:  string;
}

interface Access {
  cycle:   number;
  kind:    AccessKind;
  addr:    number;
  bytes:   number;
}

interface Watch {
  id:    string;
  label: string;
  addr:  number;
  width: 1 | 2 | 4 | 8;
}

const REGIONS: Region[] = [
  { id: "ddr",   label: "DDR4 (host)",       start: 0x8000_0000, size: 0x1000_0000, colour: "#60a5fa", note: "LPDDR4 on the Kria SOM" },
  { id: "l2",    label: "L2 URAM cache",     start: 0x4000_0000, size: 0x0040_0000, colour: "#14b8a6", note: "1.75 MB · 64 URAMs · 2-cyc read" },
  { id: "bram",  label: "BRAM scratchpad",   start: 0x2000_0000, size: 0x0010_0000, colour: "#34d399", note: "On-chip scratchpad, per-core" },
  { id: "hpbuf", label: "HP Buffer FIFO",    start: 0x1000_0000, size: 0x0000_8000, colour: "#f87171", note: "4 × HP AXI weight pre-fetch" },
  { id: "fmap",  label: "fmap cache (27b)",  start: 0x0800_0000, size: 0x0001_C000, colour: "#eab308", note: "2048 × 27b, 32-lane broadcast" },
  { id: "cmd",   label: "AXI-Lite regs",     start: 0x4400_0000, size: 0x0000_1000, colour: "#94a3b8", note: "PS→PL control registers" },
];

function generateBytes(region: Region): Uint8Array {
  const seed = region.start >>> 0;
  const n = Math.min(region.size, 4096);
  const out = new Uint8Array(n);
  let x = seed >>> 0;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x & 0xff;
  }
  return out;
}

function generateAccesses(): Access[] {
  const out: Access[] = [];
  const ops: Array<{ region: string; kind: AccessKind; bytes: number }> = [
    { region: "ddr",   kind: "read",  bytes: 16 },
    { region: "l2",    kind: "write", bytes: 16 },
    { region: "l2",    kind: "read",  bytes: 16 },
    { region: "hpbuf", kind: "write", bytes: 16 },
    { region: "fmap",  kind: "read",  bytes: 4 },
    { region: "bram",  kind: "write", bytes: 6 },
    { region: "cmd",   kind: "write", bytes: 4 },
  ];
  for (let cyc = 0; cyc < 220; cyc++) {
    const op = ops[cyc % ops.length];
    const region = REGIONS.find(r => r.id === op.region);
    if (!region) continue;
    const offset = (cyc * 0x40) % Math.min(region.size, 0x1000);
    out.push({ cycle: cyc, kind: op.kind, addr: region.start + offset, bytes: op.bytes });
  }
  return out;
}

type AddrRadix = "hex" | "dec";

export function MemoryDump() {
  const theme = useTheme();
  const [activeRegion, setActiveRegion] = useState<Region>(REGIONS[1]);
  const [cursor, setCursor]           = useState<number>(REGIONS[1].start);
  const [addrRadix, setAddrRadix]     = useState<AddrRadix>("hex");
  const [highlight, setHighlight]     = useState("");
  const [watches, setWatches]         = useState<Watch[]>([
    { id: "w1", label: "mac_state",  addr: 0x4400_0040, width: 4 },
    { id: "w2", label: "weight_cnt", addr: 0x4400_0044, width: 4 },
    { id: "w3", label: "e_max[0]",   addr: 0x4000_0200, width: 2 },
  ]);
  const [jumpInput, setJumpInput] = useState("");
  const timelineRef = useRef<HTMLCanvasElement>(null);

  const bytes    = useMemo(() => generateBytes(activeRegion), [activeRegion]);
  const accesses = useMemo(() => generateAccesses(), []);

  const regionAccesses = useMemo(
    () => accesses.filter(a => a.addr >= activeRegion.start && a.addr < activeRegion.start + activeRegion.size),
    [accesses, activeRegion],
  );

  const byteHeat = useMemo(() => {
    const map = new Uint16Array(Math.max(1, bytes.length));
    for (const a of regionAccesses) {
      const off = a.addr - activeRegion.start;
      for (let i = 0; i < a.bytes; i++) {
        const pos = off + i;
        if (pos >= 0 && pos < map.length) map[pos]++;
      }
    }
    return map;
  }, [regionAccesses, bytes.length, activeRegion.start]);

  useEffect(() => {
    const canvas = timelineRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, rect.width)  * dpr;
    canvas.height = Math.max(1, rect.height) * dpr;
    canvas.style.width  = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = theme.borderDim;
    ctx.beginPath(); ctx.moveTo(0, rect.height - 1); ctx.lineTo(rect.width, rect.height - 1); ctx.stroke();

    const cycMax = Math.max(...accesses.map(a => a.cycle), 1);

    for (const a of accesses) {
      const region = REGIONS.find(r => a.addr >= r.start && a.addr < r.start + r.size);
      if (!region) continue;
      const x = (a.cycle / cycMax) * rect.width;
      const barH = Math.max(2, rect.height * 0.55);
      ctx.fillStyle = region.colour;
      ctx.globalAlpha = a.kind === "write" ? 0.9 : 0.55;
      ctx.fillRect(x - 1, rect.height - barH, 2, barH);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = activeRegion.colour;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let cyc = 0; cyc <= cycMax; cyc++) {
      const count = regionAccesses.filter(a => a.cycle === cyc).length;
      const x = (cyc / cycMax) * rect.width;
      const y = rect.height - Math.min(rect.height - 2, count * 4);
      if (cyc === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [accesses, activeRegion, regionAccesses, theme]);

  const renderAddr = (a: number) => {
    if (addrRadix === "hex") return "0x" + a.toString(16).toUpperCase().padStart(8, "0");
    return a.toString(10).padStart(10, " ");
  };

  const tryJump = () => {
    const trimmed = jumpInput.trim();
    if (!trimmed) return;
    const n = trimmed.toLowerCase().startsWith("0x") ? parseInt(trimmed, 16) : parseInt(trimmed, 10);
    if (!Number.isFinite(n)) return;
    const r = REGIONS.find(rr => n >= rr.start && n < rr.start + rr.size);
    if (r) { setActiveRegion(r); setCursor(n); }
  };

  const BYTES_PER_ROW = 16;
  const N_ROWS  = Math.ceil(bytes.length / BYTES_PER_ROW);
  const rows = useMemo(() => {
    const out: Array<{ offset: number; bs: Uint8Array; heats: Uint16Array }> = [];
    for (let r = 0; r < N_ROWS; r++) {
      const from = r * BYTES_PER_ROW;
      out.push({
        offset: from,
        bs:    bytes.slice(from, from + BYTES_PER_ROW),
        heats: byteHeat.slice(from, from + BYTES_PER_ROW),
      });
    }
    return out;
  }, [bytes, byteHeat, N_ROWS]);

  const search = highlight.trim().toLowerCase();
  const searchMatches = (row: { bs: Uint8Array }): boolean => {
    if (!search) return false;
    if (/^[0-9a-f]+$/i.test(search) && search.length >= 2 && search.length % 2 === 0) {
      for (let i = 0; i + search.length / 2 <= row.bs.length; i++) {
        let hit = true;
        for (let k = 0; k < search.length / 2; k++) {
          const byte = row.bs[i + k];
          const want = parseInt(search.substr(k * 2, 2), 16);
          if (byte !== want) { hit = false; break; }
        }
        if (hit) return true;
      }
      return false;
    }
    const ascii = Array.from(row.bs).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : ".").join("");
    return ascii.toLowerCase().includes(search);
  };

  const colourForHeat = (h: number) => {
    if (h === 0) return "transparent";
    const alpha = Math.min(0.75, 0.18 + h * 0.12);
    return `rgba(79,193,255,${alpha})`;
  };

  const addWatch = () => {
    setWatches(w => [
      ...w,
      { id: `w${Date.now()}`, label: `watch_${w.length + 1}`, addr: cursor, width: 4 },
    ]);
  };
  const removeWatch = (id: string) => setWatches(w => w.filter(ww => ww.id !== id));

  const readWatchValue = (addr: number, width: 1 | 2 | 4 | 8): string => {
    const region = REGIONS.find(r => addr >= r.start && addr < r.start + r.size);
    if (!region) return "—";
    const off = addr - region.start;
    const buf = generateBytes(region);
    if (off + width > buf.length) return "—";
    let v = 0n;
    for (let i = 0; i < width; i++) v |= BigInt(buf[off + i]) << BigInt(i * 8);
    return "0x" + v.toString(16).toUpperCase().padStart(width * 2, "0");
  };

  return (
    <main role="main" aria-label="Memory dump" className="w-full h-full flex flex-col overflow-hidden" style={{ background: theme.bg }}>
      <div role="toolbar" aria-label="Memory dump toolbar" className="flex items-center px-3 shrink-0 gap-3"
           style={{ height: 44, borderBottom: `1px solid ${theme.border}`, background: theme.bgEditor }}>
        <Database size={15} style={{ color: theme.accent }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>Memory Dump</span>
        <span style={{ fontSize: 10, color: theme.textMuted }}>
          {activeRegion.label} · {bytes.length.toLocaleString()} B loaded
        </span>

        <div className="flex-1" />

        <div style={{ display: "inline-flex", gap: 2, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, padding: 2 }}>
          {(["hex", "dec"] as AddrRadix[]).map(r => (
            <button
              key={r}
              onClick={() => setAddrRadix(r)}
              style={{
                fontSize: 10, padding: "2px 9px", borderRadius: 3,
                background: addrRadix === r ? theme.accent : "transparent",
                color: addrRadix === r ? "#fff" : theme.textMuted,
                border: "none", cursor: "pointer", fontWeight: addrRadix === r ? 700 : 500,
              }}
            >{r.toUpperCase()}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "3px 6px" }}>
          <ArrowRight size={11} style={{ color: theme.textMuted }} />
          <input
            value={jumpInput}
            onChange={e => setJumpInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") tryJump(); }}
            placeholder="0x4000_0200"
            style={{
              width: 130, fontSize: 11, padding: "1px 2px",
              background: "transparent", border: "none", outline: "none",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: theme.text,
            }}
          />
          <button aria-label="Jump to address" onClick={tryJump} style={{
            fontSize: 10, padding: "1px 8px", borderRadius: 3,
            background: theme.accent, color: "#fff", border: "none", cursor: "pointer",
          }}>Go</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "3px 6px" }}>
          <Search size={11} style={{ color: theme.textMuted }} />
          <input
            value={highlight}
            onChange={e => setHighlight(e.target.value)}
            placeholder="bytes (deadbeef) or ASCII"
            style={{
              width: 160, fontSize: 11, padding: "1px 2px",
              background: "transparent", border: "none", outline: "none",
              color: theme.text, fontFamily: "ui-monospace, monospace",
            }}
          />
        </div>
      </div>

      <div style={{
        height: 40, padding: "4px 12px", borderBottom: `1px solid ${theme.border}`,
        background: theme.bgPanel, display: "flex", flexDirection: "column", gap: 2,
      }}>
        <span style={{ fontSize: 9, color: theme.textMuted, letterSpacing: 0.5 }}>
          ACCESS TIMELINE — {accesses.length} events · highlighted region colour = {activeRegion.label}
        </span>
        <canvas ref={timelineRef} style={{ flex: 1, width: "100%" }} />
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div style={{ width: 230, borderRight: `1px solid ${theme.border}`, background: theme.bgPanel, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px 4px", fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Regions
          </div>
          <div style={{ padding: "0 8px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
            {REGIONS.map(r => {
              const active = r.id === activeRegion.id;
              return (
                <button
                  key={r.id}
                  onClick={() => { setActiveRegion(r); setCursor(r.start); }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 2,
                    padding: "6px 9px", textAlign: "left",
                    background: active ? theme.accentBg : "transparent",
                    border: `1px solid ${active ? theme.accent : theme.borderDim}`,
                    borderRadius: 4, cursor: "pointer", color: theme.text,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.colour }} />
                    {r.label}
                  </div>
                  <div style={{ fontSize: 9, color: theme.textMuted, fontFamily: "ui-monospace, monospace" }}>
                    {renderAddr(r.start)} · {(r.size / 1024).toLocaleString()} KB
                  </div>
                  {r.note && <div style={{ fontSize: 9, color: theme.textFaint }}>{r.note}</div>}
                </button>
              );
            })}
          </div>

          <div style={{ padding: "4px 12px", fontSize: 10, color: theme.textMuted, letterSpacing: 0.6, textTransform: "uppercase",
                         display: "flex", alignItems: "center" }}>
            <span>Watches</span>
            <span className="flex-1" />
            <button aria-label="Pin current cursor as watch" onClick={addWatch} title="Add current cursor as watch" style={{
              fontSize: 9, padding: "1px 7px", borderRadius: 3,
              background: "transparent", color: theme.accent,
              border: `1px solid ${theme.accent}`, cursor: "pointer",
            }}>+ pin</button>
          </div>
          <div style={{ padding: "0 8px 12px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
            {watches.map(w => (
              <div key={w.id} style={{
                padding: "6px 9px", background: theme.bgSurface,
                border: `1px solid ${theme.borderDim}`, borderRadius: 4,
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Star size={10} style={{ color: theme.warning }} />
                  <input
                    value={w.label}
                    onChange={e => setWatches(ws => ws.map(x => x.id === w.id ? { ...x, label: e.target.value } : x))}
                    style={{
                      flex: 1, fontSize: 11, background: "transparent",
                      color: theme.text, border: "none", outline: "none", fontWeight: 600,
                    }}
                  />
                  <button aria-label={`Remove watch ${w.label}`} onClick={() => removeWatch(w.id)} style={{
                    fontSize: 9, background: "transparent", border: "none",
                    color: theme.textFaint, cursor: "pointer", padding: 0,
                  }}>✕</button>
                </div>
                <div style={{ fontSize: 10, color: theme.textMuted, fontFamily: "ui-monospace, monospace" }}>
                  {renderAddr(w.addr)} · {w.width} B
                </div>
                <div style={{ fontSize: 11, color: theme.accent, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
                  = {readWatchValue(w.addr, w.width)}
                </div>
              </div>
            ))}
            {watches.length === 0 && (
              <div style={{ fontSize: 10, color: theme.textMuted, padding: "6px 4px" }}>
                No pinned watches. Click <strong>+ pin</strong> to add the current cursor.
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}>
          <div style={{
            position: "sticky", top: 0, zIndex: 1,
            background: theme.bgEditor, borderBottom: `1px solid ${theme.border}`,
            display: "grid",
            gridTemplateColumns: "140px repeat(16, 24px) 24px minmax(160px, 1fr)",
            padding: "4px 12px",
            color: theme.textMuted, fontSize: 10, letterSpacing: 0.4,
          }}>
            <span>OFFSET</span>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} style={{ textAlign: "center" }}>
                {i.toString(16).toUpperCase().padStart(2, "0")}
              </span>
            ))}
            <span />
            <span style={{ paddingLeft: 6 }}>ASCII</span>
          </div>

          {rows.map((row, ri) => {
            const addr = activeRegion.start + row.offset;
            const inCursorRow = cursor >= addr && cursor < addr + BYTES_PER_ROW;
            const rowMatches  = searchMatches(row);
            return (
              <div
                key={ri}
                onClick={() => setCursor(addr)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px repeat(16, 24px) 24px minmax(160px, 1fr)",
                  padding: "2px 12px",
                  background: inCursorRow ? theme.accentBg : rowMatches ? "rgba(229,164,0,0.10)" : "transparent",
                  borderBottom: `1px solid ${theme.borderDim}`,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: inCursorRow ? theme.accent : theme.textMuted }}>
                  {renderAddr(addr)}
                </span>
                {Array.from({ length: 16 }, (_, i) => {
                  const b = row.bs[i] ?? 0;
                  const heat = row.heats[i] ?? 0;
                  const off = row.offset + i;
                  const byteAddr = activeRegion.start + off;
                  const isCursor = byteAddr === cursor;
                  return (
                    <span
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setCursor(byteAddr); }}
                      style={{
                        textAlign: "center",
                        color: heat > 0 ? theme.text : theme.textDim,
                        background: isCursor
                          ? theme.accent
                          : colourForHeat(heat),
                        borderRadius: 2,
                        cursor: "pointer",
                        fontWeight: isCursor ? 700 : 400,
                      }}
                    >
                      {i < row.bs.length ? b.toString(16).toUpperCase().padStart(2, "0") : "  "}
                    </span>
                  );
                })}
                <span />
                <span style={{ paddingLeft: 6, color: theme.text, letterSpacing: 1.5 }}>
                  {Array.from(row.bs).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : "·").join("")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center px-3 shrink-0 gap-3"
           style={{ height: 28, borderTop: `1px solid ${theme.border}`, background: theme.bgPanel, fontSize: 10 }}>
        <Eye size={11} style={{ color: theme.accent }} />
        <span style={{ color: theme.textMuted }}>Cursor:</span>
        <span style={{ color: theme.accent, fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
          {renderAddr(cursor)}
        </span>
        <span style={{ color: theme.textMuted }}>region</span>
        <span style={{ color: activeRegion.colour, fontWeight: 600 }}>{activeRegion.label}</span>
        <span style={{ color: theme.textMuted }}>offset</span>
        <span style={{ color: theme.text, fontFamily: "ui-monospace, monospace" }}>
          0x{(cursor - activeRegion.start).toString(16).toUpperCase().padStart(6, "0")}
        </span>
        <div className="flex-1" />
        <span style={{ color: theme.textMuted }}>
          {regionAccesses.length} access{regionAccesses.length === 1 ? "" : "es"} hit this region
          {highlight && search && ` · ${rows.filter(searchMatches).length} rows match '${highlight}'`}
        </span>
      </div>
    </main>
  );
}
