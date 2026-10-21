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
import { BootUiProvider } from "@/components/BootUi";
import { SensitiveAccessProvider } from "@/hooks/useSensitiveAccess";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "next-themes";
import "./index.css";

/** Renderiza o app com StrictMode para detectar problemas em desenvolvimento */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* O tema é do perfil (salvo no banco); o último aplicado fica guardado para a próxima abertura. */}
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="autoos-theme" disableTransitionOnChange>
        <BootUiProvider>
          <SensitiveAccessProvider>
            <App />
          </SensitiveAccessProvider>
        </BootUiProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
