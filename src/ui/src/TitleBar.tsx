import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "./ThemeContext";

interface TitleBarProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function TitleBar({ title = "pccx-lab", subtitle, children }: TitleBarProps) {
  const theme = useTheme();

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  const winBtnStyle = {
    width: 46, height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", cursor: "default", color: theme.textMuted,
    transition: "background 0.1s"
  };

  return (
    <div
      data-tauri-drag-region
      className="h-[30px] flex items-center shrink-0 select-none"
      style={{ background: theme.bgPanel, borderBottom: `1px solid ${theme.border}` }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2 px-3 pointer-events-none" style={{ minWidth: 150 }}>
        <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDim})` }}>
          <span className="text-[7px] font-black text-white">P</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>{title}</span>
        {subtitle && <span style={{ fontSize: 10, color: theme.textMuted }}>— {subtitle}</span>}
      </div>
      
      <div className="flex-1 flex items-center h-full" data-tauri-drag-region>
        {children}
      </div>

      {/* Frame Controls */}
      <div className="flex h-full shrink-0">
        <button style={winBtnStyle} onClick={handleMinimize}
          onMouseEnter={e => e.currentTarget.style.background = theme.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="4.5" width="8" height="1" fill="currentColor"/></svg>
        </button>
        <button style={winBtnStyle} onClick={handleMaximize}
          onMouseEnter={e => e.currentTarget.style.background = theme.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button style={winBtnStyle} onClick={handleClose}
          onMouseEnter={e => { e.currentTarget.style.background = "#e81123"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = theme.textMuted; }}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
      </div>
    </div>
  );
}
