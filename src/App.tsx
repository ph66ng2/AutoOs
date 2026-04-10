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
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SensitiveRoute } from "@/hooks/useSensitiveAccess";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Equipamentos from "@/pages/Equipamentos";
import Clientes from "@/pages/Clientes";
import Insumos from "@/pages/Insumos";
import Configuracoes from "@/pages/Configuracoes";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/equipamentos" element={<Equipamentos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/insumos" element={<Insumos />} />
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
  );
}

export default App;
