import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Search, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { PROFILE_PRESETS } from "@/lib/profile-presets";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import type { SecurityProfile, SensitivePermission } from "@/types";

type Action = "edit" | "pin" | "deactivate" | "reactivate";
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
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setPin("");
    setConfirmPin("");
    setError(null);
    setNotice(null);
  }
  function close() {
    setSelection(null);
    setAdminPin("");
    setPin("");
    setConfirmPin("");
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
    if (action === "pin" && (!/^\d{4,8}$/.test(pin) || pin !== confirmPin)) {
      setError("Informe um PIN de 4 a 8 dígitos e confirme o mesmo PIN.");
      return;
    }
    if (
      (action === "edit" || action === "pin") &&
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
      if (action === "pin")
        await SensitiveAccessService.resetProfilePin(profile.id, pin, adminPin);
      if (action === "deactivate")
        await SensitiveAccessService.deactivateProfile(profile.id);
      if (action === "reactivate")
        await SensitiveAccessService.reactivateProfile(profile.id);
      close();
      const successMessage = action === "edit" ? `Acesso de ${name.trim()} atualizado com sucesso.`
        : action === "pin" ? `PIN de ${profile.nome} configurado neste computador com sucesso.`
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
    selection?.action === "pin"
      ? "Configurar PIN neste computador"
      : selection?.action === "deactivate"
        ? "Desativar colaborador"
        : selection?.action === "reactivate"
          ? "Reativar colaborador"
          : "Editar acesso";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-cyan-600" /> Sua equipe
              </CardTitle>
              <CardDescription className="mt-2">
                Gerencie as pessoas e o acesso de cada uma.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {profiles.filter((profile) => profile.ativo).length} ativos
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar colaborador"
                className="pl-9"
                placeholder="Buscar pessoa ou função"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />{" "}
              Mostrar inativos
            </label>
          </div>
          {notice && (
            <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {notice}
            </p>
          )}
          {loadError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm"
            >
              <p>{loadError}</p>
              <Button variant="outline" onClick={() => void load()}>
                Tentar novamente
              </Button>
            </div>
          ) : loading ? (
            <p
              role="status"
              className="py-8 text-center text-sm text-muted-foreground"
            >
              Carregando equipe...
            </p>
          ) : (
            <div role="list" aria-label="Colaboradores" className="divide-y rounded-xl border">
              {visible.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum colaborador encontrado.
                </p>
              )}
              {visible.map((profile) => (
                <div
                  role="listitem"
                  key={profile.id}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-semibold text-cyan-700">
                      {profile.nome
                        .trim()
                        .slice(0, 2)
                        .toLocaleUpperCase("pt-BR")}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{profile.nome}</span>
                        {profile.id === activeProfileId && (
                          <Badge variant="secondary">Você</Badge>
                        )}
                        {!profile.ativo && (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {securityRoleLabel(profile.role)} ·{" "}
                        {profile.permissions.length
                          ? `${profile.permissions.length} permissões adicionais`
                          : "Acesso básico"}
                      </p>
                      <p
                        className={`mt-1 text-xs ${profile.pin_configured ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
                      >
                        {profile.pin_configured
                          ? "PIN configurado neste PC"
                          : "PIN não configurado neste PC"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.ativo && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => open(profile, "edit")}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => open(profile, "pin")}
                        >
                          <KeyRound className="mr-2 h-3.5 w-3.5" />
                          PIN
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        profile.ativo ? "text-destructive" : "text-emerald-700"
                      }
                      onClick={() =>
                        open(
                          profile,
                          profile.ativo ? "deactivate" : "reactivate",
                        )
                      }
                    >
                      {profile.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Alterações respeitam as permissões administrativas e ficam
            registradas na auditoria.
          </p>
        </CardContent>
      </Card>
      {catalogReady && (
        <CreateProfileCard profiles={profiles} onCreated={changed} />
      )}
      <Dialog
        open={!!selection}
        onOpenChange={(value) => {
          if (!value && !busy) close();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {selection?.profile.nome}.{" "}
              {selection?.action === "pin"
                ? "O PIN será configurado somente neste computador."
                : "Confira os dados antes de confirmar."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
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
                      <option key={item.role} value={item.role}>
                        {item.label}
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
                />
              </>
            )}
            {selection?.action === "pin" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="team-pin">Novo PIN</Label>
                  <Input
                    id="team-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-pin-confirm">Confirmar novo PIN</Label>
                  <Input
                    id="team-pin-confirm"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={confirmPin}
                    onChange={(event) =>
                      setConfirmPin(
                        event.target.value.replace(/\D/g, "").slice(0, 8),
                      )
                    }
                    disabled={busy}
                  />
                </div>
              </div>
            )}
            {(selection?.action === "edit" || selection?.action === "pin") && (
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
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
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
                {busy ? "Salvando..." : "Confirmar alteração"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
