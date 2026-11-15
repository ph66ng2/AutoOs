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

import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Printer,
  Package,
  DollarSign,
  Shield,
  Wrench,
  Users,
  Menu,
  X,
  Lock,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SensitiveAccessBadge, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { navItemVisible } from "@/lib/nav-visibility";
import { SENSITIVE_PERMISSIONS, type SensitivePermission } from "@/types";
import { PortalAlertasSino } from "@/components/PortalAlertas";
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { TourController } from "@/components/tour/TourController";
import { profileAppearance } from "@/lib/profile-appearance";
import { securityRoleLabel } from "@/lib/security-profile-labels";

/** Permissões que abrem a rota /configuracoes (mesmas de App.tsx). */
const CONFIGURACOES_PERMISSIONS: SensitivePermission[] = [
  SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
  SENSITIVE_PERMISSIONS.COMMUNICATION_SETTINGS,
  SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
];

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: SensitivePermission | SensitivePermission[];
  showWhenLocked?: boolean;
}

/**
 * Menu agrupado por área (MenuLateral do DS). Balcão fica de fora: hoje ele é um
 * modo do app (CounterLayout), e /balcao no modo padrão volta para o Início.
 */
const navGroups: { titulo?: string; itens: NavItem[] }[] = [
  { itens: [{ label: "Início", path: "/", icon: LayoutDashboard }] },
  {
    titulo: "Atendimento",
    itens: [
      { label: "Equipamentos", path: "/equipamentos", icon: Printer },
      { label: "Clientes", path: "/clientes", icon: Users },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { label: "Insumos e peças", path: "/insumos", icon: Package },
      { label: "Serviços", path: "/servicos", icon: Wrench },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [{ label: "Finanças", path: "/gastos", icon: DollarSign, permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES }],
  },
  { titulo: "Administração", itens: [{ label: "Equipe e acessos", path: "/perfil", icon: Shield }] },
];

const configuracoesItem: NavItem = {
  label: "Configurações",
  path: "/configuracoes",
  icon: Settings,
  permission: CONFIGURACOES_PERMISSIONS,
  showWhenLocked: true,
};

function navLinkClass(collapsed: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors duration-150",
      collapsed && "justify-center px-0",
      isActive
        ? "bg-nav-active font-bold text-nav-active-foreground"
        : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
    );
}

export function Layout() {
  const [desktopCollapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = desktopCollapsed && !mobileOpen;
  const { status, lockSensitiveAccess } = useSensitiveAccess();
  const activeProfile = status?.profiles.find((profile) => profile.id === status.active_profile_id) ?? null;
  const activeLook = activeProfile ? profileAppearance(activeProfile) : null;

  const visibleGroups = navGroups
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => navItemVisible(item, status)) }))
    .filter((grupo) => grupo.itens.length > 0);
  const mostrarConfiguracoes = navItemVisible(configuracoesItem, status);
  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === "/"}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      data-tour={`nav-${item.path}`}
      onClick={() => setMobileOpen(false)}
      className={navLinkClass(collapsed)}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" /> }
      {/* Sidebar */}
      {/* z-50 só vale na gaveta do celular (acima do fundo z-40). Em md+ a sidebar é item de flex: com z-50 ela vencia o splash de abertura (z-40). */}
      <aside id="main-sidebar" aria-label="Menu principal" className={cn("fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 md:static md:z-auto md:visible md:translate-x-0", mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full", collapsed ? "md:w-16" : "md:w-[264px]")}>
        <Button type="button" variant="ghost" aria-label="Fechar menu lateral" className="absolute right-2 top-2 text-sidebar-foreground md:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
        {/* Logo */}
        <div className="flex h-20 items-center justify-center px-4">
          {!collapsed ? (
            <img src="/logo-tag-trasparente.svg" alt="BMITAG" className="h-14 w-auto" />
          ) : (
            <div className="h-8 w-8" aria-hidden="true" />
          )}
        </div>

        {/* Navigation */}
        <nav data-tour="nav" className="flex-1 overflow-y-auto px-3 pb-3">
          {visibleGroups.map((grupo) => (
            <div key={grupo.titulo ?? "inicio"} className="space-y-0.5">
              {grupo.titulo && !collapsed && (
                <h4 className="mx-2 mb-1 mt-3 text-xs font-semibold text-muted-foreground">{grupo.titulo}</h4>
              )}
              {grupo.titulo && collapsed && <div className="mx-2 my-2 border-t border-sidebar-border" aria-hidden="true" />}
              {grupo.itens.map(renderItem)}
            </div>
          ))}
        </nav>

        {/* Segurança */}
        <div className="space-y-2 border-t border-sidebar-border p-3">
          {mostrarConfiguracoes && <nav aria-label="Sistema">{renderItem(configuracoesItem)}</nav>}
          {activeProfile && activeLook && (
            <Link
              to="/perfil"
              data-tour="profile-card"
              onClick={() => setMobileOpen(false)}
              aria-label={`Perfil de ${activeProfile.nome}`}
              className={cn("flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-card p-2 transition-colors hover:bg-muted", collapsed && "justify-center border-transparent bg-transparent p-0")}
            >
              <ProfileAvatar icon={activeLook.icon} color={activeLook.color} size={collapsed ? "sm" : "md"} />
              {!collapsed && (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">{activeProfile.nome}</span>
                  <span className="truncate text-xs text-muted-foreground">{status?.active_role ? securityRoleLabel(status.active_role) : "Sessão bloqueada"}</span>
                </span>
              )}
            </Link>
          )}
          {!collapsed && <SensitiveAccessBadge />}
          {collapsed && status?.pin_configured && status.unlocked && (
            <div className="flex justify-center">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-status-ok/30 bg-status-ok-bg text-status-ok">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
          )}
          {status?.pin_configured && status.unlocked && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-sidebar-foreground hover:bg-muted hover:text-foreground"
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
            className="w-full justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <Suspense fallback={<div role="status" aria-live="polite">Carregando página</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <TourController />
    </div>
  );
}
