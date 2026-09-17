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
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { BootSplashGate } from "@/components/BootSplashGate";
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
import { AppModeSelector } from "@/components/AppModeSelector";
import { CounterLayout } from "@/components/CounterLayout";
import { CounterSessionGate } from "@/components/CounterSessionGate";
import { ReleaseHighlightsDialog } from "@/components/ReleaseHighlightsDialog";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";
import Balcao from "@/pages/Balcao";
import { SaasApp } from "@/components/SaasApp";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";

function AppContent({ splashActive }: { splashActive: boolean }) {
  const { loading, status, refreshStatus } = useSensitiveAccess();
  const [appMode, setCurrentAppMode] = useState<AppMode | null>(() => getAppMode());

  // Força refresh do status quando o banco fica pronto
  // Resolve race condition onde refreshStatus() falhou antes do banco estar inicializado
  useEffect(() => {
    if (status?.profiles.length === 0) {
      void refreshStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const syncAppMode = (event: Event) => setCurrentAppMode((event as CustomEvent<AppMode>).detail);
    window.addEventListener("autoos:app-mode", syncAppMode);
    return () => window.removeEventListener("autoos:app-mode", syncAppMode);
  }, []);

  const sessionReady = Boolean(status?.active_profile_id && status.unlocked);

  return (
    <BrowserRouter>
      <AppModeChoice
        visible={!loading && sessionReady && appMode === null}
        onSelect={setCurrentAppMode}
      />
      <AppModeRedirect mode={appMode} ready={!loading && sessionReady} />
      <ReleaseHighlightsDialog
        enabled={!loading && !splashActive && sessionReady && appMode !== null}
      />
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
        <Route element={<CounterSessionGate><CounterLayout onChangeMode={setCurrentAppMode} /></CounterSessionGate>}>
          <Route path="/balcao" element={<Balcao />} />
          <Route path="/balcao/painel" element={<Balcao />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function AppModeChoice({ visible, onSelect }: { visible: boolean; onSelect: (mode: AppMode) => void }) {
  const navigate = useNavigate();
  if (!visible) return null;
  return <AppModeSelector onSelect={(mode) => { setAppMode(mode); onSelect(mode); navigate(mode === "counter" ? "/balcao" : "/"); }} />;
}

function AppModeRedirect({ mode, ready }: { mode: AppMode | null; ready: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!ready || !mode) return;
    const isCounterRoute = location.pathname.startsWith("/balcao");
    if (mode === "counter" && !isCounterRoute) navigate("/balcao", { replace: true });
    if (mode === "standard" && isCounterRoute) navigate("/", { replace: true });
  }, [location.pathname, mode, navigate, ready]);
  return null;
}

function InternalApp() {
  const { loading, bootProgress, advanceBootProgress, refreshStatus } = useSensitiveAccess();
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [splashActive, setSplashActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      advanceBootProgress(14);
      try {
        advanceBootProgress(28);
        const status = await DatabaseConfigService.checkStatus();
        if (cancelled) return;
        advanceBootProgress(48);
        setDbReady(status);
        if (status) {
          await refreshStatus();
        }
      } catch {
        if (!cancelled) setDbReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [advanceBootProgress, refreshStatus]);

  const bootLoading = dbReady === null || (dbReady === true && loading);
  const displayProgress = dbReady === null
    ? Math.max(bootProgress, 28)
    : bootProgress;

  if (dbReady === false) {
    return (
      <>
        <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
        <ErrorBoundary>
          <DatabaseConfigDialog
            onConfigured={() => {
              setDbReady(true);
              setSplashActive(true);
              void refreshStatus();
            }}
          />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
      <ErrorBoundary>
        {dbReady === true ? <AppContent splashActive={splashActive} /> : null}
      </ErrorBoundary>
      <BootSplashGate
        loading={bootLoading}
        progress={displayProgress}
        onFinished={() => setSplashActive(false)}
      />
    </>
  );
}

function App() {
  if (IS_SAAS_BUILD) {
    return (
      <>
        <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
        <ErrorBoundary>
          <SaasApp />
        </ErrorBoundary>
      </>
    );
  }

  return <InternalApp />;
}

export default App;
