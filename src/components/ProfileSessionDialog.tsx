import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SENSITIVE_PERMISSION_LABELS, type SecurityProfile } from "@/types";

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
  onQuickLoginNoPin?: (profileId: string) => void;
  onForgotPassword?: () => void;
}

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
  onQuickLoginNoPin,
  onForgotPassword,
}: ProfileSessionDialogProps) {
  const isSelectorMode = mode === "selector";
  const isCurrentProfileSelected = !!selectedProfile && selectedProfile.id === activeProfileId;
  const shouldAskForPin = !isSelectorMode || !isCurrentProfileSelected;
  const shouldConfirmPin = Boolean(shouldAskForPin && selectedProfile && !selectedProfile.pin_configured);
  const permissionPreview = selectedProfile?.permissions.slice(0, 3) ?? [];
  const profilesWithoutPin = profiles.filter((profile) => !profile.pin_configured);

  const primaryActionLabel = (() => {
    if (!selectedProfile) {
      return "Selecione um perfil";
    }

    if (mode === "startup") {
      return selectedProfile.pin_configured ? "Entrar com este perfil" : "Configurar PIN e entrar";
    }

    if (mode === "selector") {
      return isCurrentProfileSelected
        ? "Continuar com este perfil"
        : selectedProfile.pin_configured
          ? "Trocar para este perfil"
          : "Configurar PIN e trocar";
    }

    return selectedProfile.pin_configured
      ? (isCurrentProfileSelected ? "Desbloquear perfil" : "Trocar perfil e continuar")
      : "Configurar PIN";
  })();

  const primaryDisabled =
    !selectedProfile ||
    busy ||
    (shouldAskForPin && pin.length < 4) ||
    (shouldConfirmPin && confirmPin.length < 4);

  const handlePrimaryAction = () => {
    if (primaryDisabled) return;
    onSubmit();
  };

  const helperText = (() => {
    if (!selectedProfile) {
      return "Selecione um perfil para visualizar o contexto da sessão.";
    }

    if (mode === "startup") {
      return "Escolha a conta local que vai abrir esta sessão do aplicativo.";
    }

    if (mode === "selector" && isCurrentProfileSelected) {
      return "Você já está usando este perfil. Feche agora ou continue nele.";
    }

    if (!selectedProfile.pin_configured) {
      return "Este perfil ainda não tem PIN configurado. Defina um PIN para finalizar a troca.";
    }

    return "Informe o PIN do perfil selecionado para confirmar a sessão.";
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className={cn("max-w-5xl gap-0 overflow-hidden p-0", mandatory && "[&>button]:hidden")}>
        <div className="grid max-h-[85vh] lg:grid-cols-[1.15fr,0.85fr]">
          <div className="border-b bg-slate-50/80 p-6 lg:border-b-0 lg:border-r overflow-y-auto">
            <DialogHeader className="text-left">
              <div className="inline-flex w-fit items-center rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {mode === "startup" ? "Entrada do aplicativo" : mode === "selector" ? "Perfis da sessão" : "Acesso sensível"}
              </div>
              <DialogTitle className="text-2xl">{title}</DialogTitle>
              <DialogDescription className="max-w-xl">{description}</DialogDescription>
            </DialogHeader>

            {profilesWithoutPin.length > 0 && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="quick-login-no-pin">Login rápido (sem PIN)</Label>
                <select
                  id="quick-login-no-pin"
                  aria-label="Login rápido sem PIN"
                  value=""
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value && onQuickLoginNoPin) {
                      onQuickLoginNoPin(value);
                    }
                    event.target.value = "";
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    Selecionar operador...
                  </option>
                  {profilesWithoutPin.map((profile) => (
                    <option key={`no-pin-${profile.id}`} value={String(profile.id)}>
                      {profile.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-6 grid gap-3">
              {profiles.map((profile) => {
                const isSelected = String(profile.id) === selectedProfileId;
                const isCurrent = profile.id === activeProfileId;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onSelectProfile(String(profile.id))}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-slate-900 bg-white shadow-sm"
                        : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{profile.nome}</div>
                        <div className="text-xs text-slate-500">{profile.role}</div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isCurrent && <Badge variant="secondary">Perfil atual</Badge>}
                        {profile.pin_configured ? (
                          <Badge variant="outline">PIN ativo</Badge>
                        ) : (
                          <Badge variant="outline">Sem PIN</Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      {profile.permissions.length} permiss{profile.permissions.length === 1 ? "ão" : "ões"} configuradas
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6 overflow-y-auto">
            {selectedProfile ? (
              <Card className="shadow-none">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                      <UserRound className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{selectedProfile.nome}</CardTitle>
                      <CardDescription>{selectedProfile.role}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.id === activeProfileId && (
                      <Badge variant="secondary">Conta em uso</Badge>
                    )}
                    {unlocked && selectedProfile.id === activeProfileId && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Sessão ativa</Badge>
                    )}
                    {!selectedProfile.pin_configured && <Badge variant="outline">PIN pendente</Badge>}
                  </div>

                  <p className="text-sm text-muted-foreground">{helperText}</p>

                  {permissionPreview.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {permissionPreview.map((permission) => (
                        <Badge key={permission} variant="outline" className="text-[11px]">
                          {SENSITIVE_PERMISSION_LABELS[permission]}
                        </Badge>
                      ))}
                      {selectedProfile.permissions.length > permissionPreview.length && (
                        <Badge variant="outline" className="text-[11px]">
                          +{selectedProfile.permissions.length - permissionPreview.length}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-none">
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Selecione um perfil para visualizar as informações da sessão.
                </CardContent>
              </Card>
            )}

            {shouldAskForPin ? (
              <form
                id="profile-session-pin-form"
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  handlePrimaryAction();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="sensitive-pin">PIN do perfil</Label>
                  <Input
                    id="sensitive-pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="PIN de 4 a 8 dígitos"
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>

                {shouldConfirmPin && (
                  <div className="space-y-2">
                    <Label htmlFor="sensitive-pin-confirm">Confirmar PIN</Label>
                    <Input
                      id="sensitive-pin-confirm"
                      type="password"
                      inputMode="numeric"
                      value={confirmPin}
                      onChange={(event) => onConfirmPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="Repita o PIN"
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}
              </form>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Você já está neste perfil. Use o botão abaixo para continuar sem trocar a conta atual.
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          {mode === "startup" && onForgotPassword && (
            <Button
              variant="link"
              type="button"
              onClick={onForgotPassword}
              className="mr-auto text-cyan-600 hover:text-cyan-500 px-0"
            >
              Esqueci minha senha
            </Button>
          )}
          {!mandatory && (
            <Button variant="outline" type="button" onClick={onClose} disabled={busy}>
              Fechar
            </Button>
          )}
          <Button
            type={shouldAskForPin ? "submit" : "button"}
            form={shouldAskForPin ? "profile-session-pin-form" : undefined}
            onClick={shouldAskForPin ? undefined : handlePrimaryAction}
            disabled={primaryDisabled}
          >
            {busy ? "Validando..." : primaryActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}