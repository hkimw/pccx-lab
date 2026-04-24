import { useTheme } from "./ThemeContext";
import { Play, Pause, Square, StepForward, Activity, Settings, RefreshCw, Layers, Bug } from "lucide-react";

interface MainToolbarProps {
  onAction?: (action: string) => void;
}

export function MainToolbar({ onAction }: MainToolbarProps) {
  const theme = useTheme();
  
  const iconSize = 14;
  const btnStyle = {
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 4,
    color: theme.text,
    fontSize: 11,
    cursor: "pointer",
    background: "transparent",
    border: "1px solid transparent",
    transition: "all 0.1s",
  };

  const hoverProps = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = theme.bgHover;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "transparent";
    }
  };

  const Divider = () => <div style={{ width: 1, height: 16, background: theme.border, margin: "0 4px" }} />;

  return (
    <div className="flex items-center px-2 py-1 gap-1 shrink-0 select-none" style={{ background: theme.bgPanel, borderBottom: `1px solid ${theme.border}` }}>
      
      {/* Run Controls */}
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("run.start")} title="Start Simulation (F5)">
        <Play size={iconSize} color={theme.success} /> 
      </button>
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("run.pause")} title="Pause Simulation (F7)">
        <Pause size={iconSize} color={theme.warning} />
      </button>
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("run.stop")} title="Stop Simulation (Shift+F5)">
        <Square size={iconSize} color={theme.error} />
      </button>
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("run.step")} title="Step Over (F10)">
        <StepForward size={iconSize} color={theme.info} />
      </button>

      <Divider />

      {/* Analysis Controls */}
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("trace.reload")} title="Reload Trace">
        <RefreshCw size={iconSize} color={theme.textMuted} />
      </button>
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("trace.benchmark")} title="Live Telemetry">
        <Activity size={iconSize} color={theme.accent} />
      </button>

      <Divider />

      {/* Profiling Tools */}
      <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("view.report")} title="Generate Report">
        <Layers size={iconSize} color={theme.textMuted} /> <span style={{ color: theme.textDim }}>Report</span>
      </button>
      
      <div className="flex-1" />

      {/* Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 8 }}>
        <span style={{ fontSize: 10, color: theme.textMuted, fontFamily: "monospace" }}>Target: NPU SIM [Local]</span>
        <Divider />
        <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("run.config")} title="Target Configuration">
          <Settings size={iconSize} color={theme.textMuted} />
        </button>
        <button style={btnStyle} {...hoverProps} onClick={() => onAction?.("tools.debug")} title="Debug Mode">
          <Bug size={iconSize} color={theme.textMuted} />
        </button>
      </div>

    </div>
  );
}
