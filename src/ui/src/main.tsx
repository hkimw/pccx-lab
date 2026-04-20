import React from "react";
import ReactDOM from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import App from "./App";
import "./App.css";

// Radix Theme wrapper is inside App.tsx via ThemeProvider + RadixTheme bridge
// We keep appearance as "inherit" and let the ThemeContext control it
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Theme appearance="dark" accentColor="blue" radius="medium">
      <App />
    </Theme>
  </React.StrictMode>,
);
