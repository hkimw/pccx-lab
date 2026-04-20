import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "./ThemeContext";
import { Database, Search, ArrowRight, Save } from "lucide-react";

export function MemoryDump() {
  const theme = useTheme();
  const [baseAddress, setBaseAddress] = useState<number>(0x00000000);
  const [inputAddr, setInputAddr] = useState("0x00000000");
  const [highlightWord, setHighlightWord] = useState<number | null>(null);
  
  // Fake memory data representing LLM inference cache / weights
  const MOCK_MEMORY_SIZE = 1024 * 16; // Simulate 16K of data dynamically
  const BASE_OFFSET = 0x8000_0000; // Simulated DDR start on Zynq
  
  const [memory, setMemory] = useState<Uint8Array>(new Uint8Array(MOCK_MEMORY_SIZE));
  
  useEffect(() => {
    // Fill memory with some fake weights and patterns
    const buf = new Uint8Array(MOCK_MEMORY_SIZE);
    for (let i = 0; i < buf.length; i++) {
        if (i % 64 < 8) buf[i] = 0xaa; // DMA header pattern
        else if (i % 256 === 0) buf[i] = 0xff;
        else buf[i] = Math.floor(Math.random() * 255);
    }
    setMemory(buf);
  }, []);

  // Update animated values to simulate KV cache changing
  useEffect(() => {
    const int = setInterval(() => {
        setMemory(prev => {
            const next = new Uint8Array(prev);
            // Corrupt some values to simulate live memory writes
            for(let k = 0; k < 10; k++) {
              next[Math.floor(Math.random() * next.length)] = Math.floor(Math.random() * 255);
            }
            return next;
        });
    }, 200);
    return () => clearInterval(int);
  }, []);

  const handleJump = () => {
    const val = parseInt(inputAddr, 16);
    if (!isNaN(val)) {
        setBaseAddress(val);
    }
  };

  const getLine = (lineIdx: number) => {
    const addr = baseAddress + lineIdx * 16;
    const offset = addr % MOCK_MEMORY_SIZE; // wrap around for dummy display
    const slice = memory.slice(offset, offset + 16);
    
    let hexChunks = [];
    let asciiChunks = [];
    
    for (let i = 0; i < 16; i++) {
        const byte = slice[i] ?? 0;
        hexChunks.push(byte.toString(16).padStart(2, '0'));
        asciiChunks.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
    }
    
    return { addr, hex: hexChunks, ascii: asciiChunks.join("") };
  };

  const lines = useMemo(() => Array.from({length: 40}).map((_, i) => getLine(i)), [baseAddress, memory]);

  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.bgPanel }}>
      {/* Header Toolbar */}
      <div className="flex items-center px-4 shrink-0" style={{ height: 40, borderBottom: `1px solid ${theme.border}` }}>
        <Database size={16} className="mr-2" style={{ color: theme.accent }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>KV260 DDR Memory Examiner</span>
        
        <div style={{ marginLeft: 24, display: "flex", alignItems: "center", background: theme.bgInput, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "2px 6px" }}>
            <Search size={12} style={{ color: theme.textMuted, marginRight: 6 }} />
            <input 
                type="text" 
                value={inputAddr} 
                onChange={e => setInputAddr(e.target.value)} 
                onKeyDown={e => e.key === "Enter" && handleJump()}
                style={{ background: "transparent", border: "none", outline: "none", color: theme.text, fontSize: 11, width: 80, fontFamily: "monospace" }} 
            />
            <button onClick={handleJump} style={{ background: "transparent", color: theme.textMuted, cursor: "pointer", display: "flex", alignItems: "center" }}>
               <ArrowRight size={12} />
            </button>
        </div>
        
        <div className="flex-1" />
        <button style={{ padding: "4px 8px", fontSize: 11, background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: 4, color: theme.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <Save size={12} /> Export Bin
        </button>
      </div>

      {/* Hex Viewer */}
      <div className="flex-1 overflow-y-auto p-4" style={{ background: theme.bgEditor }}>
        <div style={{ fontFamily: "JetBrains Mono, Menlo, monospace", fontSize: 12, lineHeight: 1.6 }}>
           <div className="flex" style={{ color: theme.textFaint, marginBottom: 8, borderBottom: `1px solid ${theme.borderDim}`, paddingBottom: 4 }}>
             <span style={{ width: 100 }}>ADDRESS</span>
             <span style={{ width: 320, paddingLeft: 16 }}>00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
             <span style={{ flex: 1, paddingLeft: 16 }}>DECODED ASCII</span>
           </div>
           
           {lines.map((line, idx) => (
             <div key={idx} className="flex hover:bg-gray-800/30 transition-colors">
                <span style={{ width: 100, color: theme.textDim }}>
                  0x{(line.addr + BASE_OFFSET).toString(16).padStart(8, '0').toUpperCase()}
                </span>
                <span style={{ width: 320, paddingLeft: 16, color: theme.text }}>
                  {line.hex.map((h, i) => (
                     <span key={i} style={{ 
                         marginRight: (i === 7) ? 12 : 6, 
                         color: h === "aa" ? theme.warning : h === "ff" ? theme.accent : theme.text 
                     }}>
                       {h.toUpperCase()}
                     </span>
                  ))}
                </span>
                <span style={{ flex: 1, paddingLeft: 16, color: theme.success, letterSpacing: "2px" }}>
                   {line.ascii}
                </span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
}
