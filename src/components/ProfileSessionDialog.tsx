import { useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
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
import { ProfileAvatar } from "@/components/perfil/ProfileAvatar";
import { cn } from "@/lib/utils";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";
import { needsFirstAccessHere, profileAppearance } from "@/lib/profile-appearance";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import { erroPinNovo } from "@/lib/pin-rules";
import { PinLock } from "@/components/auth/PinLock";
import "@/components/auth/pin-entry.css";
import { PinCreateFields, regrasCumpridas } from "@/components/auth/PinCreateFields";
import type { SecurityProfile } from "@/types";

type ProfileDialogMode = "startup" | "selector" | "sensitive";

/** De onde sai a transição do primeiro acesso: o avatar tracejado e a janela de perfis. */
export interface FirstAccessOrigin {
  avatar: HTMLElement;
  dialog: HTMLElement | null;
}

interface ProfileSessionDialogProps {
  open: boolean;
  mandatory: boolean;
  mode: ProfileDialogMode;
  title: string;
  description: string;
  profiles: SecurityProfile[];
  activeProfileId?: number | null;
  unlocked: boolean;
  selectedProfileId: string;
  selectedProfile: SecurityProfile | null;
  pin: string;
  confirmPin: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onPinChange: (value: string) => void;
  onConfirmPinChange: (value: string) => void;
  onSubmit: () => void;
  onForgotPassword?: () => void;
  /** O cofre de senhas do sistema não respondeu: ninguém pode ser tratado como "sem PIN". */
  keyringBlocked?: boolean;
  onRetryKeyring?: () => void;
  /**
   * Abre o fluxo do código do administrador. `recovery` = o perfil já tem PIN neste
   * computador e a pessoa o esqueceu; sem ele, é o primeiro acesso.
   */
  onFirstAccess?: (profileId: number, recovery?: boolean, origin?: FirstAccessOrigin) => void;
  /** PIN aceito: o campo fica verde com um cadeadinho abrindo antes de a janela sair. */
  accepted?: boolean;
  /** Clique ou foco fora da janela não a fecha (voo do avatar até o primeiro acesso). */
  ignoreOutsideInteraction?: boolean;
}

/**
 * Tela "Quem está usando o AutoOS?": grade de perfis com avatar e, abaixo,
 * o PIN do perfil escolhido. Sempre escura, como o splash, porque aparece
 * antes de existir um perfil (e um tema) na sessão.
 */
export function ProfileSessionDialog({
  open,
  mandatory,
  mode,
  title,
  description,
  profiles,
  activeProfileId,
  unlocked,
  selectedProfileId,
  selectedProfile,
  pin,
  confirmPin,
  busy,
  error,
  onClose,
  onSelectProfile,
  onPinChange,
  onConfirmPinChange,
  onSubmit,
  onForgotPassword,
  onFirstAccess,
  keyringBlocked = false,
  onRetryKeyring,
  accepted = false,
  ignoreOutsideInteraction = false,
}: ProfileSessionDialogProps) {
  const isSelectorMode = mode === "selector";
  const isCurrentProfileSelected = !!selectedProfile && selectedProfile.id === activeProfileId;
  const missingRequiredPin = !keyringBlocked && !!selectedProfile && needsFirstAccessHere(selectedProfile);
  const canStartFirstAccess = missingRequiredPin && !!onFirstAccess;
  const canRecoverWithCode = !keyringBlocked && !!selectedProfile && selectedProfile.pin_configured && !!onFirstAccess;
  const isAdminWithoutPin = !keyringBlocked && selectedProfile?.role === "ADMIN" && !selectedProfile?.pin_configured && !missingRequiredPin;
  // Com o PIN aceito, o status já mostra o perfil desbloqueado; o campo continua na tela
  // até o cadeadinho terminar de abrir.
  const shouldAskForPin = accepted || isAdminWithoutPin || (Boolean(selectedProfile?.pin_configured) && (!isSelectorMode || !isCurrentProfileSelected || !unlocked));
  // Só afirmamos "não exige PIN" quando o perfil realmente tem pin_required = false.
  const pinOptional = selectedProfile?.pin_required === false;

  const primaryActionLabel = (() => {
    if (!selectedProfile) return "Selecione um perfil";
    if (canStartFirstAccess) return selectedProfile.onboarding_pendente ? "Fazer primeiro acesso" : "Ativar neste computador";
    if (missingRequiredPin) return "PIN não configurado neste PC";
    if (isAdminWithoutPin) return "Configurar PIN e continuar";
    if (mode === "startup") return "Entrar";
    if (mode === "selector") {
      return isCurrentProfileSelected
        ? (unlocked ? "Continuar com este perfil" : "Desbloquear este perfil")
        : "Trocar para este perfil";
    }
    return selectedProfile.pin_configured
      ? (isCurrentProfileSelected ? "Desbloquear perfil" : "Trocar perfil e continuar")
      : "Continuar";
  })();

  const primaryDisabled =
    !selectedProfile ||
    keyringBlocked ||
    (missingRequiredPin && !canStartFirstAccess) ||
    busy ||
    accepted ||
    (shouldAskForPin && pin.length < 4) ||
    (isAdminWithoutPin && erroPinNovo(pin, confirmPin) !== null);

  // Cada erro novo faz tremer o cadeado de roletes (criar PIN) ou o campo do PIN (entrar).
  const [pinKeys, setPinKeys] = useState(0);
  const [errorShakes, setErrorShakes] = useState(0);
  /** Só no login: em qual modo este computador entra (a mesma preferência de Perfil › Modo). */
  const [modoEntrada, setModoEntrada] = useState<AppMode>(() => getAppMode() ?? "standard");
  const [versao, setVersao] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "startup") return;
    let ativo = true;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => { if (ativo) setVersao(v); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [mode]);
  const previousError = useRef(error);
  useEffect(() => {
    if (error && error !== previousError.current && shouldAskForPin) setErrorShakes((n) => n + 1);
    previousError.current = error;
  }, [error, shouldAskForPin]);
  const entryState = accepted ? "pin-entry--ok" : error && errorShakes > 0
    ? cn("pin-entry--error", errorShakes % 2 ? "pin-entry--shake-a" : "pin-entry--shake-b")
    : "";
  const handlePinChange = (value: string) => {
    onPinChange(value);
    setPinKeys((n) => n + 1);
  };
  const handleConfirmPinChange = (value: string) => {
    onConfirmPinChange(value);
    setPinKeys((n) => n + 1);
  };
  const lockChecked = isAdminWithoutPin ? regrasCumpridas(pin, confirmPin) : 0;

  const handlePrimaryAction = () => {
    if (primaryDisabled || !selectedProfile) return;
    if (canStartFirstAccess) {
      // Só o primeiro acesso de um perfil novo ganha a transição; "Ativar neste computador" abre direto.
      const avatar = selectedProfile.onboarding_pendente
        ? document.querySelector<HTMLElement>(`[data-profile-avatar="${selectedProfile.id}"] .border-dashed`)
        : null;
      onFirstAccess!(selectedProfile.id, false, avatar ? { avatar, dialog: avatar.closest<HTMLElement>("[role='dialog']") } : undefined);
      return;
    }
    if (mode === "startup" && modoEntrada !== getAppMode()) setAppMode(modoEntrada);
    onSubmit();
  };

  const helperText = (() => {
    if (accepted) return null;
    if (!selectedProfile) return "Escolha seu perfil para entrar.";
    if (canStartFirstAccess) return selectedProfile.onboarding_pendente
      ? "Este perfil ainda não foi ativado neste computador. Tenha em mãos o código de primeiro acesso que o administrador te passou."
      : "Este perfil ainda não tem PIN neste computador. Peça um código ao administrador para ativá-lo aqui.";
    if (missingRequiredPin) return "Este perfil exige PIN. Peça a um administrador para configurá-lo neste computador em Equipe e acessos, ou use a recuperação de acesso.";
    if (isAdminWithoutPin) return "Seu perfil de administrador exige um PIN. Defina um PIN de 4 a 8 dígitos para continuar.";
    if (mode === "selector" && isCurrentProfileSelected) {
      return unlocked ? "Você já está usando este perfil. Feche agora ou continue nele." : "Informe o PIN deste perfil para desbloquear a sessão.";
    }
    if (!selectedProfile.pin_configured) {
      return pinOptional
        ? "Este perfil não exige PIN. Clique abaixo para continuar."
        : "Este perfil não tem PIN configurado neste PC. Clique abaixo para continuar.";
    }
    return null;
  })();

  // Ter apenas um perfil não significa, por si só, primeiro acesso: uma instalação
  // já usada pode continuar com apenas o administrador e um PIN já configurado.
  // A tela de criação só pode ser exibida quando o PIN está realmente pendente.
  const isFirstInstall = mode === "startup" && profiles.length === 1 && isAdminWithoutPin;
  const pinInputClass = "h-12 text-center text-xl font-semibold tracking-[0.4em]";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        // Na abertura do app a escolha de perfil é a própria página (canvas "Entrar com PIN"):
        // fundo claro do app, cartão no centro, sem o escurecido de janela.
        overlayClassName={mode === "startup" ? "bg-background" : undefined}
        className={cn(
          "max-w-[640px] gap-0 overflow-hidden rounded-2xl bg-card p-0 text-foreground",
          mode === "startup" && "shadow-[0_12px_40px_hsl(var(--foreground)/0.08)]",
          mandatory && "[&>button]:hidden",
        )}
        onPointerDownOutside={(event) => {
          if (ignoreOutsideInteraction) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (ignoreOutsideInteraction) event.preventDefault();
        }}
      >
        <div className="max-h-[90vh] overflow-y-auto px-6 py-8 sm:px-8">
          <p className="mb-6 flex items-center justify-center gap-2.5" aria-hidden="true">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-extrabold text-primary-foreground">OS</span>
            <span className="text-base font-extrabold">AutoOS</span>
          </p>
          {isFirstInstall && selectedProfile ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-6 text-center">
              <PinLock checked={lockChecked} spin={pinKeys} shake={errorShakes} />
              <DialogHeader className="items-center text-center">
                <DialogTitle className="text-2xl font-bold tracking-tight">Bem-vindo ao AutoOS</DialogTitle>
                <DialogDescription>Crie o PIN do administrador para começar. Ele fica guardado só neste computador.</DialogDescription>
              </DialogHeader>
              <form
                id="profile-session-pin-form"
                className="w-full space-y-4 text-left"
                onSubmit={(event) => {
                  event.preventDefault();
                  handlePrimaryAction();
                }}
              >
                <PinCreateFields
                  idPrefix="sensitive"
                  pin={pin}
                  confirmPin={confirmPin}
                  onPinChange={handlePinChange}
                  onConfirmPinChange={handleConfirmPinChange}
                  pinLabel="Criar PIN"
                  confirmLabel="Confirmar PIN"
                  inputClassName={pinInputClass}
                  autoFocus
                />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button size="lg" type="submit" disabled={primaryDisabled} className="w-full">
                  {busy ? "Validando..." : <>Criar meu acesso e entrar <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
              </form>
            </div>
          ) : (
            <>
              <DialogHeader className="items-center text-center">
                <DialogTitle className="text-[26px] font-extrabold tracking-tight">{title}</DialogTitle>
                <DialogDescription className="max-w-xl">{description}</DialogDescription>
              </DialogHeader>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {profiles.map((profile) => {
                  const isSelected = String(profile.id) === selectedProfileId;
                  const isCurrent = profile.id === activeProfileId && unlocked;
                  const pendingHere = !keyringBlocked && needsFirstAccessHere(profile);
                  // Tracejado só para quem ainda não montou o perfil; quem já o montou em outro
                  // computador mantém o próprio avatar e só precisa ativá-lo neste.
                  const neverSetUp = pendingHere && Boolean(profile.onboarding_pendente);
                  const look = profileAppearance(profile);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelectProfile(String(profile.id))}
                      className={cn(
                        "flex w-[144px] flex-col items-center gap-2.5 rounded-2xl border-2 px-2 pb-3 pt-3 transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "border-primary bg-acc-soft/40" : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span
                        data-profile-avatar={profile.id}
                        className="flex rounded-[28px] transition-shadow"

                      >
                        <ProfileAvatar icon={look.icon} color={look.color} size="lg" pending={neverSetUp} />
                      </span>
                      <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
                        <span className="block w-full truncate text-center text-[15px] font-semibold" title={profile.nome}>{profile.nome}</span>
                        <span className="block w-full truncate text-center text-xs text-muted-foreground">
                          {neverSetUp ? "Primeiro acesso" : pendingHere ? "Ativar neste computador" : securityRoleLabel(profile.role)}
                        </span>
                        {isCurrent && <span className="mt-1 rounded-full bg-status-ok/15 px-2 py-0.5 text-[11px] font-medium text-status-ok">Perfil atual</span>}
                        {!keyringBlocked && !pendingHere && !profile.pin_configured && (
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {pinOptionalFor(profile) ? "Não exige PIN" : "PIN não configurado neste PC"}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex w-full flex-col items-center gap-4 text-center">
                {keyringBlocked && (
                  <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-status-wait/40 bg-warning/10 px-4 py-3 text-sm text-status-wait">
                    <p>O cofre de senhas do sistema está bloqueado ou indisponível. Desbloqueie-o e tente de novo.</p>
                    {onRetryKeyring && (
                      <Button type="button" variant="outline" size="sm" onClick={onRetryKeyring} disabled={busy}>
                        Tentar de novo
                      </Button>
                    )}
                  </div>
                )}

                {helperText && !keyringBlocked && !(error && !shouldAskForPin && selectedProfile?.pin_configured) && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{helperText}</p>
                )}

                {shouldAskForPin && (
                  <form
                    id="profile-session-pin-form"
                    className="flex w-full flex-col gap-3 text-left"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handlePrimaryAction();
                    }}
                  >
                    {isAdminWithoutPin && (
                      <PinLock checked={lockChecked} spin={pinKeys} shake={errorShakes} className="mx-auto mb-2" />
                    )}
                    {isAdminWithoutPin ? (
                      <PinCreateFields
                        idPrefix="sensitive"
                        pin={pin}
                        confirmPin={confirmPin}
                        onPinChange={handlePinChange}
                        onConfirmPinChange={handleConfirmPinChange}
                        pinLabel="Novo PIN"
                        confirmLabel="Confirmar PIN"
                        inputClassName={pinInputClass}
                        centered
                        autoFocus
                      />
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="sensitive-pin" className="block text-left">{selectedProfile ? `PIN de ${selectedProfile.nome.split(" ")[0]}` : "PIN do perfil"}</Label>
                        <div className={cn("pin-entry", entryState)}>
                          <Input
                            id="sensitive-pin"
                            type="password"
                            inputMode="numeric"
                            value={pin}
                            onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                            placeholder="••••"
                            aria-label="PIN do perfil"
                            autoComplete="current-password"
                            className={pinInputClass}
                            autoFocus
                          />
                          {accepted && (
                            <svg viewBox="4 4 32 30" className="pin-entry__lock" aria-hidden="true" focusable="false">
                              {/* A alça é desenhada antes do corpo: as pernas entram nele e ficam escondidas. */}
                              <path className="pin-entry__shackle" d="M15.5 27 V15.5 A4.5 4.5 0 0 1 24.5 15.5 V23.5" />
                              <rect className="pin-entry__body" x="12.5" y="19" width="15" height="10.5" rx="1" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}
                  </form>
                )}

                {!shouldAskForPin && !error && selectedProfile?.pin_configured && (
                  <p className="text-sm text-status-ok">Você já está neste perfil. Use o botão abaixo para continuar sem trocar a conta atual.</p>
                )}

                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                {mode === "startup" && !canStartFirstAccess && !isAdminWithoutPin && (
                  <div className="w-full text-left">
                    <p id="modo-entrada-rotulo" className="mb-2 text-sm text-muted-foreground">Entrar no</p>
                    <div role="radiogroup" aria-labelledby="modo-entrada-rotulo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                      {([["standard", "Modo completo", "Todas as telas"], ["counter", "Balcão", "Tela de toque"]] as const).map(([valor, rotulo, detalhe]) => (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={modoEntrada === valor}
                          onClick={() => setModoEntrada(valor)}
                          className={cn(
                            "flex min-h-12 flex-col items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            modoEntrada === valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {rotulo}
                          <span className="text-xs font-normal text-muted-foreground">{detalhe}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex w-full flex-col-reverse items-stretch justify-center gap-2 sm:flex-row">
                  {mode === "startup" ? (
                    <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</Button>
                  ) : !mandatory ? (
                    <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>Fechar</Button>
                  ) : null}
                  <Button
                    type={shouldAskForPin ? "submit" : "button"}
                    form={shouldAskForPin ? "profile-session-pin-form" : undefined}
                    onClick={shouldAskForPin ? undefined : handlePrimaryAction}
                    disabled={primaryDisabled}
                    className="h-12 min-w-[200px] flex-1 text-base"
                  >
                    {canStartFirstAccess && <KeyRound className="mr-2 h-4 w-4" />}
                    {busy ? "Validando..." : primaryActionLabel}
                  </Button>
                </div>

                {(canRecoverWithCode || (onForgotPassword && mode !== "selector")) && (
                  <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    {canRecoverWithCode && selectedProfile && (
                      <Button variant="link" type="button" onClick={() => onFirstAccess!(selectedProfile.id, true)} className="h-auto px-0 text-sm text-primary">
                        Esqueci meu PIN: tenho um código do administrador
                      </Button>
                    )}
                    {onForgotPassword && mode !== "selector" && (
                      <Button variant="link" type="button" onClick={onForgotPassword} className="h-auto px-0 text-sm text-primary">
                        Esqueci minha senha
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {mode === "startup" && versao && (
            <p className="mt-6 text-center text-xs text-muted-foreground">Versão {versao} · banco conectado</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Só afirmamos "não exige PIN" quando o perfil realmente tem pin_required = false.
function pinOptionalFor(profile: SecurityProfile) {
  return profile.pin_required === false && profile.role !== "ADMIN";
}
