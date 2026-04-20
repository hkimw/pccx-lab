import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useTheme } from "./ThemeContext";
import { ActivitySquare, Zap } from "lucide-react";

export function Roofline() {
  const theme = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const PEAK_TOPS = 1200; // 1.2 TOPS (1200 GOPS)
  const PEAK_MEM_BW = 12; // 12 GB/s
  const RIDGE_POINT = PEAK_TOPS / PEAK_MEM_BW; // 100 GOPS/GB

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);
    
    // Compute Roofline bounds
    const computeBound = [[RIDGE_POINT, PEAK_TOPS], [1000, PEAK_TOPS]];
    const memoryBound = [[0.1, 0.1 * PEAK_MEM_BW], [RIDGE_POINT, PEAK_TOPS]];

    // Dummy application points
    const appPoints = [
      [10, 100],  // Mem bound
      [15, 170],  // Mem bound
      [80, 850],  // Compute bound
      [200, 1050] // Compute bound
    ];

    const option = {
      backgroundColor: "transparent",
      title: {
        text: "Performance Roofline Model",
        subtext: "HW Target: pccx-kv260 (1.2 TOPS, 12 GB/s)",
        textStyle: { color: theme.text, fontSize: 13 },
        subtextStyle: { color: theme.textMuted },
        left: "center"
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          if (params.seriesName === "App Kernels") {
             return `<b>Kernel</b><br/>Intensity: ${params.value[0]} GOPS/GB<br/>Perf: ${params.value[1]} GOPS`;
          }
          return params.seriesName;
        }
      },
      xAxis: {
        type: "log",
        name: "Arithmetic Intensity (GOPS/Byte)",
        nameLocation: "middle",
        nameGap: 25,
        min: 0.1, max: 1000,
        axisLabel: { color: theme.textMuted },
        splitLine: { show: true, lineStyle: { color: theme.borderDim, type: "dashed" } }
      },
      yAxis: {
        type: "log",
        name: "Performance (GOPS)",
        min: 1, max: 2000,
        axisLabel: { color: theme.textMuted },
        splitLine: { show: true, lineStyle: { color: theme.borderDim, type: "dashed" } }
      },
      series: [
        {
          name: "Memory Boundary",
          type: "line",
          data: memoryBound,
          showSymbol: false,
          itemStyle: { color: theme.error },
          lineStyle: { width: 2, type: "solid" }
        },
        {
          name: "Compute Boundary",
          type: "line",
          data: computeBound,
          showSymbol: false,
          itemStyle: { color: theme.success },
          lineStyle: { width: 2, type: "solid" }
        },
        {
          name: "App Kernels",
          type: "scatter",
          data: appPoints,
          symbolSize: 10,
          itemStyle: { color: theme.accent, opacity: 0.8 }
        }
      ]
    };

    chartInstance.current.setOption(option);
    
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chartInstance.current?.dispose();
    };
  }, [theme]);

  // Live simulation effect
  useEffect(() => {
    if (!running || !chartInstance.current) return;
    const interval = setInterval(() => {
       const option = chartInstance.current?.getOption() as any;
       if(!option) return;
       const pts = option.series[2].data as number[][];
       // jitter
       const newPts = pts.map(p => {
         let x = p[0] + (Math.random() - 0.5) * p[0] * 0.05;
         let y = p[1] + (Math.random() - 0.5) * p[1] * 0.1;
         // clamp below bounds
         if (x < RIDGE_POINT) {
            const yBound = x * PEAK_MEM_BW;
            if (y > yBound) y = yBound - 1;
         } else {
            if (y > PEAK_TOPS) y = PEAK_TOPS - 1;
         }
         return [x, y];
       });
       chartInstance.current?.setOption({ series: [{ name: "Memory Boundary" }, { name: "Compute Boundary" }, { name: "App Kernels", data: newPts }] });
    }, 100);
    return () => clearInterval(interval);
  }, [running]);

  return (
    <div className="w-full h-full flex flex-col relative" style={{ background: theme.bgPanel }}>
      <div className="flex items-center px-4 h-10 shrink-0 border-b" style={{ borderColor: theme.border, background: theme.bgSurface }}>
        <ActivitySquare size={16} className="mr-2" style={{ color: theme.warning }} />
        <span style={{ fontWeight: 600, fontSize: 13, marginRight: 24 }}>Roofline Analyzer</span>
        <div className="flex-1" />
        <button 
          onClick={() => setRunning(!running)}
          className="flex items-center gap-2 px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition-all shadow"
          style={{ background: running ? theme.error : theme.success, color: "#fff" }}
        >
          <Zap size={13}/>
          {running ? "Stop Monitoring" : "Live Streaming"}
        </button>
      </div>
      <div className="flex-1 w-full relative p-4">
        <div ref={chartRef} className="w-full h-full" style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bgHover }} />
      </div>
    </div>
  );
}
