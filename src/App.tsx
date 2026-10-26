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
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
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
import { AppModeSelector } from "@/components/AppModeSelector";
import { CounterLayout } from "@/components/CounterLayout";
import { CounterSessionGate } from "@/components/CounterSessionGate";
import { ReleaseHighlightsDialog } from "@/components/ReleaseHighlightsDialog";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";
import Balcao from "@/pages/Balcao";
import { SaasApp } from "@/components/SaasApp";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";

/** Exibição mínima do boot (IPC em dev pode resolver em poucos ms). Prod fica igual ou mais pesado só se o Rust/DB demorar. */
const MIN_BOOT_SPLASH_MS = 1_100;

function AppContent() {
  const { loading, bootProgress, status, pinPromptDismissed, openProfileSelector, refreshStatus, firstAccessOpen } = useSensitiveAccess();
  const [appMode, setCurrentAppMode] = useState<AppMode | null>(() => getAppMode());
  const [splashVisible, setSplashVisible] = useState(true);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [completionAnimationElapsed, setCompletionAnimationElapsed] = useState(false);

  // Força refresh do status quando o banco fica pronto
  // Resolve race condition onde refreshStatus() falhou antes do banco estar inicializado
  useEffect(() => {
    if (status?.profiles.length === 0) {
      refreshStatus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const syncAppMode = (event: Event) => setCurrentAppMode((event as CustomEvent<AppMode>).detail);
    window.addEventListener("autoos:app-mode", syncAppMode);
    return () => window.removeEventListener("autoos:app-mode", syncAppMode);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setMinSplashElapsed(true), MIN_BOOT_SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading) setCompletionAnimationElapsed(false);
  }, [loading]);

  const handleBootAnimationComplete = useCallback(() => setCompletionAnimationElapsed(true), []);

  const sessionBlocked = Boolean(status && status.profiles.length > 0 && !status.unlocked);
  const showEntryGate = sessionBlocked && pinPromptDismissed;
  const splashCanFadeOut = !loading && minSplashElapsed && completionAnimationElapsed && (
    Boolean(status?.unlocked) || (status?.profiles.length === 0) || pinPromptDismissed
  );
  const sessionReady = Boolean(status?.active_profile_id && status.unlocked);

  useEffect(() => {
    if (splashVisible && splashCanFadeOut) {
      const t = window.setTimeout(() => setSplashVisible(false), 540);
      return () => window.clearTimeout(t);
    }
  }, [splashVisible, splashCanFadeOut]);

  return (
    <>
      {showEntryGate ? (
        <SessionPinGate
          onEnter={() => void openProfileSelector({
            title: "Quem está usando o AutoOS?",
            description: "Escolha o perfil e informe o PIN. Sem o PIN, o atendimento continua bloqueado.",
          })}
        />
      ) : (
      <BrowserRouter>
        <AppModeChoice
          visible={!loading && sessionReady && appMode === null && !firstAccessOpen}
          onSelect={setCurrentAppMode}
        />
        <AppModeRedirect mode={appMode} ready={!loading && sessionReady} />
        <ReleaseHighlightsDialog
          enabled={!loading && !splashVisible && sessionReady && appMode !== null && !firstAccessOpen}
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
                  title="Configurações protegidas"
                  description="Desbloqueie o acesso para gerenciar integrações, banco e segurança."
                  permission={[
                    SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
                    SENSITIVE_PERMISSIONS.CONFIG_SMTP,
                    SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP,
                    SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
                  ]}
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
      )}
      {splashVisible && (
        <BootSplash
          progress={loading ? bootProgress : 100}
          fadeOut={splashCanFadeOut}
          onAnimationComplete={handleBootAnimationComplete}
        />
      )}
    </>
  );
}

function SessionPinGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#050608] px-6 text-white">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Informe o PIN para entrar</h1>
        <p className="text-sm text-slate-300">
          O AutoOS continua bloqueado. Sem o PIN do perfil, o atendimento não abre.
        </p>
        <Button type="button" onClick={onEnter}>Entrar com PIN</Button>
      </div>
    </div>
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
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const { resolvedTheme } = useTheme();
  const toastTheme = resolvedTheme === "dark" ? "dark" : "light";

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
        <Toaster theme={toastTheme} position="top-right" offset={{ top: 64, right: 24 }} visibleToasts={3} richColors closeButton duration={5000} />
        <ErrorBoundary>
          <DatabaseConfigDialog onConfigured={() => setDbReady(true)} />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      <Toaster theme={toastTheme} position="top-right" offset={{ top: 64, right: 24 }} visibleToasts={3} richColors closeButton duration={5000} />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
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
