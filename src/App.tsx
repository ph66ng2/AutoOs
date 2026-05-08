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
import { BootSplash } from "@/components/BootSplash";
import { SensitiveRoute, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Equipamentos from "@/pages/Equipamentos";
import Clientes from "@/pages/Clientes";
import Insumos from "@/pages/Insumos";
import Servicos from "@/pages/Servicos";
import Configuracoes from "@/pages/Configuracoes";
import Perfil from "@/pages/Perfil";

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
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/equipamentos" element={<Equipamentos />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/insumos" element={<Insumos />} />
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
    </>
  );
}

export default App;
