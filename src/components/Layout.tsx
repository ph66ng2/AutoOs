/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Layout.tsx — Layout Principal com Sidebar                    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Componente de layout que envolve todas as páginas.          ║
 * ║  Sidebar com navegação: Dashboard, Equipamentos, Clientes,  ║
 * ║  Insumos/Peças. Suporta collapse (16px / 60px).            ║
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
  Receipt,
  Wrench,
  Users,
  Menu,
  X,
  Lock,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SensitiveAccessBadge, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS, type SensitivePermission } from "@/types";
import { PortalAlertasSino } from "@/components/PortalAlertas";

/** Itens de navegação da sidebar. Cada item mapeia para uma rota do React Router */
const navItems: {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: SensitivePermission;
}[] = [
  { label: "Equipe e acessos", path: "/perfil", icon: Users },
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Equipamentos", path: "/equipamentos", icon: Printer },
  { label: "Clientes", path: "/clientes", icon: Users },
  { label: "Insumos/Peças", path: "/insumos", icon: Package },
  { label: "Serviços", path: "/servicos", icon: Wrench },
  { label: "Gastos", path: "/gastos", icon: Receipt, permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES },
  { label: "Configurações", path: "/configuracoes", icon: Settings },
];

export function Layout() {
  const [desktopCollapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = desktopCollapsed && !mobileOpen;
  const { status, lockSensitiveAccess } = useSensitiveAccess();

  const visibleNavItems = navItems.filter(item => {
    if (!item.permission) return true;
    return status?.permissions?.includes(item.permission) ?? false;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" /> }
      {/* Sidebar */}
      <aside id="main-sidebar" aria-label="Menu principal" className={cn("fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col bg-sidebar transition-all duration-300 md:static md:visible md:translate-x-0", mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full", collapsed ? "md:w-16" : "md:w-60")}>
        <Button type="button" variant="ghost" aria-label="Fechar menu lateral" className="absolute right-2 top-2 text-white md:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
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
          {visibleNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              aria-label={item.label}
              onClick={() => setMobileOpen(false)}
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
        <div className="hidden border-t border-sidebar-border p-3 md:block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-white/50 hover:text-white hover:bg-white/10"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed(!desktopCollapsed)}
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Recolher</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 overflow-auto bg-background">
        {/* Faixa superior: menu no celular e, à direita, as notificações (logo acima dos avisos). */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <Button type="button" variant="outline" size="icon" className="md:hidden" aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls="main-sidebar" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
          <span className="font-semibold md:hidden">AutoOS</span>
          <div className="ml-auto flex items-center gap-2">
            <PortalAlertasSino />
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
