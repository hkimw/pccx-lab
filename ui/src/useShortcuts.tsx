/**
 * Single source of truth for keyboard shortcuts.
 *
 * Rationale (WCAG 2.2 SC 2.1.1 Keyboard, WAI-ARIA 1.2 §5.2.8.4 aria-label):
 * - Every non-trivial action must be reachable without a mouse.
 * - Users must be able to discover every binding from inside the app
 *   via one well-known key (`?` or `F1`).
 *
 * This module only describes the map + the help modal. Individual
 * panels still own the concrete `window.addEventListener("keydown", …)`
 * wiring (WaveformViewer, FlameGraph, NodeEditor, CommandPalette);
 * this file reflects their intent for the user-facing cheat sheet.
 */
import React, { useEffect, useState } from "react";

export interface Shortcut {
  key: string;
  desc: string;
  action: string;
}

export const SHORTCUT_MAP: Shortcut[] = [
  // File / navigation
  { key: "Ctrl+O",        desc: "Open .pccx trace",                  action: "file.open" },
  { key: "Ctrl+Shift+O",  desc: "Open VCD file in Waveform panel",   action: "file.openVcd" },
  { key: "Ctrl+S",        desc: "Save session",                      action: "file.save" },
  { key: "Ctrl+P",        desc: "Command Palette",                   action: "cmd.palette" },
  // Editing / search
  { key: "Ctrl+F",        desc: "Find event / signal",               action: "edit.find" },
  { key: "Ctrl+G",        desc: "Go to cycle",                       action: "edit.goto" },
  // Trace-centric
  { key: "Ctrl+B",        desc: "Jump to next Waveform bookmark",    action: "waveform.nextBookmark" },
  { key: "Ctrl+Shift+D",  desc: "Toggle Flame Graph diff mode",      action: "flame.diff" },
  { key: "Ctrl+I",        desc: "Validate trace integrity",          action: "trace.validate" },
  // View / layout
  { key: "Ctrl+`",        desc: "Toggle AI Copilot panel",           action: "view.copilot" },
  { key: "Ctrl+J",        desc: "Toggle Bottom Panel",               action: "view.bottom" },
  { key: "F11",           desc: "Toggle fullscreen",                 action: "view.fullscreen" },
  // Node editor
  { key: "Shift+A",       desc: "Node Editor quick-add",             action: "nodes.add" },
  { key: "Escape",        desc: "Close modal / menu",                action: "ui.escape" },
  // Help
  { key: "? or F1",       desc: "Show this shortcut help",           action: "help.shortcuts" },
];

/**
 * Hook: call from the top-level shell to open the help overlay on
 * `?` or `F1`. Respects inputs and contenteditable targets.
 */
export function useShortcutHelp(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || "").toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || t?.isContentEditable === true;
      if (isInput) return;
      // Treat both literal "?" and F1 as help triggers.
      const isQuestion = e.key === "?" || (e.shiftKey && e.key === "/");
      const isF1 = e.key === "F1";
      if (isQuestion || isF1) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open, setOpen };
}

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal overlay listing every SHORTCUT_MAP entry. Focus-trapped by
 * `aria-modal="true"`; dismiss with `Escape` or the close button.
 */
export function ShortcutHelp({ open, onClose }: ShortcutHelpProps): React.ReactElement | null {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 460, maxWidth: 640, maxHeight: "80vh",
          background: "var(--pccx-surface, #1e1e1e)",
          color: "var(--pccx-text, #e6e6e6)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6, padding: 20, overflow: "auto",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", margin: 0 }}>
            KEYBOARD SHORTCUTS
          </h2>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Close shortcut help"
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: "inherit",
              cursor: "pointer", fontSize: 16, padding: "2px 8px",
            }}
          >
            x
          </button>
        </div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <tbody>
            {SHORTCUT_MAP.map((s) => (
              <tr key={s.action} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}>
                  <kbd
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 11, padding: "1px 6px", borderRadius: 3,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.14)",
                    }}
                  >{s.key}</kbd>
                </td>
                <td style={{ padding: "6px 0", color: "rgba(230,230,230,0.8)" }}>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: "rgba(230,230,230,0.5)", marginTop: 12 }}>
          Press <kbd>Esc</kbd> or click outside to dismiss. Full list in
          <code> docs/getting-started.md</code>.
        </p>
      </div>
    </div>
  );
}
