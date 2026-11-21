/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Layout.tsx — Layout Principal com Sidebar                    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Componente de layout que envolve todas as páginas.          ║
 * ║  Sidebar com navegação: Dashboard, Equipamentos, Clientes,  ║
 * ║  Vendas de insumos,                                         ║
 * ║  Insumos/Peças. Suporta collapse (16px / 60px).            ║
 * ║  Usa React Router <Outlet /> para renderizar a página ativa.║
 * ║                                                              ║
 * ║  DEPENDE DE: react-router-dom (NavLink, Outlet)              ║
 * ║  USADO POR: App.tsx (wrapper de todas as rotas)              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Printer,
  Package,
  DollarSign,
  Shield,
  Wrench,
  Users,
  ShoppingBag,
  Menu,
  X,
  Search,
  Lock,
  Settings,
  BadgeCheck,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Headphones,
  Store,
  Download,
} from "lucide-react";
import { setAppMode, type AppMode } from "@/lib/app-mode";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BuscaGlobal } from "@/components/busca/BuscaGlobal";
import type { TelaBuscavel } from "@/hooks/useBuscaGlobal";
import { AjudaAtalhos } from "@/components/busca/AjudaAtalhos";
import { useAtalhosGlobais } from "@/hooks/useAtalhosGlobais";
import { useRotuloCabe } from "@/hooks/useRotuloCabe";
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
import { abrirPainelAtualizacao, useAtualizacaoDisponivel } from "@/lib/atualizacao-disponivel";
import { registrarAbrirSuporte } from "@/lib/suporte-ponte";
import { useBuscaRespostasSuporte } from "@/hooks/useBuscaRespostasSuporte";


interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: SensitivePermission | SensitivePermission[];
  showWhenLocked?: boolean;
  /** Item que troca o modo do app (Balcão) em vez de só navegar. */
  modo?: AppMode;
}

/**
 * Menu agrupado por área (MenuLateral do DS). O Modo Balcão não ocupa lugar no menu: fica
 * num ícone discreto no pé (e no Ctrl+K); o CounterLayout tem o seu "Modo completo" para voltar.
 */
const navGroups: { titulo?: string; itens: NavItem[] }[] = [
  { itens: [{ label: "Início", path: "/", icon: LayoutGrid }] },
  {
    titulo: "Atendimento",
    itens: [
      { label: "Equipamentos", path: "/equipamentos", icon: Printer },
      { label: "Clientes", path: "/clientes", icon: Users },
      { label: "Vendas de insumos", path: "/vendas", icon: ShoppingBag },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { label: "Insumos e peças", path: "/insumos", icon: Package },
      { label: "Serviços", path: "/servicos", icon: Wrench },
    ],
  },
  // Um grupo só para o que tinha um item cada (Financeiro, Administração): menos títulos,
  // e o menu inteiro cabe em 720p.
  {
    titulo: "Gestão",
    itens: [
      { label: "Finanças", path: "/gastos", icon: DollarSign, permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES },
      { label: "Equipe e acessos", path: "/equipe", icon: Shield },
      { label: "Suporte", path: "/suporte", icon: Headphones },
    ],
  },
];

const configuracoesItem: NavItem = {
  label: "Configurações",
  path: "/configuracoes",
  icon: Settings,
};

/** Tela baixa: menos de 900 px de altura (720p, 768p), onde o menu não tem folga vertical. */
const TELA_BAIXA_ESCONDE = "[@media(max-height:899px)]:hidden";
const TELA_BAIXA_MOSTRA = "hidden [@media(max-height:899px)]:inline-flex";

function navLinkClass(collapsed: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex h-[42px] items-center gap-3 rounded-lg border px-3 text-sm font-medium transition-colors duration-rapida",
      // Tela baixa (720p, 768p): itens um pouco mais baixos para o menu caber sem rolar.
      "[@media(max-height:899px)]:h-9",
      collapsed && "justify-center px-0",
      isActive
        ? "border-sidebar-border bg-card font-semibold text-foreground shadow-sm before:absolute before:-left-3 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
        : "border-transparent text-foreground/80 hover:bg-card/60 hover:text-foreground",
    );
}

export function Layout() {
  const [desktopCollapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = desktopCollapsed && !mobileOpen;
  const { status, lockSensitiveAccess, connectionUnavailable, ensureSensitiveAccess } = useSensitiveAccess();
  // A lista de perfis pode não trazer o perfil da sessão; o nome da sessão basta para o cartão.
  const activeProfile = status?.profiles.find((profile) => profile.id === status.active_profile_id)
    ?? (status?.active_profile_id != null
      ? { id: status.active_profile_id, nome: status.active_profile_name || "Perfil ativo", avatar_icone: null, avatar_cor: null, tema: null }
      : null);
  const activeLook = activeProfile ? profileAppearance(activeProfile) : null;
  const portalDesligado = Boolean(status?.profiles.find((p) => p.id === status.active_profile_id)?.avisos_desligados?.includes("portal"));
  const sessaoAtiva = Boolean(status?.pin_configured && status.unlocked);
  const telaLarga = useLarguraMinima(768);
  const { versao: versaoNova } = useAtualizacaoDisponivel();
  // Borda (2) + padding (24) + ícone (18) + espaço (12) do link do pé do menu.
  const rodapeConfig = useRotuloCabe<HTMLElement, HTMLSpanElement>(56);
  const empresa = useEmpresaAtiva(`${status?.active_profile_id ?? ""}-${status?.unlocked ?? ""}`);
  // O selo só aparece quando há algo fora do normal (sem banco, sem perfil, sem PIN).
  // Desbloqueado vira o ✓ ao lado do nome; bloqueado aparece na linha de baixo do cartão.
  const mostrarAvisoAcesso = connectionUnavailable || !status?.active_profile_id || !status.pin_configured;

  const visibleGroups = navGroups
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => navItemVisible(item, status)) }))
    .filter((grupo) => grupo.itens.length > 0);
  const navigate = useNavigate();
  // "Enviar ao suporte" nos avisos de erro: só com o banco conectado (o chamado é gravado).
  useEffect(() => {
    if (connectionUnavailable) {
      registrarAbrirSuporte(null);
      return;
    }
    registrarAbrirSuporte((relatorioErro) => navigate("/suporte", { state: { relatorioErro, tela: window.location.pathname } }));
    return () => registrarAbrirSuporte(null);
  }, [connectionUnavailable, navigate]);
  // Respostas do suporte (thread do Slack) com a sessão aberta e o banco conectado.
  useBuscaRespostasSuporte(sessaoAtiva && !connectionUnavailable, status?.active_profile_id ?? null);
  const abrirModoBalcao = () => {
    setMobileOpen(false);
    setAppMode("counter");
    navigate("/balcao");
  };
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  // Telas que o Ctrl+K encontra: as mesmas do menu, mais o Modo Balcão.
  const chaveTelas = visibleGroups.flatMap((grupo) => grupo.itens.map((item) => item.path)).join("|");
  const telasBuscaveis = useMemo(
    () => [...visibleGroups.flatMap((grupo) => grupo.itens), configuracoesItem]
      .filter((item) => !item.modo)
      .map((item): TelaBuscavel => ({ label: item.label, path: item.path }))
      .concat({ label: "Modo Balcão", path: "/balcao", aoAbrir: () => setAppMode("counter") }),
    [chaveTelas],
  );
  useAtalhosGlobais({
    abrirBusca: () => setBuscaAberta(true),
    abrirAjuda: () => setAjudaAberta(true),
    // A Nova entrada é página: Cancelar e salvar voltam para a tela em que a pessoa estava.
    bloquear: () => { if (status?.unlocked) void lockSensitiveAccess(); },
    novaEntrada: () => navigate("/equipamentos/nova", { state: { origem: `${window.location.pathname}${window.location.search}` } }),
    // Mesma liberação do botão "+ Novo orçamento" de Vendas.
    novaVenda: () => {
      void ensureSensitiveAccess({
        title: "Novo orçamento de insumos",
        description: "Informe o PIN para criar um orçamento de venda de insumos.",
        permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
      }).then((liberado) => { if (liberado) navigate("/vendas/novo"); });
    },
  });
  // `rodape`: item do pé do menu (Configurações), que divide a linha com Balcão e o sino. Sem a
  // seta de "ativo" e, quando o nome não cabe inteiro (tela de 720p, texto maior), só o ícone.
  const renderItem = (item: NavItem, rodape?: { soIcone: boolean }) => {
    const soIcone = collapsed || Boolean(rodape?.soIcone);
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === "/"}
        aria-label={item.label}
        title={soIcone ? item.label : undefined}
        data-tour={`nav-${item.path}`}
        onClick={() => {
          setMobileOpen(false);
          if (item.modo) setAppMode(item.modo);
        }}
        className={(estado) => cn(navLinkClass(soIcone)(estado), rodape?.soIcone && !collapsed && "w-[42px]")}
      >
        {({ isActive }) => (
          <>
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!soIcone && <span className="flex-1 truncate">{item.label}</span>}
            {!soIcone && isActive && !rodape && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" /> }
      {/* Sidebar */}
      {/* z-50 só vale na gaveta do celular (acima do fundo z-40). Em md+ a sidebar é item de flex: com z-50 ela vencia o splash de abertura (z-40). */}
      <aside id="main-sidebar" aria-label="Menu principal" className={cn("fixed inset-y-0 left-0 z-50 flex w-[16.5rem] shrink-0 flex-col overflow-y-auto bg-sidebar transition-[width,transform,visibility] ease-saida md:overflow-visible duration-lenta md:static md:z-auto md:visible md:translate-x-0", mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full", collapsed ? "md:w-16" : "md:w-[16.5rem]")}>
        {/* Marca */}
        <div className={cn("flex h-[88px] shrink-0 items-center gap-3 px-5", collapsed && "justify-center px-0")}>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-sidebar-border bg-card shadow-sm" aria-hidden="true">
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-primary text-[9px] font-extrabold text-primary-foreground">OS</span>
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[15px] font-bold text-foreground">{empresa ?? "AutoOS"}</span>
              {empresa && <span className="truncate text-xs text-muted-foreground">AutoOS</span>}
            </span>
          )}

            {versaoNova && !collapsed && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Atualizar o AutoOS para a versão ${versaoNova}`}
                title={`Atualizar o AutoOS (versão ${versaoNova})`}
                className={cn("relative h-8 w-8 shrink-0 text-primary hover:text-primary", TELA_BAIXA_MOSTRA)}
                onClick={() => {
                  setMobileOpen(false);
                  abrirPainelAtualizacao();
                }}
              >
                <Download className="h-[18px] w-[18px]" />
                <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
              </Button>
            )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("hidden h-8 w-8 text-muted-foreground hover:text-foreground md:inline-flex", collapsed && "md:hidden")}
            aria-label="Recolher menu"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar menu lateral" className="h-8 w-8 text-muted-foreground md:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
        </div>
        {collapsed && (
          <div className="hidden flex-col items-center gap-1 pb-2 md:flex">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Expandir menu" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Busca global (Ctrl+K) */}
        <div className={cn("shrink-0 px-3 pb-1", collapsed && "flex justify-center px-0")}>
          <button
            type="button"
            onClick={() => setBuscaAberta(true)}
            aria-label="Buscar (Ctrl+K)"
            data-tour="busca-global"
            title={collapsed ? "Buscar (Ctrl+K)" : undefined}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-lg border border-sidebar-border bg-card/60 px-3 text-sm text-muted-foreground transition-colors duration-rapida hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "h-9 w-9 justify-center px-0",
            )}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="flex-1 text-left">Buscar</span>}
            {!collapsed && <kbd className="rounded border bg-muted px-1.5 text-[11px] font-medium">Ctrl K</kbd>}
          </button>
        </div>

        {/* Navigation */}
        {/* No celular o menu inteiro rola (nada some atrás da rolagem da lista); no computador só a lista rola. */}
        <nav data-tour="nav" className="shrink-0 px-3 pb-3 md:flex-1 md:shrink md:overflow-y-auto">
          {visibleGroups.map((grupo) => (
            <div key={grupo.titulo ?? "inicio"} className="space-y-0.5">
              {grupo.titulo && !collapsed && (
                <h4 className="mx-3 mb-1.5 mt-5 text-[13px] font-medium text-muted-foreground [@media(max-height:899px)]:mb-1 [@media(max-height:899px)]:mt-3">{grupo.titulo}</h4>
              )}
              {grupo.titulo && collapsed && <div className="mx-2 my-3 border-t border-sidebar-border [@media(max-height:899px)]:my-2" aria-hidden="true" />}
              {grupo.itens.map((item) => renderItem(item))}
            </div>
          ))}
        </nav>

        {/* Pé: Configurações e o cartão do perfil */}
        <div className="mt-auto space-y-2 px-3 pb-3 pt-2">
          {/* Só existe quando há versão nova; abre o mesmo painel do aviso flutuante. Em tela baixa
              (720p, 768p) o cartão tomaria o espaço do menu: vira o ícone no topo, ao lado de recolher. */}
          {versaoNova && (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                abrirPainelAtualizacao();
              }}
              aria-label={`Atualizar o AutoOS para a versão ${versaoNova}`}
              title={collapsed ? `Atualizar o AutoOS (versão ${versaoNova})` : undefined}
              className={cn(
                "relative flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-rapida hover:bg-primary/15",
                collapsed ? "h-9 w-9 justify-center self-center px-0 py-0" : TELA_BAIXA_ESCONDE,
              )}
            >
              <Download className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate">Atualizar o AutoOS</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">Versão {versaoNova} disponível</span>
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 shrink-0 rounded-full bg-primary", collapsed && "absolute right-1 top-1")}
              />
            </button>
          )}
          {/* No computador não há barra no topo (canvas): as notificações ficam ao lado de Configurações. */}
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <nav ref={rodapeConfig.conteinerRef} aria-label="Sistema" className="relative min-w-0 flex-1">
              {renderItem(configuracoesItem, { soIcone: !rodapeConfig.cabe })}
              {/* Cópia invisível do nome, só para medir se ele cabe inteiro. */}
              <span ref={rodapeConfig.medidaRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-sm font-semibold">
                {configuracoesItem.label}
              </span>
            </nav>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Abrir o Modo Balcão"
              title="Modo Balcão (tela de toque da recepção)"
              // Recolhido em tela baixa não cabe: o Balcão continua no menu aberto e no Ctrl+K.
              className={cn("h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground", collapsed && TELA_BAIXA_ESCONDE)}
              onClick={() => abrirModoBalcao()}
            >
              <Store className="h-[18px] w-[18px]" />
            </Button>
            {telaLarga && <PortalAlertasSino perfilId={status?.active_profile_id ?? null} portalDesligado={portalDesligado} />}
          </div>
          {!collapsed && mostrarAvisoAcesso && <SensitiveAccessBadge />}
          {activeProfile && activeLook && (
            <div
              className={cn(
                "flex items-center gap-1 rounded-xl border border-sidebar-border bg-card p-1.5 shadow-sm",
                collapsed && "flex-col border-transparent bg-transparent p-0 shadow-none",
              )}
            >
              <Link
                to="/perfil"
                data-tour="profile-card"
                onClick={() => setMobileOpen(false)}
                aria-label={`Perfil de ${activeProfile.nome}`}
                title="Trocar perfil"
                className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted", collapsed && "justify-center p-0")}
              >
                <ProfileAvatar icon={activeLook.icon} color={activeLook.color} size={collapsed ? "sm" : "md"} />
                {!collapsed && (
                  <span className="flex min-w-0 flex-1 flex-col">
                    {/* Nome em até duas linhas: nomes compostos não somem atrás de reticências. */}
                    <span className="line-clamp-2 break-words text-sm font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
                      {activeProfile.nome}
                      {sessaoAtiva && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-primary" aria-label="Acesso ativo" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {status?.active_role ? securityRoleLabel(status.active_role) : "Sessão bloqueada"}
                    </span>
                  </span>
                )}
              </Link>
              {sessaoAtiva && (
                <Button
                  variant="ghost"
                  size="icon"
                  // Recolhido em tela baixa não cabe: bloquear continua no Ctrl+L e no menu aberto.
                  className={cn("h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground", collapsed && TELA_BAIXA_ESCONDE)}
                  aria-label="Bloquear acesso sensível"
                  title="Bloquear acesso sensível (Ctrl+L)"
                  aria-keyshortcuts="Control+L"
                  onClick={() => void lockSensitiveAccess()}
                >
                  <Lock className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {!activeProfile && sessaoAtiva && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-muted-foreground hover:text-foreground"
              onClick={() => void lockSensitiveAccess()}
            >
              <Lock className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="ml-2">Bloquear acesso sensível</span>}
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <BuscaGlobal aberta={buscaAberta} onAbertaChange={setBuscaAberta} telas={telasBuscaveis} />
      <AjudaAtalhos aberta={ajudaAberta} onAbertaChange={setAjudaAberta} />
      <main className="min-w-0 flex-1 overflow-auto bg-background">
        {/* Faixa superior: menu no celular e, à direita, as notificações (logo acima dos avisos). */}
        {/* Só no celular: abrir o menu e as notificações. No computador a página começa no título. */}
        {!telaLarga && (
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button type="button" variant="outline" size="icon" aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls="main-sidebar" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
            <span className="font-semibold">{empresa ?? "AutoOS"}</span>
            <div className="ml-auto flex items-center gap-2">
              <PortalAlertasSino perfilId={status?.active_profile_id ?? null} portalDesligado={portalDesligado} />
            </div>
          </header>
        )}
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
