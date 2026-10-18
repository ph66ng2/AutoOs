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
import { needsFirstAccessHere, profileAppearance } from "@/lib/profile-appearance";
import { securityRoleLabel } from "@/lib/security-profile-labels";
import type { SecurityProfile } from "@/types";

type ProfileDialogMode = "startup" | "selector" | "sensitive";

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
  /** Perfil sem PIN neste computador: abre o primeiro acesso com código. */
  onFirstAccess?: (profileId: number) => void;
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
}: ProfileSessionDialogProps) {
  const isSelectorMode = mode === "selector";
  const isCurrentProfileSelected = !!selectedProfile && selectedProfile.id === activeProfileId;
  const missingRequiredPin = !!selectedProfile && needsFirstAccessHere(selectedProfile);
  const canStartFirstAccess = missingRequiredPin && !!onFirstAccess;
  const isAdminWithoutPin = selectedProfile?.role === "ADMIN" && !selectedProfile?.pin_configured && !missingRequiredPin;
  const shouldAskForPin = isAdminWithoutPin || (Boolean(selectedProfile?.pin_configured) && (!isSelectorMode || !isCurrentProfileSelected || !unlocked));

  const primaryActionLabel = (() => {
    if (!selectedProfile) return "Selecione um perfil";
    if (canStartFirstAccess) return "Fazer primeiro acesso";
    if (missingRequiredPin) return "PIN pendente neste computador";
    if (isAdminWithoutPin) return "Configurar PIN e continuar";
    if (mode === "startup") return "Entrar com este perfil";
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
    (missingRequiredPin && !canStartFirstAccess) ||
    busy ||
    (shouldAskForPin && pin.length < 4) ||
    (isAdminWithoutPin && (confirmPin.length < 4 || pin !== confirmPin));

  const handlePrimaryAction = () => {
    if (primaryDisabled || !selectedProfile) return;
    if (canStartFirstAccess) {
      onFirstAccess!(selectedProfile.id);
      return;
    }
    onSubmit();
  };

  const helperText = (() => {
    if (!selectedProfile) return "Escolha seu perfil para entrar.";
    if (canStartFirstAccess) return "Este perfil ainda não foi ativado neste computador. Tenha em mãos o código de primeiro acesso que o administrador te passou.";
    if (missingRequiredPin) return "Este perfil exige PIN. Peça a um administrador para configurá-lo neste computador em Equipe e acessos, ou use a recuperação de acesso.";
    if (isAdminWithoutPin) return "Seu perfil de administrador exige um PIN. Defina um PIN de 4 a 8 dígitos para continuar.";
    if (mode === "selector" && isCurrentProfileSelected) {
      return unlocked ? "Você já está usando este perfil. Feche agora ou continue nele." : "Informe o PIN deste perfil para desbloquear a sessão.";
    }
    if (!selectedProfile.pin_configured) return "Este perfil não exige PIN. Clique abaixo para continuar.";
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
        className={cn(
          "dark max-w-4xl gap-0 overflow-hidden border-sidebar-border bg-background p-0 text-foreground",
          mandatory && "[&>button]:hidden",
        )}
      >
        <div className="max-h-[90vh] overflow-y-auto px-6 py-10 sm:px-12">
          {isFirstInstall && selectedProfile ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-6 text-center">
              <ProfileAvatar {...avatarProps(selectedProfile)} size="lg" />
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
                <div className="space-y-2">
                  <Label htmlFor="sensitive-pin">Criar PIN</Label>
                  <Input
                    id="sensitive-pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className={pinInputClass}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sensitive-pin-confirm">Confirmar PIN</Label>
                  <Input
                    id="sensitive-pin-confirm"
                    type="password"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(event) => onConfirmPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className={pinInputClass}
                  />
                </div>
                {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
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
                <DialogTitle className="text-3xl font-bold tracking-tight">{title}</DialogTitle>
                <DialogDescription className="max-w-xl">{description}</DialogDescription>
              </DialogHeader>

              <div className="mt-10 flex flex-wrap justify-center gap-4 sm:gap-6">
                {profiles.map((profile) => {
                  const isSelected = String(profile.id) === selectedProfileId;
                  const isCurrent = profile.id === activeProfileId && unlocked;
                  const pendingHere = needsFirstAccessHere(profile);
                  const look = profileAppearance(profile);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelectProfile(String(profile.id))}
                      className={cn(
                        "flex w-36 flex-col items-center gap-3 rounded-2xl px-2 pb-4 pt-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                      )}
                    >
                      <span
                        className="flex rounded-[28px] transition-shadow"
                        style={isSelected && !pendingHere ? { boxShadow: `0 0 0 3px hsl(var(--background)), 0 0 0 6px ${look.color}` } : undefined}
                      >
                        <ProfileAvatar icon={look.icon} color={look.color} size="xl" pending={pendingHere} />
                      </span>
                      <span className="flex flex-col items-center gap-0.5">
                        <span className="max-w-full truncate text-[15px] font-semibold">{profile.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {pendingHere ? "Primeiro acesso" : securityRoleLabel(profile.role)}
                        </span>
                        {isCurrent && <span className="mt-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Perfil atual</span>}
                        {!pendingHere && !profile.pin_configured && profile.role !== "ADMIN" && (
                          <span className="mt-1 text-[11px] text-muted-foreground">Não exige PIN</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4 text-center">
                {helperText && !(error && !shouldAskForPin && selectedProfile?.pin_configured) && (
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
                    <div className="space-y-2">
                      <Label htmlFor="sensitive-pin" className="block text-center">
                        {isAdminWithoutPin ? "Novo PIN" : "PIN do perfil"}
                      </Label>
                      <Input
                        id="sensitive-pin"
                        type="password"
                        inputMode="numeric"
                        value={pin}
                        onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="••••"
                        autoComplete="current-password"
                        className={pinInputClass}
                        autoFocus
                      />
                    </div>
                    {isAdminWithoutPin && (
                      <div className="space-y-2">
                        <Label htmlFor="sensitive-pin-confirm" className="block text-center">Confirmar PIN</Label>
                        <Input
                          id="sensitive-pin-confirm"
                          type="password"
                          inputMode="numeric"
                          value={confirmPin}
                          onChange={(event) => onConfirmPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                          placeholder="••••"
                          autoComplete="new-password"
                          className={pinInputClass}
                        />
                      </div>
                    )}
                  </form>
                )}

                {!shouldAskForPin && !error && selectedProfile?.pin_configured && (
                  <p className="text-sm text-emerald-300">Você já está neste perfil. Use o botão abaixo para continuar sem trocar a conta atual.</p>
                )}

                {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

                <div className="flex w-full flex-col-reverse items-center justify-center gap-2 sm:flex-row">
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
                    className="min-w-[200px]"
                  >
                    {canStartFirstAccess && <KeyRound className="mr-2 h-4 w-4" />}
                    {busy ? "Validando..." : primaryActionLabel}
                  </Button>
                </div>

                {onForgotPassword && mode !== "selector" && (
                  <Button variant="link" type="button" onClick={onForgotPassword} className="h-auto px-0 text-sm text-primary">
                    Esqueci minha senha
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function avatarProps(profile: SecurityProfile) {
  const look = profileAppearance(profile);
  return { icon: look.icon, color: look.color };
}
