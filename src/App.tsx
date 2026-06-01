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
import { SensitiveRoute, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Equipamentos from "@/pages/Equipamentos";
import Clientes from "@/pages/Clientes";
// import Insumos from "@/pages/Insumos"; // [BLOQUEIO-TEMPORARIO-INSUMOS] descomente esta linha para restaurar o módulo de Insumos
import Servicos from "@/pages/Servicos";

/**
 * Componente placeholder para o módulo de Insumos temporariamente bloqueado.
 * 
 * ═══════════════════════════════════════════════════════════════
 * COMO DESBLOQUEAR O MÓDULO DE INSUMOS (3 passos, ~2 min):
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1. NESTE ARQUIVO (App.tsx):
 *    - Descomente: import Insumos from "@/pages/Insumos";
 *    - Apague este componente BlockedPage e a função
 *    - Troque a rota /insumos de volta para: element={<Insumos />}
 * 
 * 2. Em src/components/Layout.tsx (~linha 38):
 *    - Descomente o item: { label: "Insumos", path: "/insumos", icon: Package }
 * 
 * 3. Em src/pages/Dashboard.tsx (~linhas 220, 263, 370):
 *    - Descomente/restaure os botões "Novo Insumo", card "Estoque Baixo" e "Ver todos"
 * 
 * Busque por: [BLOQUEIO-TEMPORARIO-INSUMOS] no projeto para localizar todos os pontos.
 * ═══════════════════════════════════════════════════════════════
 */
function BlockedInsumosPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Package className="h-16 w-16 text-muted-foreground mb-6 opacity-30" />
      <h2 className="text-2xl font-bold text-foreground mb-2">Módulo de Insumos</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        O módulo de controle de estoque e insumos está temporariamente indisponível
        para manutenção. Nenhum dado foi perdido — o banco permanece íntegro.
      </p>
      <Badge variant="secondary" className="text-xs">
        Bloqueio programado — procure [BLOQUEIO-TEMPORARIO-INSUMOS] no código para reverter
      </Badge>
    </div>
  );
}
import Configuracoes from "@/pages/Configuracoes";
import Perfil from "@/pages/Perfil";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Exibição mínima do boot (IPC em dev pode resolver em poucos ms). Prod fica igual ou mais pesado só se o Rust/DB demorar. */
const MIN_BOOT_SPLASH_MS = 1_100;

function App() {
  const { loading, bootProgress } = useSensitiveAccess();
  const [splashVisible, setSplashVisible] = useState(true);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

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
      <Toaster position="top-right" visibleToasts={3} richColors closeButton duration={5000} />
      <ErrorBoundary>
        <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/equipamentos" element={<Equipamentos />} />
            <Route path="/clientes" element={<Clientes />} />
            {/* [BLOQUEIO-TEMPORARIO-INSUMOS] Troque <BlockedInsumosPage /> por <Insumos /> para restaurar */}
            <Route path="/insumos" element={<BlockedInsumosPage />} />
            <Route path="/servicos" element={<Servicos />} />
            <Route
              path="/configuracoes"
              element={
                <SensitiveRoute
                  title="Configurações SMTP protegidas"
                  description="Desbloqueie o acesso sensível para visualizar ou alterar credenciais e envios SMTP."
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
      </ErrorBoundary>
    </>
  );
}

export default App;
