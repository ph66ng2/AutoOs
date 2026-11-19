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
import { createContext, lazy, useCallback, useContext, useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { BootSplash } from "@/components/BootSplash";
import { DatabaseConfigDialog } from "@/components/DatabaseConfigDialog";
import { SensitiveRoute, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS } from "@/types";
import { Layout } from "@/components/Layout";
import { DatabaseConfigService } from "@/lib/db-config";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppModeSelector } from "@/components/AppModeSelector";
import { CounterLayout } from "@/components/CounterLayout";
import { CounterSessionGate } from "@/components/CounterSessionGate";
import { ReleaseHighlightsDialog } from "@/components/ReleaseHighlightsDialog";
import { UpdateNotice } from "@/components/UpdateNotice";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";

/**
 * AvisoRapido do DS: fundo de cartão, borda e sombra de menu, sem cor de fundo por tipo
 * (sem as cores ricas do sonner). A cor da família fica só no ícone.
 */
const AVISO_RAPIDO_OPCOES = {
  classNames: {
    toast: "!rounded-[14px] !border-border !bg-card !text-card-foreground !shadow-[0_12px_32px_rgba(0,0,0,0.18)]",
    title: "!text-sm !font-bold",
    description: "!text-[13px] !text-muted-foreground",
    actionButton: "!bg-acc-soft !font-semibold !text-acc-soft-foreground",
    cancelButton: "!bg-muted !text-muted-foreground",
    closeButton: "!border-border !bg-card !text-muted-foreground",
    success: "[&_[data-icon]]:!text-status-ok",
    info: "[&_[data-icon]]:!text-status-work",
    warning: "[&_[data-icon]]:!text-status-wait",
    error: "[&_[data-icon]]:!text-status-bad",
  },
};

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Equipamentos = lazy(() => import("@/pages/Equipamentos"));
const Clientes = lazy(() => import("@/pages/Clientes"));
const ClienteEquipamentos = lazy(() => import("@/pages/ClienteEquipamentos"));
const Insumos = lazy(() => import("@/pages/Insumos"));
const VendasInsumos = lazy(() => import("@/pages/VendasInsumos"));
const VendaDetalhe = lazy(() => import("@/pages/vendas/VendaDetalhe"));
const VendaFormulario = lazy(() => import("@/pages/vendas/VendaFormulario"));
const Servicos = lazy(() => import("@/pages/Servicos"));
const Gastos = lazy(() => import("@/pages/Gastos"));
const Configuracoes = lazy(() => import("@/pages/Configuracoes"));
const Perfil = lazy(() => import("@/pages/Perfil"));
const Equipe = lazy(() => import("@/pages/Equipe"));
const PowerSyncPOC = lazy(() => import("@/poc/PowerSyncPOC"));
const Balcao = lazy(() => import("@/pages/Balcao"));

function AppContent() {
  const { loading, bootProgress, status, pinPromptDismissed, openProfileSelector, refreshStatus, firstAccessOpen } = useSensitiveAccess();
  const [appMode, setCurrentAppMode] = useState<AppMode | null>(() => getAppMode());
  const [splashVisible, setSplashVisible] = useState(true);
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

  const handleBootAnimationComplete = useCallback(() => setCompletionAnimationElapsed(true), []);

  const sessionBlocked = Boolean(status && status.profiles.length > 0 && !status.unlocked);
  const showEntryGate = sessionBlocked && pinPromptDismissed;
  // A duração mínima do splash é a da própria abertura BMI TAG (`completionAnimationElapsed`).
  const splashCanFadeOut = !loading && completionAnimationElapsed && (
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
            title: "Quem está usando?",
            description: "Escolha o perfil e informe o PIN. Sem o PIN, o atendimento continua bloqueado.",
          })}
        />
      ) : (
      <RoteadorDoApp>
        <AppModeChoice
          visible={!loading && sessionReady && appMode === null && !firstAccessOpen}
          onSelect={setCurrentAppMode}
        />
        <AppModeRedirect mode={appMode} ready={!loading && sessionReady} />
        <ReleaseHighlightsDialog
          enabled={!loading && !splashVisible && sessionReady && appMode !== null && !firstAccessOpen}
        />
        {/* Fora dos layouts: vale para o modo padrão e para o Modo Balcão. */}
        <UpdateNotice />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/equipe" element={<Equipe />} />
            {/* Mesmo elemento com e sem :id: filtros e página da lista sobrevivem aos Detalhes da OS. */}
            <Route path="/equipamentos/:id?" element={<Equipamentos />} />
            <Route path="/equipamentos/:id/orcamento" element={<Equipamentos />} />
            <Route path="/equipamentos/:id/verificacao" element={<Equipamentos />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id/equipamentos" element={<ClienteEquipamentos />} />
            <Route path="/insumos" element={<Insumos />} />
            <Route path="/vendas" element={<VendasInsumos />} />
            <Route path="/vendas/novo" element={<VendaFormulario />} />
            <Route path="/vendas/:id" element={<VendaDetalhe />} />
            <Route path="/vendas/:id/editar" element={<VendaFormulario />} />
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
                    SENSITIVE_PERMISSIONS.COMMUNICATION_SETTINGS,
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
      </RoteadorDoApp>
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

/**
 * Roteador com dados (createBrowserRouter): é o que permite `useBlocker`, usado para avisar
 * antes de sair de um formulário pela metade. Uma rota coringa entrega a árvore de <Routes>
 * de sempre, então as rotas continuam declaradas como antes. O roteador nasce quando o
 * conteúdo monta (como o BrowserRouter antigo), lendo o endereço atual.
 */
const ConteudoDoRoteador = createContext<React.ReactNode>(null);

function RoteadorDoApp({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createBrowserRouter([{ path: "*", element: <ConteudoRoteado /> }]));
  useEffect(() => () => router.dispose(), [router]);
  return (
    <ConteudoDoRoteador.Provider value={children}>
      <RouterProvider router={router} />
    </ConteudoDoRoteador.Provider>
  );
}

/** A rota coringa só devolve a árvore de <Routes> recebida por contexto (que se atualiza a cada render do App). */
function ConteudoRoteado() {
  return <>{useContext(ConteudoDoRoteador)}</>;
}

function SessionPinGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#050608] px-6 text-white">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Informe o PIN para entrar</h1>
        <p className="text-sm text-muted-foreground">
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

function App() {
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
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!dbReady) {
    return (
      <>
        <Toaster theme={toastTheme} position="top-right" offset={{ top: 64, right: 24 }} visibleToasts={3} closeButton duration={5000} toastOptions={AVISO_RAPIDO_OPCOES} />
        <ErrorBoundary>
          <DatabaseConfigDialog onConfigured={() => setDbReady(true)} />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      <Toaster theme={toastTheme} position="top-right" offset={{ top: 64, right: 24 }} visibleToasts={3} closeButton duration={5000} toastOptions={AVISO_RAPIDO_OPCOES} />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </>
  );
}

export default App;
