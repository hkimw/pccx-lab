import { useState, useEffect, useRef } from "react";
import { useTheme } from "./ThemeContext";
import { Play, Pause, RefreshCw, Cpu, Database, Activity } from "lucide-react";

interface AXI_Tx {
  id: number;
  source: string;
  target: string;
  type: "read" | "write";
  progress: number;
}

export function HardwareVisualizer() {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [running, setRunning] = useState(true);
  const [transactions, setTransactions] = useState<AXI_Tx[]>([]);
  const [svCode, setSvCode] = useState("module tb_kv260_npu;\n  reg clk, rst_n;\n  // AXI Master VIP\n  pccx_axi_vip #(.ADDR_WIDTH(32)) axi_vip();\n\n  initial begin\n    // Send burst request to MAC\n    axi_vip.write(32'h8000_1000, 256, payload);\n    #1000 $finish;\n  end\nendmodule");
  const [compileStatus, setCompileStatus] = useState<string | null>(null);

  // Graph nodes
  const NODES = {
    PS:   { x: 100, y: 150, w: 140, h: 80, label: "Zynq UltraScale+ PS", color: "#f59e0b" },
    AXI:  { x: 350, y: 150, w: 60,  h: 240, label: "AXI SmartConnect", color: "#6b7280" },
    BRAM: { x: 550, y: 50,  w: 120, h: 60, label: "L2 BRAM Cache", color: "#10b981" },
    MAC:  { x: 550, y: 150, w: 120, h: 100, label: "MAC Array (PCCX)", color: "#8b5cf6" },
    DDR:  { x: 550, y: 300, w: 120, h: 60, label: "DDR4 Controller", color: "#3b82f6" },
  };

  useEffect(() => {
    if (!running) return;
    
    // Spawn random AXI transactions
    const interval = setInterval(() => {
      setTransactions(prev => {
        if (prev.length > 5) return prev; // Limit active
        const r = Math.random();
        if (r < 0.3) {
          return [...prev, { id: Date.now(), source: "PS", target: "MAC", type: "write", progress: 0 }];
        } else if (r < 0.6) {
          return [...prev, { id: Date.now(), source: "MAC", target: "BRAM", type: "read", progress: 0 }];
        } else if (r < 0.9) {
          return [...prev, { id: Date.now(), source: "MAC", target: "DDR", type: "write", progress: 0 }];
        }
        return prev;
      });
    }, 400);
    
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      // Update tx progress
      setTransactions(prev => prev.map(t => ({ ...t, progress: t.progress + dt * 0.001 })).filter(t => t.progress < 1.0));

      const canvas = canvasRef.current;
      if (canvas && containerRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        
        if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
          canvas.width = cw * dpr;
          canvas.height = ch * dpr;
          canvas.style.width = `${cw}px`;
          canvas.style.height = `${ch}px`;
        }
        
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cw, ch);

        // Draw connections
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.borderDim;
        const drawLine = (from: any, to: any, color?: string) => {
           ctx.beginPath();
           ctx.moveTo(from.x + from.w, from.y + from.h/2);
           ctx.lineTo(to.x, to.y + to.h/2);
           if (color) ctx.strokeStyle = color;
           ctx.stroke();
           ctx.strokeStyle = theme.borderDim;
        };

        drawLine(NODES.PS, NODES.AXI);
        drawLine(NODES.AXI, NODES.BRAM);
        drawLine(NODES.AXI, NODES.MAC);
        drawLine(NODES.AXI, NODES.DDR);

        // Draw nodes
        ctx.font = "12px Inter, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        
        for (const [key, n] of Object.entries(NODES)) {
          ctx.fillStyle = theme.bgSurface;
          ctx.beginPath();
          ctx.roundRect(n.x, n.y, n.w, n.h, 6);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = theme.border;
          ctx.stroke();

          // Header
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.roundRect(n.x, n.y, n.w, 24, [6,6,0,0]);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.fillText(n.label, n.x + n.w/2, n.y + 12);
        }

        // Draw animated transactions
        transactions.forEach(t => {
          const src = NODES[t.source as keyof typeof NODES];
          const tgt = NODES[t.target as keyof typeof NODES];
          if (!src || !tgt) return;

          let sx, sy, tx, ty;
          
          if (t.source === "PS") {
              sx = src.x + src.w; sy = src.y + src.h/2;
              tx = NODES.AXI.x; ty = NODES.AXI.y + NODES.AXI.h/2;
          } else {
              sx = NODES.AXI.x + NODES.AXI.w; sy = NODES.AXI.y + NODES.AXI.h/2;
              tx = tgt.x; ty = tgt.y + tgt.h/2;
          }

          if (t.source === "MAC") { // Assuming MAC is sending out (write) or requesting (read)
              sx = src.x; sy = src.y + src.h/2;
              tx = NODES.AXI.x + NODES.AXI.w; ty = NODES.AXI.y + NODES.AXI.h/2;
          }

          const curX = sx + (tx - sx) * t.progress;
          const curY = sy + (ty - sy) * t.progress;

          ctx.fillStyle = t.type === "read" ? theme.success : theme.warning;
          ctx.beginPath();
          ctx.arc(curX, curY, 5, 0, Math.PI * 2);
          ctx.fill();
          
          // Glow
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [transactions, theme]);

  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.bgPanel }}>
      <div className="flex items-center px-4 shrink-0" style={{ height: 40, borderBottom: `1px solid ${theme.border}` }}>
        <Cpu size={16} className="mr-2" style={{ color: theme.accent }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>KV260 SV Tester</span>
        <select style={{ marginLeft: 16, fontSize: 11, background: theme.bgInput, border: `1px solid ${theme.borderDim}`, color: theme.textDim, padding: "2px 6px", outline: "none", borderRadius: 4 }}>
           <option>Target: Entire KV260 SoC</option>
           <option>Target: MAC Array Module</option>
           <option>Target: DDR Controllers</option>
           <option>Target: AXI Interconnect VIP</option>
        </select>
        
        <div className="flex-1" />
        
        <div className="flex gap-2">
          <button onClick={() => {
              setCompileStatus("Compiling...");
              setTimeout(() => {
                  setCompileStatus("Running SystemVerilog Test...");
                  setTransactions([]);
                  setRunning(true);
                  setTimeout(() => setCompileStatus("Test Completed"), 5000);
              }, 600);
          }} style={{ padding: "4px 8px", fontSize: 11, background: theme.accent, border: "none", borderRadius: 4, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
            <Play size={12} /> Exectue SV Test
          </button>
          <button onClick={() => setRunning(!running)} style={{ padding: "4px 8px", fontSize: 11, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, color: running ? theme.warning : theme.success, display: "flex", alignItems: "center", gap: 6 }}>
            {running ? <Pause size={12} /> : <Play size={12} />}
            {running ? "Pause Sim" : "Resume"}
          </button>
          <button onClick={() => setTransactions([])} style={{ padding: "4px 8px", fontSize: 11, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, color: theme.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} /> Clear Bus
          </button>
        </div>
      </div>

      {compileStatus && (
          <div style={{ padding: "4px 16px", fontSize: 10, background: theme.bgHover, color: compileStatus.includes("Running") ? theme.accent : theme.success, borderBottom: `1px solid ${theme.border}` }}>
              System Status: {compileStatus}
          </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left SV Pane */}
        <div className="w-[300px] shrink-0 border-r" style={{ borderRight: `1px solid ${theme.border}`, background: theme.bgEditor, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 12px", fontSize: 10, background: theme.bgPanel, borderBottom: `1px solid ${theme.border}`, color: theme.textDim, fontWeight: 600 }}>SystemVerilog Stimulus</div>
            <textarea
                value={svCode}
                onChange={e => setSvCode(e.target.value)}
                style={{
                   flex: 1, padding: 12, outline: "none", resize: "none",
                   background: "transparent", color: theme.text, fontSize: 11,
                   fontFamily: "JetBrains Mono, Menlo, monospace", lineHeight: 1.6
                }}
            />
        </div>

        {/* Right Canvas Pane */}
        <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        {/* Background grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(${theme.borderDim} 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }} />
        <canvas ref={canvasRef} className="absolute inset-0" />
        </div>
      </div>

      <div className="shrink-0 p-3 flex gap-4" style={{ borderTop: `1px solid ${theme.border}`, background: theme.bgSurface }}>
         <div className="flex items-center gap-2" style={{ fontSize: 11, color: theme.textMuted }}>
           <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.success, display: "inline-block" }} /> AXI Read
         </div>
         <div className="flex items-center gap-2" style={{ fontSize: 11, color: theme.textMuted }}>
           <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.warning, display: "inline-block" }} /> AXI Write
         </div>
         <div className="flex-1" />
         <span style={{ fontSize: 11, color: theme.textDim }}>Active Transactions: {transactions.length}</span>
      </div>
    </div>
  );
}
