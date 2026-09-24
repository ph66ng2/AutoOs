import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, MailPlus, RefreshCw, Search, ShieldCheck, UserCheck, UserRound, UserX, UsersRound } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSaasUsersRepository, type SaasCompanyUser, type SaasOperationalProfileOption, type SupabaseSaasUsersRepository } from "@/lib/data/saas-users-repository";
import type { SaasSession } from "@/types/saas-auth";

type TeamRepository = Pick<
  SupabaseSaasUsersRepository,
  "listUsers" | "listActiveProfiles" | "invite" | "resendInvite" | "changeProfile" | "deactivate" | "reactivate"
>;

type PendingAction =
  | { kind: "change_profile"; user: SaasCompanyUser; profileId: string }
  | { kind: "deactivate" | "reactivate"; user: SaasCompanyUser };

interface SaasTeamSettingsPageProps {
  session: SaasSession;
  repository?: TeamRepository;
}

const STATUS_LABELS = {
  pending: "Convite pendente",
  active: "Ativo",
  inactive: "Inativo",
} as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação online. Tente novamente.";
}

function statusVariant(status: SaasCompanyUser["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

export function SaasTeamSettingsPage({ session, repository: providedRepository }: SaasTeamSettingsPageProps) {
  const repository = useMemo(
    () => providedRepository ?? createSaasUsersRepository(session),
    [providedRepository, session],
  );
  const [users, setUsers] = useState<SaasCompanyUser[]>([]);
  const [profiles, setProfiles] = useState<SaasOperationalProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteProfileId, setInviteProfileId] = useState("");
  const [profileDrafts, setProfileDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    setRefreshWarning(null);
    try {
      const [nextUsers, nextProfiles] = await Promise.all([
        repository.listUsers(),
        repository.listActiveProfiles(),
      ]);
      setUsers(nextUsers);
      setProfiles(nextProfiles);
      setProfileDrafts({});
      setInviteProfileId((current) => nextProfiles.some((profile) => profile.id === current)
        ? current
        : nextProfiles[0]?.id || "");
    } catch (error) {
      setLoadError(safeErrorMessage(error));
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshUsersAfterMutation = async () => {
    try {
      const nextUsers = await repository.listUsers();
      setUsers(nextUsers);
      setProfileDrafts({});
      setRefreshWarning(null);
    } catch {
      setRefreshWarning("A alteração foi confirmada pelo servidor, mas a lista não atualizou. Use “Atualizar equipe” para conferir o estado atual.");
    }
  };

  async function inviteEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !inviteProfileId || busyKey) return;
    setBusyKey("invite");
    setOperationError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);
    try {
      await repository.invite(email, inviteProfileId);
      setInviteEmail("");
      setSuccessMessage(`Convite enviado para ${email}. O funcionário define a própria senha pelo link recebido.`);
      await refreshUsersAfterMutation();
    } catch (error) {
      setOperationError(safeErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function resendInvitation(user: SaasCompanyUser) {
    if (busyKey) return;
    setBusyKey(`resend:${user.user_id}`);
    setOperationError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);
    try {
      await repository.resendInvite(user.user_id);
      setSuccessMessage(`Convite reenviado para ${user.email}.`);
      await refreshUsersAfterMutation();
    } catch (error) {
      setOperationError(safeErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveProfile(user: SaasCompanyUser) {
    const profileId = profileDrafts[user.user_id] ?? user.profile_id;
    if (profileId === user.profile_id || busyKey || user.legacy_admin || user.status === "inactive") return;
    const selected = profiles.find((profile) => profile.id === profileId);
    if (!selected) return;
    if (user.user_id === session.identity.userId && selected.role !== "ADMIN") return;
    setPendingAction({ kind: "change_profile", user, profileId });
  }

  async function confirmPendingAction() {
    const action = pendingAction;
    if (!action || busyKey) return;
    const busyId = `${action.kind}:${action.user.user_id}`;
    setBusyKey(busyId);
    setOperationError(null);
    setRefreshWarning(null);
    setSuccessMessage(null);
    setPendingAction(null);
    try {
      if (action.kind === "change_profile") {
        await repository.changeProfile(action.user.user_id, action.profileId);
        const selected = profiles.find((profile) => profile.id === action.profileId);
        setSuccessMessage(`Perfil de ${action.user.email} alterado para ${selected?.name ?? "o novo perfil"}.`);
      } else if (action.kind === "deactivate") {
        await repository.deactivate(action.user.user_id);
        setSuccessMessage(`Acesso de ${action.user.email} inativado.`);
      } else {
        await repository.reactivate(action.user.user_id);
        setSuccessMessage(`Acesso de ${action.user.email} reativado.`);
      }
      await refreshUsersAfterMutation();
    } catch (error) {
      setOperationError(safeErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return users;
    return users.filter((user) => [user.email, user.profile_name, user.profile_role, STATUS_LABELS[user.status]]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(term)));
  }, [search, users]);

  const pendingCount = users.filter((user) => user.status === "pending").length;
  const activeCount = users.filter((user) => user.status === "active").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="h-4 w-4" />Administração da empresa</div>
          <h1 className="text-3xl font-bold tracking-tight">Equipe e Acessos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Convide funcionários e mantenha os perfis e acessos da sua empresa em ordem.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => { setSuccessMessage(null); void loadData(false); }}
          disabled={loading || refreshing || Boolean(busyKey)}
          aria-label="Atualizar equipe"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </header>

      {loadError && <ErrorAlert context="Equipe e Acessos" action="Não foi possível carregar" message={loadError} />}
      {operationError && <ErrorAlert context="Equipe e Acessos" action="Operação não concluída" message={operationError} />}
      {refreshWarning && <ErrorAlert variant="warning" context="Equipe e Acessos" action="Confira a lista" message={refreshWarning} />}
      {successMessage && <div role="status" aria-live="polite"><ErrorAlert variant="success" context="Equipe e Acessos" action="Concluído" message={successMessage} /></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 pt-6"><div className="rounded-lg bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5" /></div><div><p className="text-2xl font-semibold tabular-nums">{loading ? "—" : users.length}</p><p className="text-sm text-muted-foreground">Pessoas na equipe</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><UserCheck className="h-5 w-5" /></div><div><p className="text-2xl font-semibold tabular-nums">{loading ? "—" : activeCount}</p><p className="text-sm text-muted-foreground">Acessos ativos</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><Clock3 className="h-5 w-5" /></div><div><p className="text-2xl font-semibold tabular-nums">{loading ? "—" : pendingCount}</p><p className="text-sm text-muted-foreground">Convites pendentes</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg"><MailPlus className="h-5 w-5 text-primary" />Convidar funcionário</CardTitle>
          <CardDescription>O convite é enviado por e-mail. A pessoa define a própria senha; ela nunca é exibida ou armazenada por aqui.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void inviteEmployee(event)} className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="team-invite-email">E-mail do funcionário</Label>
              <Input id="team-invite-email" type="email" autoComplete="email" required maxLength={254} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nome@empresa.com.br" disabled={Boolean(busyKey)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-invite-profile">Perfil de acesso</Label>
              <select
                id="team-invite-profile"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={inviteProfileId}
                onChange={(event) => setInviteProfileId(event.target.value)}
                disabled={loading || profiles.length === 0 || Boolean(busyKey)}
                required
              >
                {profiles.length === 0 ? <option value="">Nenhum perfil ativo disponível</option> : null}
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.role}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={loading || !inviteEmail.trim() || !inviteProfileId || Boolean(busyKey)}>
              <MailPlus className="h-4 w-4" />{busyKey === "invite" ? "Enviando…" : "Enviar convite"}
            </Button>
          </form>
          {profiles.length === 0 && !loading && !loadError ? <p className="mt-3 text-sm text-muted-foreground">Crie ou ative um perfil antes de convidar alguém.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1"><CardTitle className="text-lg">Pessoas e perfis</CardTitle><CardDescription>O estado mostrado é o confirmado pelo servidor, não uma alteração local pendente.</CardDescription></div>
          <div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar equipe" className="pl-9" placeholder="Buscar e-mail, perfil ou estado" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </CardHeader>
        <CardContent>
          {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />Carregando equipe…</div>
          ) : loadError ? (
            <div className="py-8 text-center text-sm text-muted-foreground">A lista está indisponível. Atualize para tentar novamente.</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center">
              <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{users.length === 0 ? "Nenhum funcionário cadastrado" : "Nenhum resultado encontrado"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{users.length === 0 ? "Envie um convite para começar a montar sua equipe." : "Tente outro e-mail, perfil ou estado."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Funcionário</TableHead><TableHead>Perfil de acesso</TableHead><TableHead>Estado</TableHead><TableHead>Última alteração</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const draftProfileId = profileDrafts[user.user_id] ?? user.profile_id;
                    const selectedProfile = profiles.find((profile) => profile.id === draftProfileId);
                    const selfDemotion = user.user_id === session.identity.userId && selectedProfile?.role !== "ADMIN";
                    const rowBusy = busyKey?.endsWith(`:${user.user_id}`) ?? false;
                    const canChangeProfile = !user.legacy_admin && user.status !== "inactive";
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell className="min-w-56">
                          <p className="font-medium">{user.email}</p>
                          {user.legacy_admin ? <p className="mt-1 text-xs text-muted-foreground">Conta ADMIN legada · somente leitura</p> : <p className="mt-1 text-xs text-muted-foreground">Funcionário</p>}
                        </TableCell>
                        <TableCell className="min-w-64">
                          <div className="flex items-center gap-2">
                            <select
                              aria-label={`Perfil de ${user.email}`}
                              className="flex h-9 min-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={draftProfileId}
                              onChange={(event) => setProfileDrafts((current) => ({ ...current, [user.user_id]: event.target.value }))}
                              disabled={!canChangeProfile || Boolean(busyKey)}
                            >
                              {!profiles.some((profile) => profile.id === user.profile_id) ? <option value={user.profile_id}>{user.profile_name} · inativo</option> : null}
                              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.role}</option>)}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void saveProfile(user)}
                              disabled={!canChangeProfile || draftProfileId === user.profile_id || selfDemotion || Boolean(busyKey)}
                              aria-label={`Salvar perfil de ${user.email}`}
                              title={selfDemotion ? "Você não pode remover seu próprio perfil ADMIN." : undefined}
                            >
                              Salvar
                            </Button>
                          </div>
                          {selfDemotion ? <p className="mt-1 text-xs text-amber-700" role="note">Sua conta não pode perder o perfil ADMIN nesta tela.</p> : null}
                          {!user.profile_active ? <p className="mt-1 text-xs text-amber-700">O perfil atual está inativo.</p> : null}
                        </TableCell>
                        <TableCell><Badge variant={statusVariant(user.status)}>{STATUS_LABELS[user.status]}</Badge></TableCell>
                        <TableCell className="min-w-36 text-sm text-muted-foreground">
                          {user.updated_at ? <time dateTime={user.updated_at}>{formatDate(user.updated_at)}</time> : user.invited_at ? <time dateTime={user.invited_at}>Convite · {formatDate(user.invited_at)}</time> : "—"}
                        </TableCell>
                        <TableCell className="min-w-44 text-right">
                          <div className="flex justify-end gap-2">
                            {!user.legacy_admin && user.status === "pending" ? <Button type="button" size="sm" variant="outline" disabled={Boolean(busyKey)} onClick={() => void resendInvitation(user)}><MailPlus className="h-4 w-4" />{busyKey === `resend:${user.user_id}` ? "Reenviando…" : "Reenviar"}</Button> : null}
                            {!user.legacy_admin && user.status === "active" && user.user_id !== session.identity.userId ? <Button type="button" size="sm" variant="destructive" disabled={Boolean(busyKey)} onClick={() => setPendingAction({ kind: "deactivate", user })}><UserX className="h-4 w-4" />Inativar</Button> : null}
                            {!user.legacy_admin && user.status === "inactive" ? <Button type="button" size="sm" variant="outline" disabled={!user.profile_active || Boolean(busyKey)} onClick={() => setPendingAction({ kind: "reactivate", user })} title={!user.profile_active ? "Ative o perfil antes de reativar o usuário." : undefined}><UserCheck className="h-4 w-4" />Reativar</Button> : null}
                            {user.user_id === session.identity.userId && user.status === "active" ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Sua conta</span> : null}
                            {user.legacy_admin ? <span className="text-xs text-muted-foreground">Gerenciado fora do SaaS</span> : null}
                            {!user.legacy_admin && user.status === "inactive" && !user.profile_active ? <span className="text-xs text-muted-foreground">Perfil inativo</span> : null}
                          </div>
                          {rowBusy ? <span className="sr-only">Atualizando {user.email}</span> : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => { if (!open) setPendingAction(null); }}
        title={pendingAction?.kind === "deactivate" ? "Inativar acesso?" : pendingAction?.kind === "reactivate" ? "Reativar acesso?" : "Confirmar troca de perfil?"}
        description={pendingAction?.kind === "deactivate"
          ? `${pendingAction.user.email} perderá o acesso à empresa imediatamente. As sessões existentes também serão invalidadas.`
          : pendingAction?.kind === "reactivate"
            ? `Confirma reativar o acesso de ${pendingAction.user.email}? O perfil atribuído será aplicado novamente.`
            : pendingAction?.kind === "change_profile"
              ? `O perfil de ${pendingAction.user.email} mudará para ${profiles.find((profile) => profile.id === pendingAction.profileId)?.name ?? "o perfil selecionado"}. A alteração será registrada no servidor.`
              : "Confirme a operação selecionada."}
        confirmLabel={pendingAction?.kind === "deactivate" ? "Inativar acesso" : pendingAction?.kind === "reactivate" ? "Reativar acesso" : "Alterar perfil"}
        cancelLabel="Cancelar"
        variant={pendingAction?.kind === "deactivate" ? "destructive" : "default"}
        onConfirm={() => void confirmPendingAction()}
      />
    </div>
  );
}

export function SaasTeamAccessDenied() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-semibold">Acesso restrito</h1>
      <p className="mt-2 text-sm text-muted-foreground">A área Equipe e Acessos está disponível somente para ADMIN ativo da empresa.</p>
    </div>
  );
}
