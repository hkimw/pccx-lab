import { useEffect, useRef, useState, useMemo } from "react";
import { Play, ZoomIn, ZoomOut, Save, Crosshair, ChevronRight, ChevronDown, Activity } from "lucide-react";
import { useTheme } from "./ThemeContext";

interface Signal {
  name: string;
  type: "clock" | "wire" | "bus";
  expanded?: boolean;
  children?: Signal[];
  data: Array<{ t: number; v: number | string }>; // time to value transition
}

export function WaveformViewer() {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [cursorTime, setCursorTime] = useState<number | null>(null);

  // Generate fake wave data mimicking Vivado Modelsim/GTKWave logic analyzers
  useEffect(() => {
    const fakeData: Signal[] = [];
    const MAX_T = 1000;
    
    // Core Clock
    const clkEvents = [];
    for(let t=0; t<=MAX_T; t+=10) clkEvents.push({t, v: (t/10)%2===0 ? 1 : 0});
    fakeData.push({ name: "sys_clk", type: "clock", data: clkEvents });

    // Reset
    fakeData.push({ name: "rst_n", type: "wire", data: [{t:0, v:0}, {t:35, v:1}] });

    // AXI Bus
    fakeData.push({ 
        name: "m_axi_gmem", type: "bus", expanded: true, data: [],
        children: [
           { name: "AWVALID", type: "wire", data: [{t:0, v:0}, {t:100, v:1}, {t:110, v:0}, {t:300, v:1}, {t:310, v:0}] },
           { name: "AWADDR", type: "bus", data: [{t:0, v:"Z"}, {t:100, v:"0x80001000"}, {t:110, v:"Z"}, {t:300, v:"0x80040000"}, {t:310, v:"Z"}] },
           { name: "WVALID", type: "wire", data: [{t:0, v:0}, {t:130, v:1}, {t:150, v:0}] },
           { name: "WDATA", type: "bus", data: [{t:0, v:"Z"}, {t:130, v:"D5A92211"}, {t:140, v:"FF12BB00"}, {t:150, v:"Z"}] },
        ]
    });

    // MAC Array Core States
    fakeData.push({
        name: "mac_state", type: "bus", data: [
            {t:0, v:"IDLE"}, {t:120, v:"FETCH"}, {t:180, v:"COMPUTE"}, {t:400, v:"WRITEBACK"}, {t:420, v:"IDLE"}
        ]
    });

    setSignals(fakeData);
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    
    // Prevent 0 size crash
    if (cw === 0 || ch === 0) return;

    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    
    // UI Layout vars
    const NAME_W = 200;
    const ROW_H = 24;
    const paddingY = 30; // Top timeline header

    // Clear background
    ctx.fillStyle = theme.bgPanel;
    ctx.fillRect(NAME_W, 0, cw - NAME_W, ch);
    ctx.fillStyle = theme.bgSurface;
    ctx.fillRect(0, 0, NAME_W, ch);
    
    // Grid Lines
    ctx.strokeStyle = theme.borderDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(NAME_W, 0); ctx.lineTo(NAME_W, ch);
    ctx.stroke();

    const renderZoom = Math.max(0.001, zoom);
    const step = Math.max(5, 100 * renderZoom); // Safely clamp the grid step to avoid infinite loop
    for (let x = NAME_W; x < cw; x += step) {
       ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
       ctx.fillStyle = theme.textMuted;
       ctx.font = "10px sans-serif";
       ctx.fillText(`${Math.round((x - NAME_W + scrollX)/renderZoom)}ns`, x + 4, 16);
    }

    // Flatten signals to consider expansion
    const renderRows: Array<{sig: Signal, depth: number}> = [];
    const traverse = (s: Signal, d: number) => {
        renderRows.push({sig: s, depth: d});
        if (s.expanded && s.children) s.children.forEach(c => traverse(c, d+1));
    };
    signals.forEach(s => traverse(s, 0));

    // Render Rows
    let y = paddingY;
    renderRows.forEach(({sig, depth}) => {
       // Name panel
       ctx.fillStyle = theme.textDim;
       ctx.font = "11px Inter, monospace";
       ctx.textAlign = "left";
       ctx.textBaseline = "middle";
       ctx.fillText(sig.name, 10 + depth * 15 + (sig.children ? 10 : 0), y + ROW_H/2);
       
       // Separator
       ctx.strokeStyle = theme.borderDim;
       ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(cw, y + ROW_H); ctx.stroke();
       
       // Draw Waveform Data
       ctx.save();
       ctx.beginPath(); ctx.rect(NAME_W, y, cw - NAME_W, ROW_H); ctx.clip();
       
       const getScreenX = (t: number) => NAME_W + (t * zoom) - scrollX;
       
       if (sig.type === "wire" || sig.type === "clock") {
           ctx.strokeStyle = sig.type === "clock" ? theme.accent : "#22c55e"; // bright green for wires
           ctx.lineWidth = 2;
           ctx.beginPath();
           
           if (sig.data.length > 0) {
               let lastX = NAME_W, lastV = sig.data[0].v === 1 ? ROW_H*0.2 : ROW_H*0.8;
               ctx.moveTo(lastX, y + lastV);
               
               for (let i = 0; i < sig.data.length; i++) {
                   const curr = sig.data[i];
                   const sx = getScreenX(curr.t);
                   const sv = curr.v === 1 ? ROW_H*0.2 : ROW_H*0.8;
                   
                   ctx.lineTo(sx, y + lastV); // hold previous state
                   ctx.lineTo(sx, y + sv);    // vertical transition
                   lastX = sx; lastV = sv;
               }
               ctx.lineTo(cw, y + lastV); // extend to end
               ctx.stroke();
           }
       } else if (sig.type === "bus") {
           // Draw Bus states
           if (sig.data.length > 0) {
               for (let i = 0; i < sig.data.length; i++) {
                   const curr = sig.data[i];
                   const next = sig.data[i+1];
                   const sx = getScreenX(curr.t);
                   const nx = next ? getScreenX(next.t) : cw;
                   
                   if (sx > cw || nx < NAME_W) continue;
                   
                   const drawX = Math.max(NAME_W, sx);
                   const drawW = Math.min(cw, nx) - drawX;
                   
                   if (curr.v === "Z" || curr.v === "X") {
                       // High Z
                       ctx.strokeStyle = theme.error; ctx.lineWidth = 1;
                       ctx.beginPath(); ctx.moveTo(drawX, y + ROW_H/2); ctx.lineTo(drawX + drawW, y + ROW_H/2); ctx.stroke();
                   } else {
                       // Hex Box
                       ctx.fillStyle = theme.bgHover;
                       ctx.strokeStyle = "#38bdf8"; // blue bus lines
                       ctx.lineWidth = 1;
                       
                       ctx.beginPath();
                       // hexagon logic
                       const slant = Math.min(4, drawW / 2);
                       ctx.moveTo(drawX, y + ROW_H/2);
                       ctx.lineTo(drawX + slant, y + ROW_H*0.2);
                       ctx.lineTo(drawX + drawW - slant, y + ROW_H*0.2);
                       ctx.lineTo(drawX + drawW, y + ROW_H/2);
                       ctx.lineTo(drawX + drawW - slant, y + ROW_H*0.8);
                       ctx.lineTo(drawX + slant, y + ROW_H*0.8);
                       ctx.closePath();
                       ctx.fill(); ctx.stroke();
                       
                       // Text
                       if (drawW > 20) {
                           ctx.fillStyle = theme.text;
                           ctx.textAlign = "center";
                           ctx.fillText(String(curr.v), drawX + drawW/2, y + ROW_H/2);
                       }
                   }
               }
           }
       }
       ctx.restore();
       y += ROW_H;
    });

    // Crosshair
    if (cursorTime !== null) {
       const cx = NAME_W + (cursorTime * zoom) - scrollX;
       if (cx > NAME_W && cx < cw) {
           ctx.strokeStyle = theme.warning;
           ctx.lineWidth = 1;
           ctx.setLineDash([4, 4]);
           ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ch); ctx.stroke();
           ctx.setLineDash([]);
           
           // Value tag
           ctx.fillStyle = theme.warning;
           ctx.fillRect(cx - 20, 0, 40, 16);
           ctx.fillStyle = "#000";
           ctx.textAlign = "center";
           ctx.fillText(cursorTime.toString(), cx, 8);
       }
    }
  };

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [signals, zoom, scrollX, cursorTime, theme]);

  const handleWheel = (e: React.WheelEvent) => {
     if (e.ctrlKey) setZoom(z => Math.max(0.1, z - e.deltaY * 0.005));
     else setScrollX(s => Math.max(0, s + e.deltaX));
  };

  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.bgPanel }}>
      <div className="flex items-center px-4 shrink-0" style={{ height: 40, borderBottom: `1px solid ${theme.border}` }}>
        <Activity size={16} className="mr-2" style={{ color: theme.accent }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Advanced Waveform Analyser</span>
        <div className="flex-1" />
        <div className="flex gap-2">
            <button onClick={() => setZoom(z => Math.min(10, z * 1.5))} style={{ padding: "4px 8px", fontSize: 11, background: theme.bgHover, border: `1px solid ${theme.border}`, borderRadius: 4, display: "flex", gap: 4, color: theme.text }}><ZoomIn size={12}/> Zoom In</button>
            <button onClick={() => setZoom(z => Math.max(0.1, z / 1.5))} style={{ padding: "4px 8px", fontSize: 11, background: theme.bgHover, border: `1px solid ${theme.border}`, borderRadius: 4, display: "flex", gap: 4, color: theme.text }}><ZoomOut size={12}/> Zoom Out</button>
            <button style={{ padding: "4px 8px", fontSize: 11, background: theme.bgHover, border: `1px solid ${theme.border}`, borderRadius: 4, display: "flex", gap: 4, color: theme.text }}><Save size={12}/> VCD Export</button>
        </div>
      </div>
      <div className="flex-1 relative" ref={containerRef} onWheel={handleWheel}
           onMouseMove={e => {
               if(!containerRef.current) return;
               const rect = containerRef.current.getBoundingClientRect();
               const x = e.clientX - rect.left;
               if (x > 200) setCursorTime(Math.round((x - 200 + scrollX) / zoom));
           }}
           onMouseLeave={() => setCursorTime(null)}>
         <canvas ref={canvasRef} className="absolute inset-0" />
         
         {/* React HTML overlays for interactivity (expand arrows) */}
         <div className="absolute left-0 top-[30px] bottom-0 w-[200px] pointer-events-none">
             {(() => {
                 const arr = [];
                 let y = 0;
                 const traverse = (s: Signal, depth: number) => {
                     if (s.children) {
                         const currY = y;
                         arr.push(
                             <div key={s.name} className="absolute flex items-center pointer-events-auto cursor-pointer" 
                                  style={{ top: currY, height: 24, left: depth * 15, width: 24 }}
                                  onClick={() => setSignals(prev => {
                                      const clone = JSON.parse(JSON.stringify(prev));
                                      const find = (arr: Signal[]) => {
                                          for(let i=0; i<arr.length; i++) {
                                              if(arr[i].name === s.name) arr[i].expanded = !arr[i].expanded;
                                              else if (arr[i].children) find(arr[i].children!);
                                          }
                                      };
                                      find(clone);
                                      return clone;
                                  })}>
                                 {s.expanded ? <ChevronDown size={14} color={theme.textMuted}/> : <ChevronRight size={14} color={theme.textMuted}/>}
                             </div>
                         );
                     }
                     y += 24;
                     if (s.expanded && s.children) s.children.forEach(c => traverse(c, depth+1));
                 };
                 signals.forEach(s => traverse(s, 0));
                 return arr;
             })()}
         </div>
      </div>
    </div>
  );
}
