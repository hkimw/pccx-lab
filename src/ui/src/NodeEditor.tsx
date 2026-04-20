import { useCallback, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "./ThemeContext";

// ─── Shared ───────────────────────────────────────────────────────────────────

function useNodeStyle() {
  const theme = useTheme();
  return {
    background: theme.mode === "dark" ? "#252526" : "#ffffff",
    border: "1.5px solid",
    borderRadius: 8,
    minWidth: 210,
    fontFamily: "Inter, sans-serif",
    boxShadow: theme.mode === "dark" ? "0 4px 20px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,0,0,0.08)",
  };
}

function Header({ title, sub, color }: { title: string; sub?: string; color: string }) {
  const theme = useTheme();
  return (
    <div style={{ padding: "6px 10px", borderBottom: `1px solid ${theme.mode === "dark" ? "#3e3e3e" : "rgba(0,0,0,0.06)"}`, background: `linear-gradient(135deg, ${color}22, ${color}11)`, borderRadius: "6px 6px 0 0" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>● {title}</div>
      {sub && <div style={{ fontSize: 9, color: theme.textDim, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, value, unit, type = "number", options, onChange, min, max }: {
  label: string; value: string | number; unit?: string;
  type?: "number" | "select" | "text" | "range";
  options?: string[]; onChange?: (v: string) => void; min?: number; max?: number;
}) {
  const theme = useTheme();
  const d = theme.mode === "dark";
  return (
    <div className="flex items-center justify-between gap-2 py-[3px] px-3">
      <span style={{ fontSize: 10, color: theme.textMuted, whiteSpace: "nowrap" }}>{label}</span>
      <div className="flex items-center gap-1">
        {type === "select" && options ? (
          <select value={value} onChange={e => onChange?.(e.target.value)}
            style={{ fontSize: 10, background: d ? "#3c3c3c" : "#f3f4f6", border: `1px solid ${d ? "#4a4a4a" : "#d1d5db"}`, borderRadius: 3, color: theme.text, padding: "1px 4px" }}>
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : type === "range" ? (
          <input type="range" min={min} max={max} value={value} onChange={e => onChange?.(e.target.value)} style={{ width: 65, accentColor: "#3b82f6" }} />
        ) : (
          <input type={type === "number" ? "number" : "text"} value={value} min={min} max={max} onChange={e => onChange?.(e.target.value)}
            style={{ width: 65, fontSize: 10, background: d ? "#3c3c3c" : "#f3f4f6", border: `1px solid ${d ? "#4a4a4a" : "#d1d5db"}`, borderRadius: 3, color: theme.text, padding: "1px 6px", textAlign: "right" }} />
        )}
        {unit && <span style={{ fontSize: 9, color: theme.textMuted }}>{unit}</span>}
      </div>
    </div>
  );
}

const handleStyle = (color: string, pos: "left" | "right" | "top" | "bottom") => ({
  background: color, border: "2px solid #252526", width: 10, height: 10,
  ...(pos === "left" ? { left: -5 } : pos === "right" ? { right: -5 } : pos === "top" ? { top: -5 } : { bottom: -5 }),
});

// ─── Nodes ────────────────────────────────────────────────────────────────────

function HostNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#94a3b8";
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="Host CPU" sub="Command interface" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Interface" value="PCIe 4.0" type="select" options={["PCIe 3.0","PCIe 4.0","PCIe 5.0","CXL 3.0"]} />
        <Field label="Bandwidth" value="32" unit="GB/s" type="number" />
      </div>
      <Handle type="source" id="cmd"  position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="dma"  position={Position.Bottom} style={handleStyle(c, "bottom")} />
    </div>
  );
}

function DramNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#60a5fa";
  const [bw, setBw] = useState("68"); const [cap, setCap] = useState("16");
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="DRAM" sub="Off-chip memory" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Bandwidth" value={bw} unit="GB/s" onChange={setBw} />
        <Field label="Capacity" value={cap} unit="GB" onChange={setCap} />
        <Field label="Type" value="LPDDR5" type="select" options={["LPDDR5","HBM2E","DDR5","GDDR6X"]} />
      </div>
      <Handle type="target" id="wb_in" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="read"  position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="stat"  position={Position.Bottom} style={handleStyle(c, "bottom")} />
    </div>
  );
}

function AxiNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#818cf8";
  const [bw, setBw] = useState("16"); const [burst, setBurst] = useState("16");
  return (
    <div style={{ ...s, borderColor: c + "55", minWidth: 230 }}>
      <Header title="AXI-128 Interconnect" sub="Multi-port fabric" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Bandwidth" value={bw} unit="B/cyc" onChange={setBw} />
        <Field label="Burst Len" value={burst} unit="beats" onChange={setBurst} />
        <Field label="Width" value="128-bit" type="select" options={["64-bit","128-bit","256-bit","512-bit"]} />
        <Field label="Overhead" value="15" unit="cycles" />
        <Field label="Ports" value="4" type="select" options={["1","2","4","8"]} />
      </div>
      <Handle type="target" id="in_host" position={Position.Top} style={handleStyle(c, "top")} />
      <Handle type="target" id="in_dram" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="out_bram" position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="out_ctrl" position={Position.Bottom} style={handleStyle(c, "bottom")} />
    </div>
  );
}

function BramNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#34d399";
  const [cap, setCap] = useState("1024");
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="L2 / BRAM" sub="On-chip scratchpad" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Capacity" value={cap} unit="KB" onChange={setCap} />
        <Field label="Read BW" value="64" unit="B/cyc" />
        <Field label="Write BW" value="64" unit="B/cyc" />
        <Field label="Read Ports" value="2" type="select" options={["1","2","4"]} />
        <Field label="Banks" value="4" type="select" options={["1","2","4","8","16"]} />
      </div>
      <Handle type="target" id="in" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="to_mac_a" position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="to_mac_b" position={Position.Bottom} style={handleStyle("#22d3ee", "bottom")} />
    </div>
  );
}

function MacNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#a78bfa";
  const [rows, setRows] = useState("32"); const [cols, setCols] = useState("32"); const [clk, setClk] = useState("1000");
  const tops = (Number(rows) * Number(cols) * 2 * 32 * Number(clk) * 1e6 / 1e12).toFixed(2);
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="MAC Array" sub={`Systolic · ${tops} TOPS`} color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Rows" value={rows} type="range" min={4} max={128} onChange={setRows} />
        <Field label="Cols" value={cols} type="range" min={4} max={128} onChange={setCols} />
        <Field label="Precision" value="BF16" type="select" options={["INT8","BF16","FP16","FP32"]} />
        <Field label="Clock" value={clk} unit="MHz" onChange={setClk} />
        <Field label="Pipeline" value="10" unit="stg" />
        <div style={{ margin: "4px 12px 2px", padding: "4px 6px", background: "#333333", borderRadius: 4, textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{tops} TOPS</span>
        </div>
      </div>
      <Handle type="target" id="tile_a" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="target" id="tile_b" position={Position.Top} style={handleStyle("#22d3ee", "top")} />
      <Handle type="source" id="partial" position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="stall" position={Position.Bottom} style={handleStyle("#6366f1", "bottom")} />
    </div>
  );
}

function AccumNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#f59e0b";
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="Accumulator" sub="Register file + adder tree" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Precision" value="FP32" type="select" options={["INT32","FP32","FP64"]} />
        <Field label="Depth" value="64" unit="regs" />
        <Field label="Adder Tree" value="Yes" type="select" options={["No","Yes"]} />
      </div>
      <Handle type="target" id="in" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="out" position={Position.Right} style={handleStyle(c, "right")} />
    </div>
  );
}

function PostProcNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#fb923c";
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="Post-Proc Unit" sub="Activation / Norm / Quant" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Activation" value="ReLU" type="select" options={["None","ReLU","GELU","SiLU","Sigmoid","Swish"]} />
        <Field label="Normalizer" value="LayerNorm" type="select" options={["None","LayerNorm","BatchNorm","RMSNorm","GroupNorm"]} />
        <Field label="Quantize" value="None" type="select" options={["None","INT8","FP8"]} />
        <Field label="Softmax" value="Yes" type="select" options={["No","Yes"]} />
      </div>
      <Handle type="target" id="in" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="out" position={Position.Right} style={handleStyle(c, "right")} />
      <Handle type="source" id="stats" position={Position.Bottom} style={handleStyle("#fb7185", "bottom")} />
    </div>
  );
}

function WriteBackNode(_: NodeProps) {
  const s = useNodeStyle(); const c = "#f472b6";
  return (
    <div style={{ ...s, borderColor: c + "55" }}>
      <Header title="Write-back Engine" sub="DMA write unit" color={c} />
      <div style={{ padding: "4px 0" }}>
        <Field label="Mode" value="DMA" type="select" options={["DMA","MMIO","Streaming"]} />
        <Field label="Channels" value="4" type="select" options={["1","2","4","8"]} />
        <Field label="Buffer" value="16" unit="KB" />
      </div>
      <Handle type="target" id="in" position={Position.Left} style={handleStyle(c, "left")} />
      <Handle type="source" id="to_dram" position={Position.Right} style={handleStyle(c, "right")} />
    </div>
  );
}

// ─── Registration ─────────────────────────────────────────────────────────────
const nodeTypes: NodeTypes = {
  host: HostNode as any, dram: DramNode as any, axi: AxiNode as any,
  bram: BramNode as any, mac: MacNode as any, accum: AccumNode as any,
  postproc: PostProcNode as any, writeback: WriteBackNode as any,
};

function buildGraph() {
  const nodes: Node[] = [
    { id: "host",      type: "host",      position: { x: 20,   y: 0   }, data: {} },
    { id: "dram",      type: "dram",      position: { x: 20,   y: 200 }, data: {} },
    { id: "axi",       type: "axi",       position: { x: 280,  y: 80  }, data: {} },
    { id: "bram",      type: "bram",      position: { x: 560,  y: 20  }, data: {} },
    { id: "mac",       type: "mac",       position: { x: 820,  y: 20  }, data: {} },
    { id: "accum",     type: "accum",     position: { x: 1060, y: 60  }, data: {} },
    { id: "postproc",  type: "postproc",  position: { x: 1060, y: 240 }, data: {} },
    { id: "writeback", type: "writeback", position: { x: 820,  y: 340 }, data: {} },
  ];

  const mkEdge = (id: string, src: string, srcH: string, tgt: string, tgtH: string, color: string, label?: string): Edge => ({
    id, source: src, sourceHandle: srcH, target: tgt, targetHandle: tgtH,
    animated: true, style: { stroke: color, strokeWidth: 1.5 },
    label, labelStyle: { fill: color, fontSize: 9 }, labelBgStyle: { fill: "#252526", fillOpacity: 0.9 },
    deletable: true,
  });

  const edges: Edge[] = [
    mkEdge("host-axi",  "host", "cmd",     "axi", "in_host",  "#94a3b8", "CMD"),
    mkEdge("dram-axi",  "dram", "read",    "axi", "in_dram",  "#60a5fa", "DMA READ"),
    mkEdge("axi-bram",  "axi",  "out_bram","bram","in",       "#818cf8", "AXI burst"),
    mkEdge("bram-macA", "bram", "to_mac_a","mac", "tile_a",   "#34d399", "A tile"),
    mkEdge("bram-macB", "bram", "to_mac_b","mac", "tile_b",   "#22d3ee", "B tile"),
    mkEdge("mac-accum", "mac",  "partial", "accum","in",      "#a78bfa", "partial Σ"),
    mkEdge("accum-pp",  "accum","out",     "postproc","in",   "#f59e0b", "C matrix"),
    mkEdge("pp-wb",     "postproc","out",  "writeback","in",  "#fb923c", "output"),
    mkEdge("wb-dram",   "writeback","to_dram","dram","wb_in", "#f472b6", "DMA WRITE"),
  ];

  return { nodes, edges };
}

import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

// ─── DnD Sidebar ──────────────────────────────────────────────────────────────

function Sidebar() {
  const theme = useTheme();
  
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const modules = [
     { id: "host", label: "Host CPU", color: "#94a3b8" },
     { id: "dram", label: "DRAM Controller", color: "#60a5fa" },
     { id: "axi", label: "AXI Interconnect", color: "#818cf8" },
     { id: "bram", label: "L2 BRAM Cache", color: "#34d399" },
     { id: "mac", label: "MAC Array", color: "#a78bfa" },
     { id: "accum", label: "Accumulator", color: "#f59e0b" },
     { id: "postproc", label: "Post-Processing", color: "#fb923c" },
     { id: "writeback", label: "DMA Write-Back", color: "#f472b6" }
  ];

  return (
    <div className="w-[220px] shrink-0 flex flex-col" style={{ background: theme.bgPanel, borderRight: `1px solid ${theme.border}` }}>
      <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${theme.border}`, color: theme.text }}>
        Hardware Modules
      </div>
      <div style={{ fontSize: 10, color: theme.textMuted, padding: "8px 16px", borderBottom: `1px solid ${theme.border}` }}>
        Drag nodes into the canvas to build a custom NPU dataflow topology.
      </div>
      <div className="flex px-4 py-2 gap-2 border-b" style={{ borderColor: theme.border }}>
         <button onClick={() => alert("Topology cleared")} className="flex-1 py-1 rounded text-[10px] font-bold shadow" style={{ background: theme.bgSurface, color: theme.textDim, border: `1px solid ${theme.border}` }}>
            Clear Graph
         </button>
         <button onClick={() => alert("Exported pccx_topology.json")} className="flex-1 py-1 rounded text-[10px] font-bold shadow" style={{ background: theme.accent, color: "#fff" }}>
            Export JSON
         </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
         {modules.map(opt => (
            <div key={opt.id} 
                 onDragStart={(e) => onDragStart(e, opt.id)} 
                 draggable
                 style={{ padding: "8px 12px", background: theme.bgSurface, border: `1px solid ${theme.borderDim}`, borderRadius: 6, cursor: "grab", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: opt.color, boxShadow: `0 0 8px ${opt.color}88` }} />
                <span style={{ fontSize: 11, color: theme.text, fontWeight: 600 }}>{opt.label}</span>
            </div>
         ))}
      </div>
    </div>
  );
}

// ─── Main Flow Component ──────────────────────────────────────────────────────

let idIndex = 0;
const getId = () => `node_drop_${idIndex++}`;

function DnDFlow() {
  const theme = useTheme();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { nodes: initN, edges: initE } = useMemo(buildGraph, []);
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initN);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initE);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback((p: Connection) => setEdges(eds => addEdge({ ...p, animated: true, style: { stroke: "#6b7280", strokeWidth: 1.5 }, deletable: true }, eds)), [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (typeof type === "undefined" || !type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: {},
      };

      setNodes((nds) => nds.concat(newNode));
    }, [screenToFlowPosition, setNodes]);

  return (
    <div className="w-full h-full flex">
      <Sidebar />
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          colorMode={theme.mode}
          fitView fitViewOptions={{ padding: 0.12 }}
          minZoom={0.15} maxZoom={4}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ deletable: true }}
        >
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={n => {
              const c: Record<string, string> = { dram:"#60a5fa", axi:"#818cf8", bram:"#34d399", mac:"#a78bfa", accum:"#f59e0b", postproc:"#fb923c", writeback:"#f472b6", host:"#94a3b8" };
              return c[n.type ?? ""] ?? "#4a4a4a";
            }}
            maskColor={theme.mode === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"}
            style={{ background: theme.bgPanel, border: `1px solid ${theme.border}` }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={theme.mode === "dark" ? "#3e3e3e" : "#e5e7eb"} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function NodeEditor() {
  return (
    <ReactFlowProvider>
      <DnDFlow />
    </ReactFlowProvider>
  );
}
