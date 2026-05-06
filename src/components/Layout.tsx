/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Layout.tsx — Layout Principal com Sidebar                    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Componente de layout que envolve todas as páginas.          ║
 * ║  Sidebar com navegação: Dashboard, Equipamentos, Clientes,  ║
 * ║  Insumos. Suporta collapse (16px / 60px).                   ║
 * ║  Usa React Router <Outlet /> para renderizar a página ativa.║
 * ║                                                              ║
 * ║  DEPENDE DE: react-router-dom (NavLink, Outlet)              ║
 * ║  USADO POR: App.tsx (wrapper de todas as rotas)              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Printer,
  Package,
  Users,
  Menu,
  Lock,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SensitiveAccessBadge, useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/** Itens de navegação da sidebar. Cada item mapeia para uma rota do React Router */
const navItems = [
  { label: "Perfil", path: "/perfil", icon: Users },
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Equipamentos", path: "/equipamentos", icon: Printer },
  { label: "Clientes", path: "/clientes", icon: Users },
  { label: "Insumos", path: "/insumos", icon: Package },
  { label: "Configuracoes", path: "/configuracoes", icon: Settings },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { status, lockSensitiveAccess } = useSensitiveAccess();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn("flex flex-col bg-sidebar transition-all duration-300", collapsed ? "w-16" : "w-60")}>
        {/* Logo */}
        <div className="flex h-[150px] items-center justify-center border-b border-sidebar-border px-4">
          {!collapsed ? (
            <img src="/logo-tag-trasparente.svg" alt="BMITAG" className="h-[110px] w-auto" />
          ) : (
            <div className="h-8 w-8" aria-hidden="true" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/60 hover:bg-white/10 hover:text-white/90"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Segurança */}
        <div className="border-t border-sidebar-border p-3 space-y-3">
          {!collapsed && (
            <div className="space-y-2">
              <SensitiveAccessBadge />
              {status?.active_profile_name && (
                <p className="text-xs text-white/50">
                  Perfil: {status.active_profile_name}
                  {status.active_role ? ` (${status.active_role})` : ""}
                </p>
              )}
            </div>
          )}
          {collapsed && status?.pin_configured && status.unlocked && (
            <div className="flex justify-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
          )}
          {status?.pin_configured && status.unlocked && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => void lockSensitiveAccess()}
            >
              <Lock className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="ml-2">Bloquear acesso sensível</span>}
            </Button>
          )}
        </div>

        {/* Toggle */}
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Recolher</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
