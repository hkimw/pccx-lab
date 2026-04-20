import { useRef, useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "./ThemeContext";

interface Span {
  name: string;
  start: number;
  duration: number;
  depth: number;
  color: string;
}

export function FlameGraph() {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [totalCycles, setTotalCycles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<{ text: string; rec: string } | null>(null);

  const vp = useRef({ offset: 0, cpp: 1, dragging: false, lastX: 0 });

  useEffect(() => {
    // Generate dummy flame graph data for NPU layers
    const demoSpans: Span[] = [];
    const layers = ["Conv2D_0", "Depthwise_1", "Add_2", "Conv2D_3", "Softmax_4"];
    const colors = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef"];
    
    let t = 0;
    
    // Root span
    const rootDur = 120000;
    demoSpans.push({ name: "Forward_Pass", start: 0, duration: rootDur, depth: 0, color: theme.mode === "dark" ? "#374151" : "#e5e7eb" });

    // Layers
    for (const layer of layers) {
      const lDur = 15000 + Math.random() * 10000;
      demoSpans.push({ name: layer, start: t, duration: lDur, depth: 1, color: colors[Math.floor(Math.random() * colors.length)] });
      
      // Hardware phases inside layer
      let ht = t;
      const phases = [
        { n: "DMA_Read_Wait", w: 0.1 },
        { n: "MAC_Compute", w: 0.7 },
        { n: "DMA_Write", w: 0.2 },
      ];
      
      for (const p of phases) {
        const pdur = lDur * p.w;
        demoSpans.push({ name: p.n, start: ht, duration: pdur, depth: 2, color: colors[Math.floor(Math.random() * colors.length)] });
        ht += pdur;
      }
      
      t += lDur + Math.random() * 500;
    }
    
    setSpans(demoSpans);
    setTotalCycles(rootDur);
    vp.current.cpp = rootDur / 800; // default width guess
    setLoading(false);
  }, [theme.mode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cont = containerRef.current;
    if (!canvas || !cont) return;
    
    const dpr = window.devicePixelRatio || 1;
    const cw = cont.clientWidth; 
    const ch = cont.clientHeight;
    
    canvas.width = cw * dpr; 
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`; 
    canvas.style.height = `${ch}px`;
    
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const { offset, cpp } = vp.current;
    
    // Clear
    ctx.fillStyle = theme.bgPanel;
    ctx.fillRect(0, 0, cw, ch);

    const SPAN_H = 22;
    const paddingY = 20;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (const span of spans) {
      const x1 = (span.start - offset) / cpp;
      const w = span.duration / cpp;
      
      if (x1 + w < 0 || x1 > cw) continue; // Culling

      const y = paddingY + span.depth * (SPAN_H + 2);
      
      const drawX = Math.max(0, x1);
      const drawW = Math.min(cw - drawX, w - (drawX - x1));
      
      if (drawW <= 0) continue;

      // Box
      ctx.fillStyle = span.color;
      ctx.beginPath();
      ctx.roundRect(x1, y, w, SPAN_H, 2);
      ctx.fill();
      
      // Border
      ctx.strokeStyle = theme.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text if wide enough
      if (drawW > 30) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px Inter, sans-serif";
        ctx.save();
        ctx.beginPath(); ctx.rect(drawX, y, drawW, SPAN_H); ctx.clip();
        ctx.fillText(span.name, Math.max(x1 + 4, 4), y + SPAN_H / 2);
        ctx.restore();
      }
    }
  }, [spans, theme]);

  useEffect(() => { 
    draw(); 
    const ro = new ResizeObserver(draw); 
    if (containerRef.current) {
        vp.current.cpp = totalCycles / (containerRef.current.clientWidth || 1000);
        ro.observe(containerRef.current); 
    }
    return () => ro.disconnect(); 
  }, [draw, totalCycles]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const mx = e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0);
    if (e.ctrlKey || e.metaKey) {
      const zf = e.deltaY > 0 ? 1.2 : 0.833;
      const cyc = vp.current.offset + mx * vp.current.cpp;
      vp.current.cpp = Math.max(0.001, vp.current.cpp * zf);
      vp.current.offset = cyc - mx * vp.current.cpp;
    } else {
      vp.current.offset += e.deltaX * vp.current.cpp * 0.5;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) vp.current.offset += e.deltaY * vp.current.cpp * 0.5;
    }
    draw();
  }, [draw]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  
  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (vp.current.dragging) {
      const dx = e.clientX - vp.current.lastX;
      vp.current.offset -= dx * vp.current.cpp;
      vp.current.lastX = e.clientX;
      draw();
      setTooltip(null);
      return;
    }

    const SPAN_H = 22;
    const paddingY = 20;
    const hCyc = vp.current.offset + mx * vp.current.cpp;
    
    // Find highest depth hit
    let hit: Span | null = null;
    for (const span of spans) {
        const y = paddingY + span.depth * (SPAN_H + 2);
        if (my >= y && my <= y + SPAN_H && hCyc >= span.start && hCyc <= span.start + span.duration) {
            if (!hit || span.depth > hit.depth) hit = span;
        }
    }

    if (hit) {
      setTooltip({
        x: e.clientX - rect.left + 15, 
        y: e.clientY - rect.top + 15,
        text: `${hit.name}\nDuration: ${hit.duration.toLocaleString()} cycles\nStart: ${hit.start.toLocaleString()}`
      });
    } else {
      setTooltip(null);
    }
  };

  const handleAIHotspot = () => {
    // Find the longest bottleneck node (deepest level, usually DMA_Read_Wait or MAC_Compute)
    const bottleneck = spans.filter(s => s.depth === 2 && s.name.includes("Wait")).sort((a,b) => b.duration - a.duration)[0];
    if (!bottleneck) return;

    // Smooth scroll to bottleneck
    const targetOffset = bottleneck.start - (containerRef.current?.clientWidth || 800) * 0.1 * vp.current.cpp; // 10% from left
    const targetCpp = bottleneck.duration / ((containerRef.current?.clientWidth || 800) * 0.8); // Fit node into 80%

    // Animate
    let step = 0;
    const startOff = vp.current.offset;
    const startCpp = vp.current.cpp;
    const interval = setInterval(() => {
      step++;
      const t = step / 30; // 30 frames
      const ease = 1 - Math.pow(1 - t, 3);
      vp.current.offset = startOff + (targetOffset - startOff) * ease;
      vp.current.cpp = startCpp + (targetCpp - startCpp) * ease;
      draw();
      
      if (step >= 30) {
        clearInterval(interval);
        setAiAnalysis({
          text: `Found critical bottleneck: [${bottleneck.name}] stalled for ${bottleneck.duration.toLocaleString()} cycles.`,
          rec: "Recommend enabling L2 Hardware Prefetcher and increasing AXI Burst Length from 16 to 64 beats to hide DRAM latency."
        });
      }
    }, 16);
  };

  const btnStyle = { fontSize: 10, padding: "2px 8px", borderRadius: 3, background: theme.bgSurface, color: theme.textDim, border: `1px solid ${theme.border}`, cursor: "pointer", transition: "all 0.2s" };

  return (
    <div className="w-full h-full flex flex-col relative" style={{ background: theme.bgPanel }}>
      <div className="flex items-center px-3 gap-3 shrink-0" style={{ height: 30, borderBottom: `1px solid ${theme.border}` }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, letterSpacing: "0.05em" }}>FLAME GRAPH</span>
        <button onClick={() => { if(containerRef.current) { vp.current.offset=0; vp.current.cpp = totalCycles / containerRef.current.clientWidth; draw(); setAiAnalysis(null); } }} style={btnStyle} className="hover:opacity-80">Fit All</button>
        <button onClick={handleAIHotspot} style={{ ...btnStyle, background: theme.accent, color: "#fff", border: `1px solid ${theme.accent}`, display: "flex", alignItems: "center", gap: 4 }} className="hover:opacity-80">
           ✨ Find Bottleneck Spot
        </button>
        {loading && <span style={{ fontSize: 10, color: theme.textMuted }} className="animate-pulse">Loading...</span>}
        <div className="flex-1" />
        <span style={{ fontSize: 9, color: theme.textFaint }}>Ctrl+Scroll: zoom · Drag: pan</span>
      </div>
      
      <div 
        ref={containerRef} 
        className="flex-1 relative overflow-hidden" 
        style={{ cursor: vp.current.dragging ? "grabbing" : "crosshair" }}
        onMouseDown={e => { vp.current.dragging = true; vp.current.lastX = e.clientX; }}
        onMouseUp={() => vp.current.dragging = false}
        onMouseLeave={() => vp.current.dragging = false}
        onMouseMove={onMouseMove}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {tooltip && (
          <div className="absolute z-50 pointer-events-none rounded px-2 py-1.5 shadow-xl transition-all" style={{
            left: tooltip.x, top: tooltip.y, fontSize: 10, whiteSpace: "pre",
            background: theme.bgSurface, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}>
            {tooltip.text}
          </div>
        )}

        {/* AI Analysis Floating Widget */}
        {aiAnalysis && (
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 w-[400px] rounded-lg p-4 shadow-2xl animate-in zoom-in slide-in-from-top-4 duration-300" style={{ background: theme.mode === "dark" ? "#252526" : "#fff", border: `1px solid ${theme.error}`, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
               <div className="flex items-center gap-2 mb-2">
                 <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: theme.error }}></div>
                 <h4 style={{ fontSize: 12, fontWeight: 700, color: theme.error }}>Critical Stalls Detected</h4>
               </div>
               <p style={{ fontSize: 11, color: theme.text, marginBottom: 8, lineHeight: 1.5 }}>{aiAnalysis.text}</p>
               <div style={{ background: theme.mode === "dark" ? "#1e1e1e" : "#f5f5f5", padding: "8px 12px", borderRadius: 6, borderLeft: `3px solid ${theme.accent}` }}>
                 <p style={{ fontSize: 10, color: theme.textDim }}>💡 <strong>AI Recommendation:</strong><br/>{aiAnalysis.rec}</p>
               </div>
               <button onClick={() => setAiAnalysis(null)} className="absolute top-3 right-3" style={{ color: theme.textMuted }}>✕</button>
            </div>
        )}
      </div>
    </div>
  );
}
