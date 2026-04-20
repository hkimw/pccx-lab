import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useTheme } from "./ThemeContext";

export function PerfChart() {
  const theme = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ time: string; mac: number; l2Read: number; l2Write: number }[]>([]);

  // Generate initial history
  useEffect(() => {
    const initData = [];
    let now = new Date();
    for (let i = 0; i < 60; i++) {
        initData.push({
            time: new Date(now.getTime() - (60 - i) * 500).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 }),
            mac: 20 + Math.random() * 60,
            l2Read: 40 + Math.random() * 50,
            l2Write: 10 + Math.random() * 30,
        });
    }
    setData(initData);
  }, []);

  // Live updates
  useEffect(() => {
    const timer = setInterval(() => {
      setData(prev => {
        const next = [...prev.slice(1)];
        const last = prev[prev.length - 1] || { mac: 50, l2Read: 50, l2Write: 20 };
        next.push({
            time: new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 }),
            mac: Math.max(0, Math.min(100, last.mac + (Math.random() - 0.5) * 20)),
            l2Read: Math.max(0, Math.min(100, last.l2Read + (Math.random() - 0.5) * 30)),
            l2Write: Math.max(0, Math.min(100, last.l2Write + (Math.random() - 0.5) * 15)),
        });
        return next;
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    const chart = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current);

    const option = {
      backgroundColor: "transparent",
      tooltip: { 
        trigger: "axis", 
        backgroundColor: theme.bgSurface, 
        borderColor: theme.border, 
        textStyle: { color: theme.text, fontSize: 11 },
        axisPointer: { type: "cross", crossStyle: { color: theme.textFaint } }
      },
      legend: {
        data: ["MAC Compute (%)", "L2 Read BW (GB/s)", "L2 Write BW (GB/s)"],
        textStyle: { color: theme.textMuted, fontSize: 10 },
        top: 0, right: 10, itemWidth: 12, itemHeight: 8,
      },
      grid: { left: 40, right: 20, top: 25, bottom: 20 },
      xAxis: {
        type: "category",
        data: data.map(d => d.time),
        axisLine: { lineStyle: { color: theme.borderDim } },
        axisLabel: { color: theme.textFaint, fontSize: 9, formatter: (val: string) => val.split(".")[0] }, // Show only seconds
        axisTick: { show: false },
        boundaryGap: false,
      },
      yAxis: {
        type: "value",
        max: 100,
        splitLine: { lineStyle: { color: theme.borderDim, type: "dashed" } },
        axisLabel: { color: theme.textFaint, fontSize: 9 },
      },
      series: [
        {
          name: "MAC Compute (%)",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.mac),
          itemStyle: { color: theme.accent },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: theme.accent + "66" },
              { offset: 1, color: theme.accent + "00" }
            ])
          },
        },
        {
          name: "L2 Read BW (GB/s)",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.l2Read),
          itemStyle: { color: theme.success },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: theme.success + "44" },
              { offset: 1, color: theme.success + "00" }
            ])
          },
        },
        {
          name: "L2 Write BW (GB/s)",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: data.map(d => d.l2Write),
          itemStyle: { color: theme.warning },
        }
      ],
      animation: false // Smooth scrolling without default chart setup animation
    };

    chart.setOption(option);

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [data, theme]);

  return <div ref={chartRef} className="w-full h-full" />;
}
