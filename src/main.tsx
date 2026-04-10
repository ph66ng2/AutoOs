/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  main.tsx — Ponto de Entrada do React                      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Inicializa o React 18 com StrictMode e monta o App no    ║
 * ║  elemento #root do index.html.                             ║
 * ║                                                              ║
 * ║  DEPENDE DE: react, react-dom, App.tsx, index.css          ║
 * ║  CHAMADO POR: Vite (durante dev/build)                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SensitiveAccessProvider } from "@/hooks/useSensitiveAccess";
import "./index.css";

/** Renderiza o app com StrictMode para detectar problemas em desenvolvimento */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SensitiveAccessProvider>
      <App />
    </SensitiveAccessProvider>
  </React.StrictMode>,
);
