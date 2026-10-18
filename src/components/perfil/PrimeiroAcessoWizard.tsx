import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppearancePicker } from "@/components/perfil/AppearancePicker";
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { profileAppearance, type ProfileTheme } from "@/lib/profile-appearance";
import { PERMISSION_DETAILS } from "@/lib/profile-presets";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import { BASE_MODULES } from "@/lib/tour-steps";
import { cn } from "@/lib/utils";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

type Step = "acesso" | "voce" | "pronto";

function errorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return mensagemVisivelAoOperador(message) ?? message;
}

/**
 * Primeiro acesso do perfil. Com `needsCode`, começa pelo código do administrador
 * e pela criação do PIN deste computador; depois a pessoa escolhe nome, ícone,
 * cor e tema, e termina podendo abrir o tour.
 */
export function PrimeiroAcessoWizard({
  profile,
  needsCode,
  onStatusChange,
  onCancel,
  onFinish,
}: {
  profile: SecurityProfile;
  needsCode: boolean;
  onStatusChange: (status: SensitiveAccessStatus) => void;
  /** Só disponível antes da ativação: depois dela o perfil já está em uso. */
  onCancel: () => void;
  onFinish: (startTour: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const steps: Step[] = needsCode ? ["acesso", "voce", "pronto"] : ["voce", "pronto"];
  const [step, setStep] = useState<Step>(steps[0]);
  const initialLook = profileAppearance(profile);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [nome, setNome] = useState(profile.nome);
  const [color, setColor] = useState(initialLook.color);
  const [icon, setIcon] = useState(initialLook.icon);
  const [theme, setTheme] = useState<ProfileTheme>(initialLook.theme);
  const [current, setCurrent] = useState<SecurityProfile>(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepIndex = steps.indexOf(step);

  const granted = useMemo(() => [
    ...BASE_MODULES.map((module) => module.title),
    ...current.permissions.map((permission) => PERMISSION_DETAILS[permission]?.title).filter(Boolean),
  ], [current.permissions]);

  async function redeem() {
    if (normalizeCode(codigo).length !== 6) return setError("Digite os 6 caracteres do código.");
    if (!/^\d{4,8}$/.test(pin)) return setError("O PIN deve ter de 4 a 8 dígitos.");
    if (pin !== confirmPin) return setError("Os PINs não conferem.");
    setBusy(true);
    setError(null);
    try {
      const status = await SensitiveAccessService.redeemAccessCode(profile.id, codigo, pin, confirmPin);
      onStatusChange(status);
      const updated = status.profiles.find((item) => item.id === profile.id);
      if (updated) setCurrent(updated);
      setPin("");
      setConfirmPin("");
      setStep("voce");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function savePersonalization() {
    if (nome.trim().length < 3) return setError("O nome deve ter pelo menos 3 caracteres.");
    setBusy(true);
    setError(null);
    try {
      const status = await SensitiveAccessService.savePersonalization({
        nome: nome.trim(),
        avatar_icone: icon,
        avatar_cor: color,
        tema: theme,
        concluir_onboarding: true,
      });
      onStatusChange(status);
      const updated = status.profiles.find((item) => item.id === profile.id);
      if (updated) setCurrent(updated);
      setStep("pronto");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="primeiro-acesso-titulo" className="dark fixed inset-0 z-[90] grid bg-background text-foreground lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col overflow-y-auto bg-card px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-2.5">
          <img src="/logo-tag-trasparente.svg" alt="" className="h-8 w-auto" />
          <span className="text-lg font-bold">AutoOS</span>
        </div>

        <ol aria-label="Etapas" className="mt-10 flex gap-2">
          {steps.map((item, index) => (
            <li key={item} aria-current={item === step ? "step" : undefined} className="flex flex-1 flex-col gap-2">
              <span className={cn("h-1 rounded-full transition-colors", index <= stepIndex ? "bg-primary" : "bg-border")} />
              <span className={cn("text-xs", index <= stepIndex ? "text-foreground" : "text-muted-foreground")}>
                {item === "acesso" ? "Código e PIN" : item === "voce" ? "Seu perfil" : "Pronto"}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-1 flex-col justify-center py-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} {...slide} transition={{ duration: 0.22, ease: "easeOut" }} className="space-y-7">
              {step === "acesso" && (
                <form
                  id="primeiro-acesso-form"
                  className="space-y-7"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void redeem();
                  }}
                >
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-3xl font-bold tracking-tight">Bem-vindo ao AutoOS</h1>
                    <p className="text-muted-foreground">
                      Digite o código que o administrador te passou e crie o PIN que você vai usar neste computador.
                    </p>
                  </header>
                  <div className="space-y-2">
                    <Label htmlFor="primeiro-acesso-codigo">Código de primeiro acesso</Label>
                    <Input
                      id="primeiro-acesso-codigo"
                      value={codigo}
                      onChange={(event) => setCodigo(formatCode(event.target.value))}
                      placeholder="K7Q-42M"
                      autoComplete="one-time-code"
                      autoFocus
                      className="h-14 text-2xl font-semibold uppercase tracking-[0.3em]"
                    />
                    <p className="text-sm text-muted-foreground">Vale por 24 horas. Expirou? Peça um novo ao administrador.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="primeiro-acesso-pin">Crie seu PIN</Label>
                      <Input
                        id="primeiro-acesso-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pin}
                        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="4 a 8 dígitos"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primeiro-acesso-pin-confirm">Repita o PIN</Label>
                      <Input
                        id="primeiro-acesso-pin-confirm"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={confirmPin}
                        onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                        className="h-12"
                      />
                    </div>
                  </div>
                  <p className="flex gap-2.5 rounded-xl bg-muted p-3.5 text-sm leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Só você sabe este PIN, nem o administrador vê. Se esquecer, ele gera um novo código para você.
                  </p>
                </form>
              )}

              {step === "voce" && (
                <form
                  id="primeiro-acesso-form"
                  className="space-y-7"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void savePersonalization();
                  }}
                >
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-3xl font-bold tracking-tight">Deixe com a sua cara</h1>
                    <p className="text-muted-foreground">Seu nome aparece na tela de perfis, nas OS e no histórico. Dá para mudar tudo depois em Perfil.</p>
                  </header>
                  <div className="max-w-sm space-y-2">
                    <Label htmlFor="primeiro-acesso-nome">Nome de exibição</Label>
                    <Input id="primeiro-acesso-nome" value={nome} onChange={(event) => setNome(event.target.value)} maxLength={40} className="h-12 text-base" autoFocus />
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
                </form>
              )}

              {step === "pronto" && (
                <div className="space-y-6">
                  <ProfileAvatar icon={icon} color={color} size="lg" />
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-3xl font-bold tracking-tight">Tudo pronto, {current.nome}</h1>
                    <p className="text-muted-foreground">O administrador liberou para você:</p>
                  </header>
                  <ul className="flex flex-wrap gap-2">
                    {granted.map((title) => (
                      <li key={title} className="rounded-full border bg-muted px-3 py-1.5 text-sm">{title}</li>
                    ))}
                  </ul>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Em 2 minutos a gente mostra onde fica cada coisa. Se preferir, pule e veja depois em Perfil › Tutorial.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <p role="alert" className="mt-5 text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          {step === "acesso" ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar aos perfis
            </Button>
          ) : <span />}
          {step === "pronto" ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onFinish(false)}>Pular por agora</Button>
              <Button type="button" onClick={() => onFinish(true)}>Começar tour</Button>
            </div>
          ) : (
            <Button type="submit" form="primeiro-acesso-form" disabled={busy}>
              {busy ? "Salvando..." : "Continuar"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <ShellPreview name={nome.trim() || current.nome} role={securityRoleLabel(current.role)} icon={icon} color={color} theme={theme} />
    </div>
  );
}

function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
}

function formatCode(value: string) {
  const code = normalizeCode(value);
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** Miniatura do AutoOS com o visual escolhido, atualizada ao vivo. */
function ShellPreview({ name, role, icon, color, theme }: { name: string; role: string; icon: string; color: string; theme: ProfileTheme }) {
  const light = theme === "light";
  const palette = light
    ? { bg: "#F8F9FB", side: "#1B2232", card: "#FFFFFF", line: "#E1E5EB" }
    : { bg: "#0B0E13", side: "#0F131B", card: "#11151D", line: "#20293B" };
  return (
    <div aria-hidden="true" className="hidden items-center overflow-hidden py-16 pl-14 lg:flex">
      <div className="flex h-[520px] w-[680px] shrink-0 overflow-hidden rounded-l-2xl shadow-2xl transition-colors" style={{ backgroundColor: palette.bg }}>
        <div className="flex w-48 flex-col gap-1 px-3.5 py-5" style={{ backgroundColor: palette.side }}>
          <div className="mb-4 flex items-center gap-2 px-1">
            <span className="h-5 w-5 rounded-md bg-primary" />
            <span className="text-[13px] font-bold text-white">AutoOS</span>
          </div>
          {["Dashboard", "Equipamentos", "Clientes", "Serviços", "Perfil"].map((label, index) => (
            <span key={label} className={cn("rounded-lg px-2.5 py-1.5 text-xs", index === 1 ? "bg-primary text-white" : "text-white/60")}>{label}</span>
          ))}
          <span className="flex-1" />
          <span className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <ProfileAvatar icon={icon} color={color} size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold text-white">{name}</span>
              <span className="text-[11px] text-white/55">{role}</span>
            </span>
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 p-6">
          <span className="h-3.5 w-2/5 rounded-full" style={{ backgroundColor: palette.line }} />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => (
              <span key={item} className="h-[72px] rounded-xl border" style={{ backgroundColor: palette.card, borderColor: palette.line }} />
            ))}
          </div>
          <span className="flex flex-1 flex-col gap-3 rounded-xl border p-4" style={{ backgroundColor: palette.card, borderColor: palette.line }}>
            {["70%", "55%", "62%"].map((width) => (
              <span key={width} className="h-2.5 rounded-full" style={{ width, backgroundColor: palette.line }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
