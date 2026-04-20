import { useTheme } from "./ThemeContext";

interface StatusBarProps {
  traceLoaded: boolean;
  totalCycles?: number;
  numCores?: number;
  license?: string;
  activeTab?: string;
}

export function StatusBar({ traceLoaded, totalCycles, numCores, license, activeTab }: StatusBarProps) {
  const theme = useTheme();
  return (
    <div className="h-6 flex items-center px-3 gap-4 shrink-0 select-none"
      style={{ background: theme.bgPanel, borderTop: `1px solid ${theme.border}`, fontSize: 10 }}>
      <span style={{ color: traceLoaded ? theme.success : theme.textMuted }}>
        {traceLoaded ? "● Trace" : "○ No Trace"}
      </span>
      {totalCycles != null && (
        <>
          <span style={{ color: theme.textFaint }}>|</span>
          <span style={{ color: theme.textMuted }}>
            Cycles: <span style={{ color: theme.text, fontFamily: "monospace" }}>{totalCycles.toLocaleString()}</span>
          </span>
        </>
      )}
      {numCores != null && (
        <>
          <span style={{ color: theme.textFaint }}>|</span>
          <span style={{ color: theme.textMuted }}>
            Cores: <span style={{ color: theme.text, fontFamily: "monospace" }}>{numCores}</span>
          </span>
        </>
      )}
      <div className="flex-1" />
      {activeTab && <span style={{ color: theme.textMuted, textTransform: "capitalize" }}>{activeTab}</span>}
      <span style={{ color: theme.textFaint }}>|</span>
      <span style={{ color: theme.textMuted }}>pccx-lab v0.4.0</span>
      {license && (
        <>
          <span style={{ color: theme.textFaint }}>|</span>
          <span style={{ color: theme.accent }}>{license}</span>
        </>
      )}
      <span style={{ color: theme.textFaint }}>|</span>
      <span style={{ color: theme.textMuted }}>{theme.mode === "dark" ? "Dark" : "Light"}</span>
    </div>
  );
}
