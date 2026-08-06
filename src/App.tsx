/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  App.tsx — Componente Raiz e Configuração de Rotas         ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Define o roteamento principal do aplicativo usando       ║
 * ║  React Router v6. Todas as rotas são renderizadas dentro  ║
 * ║  do Layout principal que contém a sidebar.                ║
 * ║                                                              ║
 * ║  ROTAS DISPONÍVEIS:                                          ║
 * ║  - / → Dashboard (métricas e visão geral)                  ║
 * ║  - /equipamentos → CRUD de equipamentos                    ║
 * ║  - /clientes → CRUD de clientes (PF/PJ)                    ║
 * ║  - /insumos → Gestão de estoque                            ║
 * ║  - /configuracoes → Configurações SMTP                     ║
 * ║                                                              ║
 * ║  DEPENDE DE: react-router-dom, components/Layout           ║
 * ║  USADO POR: main.tsx (ponto de entrada)                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { BootSplash } from "@/components/BootSplash";
import { DatabaseConfigDialog } from "@/components/DatabaseConfigDialog";
import { SensitiveRoute, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS } from "@/types";
import { Layout } from "@/components/Layout";
import { DatabaseConfigService } from "@/lib/db-config";
import Dashboard from "@/pages/Dashboard";
import Equipamentos from "@/pages/Equipamentos";
import Clientes from "@/pages/Clientes";
import Insumos from "@/pages/Insumos";
import Servicos from "@/pages/Servicos";
import Gastos from "@/pages/Gastos";

import Configuracoes from "@/pages/Configuracoes";
import Perfil from "@/pages/Perfil";
import PowerSyncPOC from "@/poc/PowerSyncPOC";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/** Exibição mínima do boot (IPC em dev pode resolver em poucos ms). Prod fica igual ou mais pesado só se o Rust/DB demorar. */
const MIN_BOOT_SPLASH_MS = 1_100;

function AppContent() {
  const { loading, bootProgress, status, refreshStatus } = useSensitiveAccess();
  const [splashVisible, setSplashVisible] = useState(true);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  // Força refresh do status quando o banco fica pronto
  // Resolve race condition onde refreshStatus() falhou antes do banco estar inicializado
  useEffect(() => {
    if (status?.profiles.length === 0) {
      refreshStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = window.setTimeout(() => setMinSplashElapsed(true), MIN_BOOT_SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  const splashCanFadeOut = !loading && minSplashElapsed;

  useEffect(() => {
    if (splashVisible && splashCanFadeOut) {
      const t = window.setTimeout(() => setSplashVisible(false), 540);
      return () => window.clearTimeout(t);
    }
  }, [splashVisible, splashCanFadeOut]);

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/equipamentos" element={<Equipamentos />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/insumos" element={<Insumos />} />
            <Route path="/servicos" element={<Servicos />} />
            <Route path="/poc" element={<PowerSyncPOC />} />
            <Route
              path="/gastos"
              element={
                <SensitiveRoute
                  title="Gastos e despesas protegidos"
                  description="Desbloqueie o acesso sensível para visualizar gastos e despesas do sistema."
                  permission={SENSITIVE_PERMISSIONS.VIEW_EXPENSES}
                >
                  <Gastos />
                </SensitiveRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <SensitiveRoute
                  title="Configurações SMTP protegidas"
                  description="Desbloqueie o acesso sensível para visualizar ou alterar credenciais e envios SMTP."
                  permission={SENSITIVE_PERMISSIONS.MANAGE_PROFILES}
                >
                  <Configuracoes />
                </SensitiveRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
      {splashVisible && (
        <BootSplash progress={loading ? bootProgress : 100} fadeOut={splashCanFadeOut} />
      )}
    </>
  );
}

function App() {
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const status = await DatabaseConfigService.checkStatus();
        setDbReady(status);
      } catch {
        setDbReady(false);
      }
    })();
  }, []);

  if (dbReady === null) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050608]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!dbReady) {
    return (
      <>
        <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
        <ErrorBoundary>
          <DatabaseConfigDialog onConfigured={() => setDbReady(true)} />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </>
  );
}

export default App;
