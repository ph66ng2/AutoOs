import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Printer, ShieldCheck, Users, Wrench } from "lucide-react";
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

const PRESS = "active:scale-[0.96] transition-[transform,background-color] duration-150 ease-out motion-reduce:active:scale-100";

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
  recovery = false,
  onStatusChange,
  onCancel,
  onFinish,
}: {
  profile: SecurityProfile;
  needsCode: boolean;
  /** Perfil que já tem PIN e o esqueceu: só código + PIN novo, sem nome/visual/tour. */
  recovery?: boolean;
  onStatusChange: (status: SensitiveAccessStatus) => void;
  /** Só disponível antes da ativação: depois dela o perfil já está em uso. */
  onCancel: () => void;
  onFinish: (result: "tour" | "pular" | "ativado") => void;
}) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  // Quem já concluiu o primeiro acesso em outro computador não escolhe nome e visual de novo:
  // só o código e o PIN deste computador (mesma etapa da recuperação de PIN).
  // Fixado na montagem: depois de salvar o perfil, `onboarding_pendente` muda e não pode mudar o fluxo.
  const [initialFlow] = useState(() => {
    const reactivation = needsCode && !recovery && !profile.onboarding_pendente;
    const shortFlow = recovery || reactivation;
    const steps: Step[] = shortFlow ? ["acesso"] : needsCode ? ["acesso", "voce", "pronto"] : ["voce", "pronto"];
    return { reactivation, shortFlow, steps };
  });
  const { reactivation, shortFlow, steps } = initialFlow;
  const [step, setStep] = useState<Step>(steps[0]);
  const [redeemed, setRedeemed] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const initialLook = profileAppearance(profile);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [nome, setNome] = useState(profile.nome);
  const [color, setColor] = useState(initialLook.color);
  const [icon, setIcon] = useState(initialLook.icon);
  const [theme, setTheme] = useState<ProfileTheme>(initialLook.theme);
  // Trocar o tema não anima cores de tudo na tela: desliga transições só durante a troca.
  const firstTheme = useRef(true);
  useLayoutEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    el.setAttribute("data-theme-switching", "");
    void el.offsetHeight;
    const id = requestAnimationFrame(() => el.removeAttribute("data-theme-switching"));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  const [current, setCurrent] = useState<SecurityProfile>(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepIndex = steps.indexOf(step);

  function goTo(next: Step) {
    setDirection(steps.indexOf(next) > stepIndex ? 1 : -1);
    setError(null);
    setStep(next);
  }

  const granted = useMemo(() => [
    ...BASE_MODULES.map((module) => module.title),
    ...current.permissions.map((permission) => PERMISSION_DETAILS[permission]?.title).filter(Boolean),
  ], [current.permissions]);

  // `busy` só vale no próximo render: Enter ou clique repetido chega antes disso.
  const redeemInFlight = useRef(false);

  async function redeem() {
    if (redeemed) {
      goTo("voce");
      return;
    }
    if (redeemInFlight.current) return;
    if (normalizeCode(codigo).length !== 6) return setError("Digite os 6 caracteres do código.");
    if (!/^\d{4,8}$/.test(pin)) return setError("O PIN deve ter de 4 a 8 dígitos.");
    if (pin !== confirmPin) return setError("Os PINs não conferem.");
    redeemInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const status = await SensitiveAccessService.redeemAccessCode(profile.id, codigo, pin, confirmPin);
      onStatusChange(status);
      const updated = status.profiles.find((item) => item.id === profile.id);
      if (updated) setCurrent(updated);
      setPin("");
      setConfirmPin("");
      if (shortFlow) {
        onFinish("ativado");
        return;
      }
      setRedeemed(true);
      goTo("voce");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      redeemInFlight.current = false;
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
      goTo("pronto");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  // `direction` (1 avançar, -1 voltar) chega como `custom`: a etapa entra pelo lado de onde veio.
  const slide: Variants = {
    initial: (d: 1 | -1) => ({ opacity: 0, x: reduceMotion ? 0 : 16 * d }),
    animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
    exit: (d: 1 | -1) => ({ opacity: 0, x: reduceMotion ? 0 : -8 * d, transition: { duration: 0.12, ease: "easeOut" } }),
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="primeiro-acesso-titulo" data-blocks-tour="true" ref={rootRef} className={cn("fixed inset-0 z-[90] grid bg-background text-foreground lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]", theme === "dark" ? "dark" : "light")}>
      <div className="flex min-h-0 flex-col bg-background">
        <div className="mx-auto w-full max-w-[480px] shrink-0 px-6 pt-6 sm:px-10 lg:px-14">
        <div className="flex items-center gap-2.5">
          <img src="/logo-tag-trasparente.svg" alt="" className="h-7 w-auto" />
          <span className="text-lg font-bold">AutoOS</span>
        </div>

        <ol aria-label="Etapas" className={cn("mt-6 flex gap-2", shortFlow && "hidden")}>
          {steps.map((item, index) => (
            <li key={item} aria-current={item === step ? "step" : undefined} className="flex flex-1 flex-col gap-2">
              <span className={cn("h-1 rounded-full transition-colors", index <= stepIndex ? "bg-primary" : "bg-muted")} />
              <span className={cn("text-xs", index <= stepIndex ? "text-foreground" : "text-muted-foreground")}>
                {item === "acesso" ? "Código e PIN" : item === "voce" ? "Seu perfil" : "Pronto"}
              </span>
            </li>
          ))}
        </ol>
        </div>

        <div data-slot="wizard-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-6 py-6 sm:px-10 lg:px-14">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div key={step} custom={direction} variants={slide} initial="initial" animate="animate" exit="exit" className="space-y-5">
              {step === "acesso" && redeemed && (
                <form
                  id="primeiro-acesso-form"
                  className="space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    goTo("voce");
                  }}
                >
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-2xl font-semibold tracking-tight">Código e PIN definidos</h1>
                    <p className="text-sm text-foreground">O código já foi usado e o PIN deste computador está salvo. Para trocar o PIN depois, use Perfil › Segurança.</p>
                  </header>
                </form>
              )}

              {step === "acesso" && !redeemed && (
                <form
                  id="primeiro-acesso-form"
                  className="space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void redeem();
                  }}
                >
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-2xl font-semibold tracking-tight">
                      {recovery
                        ? `Redefinir o PIN de ${profile.nome}`
                        : reactivation
                          ? `Ativar ${profile.nome} neste computador`
                          : "Bem-vindo ao AutoOS"}
                    </h1>
                    <p className="text-sm text-foreground">
                      {recovery
                        ? "Digite o código que o administrador gerou para você e crie o novo PIN deste computador. O PIN antigo deixa de valer neste computador; nos outros, ele continua valendo até você usar um código lá."
                        : reactivation
                          ? "Digite o código que o administrador gerou e crie o PIN que você vai usar neste computador. Seu nome e seu visual continuam os mesmos."
                          : "Digite o código que o administrador te passou e crie o PIN que você vai usar neste computador."}
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
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    Só você sabe este PIN, nem o administrador vê. Se esquecer, ele gera um novo código para você.
                  </p>
                </form>
              )}

              {step === "voce" && (
                <>
                  <div className="lg:hidden flex items-center gap-3 rounded-xl bg-muted p-3">
                    <ProfileAvatar icon={icon} color={color} size="md" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{nome.trim() || current.nome}</span>
                      <span className="text-xs text-muted-foreground">{securityRoleLabel(current.role)}</span>
                    </span>
                  </div>
                  <form
                    id="primeiro-acesso-form"
                    className="space-y-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void savePersonalization();
                    }}
                  >
                    <header className="space-y-2">
                      <h1 id="primeiro-acesso-titulo" className="text-2xl font-semibold tracking-tight">Deixe com a sua cara</h1>
                      <p className="text-sm text-foreground">Seu nome aparece na tela de perfis, nas OS e no histórico. Dá para mudar tudo depois em Perfil.</p>
                    </header>
                    <div className="space-y-2">
                      <Label htmlFor="primeiro-acesso-nome">Nome de exibição</Label>
                      <Input id="primeiro-acesso-nome" value={nome} onChange={(event) => setNome(event.target.value)} maxLength={40} className="h-11 w-full text-base" autoFocus />
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
                </>
              )}

              {step === "pronto" && (
                <div className="space-y-6">
                  <ProfileAvatar icon={icon} color={color} size="lg" />
                  <header className="space-y-2">
                    <h1 id="primeiro-acesso-titulo" className="text-2xl font-semibold tracking-tight">Tudo pronto, {current.nome}</h1>
                    <p className="text-sm text-foreground">O administrador liberou para você:</p>
                  </header>
                  <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {granted.map((title) => (
                      <li key={title} className="flex items-center gap-2"><Check className="h-4 w-4 text-muted-foreground" />{title}</li>
                    ))}
                  </ul>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Em 2 minutos a gente mostra onde fica cada coisa. Se preferir, pule e veja depois em Perfil › Tutorial.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p role="alert" className="mt-5 flex items-start gap-2 text-sm text-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{error}</span>
            </p>
          )}
        </div>
        </div>

        <div className="shrink-0 border-t border-border">
        <div className="mx-auto flex w-full max-w-[480px] flex-wrap items-center justify-between gap-2 px-6 py-4 sm:px-10 lg:px-14">
          {step === "acesso" && !redeemed ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className={PRESS}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar aos perfis
            </Button>
          ) : stepIndex > 0 ? (
            <Button type="button" variant="ghost" onClick={() => goTo(steps[stepIndex - 1])} disabled={busy} className={PRESS}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
          ) : <span />}
          {step === "pronto" ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onFinish("pular")} className={PRESS}>Pular por agora</Button>
              <Button type="button" onClick={() => onFinish("tour")} className={PRESS}>Começar tour</Button>
            </div>
          ) : (
            <Button type="submit" form="primeiro-acesso-form" disabled={busy} className={PRESS}>
              {busy ? "Salvando..." : redeemed ? "Continuar" : recovery ? "Redefinir PIN" : reactivation ? "Ativar neste computador" : "Continuar"} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
        </div>
      </div>

      <ShellPreview name={nome.trim() || current.nome} role={securityRoleLabel(current.role)} icon={icon} color={color} />
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

/** Miniatura decorativa de um pedaço real do AutoOS, com o visual escolhido e o tema da raiz. */
function ShellPreview({ name, role, icon, color }: { name: string; role: string; icon: string; color: string }) {
  const items = [
    { label: "Equipamentos", Icon: Printer, active: true },
    { label: "Clientes", Icon: Users, active: false },
    { label: "Serviços", Icon: Wrench, active: false },
  ];
  const orders = [
    { title: "OS 1042 · HP LaserJet M428", status: "Em análise" },
    { title: "OS 1043 · Epson L3250", status: "Aguardando aprovação" },
  ];
  return (
    <div aria-hidden="true" className="hidden lg:flex items-center justify-center bg-muted p-10">
      <div className="w-full max-w-[460px] rounded-2xl bg-card p-2 shadow-xl">
        <div className="flex aspect-[16/10] overflow-hidden rounded-lg bg-background">
          <div className="flex w-[38%] flex-col bg-sidebar p-3">
            <div className="flex items-center gap-1.5">
              <img src="/logo-tag-trasparente.svg" alt="" className="h-5 w-auto" />
              <span className="text-xs font-semibold text-white">AutoOS</span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {items.map(({ label, Icon, active }) => (
                <span
                  key={label}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                    active ? "bg-white/15 text-white shadow-sm" : "text-white/60",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              ))}
            </div>
            <span className="flex-1" />
            <span className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
              <ProfileAvatar icon={icon} color={color} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-white">{name}</span>
                <span className="truncate text-[11px] text-white/60">{role}</span>
              </span>
            </span>
          </div>
          <div className="flex-1 p-4">
            <span className="block text-sm font-semibold text-foreground">Equipamentos</span>
            {orders.map((order) => (
              <div key={order.title} className="mt-3 flex min-w-0 flex-col gap-0.5 rounded-md bg-card p-2.5 text-xs">
                <span className="truncate font-medium text-foreground">{order.title}</span>
                <span className="truncate text-muted-foreground">{order.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
