import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useInRouterContext } from "react-router-dom";
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_LABELS } from "@/lib/eventos-auditoria";
import { formatDateTimeSalvador, parseDbTimestampUtc } from "@/lib/date-utils";
import { securityPermissionLabel } from "@/lib/security-profile-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfilePermissions } from "@/components/ProfilePermissions";
import { CreateProfileCard } from "@/components/CreateProfileCard";
import { AccessCodeCard } from "@/components/perfil/AccessCodeCard";
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { profileAppearance } from "@/lib/profile-appearance";
import { newPermissions } from "@/lib/tour-steps";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { MENSAGEM_TRAVA_056, perfilCompativel056 } from "@/lib/compatibilidade-056";
import { PROFILE_PRESETS } from "@/lib/profile-presets";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import { SENSITIVE_PERMISSIONS, type CodigoPrimeiroAcesso, type SecurityAuditEvent, type SecurityProfile, type SensitivePermission } from "@/types";

type Action = "edit" | "code" | "deactivate" | "reactivate";

function memberStatus(profile: SecurityProfile): { label: string; className: string } {
  if (!profile.ativo) return { label: "Inativo", className: "bg-muted text-muted-foreground" };
  if (profile.onboarding_pendente) {
    return { label: "Aguardando 1º acesso", className: "bg-warning/15 text-status-wait" };
  }
  if (profile.tour_permissoes_vistas && newPermissions(profile.permissions, profile.tour_permissoes_vistas).length > 0) {
    return { label: "Vê novidades no próximo acesso", className: "bg-primary/10 text-primary" };
  }
  return { label: "Ativo", className: "bg-status-ok/15 text-status-ok" };
}
const TOTAL_PERMISSOES = Object.keys(SENSITIVE_PERMISSIONS).length;

/** Situação do perfil neste computador (o PIN fica no keyring de cada máquina). */
function situacaoNoComputador(profile: SecurityProfile): { titulo: string; detalhe: string; classe: string } | null {
  if (!profile.ativo) return { titulo: "Inativo", detalhe: "Não aparece na lista de acesso.", classe: "bg-muted text-muted-foreground" };
  if (profile.onboarding_pendente) return { titulo: "Ainda não fez o primeiro acesso", detalhe: "Gere um código para a pessoa entrar.", classe: "bg-muted text-foreground" };
  if (profile.pin_configured) return { titulo: "PIN neste computador", detalhe: "Criado pela própria pessoa.", classe: "bg-status-ok-bg text-status-ok" };
  return { titulo: "Sem PIN neste computador", detalhe: "Usa outro PC. Para entrar aqui, gere um código.", classe: "bg-status-wait-bg text-status-wait" };
}

/** Últimos eventos de segurança, ao lado da equipe; "Ver tudo" leva à auditoria completa. */
function AuditoriaRecente() {
  const [eventos, setEventos] = useState<SecurityAuditEvent[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const dentroDoRoteador = useInRouterContext();
  useEffect(() => {
    let ativo = true;
    Promise.resolve()
      .then(() => SensitiveAccessService.listAuditEvents(6))
      .then((lista) => ativo && setEventos(lista ?? []))
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, []);
  return (
    <section aria-labelledby="auditoria-recente-titulo" className="self-start rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="auditoria-recente-titulo" className="text-base font-bold">Auditoria recente</h2>
        {dentroDoRoteador && (
          <Link to="/configuracoes?aba=observabilidade" className="text-sm font-semibold text-primary hover:underline">Ver tudo</Link>
        )}
      </div>
      {falhou ? (
        <p className="mt-3 text-sm text-muted-foreground">Não foi possível carregar a auditoria.</p>
      ) : eventos == null ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
      ) : eventos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum evento ainda.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {eventos.map((evento) => (
            <li key={evento.id} className="flex gap-3 py-2.5">
              <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", evento.success ? "bg-primary" : "bg-status-bad")} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{EVENT_LABELS[evento.event_type] ?? evento.details ?? evento.event_type}</span>
                <span className="block text-xs text-muted-foreground">
                  {evento.profile_name || "Sistema"}
                  {evento.created_at ? ` · ${formatDateTimeSalvador(parseDbTimestampUtc(evento.created_at), "")}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TeamAccessManager({
  activeProfileId,
  onChanged,
}: {
  activeProfileId?: number | null;
  onChanged: () => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<SecurityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selection, setSelection] = useState<{
    profile: SecurityProfile;
    action: Action;
  } | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("CUSTOM");
  const [permissions, setPermissions] = useState<SensitivePermission[]>([]);
  const [adminPin, setAdminPin] = useState("");
  const [issuedCode, setIssuedCode] = useState<CodigoPrimeiroAcesso | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setProfiles(await SensitiveAccessService.listProfiles(true));
      setCatalogReady(true);
    } catch {
      setLoadError("Não foi possível carregar a equipe. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function changed() {
    await load();
    await onChanged();
  }
  function open(profile: SecurityProfile, action: Action) {
    setSelection({ profile, action });
    setName(profile.nome);
    setRole(profile.role);
    setPermissions([...profile.permissions]);
    setAdminPin("");
    setIssuedCode(null);
    setError(null);
    setNotice(null);
  }
  function close() {
    setSelection(null);
    setAdminPin("");
    setIssuedCode(null);
    setError(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || busy) return;
    const { profile, action } = selection;
    if (action === "edit" && name.trim().length < 3) {
      setError("Informe um nome com pelo menos 3 caracteres.");
      return;
    }
    if (action === "edit") {
      const compat = perfilCompativel056(role, permissions);
      if (!compat.ok) {
        setError(compat.motivo ?? "Perfil incompatível com a versão 0.5.6.");
        return;
      }
    }
    if (action === "reactivate") {
      const compat = perfilCompativel056(profile.role, profile.permissions);
      if (!compat.ok) {
        setError(MENSAGEM_TRAVA_056);
        return;
      }
    }
    if (
      (action === "edit" || action === "code") &&
      !/^\d{4,8}$/.test(adminPin)
    ) {
      setError("Informe seu PIN para autorizar a alteração.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === "edit")
        await SensitiveAccessService.updateProfile(
          profile.id,
          { nome: name.trim(), role, permissions },
          adminPin,
        );
      if (action === "code") {
        setIssuedCode(await SensitiveAccessService.issueAccessCode(profile.id, adminPin));
        setAdminPin("");
        await load();
        return;
      }
      if (action === "deactivate")
        await SensitiveAccessService.deactivateProfile(profile.id);
      if (action === "reactivate")
        await SensitiveAccessService.reactivateProfile(profile.id);
      close();
      const successMessage = action === "edit" ? `Acesso de ${name.trim()} atualizado com sucesso.`
        : action === "deactivate" ? `Acesso de ${profile.nome} desativado com sucesso.`
        : `Acesso de ${profile.nome} reativado com sucesso.`;
      setNotice(successMessage);
      toast.success(successMessage);
      // If the manager changed their own access, refresh auth before making another privileged call.
      if (profile.id === activeProfileId) await onChanged();
      else await changed();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(mensagemVisivelAoOperador(message) ?? message);
    } finally {
      setBusy(false);
    }
  }
  const visible = profiles.filter(
    (profile) =>
      (includeInactive || profile.ativo) &&
      `${profile.nome} ${securityRoleLabel(profile.role)}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const actionTitle =
    selection?.action === "code"
      ? "Novo código de primeiro acesso"
      : selection?.action === "deactivate"
        ? "Desativar colaborador"
        : selection?.action === "reactivate"
          ? "Reativar colaborador"
          : "Editar acesso";

  const ativos = profiles.filter((profile) => profile.ativo).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar colaborador"
            className="h-11 border-transparent bg-muted pl-10 md:h-10"
            placeholder="Buscar pessoa ou função"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground md:min-h-0">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />{" "}
          Mostrar inativos
        </label>
        <span className="text-sm text-muted-foreground">{ativos} {ativos === 1 ? "ativo" : "ativos"}</span>
        {catalogReady && (
          <Button className="ml-auto h-10" onClick={() => setCriando(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo perfil
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-xl border border-status-ok/30 bg-status-ok-bg p-4 text-sm text-status-ok">
          {notice}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {loadError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
            <p>{loadError}</p>
            <Button variant="outline" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </div>
        ) : loading ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            Carregando equipe...
          </p>
        ) : (
          <div role="list" aria-label="Colaboradores" className="grid content-start gap-4 md:grid-cols-2">
            {visible.length === 0 && (
              <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground md:col-span-2">
                Nenhum colaborador encontrado.
              </p>
            )}
            {visible.map((profile) => {
              const situacao = situacaoNoComputador(profile);
              const permissoes = profile.permissions;
              return (
                <div role="listitem" key={profile.id} className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-5", !profile.ativo && "bg-muted/40")}>
                  <div className="flex items-start gap-3">
                    <ProfileAvatar
                      icon={profileAppearance(profile).icon}
                      color={profileAppearance(profile).color}
                      pending={profile.onboarding_pendente}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold [overflow-wrap:anywhere]">{profile.nome}</span>
                        {profile.id === activeProfileId && <Badge variant="secondary">Você</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {securityRoleLabel(profile.role)}
                        {memberStatus(profile).label !== "Ativo" && (
                          <>
                            {" · "}
                            <span className={cn("font-semibold", memberStatus(profile).className.includes("text-status-wait") ? "text-status-wait" : memberStatus(profile).className.includes("text-primary") ? "text-primary" : "")}>
                              {memberStatus(profile).label}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      title={profile.ativo ? `Desativar o acesso de ${profile.nome}` : `Reativar o acesso de ${profile.nome}`}
                      className={cn(
                        "h-11 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold md:h-8",
                        profile.ativo
                          ? "border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                          : "border-status-ok/30 text-status-ok hover:bg-status-ok-bg hover:text-status-ok",
                      )}
                      onClick={() => open(profile, profile.ativo ? "deactivate" : "reactivate")}
                    >
                      {profile.ativo ? <UserX className="h-3.5 w-3.5" aria-hidden="true" /> : <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                      {profile.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                  {situacao && (
                    <div className={cn("rounded-xl px-4 py-3 text-sm", situacao.classe)}>
                      <p className="font-semibold">{situacao.titulo}</p>
                      <p className="text-xs opacity-90">{situacao.detalhe}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      Pode · {permissoes.length} de {TOTAL_PERMISSOES}
                    </p>
                    {permissoes.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">Só as telas do dia a dia.</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {permissoes.slice(0, 4).map((permissao) => (
                          <li key={permissao} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium first-letter:uppercase">
                            {securityPermissionLabel(permissao)}
                          </li>
                        ))}
                        {permissoes.length > 4 && (
                          <li className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium" title={permissoes.slice(4).map(securityPermissionLabel).join(", ")}>
                            +{permissoes.length - 4}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  {profile.ativo && (
                  <div className="mt-auto flex flex-wrap gap-2">
                    {(
                      <>
                        <Button
                          variant={profile.onboarding_pendente || !profile.pin_configured ? "outline" : "default"}
                          className="h-11 flex-1 md:h-9"
                          onClick={() => open(profile, "edit")}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          variant={profile.onboarding_pendente || !profile.pin_configured ? "default" : "outline"}
                          className="h-11 flex-1 md:h-9"
                          onClick={() => open(profile, "code")}
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5" />
                          Novo código
                        </Button>
                      </>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <AuditoriaRecente />
      </div>
      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent tamanho="g" className="overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Novo perfil</DialogTitle>
            <DialogDescription>Cadastrar uma pessoa da equipe.</DialogDescription>
          </DialogHeader>
          {catalogReady && (
            <CreateProfileCard
              profiles={profiles}
              onCreated={async () => {
                await changed();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selection}
        onOpenChange={(value) => {
          if (!value && !busy) close();
        }}
      >
        <DialogContent tamanho="g" className="overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {selection?.profile.nome}.{" "}
              {selection?.action === "code"
                ? "Para outro computador ou PIN esquecido. O código anterior deixa de valer."
                : "Confira os dados antes de confirmar."}
            </DialogDescription>
          </DialogHeader>
          <form onChange={() => setError(null)} onSubmit={(event) => void submit(event)} className="space-y-5">
            {selection?.action === "edit" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="team-name">Nome do colaborador</Label>
                  <Input
                    id="team-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-role">Função</Label>
                  <select
                    id="team-role"
                    value={role}
                    disabled={busy}
                    onChange={(event) => {
                      const preset = PROFILE_PRESETS.find(
                        (item) => item.role === event.target.value,
                      )!;
                      setRole(preset.role);
                      setPermissions([...preset.permissions]);
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {!PROFILE_PRESETS.some((item) => item.role === role) && (
                      <option value={role}>{securityRoleLabel(role)}</option>
                    )}
                    {PROFILE_PRESETS.map((item) => (
                      <option key={item.role} value={item.role} disabled={!item.disponivel && item.role !== role} title={item.motivoIndisponivel}>
                        {item.label}
                        {!item.disponivel ? " (indisponível)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <ProfilePermissions
                  permissions={permissions}
                  onChange={(next) => {
                    setRole("CUSTOM");
                    setPermissions(next);
                  }}
                  disabled={busy || role === "ADMIN"}
                  role={role}
                />
              </>
            )}
            {issuedCode && <AccessCodeCard code={issuedCode} />}
            {!issuedCode && (selection?.action === "edit" || selection?.action === "code") && (
              <div className="space-y-2">
                <Label htmlFor="team-admin-pin">Seu PIN de administrador</Label>
                <Input
                  id="team-admin-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={adminPin}
                  onChange={(event) =>
                    setAdminPin(
                      event.target.value.replace(/\D/g, "").slice(0, 8),
                    )
                  }
                  disabled={busy}
                />
              </div>
            )}
            {selection?.action === "deactivate" && (
              <p className="rounded-lg border border-status-wait/40 bg-warning/5 p-4 text-sm">
                Este colaborador ficará impedido de entrar. O histórico será
                preservado e você poderá reativá-lo depois.
                {selection.profile.id === activeProfileId &&
                  " Você está desativando seu próprio acesso e sua sessão será bloqueada."}
              </p>
            )}
            {selection?.action === "reactivate" && (
              <p className="text-sm text-muted-foreground">
                O colaborador voltará a aparecer na lista de acesso, com as
                permissões anteriores.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {issuedCode ? (
                <Button type="button" onClick={close}>Concluir</Button>
              ) : (
              <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={busy}
                variant={
                  selection?.action === "deactivate" ? "destructive" : "default"
                }
              >
                {busy ? "Salvando..." : selection?.action === "code" ? "Gerar código" : "Confirmar alteração"}
              </Button>
              </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
