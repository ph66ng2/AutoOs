import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRightLeft, Check, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppearancePicker } from "@/components/perfil/AppearancePicker";
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { TeamAccessManager } from "@/components/TeamAccessManager";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { getAppMode, setAppMode } from "@/lib/app-mode";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { profileAppearance, type ProfileTheme } from "@/lib/profile-appearance";
import { PERMISSION_DETAILS } from "@/lib/profile-presets";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { requestTour } from "@/lib/tour-request";
import { BASE_MODULES, newPermissions } from "@/lib/tour-steps";
import { cn } from "@/lib/utils";
import {
  SENSITIVE_PERMISSIONS,
  type SecurityAuditEvent,
  type SecurityProfile,
  type SensitivePermission,
} from "@/types";

const ALL_PERMISSIONS = Object.values(SENSITIVE_PERMISSIONS) as SensitivePermission[];

function errorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return mensagemVisivelAoOperador(message) ?? message;
}

export default function Perfil() {
  const { status, openProfileSelector, refreshStatus } = useSensitiveAccess();
  const navigate = useNavigate();
  const profile = status?.profiles.find((item) => item.id === status.active_profile_id) ?? null;
  const unlocked = Boolean(status?.unlocked);

  if (!profile) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Carregando perfil...</p>;
  }

  const look = profileAppearance(profile);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <ProfileAvatar icon={look.icon} color={look.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold tracking-tight">{profile.nome}</h1>
          <p className="text-muted-foreground">
            {unlocked ? `${securityRoleLabel(status?.active_role)} · ativo neste computador` : "Sessão bloqueada"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void openProfileSelector({
            title: "Quem está usando o AutoOS?",
            description: "Escolha o perfil e informe o PIN para entrar.",
          })}
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" /> Trocar de perfil
        </Button>
      </div>

      {!unlocked ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Informe seu PIN para ver e editar o seu perfil.</p>
            </div>
            <Button type="button" onClick={() => void openProfileSelector({ title: "Quem está usando o AutoOS?", description: "Escolha o perfil e informe o PIN para entrar." })}>
              Desbloquear
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Reinicia abas e formulários ao trocar de perfil: a aba Equipe pode não existir no próximo.
        <Tabs key={profile.id} defaultValue="visao" className="space-y-6">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
            {[
              ["visao", "Visão geral"],
              ["personalizar", "Personalizar"],
              ["seguranca", "Segurança"],
              ["tutorial", "Tutorial"],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className={TAB_CLASS}>{label}</TabsTrigger>
            ))}
            {status?.can_manage_profiles && (
              <TabsTrigger value="equipe" data-tour="perfil-tab-equipe" className={TAB_CLASS}>Equipe</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="visao" className="mt-0">
            <VisaoGeral profile={profile} permissions={status?.permissions ?? []} onModeChange={(mode) => {
              setAppMode(mode);
              navigate(mode === "counter" ? "/balcao" : "/");
            }} />
          </TabsContent>
          <TabsContent value="personalizar" className="mt-0">
            <Personalizar profile={profile} onSaved={refreshStatus} />
          </TabsContent>
          <TabsContent value="seguranca" className="mt-0">
            <Seguranca onChanged={refreshStatus} />
          </TabsContent>
          <TabsContent value="tutorial" className="mt-0">
            <Tutorial profile={profile} permissions={status?.permissions ?? []} />
          </TabsContent>
          {status?.can_manage_profiles && (
            <TabsContent value="equipe" className="mt-0">
              <TeamAccessManager activeProfileId={status.active_profile_id} onChanged={refreshStatus} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

const TAB_CLASS =
  "rounded-none border-b-2 border-transparent px-3.5 py-2.5 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const EVENT_LABELS: Record<string, string> = {
  PROFILE_SWITCH: "Entrou no perfil",
  UNLOCK_SUCCESS: "Desbloqueou a sessão",
  SESSION_UNLOCKED_NO_PIN: "Desbloqueou a sessão",
  LOCK: "Bloqueou a sessão",
  PIN_CHANGED: "Trocou o PIN",
  ACCESS_CODE_REDEEMED: "Ativou o perfil em um computador",
  PROFILE_RENAMED: "Mudou o nome do perfil",
  PROFILE_CREATED: "Criou um perfil",
  PROFILE_UPDATED: "Alterou um perfil",
  ACCESS_CODE_ISSUED: "Gerou um código de acesso",
};

function formatWhen(value?: string | null) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function VisaoGeral({
  profile,
  permissions,
  onModeChange,
}: {
  profile: SecurityProfile;
  permissions: SensitivePermission[];
  onModeChange: (mode: "standard" | "counter") => void;
}) {
  const [activity, setActivity] = useState<SecurityAuditEvent[] | null>(null);
  const mode = getAppMode() ?? "standard";

  useEffect(() => {
    let alive = true;
    SensitiveAccessService.listMyActivity(5)
      .then((events) => { if (alive) setActivity(events); })
      .catch(() => { if (alive) setActivity([]); });
    return () => { alive = false; };
  }, [profile.id]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que você pode fazer</CardTitle>
          <CardDescription>Precisa de algo bloqueado? Fale com o administrador da equipe.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {BASE_MODULES.map((module) => (
              <CapabilityItem key={module.title} title={module.title} note="Liberado para todos" allowed />
            ))}
            {ALL_PERMISSIONS.map((permission) => (
              <CapabilityItem
                key={permission}
                title={PERMISSION_DETAILS[permission].title}
                note={permissions.includes(permission) ? PERMISSION_DETAILS[permission].description : "Bloqueado"}
                allowed={permissions.includes(permission)}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modo deste computador</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Modo" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {([["standard", "Sistema completo"], ["counter", "Balcão"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => mode !== value && onModeChange(value)}
                  className={cn(
                    "h-9 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas ações</CardTitle>
          </CardHeader>
          <CardContent>
            {activity === null ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
            ) : (
              <ul className="space-y-2.5">
                {activity.map((event) => (
                  <li key={event.id} className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{EVENT_LABELS[event.event_type] ?? event.details ?? event.event_type}</span>
                    <span className="shrink-0 text-muted-foreground">{formatWhen(event.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CapabilityItem({ title, note, allowed }: { title: string; note: string; allowed: boolean }) {
  return (
    <li className={cn("flex items-start gap-2.5 rounded-lg p-3", allowed ? "bg-emerald-500/10" : "bg-muted")}>
      {allowed ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
      ) : (
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex flex-col gap-0.5">
        <span className={cn("text-sm font-medium", !allowed && "text-muted-foreground")}>{title}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </span>
    </li>
  );
}

function Personalizar({ profile, onSaved }: { profile: SecurityProfile; onSaved: () => Promise<void> }) {
  const look = profileAppearance(profile);
  const [nome, setNome] = useState(profile.nome);
  const [color, setColor] = useState(look.color);
  const [icon, setIcon] = useState(look.icon);
  const [theme, setTheme] = useState<ProfileTheme>(look.theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (nome.trim().length < 3) return setError("O nome deve ter pelo menos 3 caracteres.");
    setBusy(true);
    setError(null);
    try {
      await SensitiveAccessService.savePersonalization({
        nome: nome.trim(),
        avatar_icone: icon,
        avatar_cor: color,
        tema: theme,
        concluir_onboarding: false,
      });
      await onSaved();
      toast.success("Perfil atualizado.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardContent className="p-6">
        <form onSubmit={(event) => void save(event)} className="space-y-7">
          <div className="flex items-center gap-4">
            <ProfileAvatar icon={icon} color={color} size="lg" />
            <div className="max-w-sm flex-1 space-y-2">
              <Label htmlFor="perfil-nome">Nome de exibição</Label>
              <Input id="perfil-nome" value={nome} onChange={(event) => setNome(event.target.value)} maxLength={40} disabled={busy} />
            </div>
          </div>
          <AppearancePicker
            color={color}
            icon={icon}
            theme={theme}
            onColorChange={setColor}
            onIconChange={setIcon}
            onThemeChange={setTheme}
            disabled={busy}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Seguranca({ onChanged }: { onChanged: () => Promise<void> }) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return setError("O novo PIN deve ter de 4 a 8 dígitos.");
    if (pin !== confirmPin) return setError("Os PINs não conferem.");
    setBusy(true);
    setError(null);
    try {
      await SensitiveAccessService.configurePin(pin, currentPin);
      setCurrentPin("");
      setPin("");
      setConfirmPin("");
      await onChanged();
      toast.success("PIN trocado neste computador.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trocar PIN deste computador</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void save(event)} className="space-y-4">
            {([
              ["perfil-pin-atual", "PIN atual", currentPin, setCurrentPin, "current-password"],
              ["perfil-pin-novo", "Novo PIN", pin, setPin, "new-password"],
              ["perfil-pin-confirmar", "Repita o novo PIN", confirmPin, setConfirmPin, "new-password"],
            ] as const).map(([id, label, value, setter, autoComplete]) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type="password"
                  inputMode="numeric"
                  autoComplete={autoComplete}
                  value={value}
                  onChange={(event) => setter(digits(event.target.value))}
                  disabled={busy}
                />
              </div>
            ))}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Trocar PIN"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Usar em outro computador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Seu PIN fica guardado só neste computador. Para entrar em outro, peça ao administrador um código de primeiro acesso e crie um PIN lá.</p>
          <p>Esqueceu o PIN? O caminho é o mesmo: um código novo do administrador.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Tutorial({ profile, permissions }: { profile: SecurityProfile; permissions: SensitivePermission[] }) {
  const seen = profile.tour_permissoes_vistas ?? null;
  const pending = newPermissions(permissions, seen);
  const openTour = useCallback((kind: "completo" | "novidades") => requestTour(kind), []);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Tour completo</h2>
            <p className="mt-1 text-sm text-muted-foreground">Passa pelas telas liberadas para o seu perfil. Cerca de 2 minutos.</p>
          </div>
          <Button type="button" onClick={() => openTour("completo")}>
            <Sparkles className="mr-2 h-4 w-4" /> Ver tour
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suas liberações</CardTitle>
          <CardDescription>
            {seen === null
              ? "Você ainda não viu o tour."
              : pending.length > 0
                ? "Há liberações novas que o tour ainda não mostrou."
                : "O tour já mostrou tudo o que você pode fazer."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Seu perfil usa as telas do dia a dia, sem liberações extras.</p>
          ) : (
            <ul className="divide-y">
              {permissions.map((permission) => (
                <li key={permission} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-sm font-medium">{PERMISSION_DETAILS[permission].title}</span>
                  {pending.includes(permission) && seen !== null ? (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Novo</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{seen === null ? "Ainda não visto" : "Visto no tour"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {seen !== null && pending.length > 0 && (
            <Button type="button" variant="outline" className="mt-4" onClick={() => openTour("novidades")}>Ver novidades</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
