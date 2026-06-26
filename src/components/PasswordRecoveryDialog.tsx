import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { DatabaseConfigService } from "@/lib/db-config";
import type { DatabaseConnectionConfig, SecurityProfile } from "@/types";

interface PasswordRecoveryDialogProps {
  open: boolean;
  profiles: SecurityProfile[];
  onClose: () => void;
  onSuccess?: () => void;
}

type RecoveryStep = "credentials" | "profile" | "success";

export function PasswordRecoveryDialog({
  open,
  profiles,
  onClose,
  onSuccess,
}: PasswordRecoveryDialogProps) {
  const [step, setStep] = useState<RecoveryStep>("credentials");
  const [savedConfig, setSavedConfig] = useState<DatabaseConnectionConfig | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeProfiles = profiles.filter((p) => p.ativo);

  const resetState = useCallback(() => {
    setStep("credentials");
    setSelectedProfileId("");
    setNewPin("");
    setConfirmPin("");
    setPassword("");
    setShowPassword(false);
    setError(null);
    setBusy(false);
  }, []);

  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    clearAutoClose();
    resetState();
    onClose();
  }, [clearAutoClose, resetState, onClose]);

  const handleSuccess = useCallback(() => {
    clearAutoClose();
    resetState();
    onClose();
    onSuccess?.();
  }, [clearAutoClose, resetState, onClose, onSuccess]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    resetState();

    DatabaseConfigService.load().then((config) => {
      if (!cancelled) {
        if (config) {
          setSavedConfig(config);
        } else {
          DatabaseConfigService.getCurrentConfig().then((current) => {
            if (!cancelled) {
              setSavedConfig(current);
              if (!current) {
                setError("Configuração de banco não encontrada. Use a configuração inicial.");
              }
            }
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, resetState]);

  useEffect(() => {
    if (step === "success") {
      autoCloseRef.current = setTimeout(() => {
        handleSuccess();
      }, 2000);
    }
    return () => {
      clearAutoClose();
    };
  }, [step, handleSuccess, clearAutoClose]);

  const handleVerifyCredentials = async () => {
    if (!savedConfig) {
      setError("Configuração de banco não encontrada. Use a configuração inicial.");
      return;
    }

    if (!password) {
      setError("Informe a senha do PostgreSQL.");
      return;
    }

    setBusy(true);
    setError(null);

    const creds: DatabaseConnectionConfig = {
      ...savedConfig,
      password,
    };

    const result = await db.verificarCredenciaisBanco(creds);

    if (result.success) {
      setStep("profile");
    } else {
      setError(result.error || "Credenciais inválidas. Verifique os dados e tente novamente.");
    }

    setBusy(false);
  };

  const handleResetPin = async () => {
    if (!savedConfig) {
      setError("Configuração de banco não encontrada. Use a configuração inicial.");
      return;
    }

    if (!selectedProfileId) {
      setError("Selecione um perfil.");
      return;
    }

    if (newPin.length < 4 || newPin.length > 8) {
      setError("O PIN deve ter entre 4 e 8 dígitos.");
      return;
    }

    if (newPin !== confirmPin) {
      setError("Os PINs não coincidem.");
      return;
    }

    setBusy(true);
    setError(null);

    const creds: DatabaseConnectionConfig = {
      ...savedConfig,
      password,
    };

    const result = await db.redefinirPinViaDb(creds, Number(selectedProfileId), newPin);

    if (result.success) {
      setStep("success");
    } else {
      setError(result.error || "Não foi possível redefinir o PIN.");
    }

    setBusy(false);
  };

  const handleBack = () => {
    setStep("credentials");
    setError(null);
    setNewPin("");
    setConfirmPin("");
    setSelectedProfileId("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <KeyRound className="h-5 w-5 text-cyan-500" />
            )}
            <DialogTitle>Recuperação de PIN</DialogTitle>
          </div>
          <DialogDescription>
            {step === "credentials" &&
              "Informe as credenciais do PostgreSQL para verificar o acesso ao banco."}
            {step === "profile" &&
              "Selecione o perfil e defina o novo PIN."}
            {step === "success" && "Concluído!"}
          </DialogDescription>
        </DialogHeader>

        {step === "credentials" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Digite a senha do banco de dados PostgreSQL para verificar sua identidade.
              As demais informações já estão salvas na configuração do sistema.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-password">Senha do PostgreSQL</Label>
              <div className="relative">
                <Input
                  id="recovery-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Senha do PostgreSQL"
                  className="pr-10"
                  disabled={!savedConfig}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "profile" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="recovery-profile">Perfil</Label>
              <select
                id="recovery-profile"
                aria-label="Perfil"
                value={selectedProfileId}
                onChange={(e) => {
                  setSelectedProfileId(e.target.value);
                  setError(null);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  Selecionar perfil...
                </option>
                {activeProfiles.map((profile) => (
                  <option key={profile.id} value={String(profile.id)}>
                    {profile.nome} ({profile.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-new-pin">Novo PIN</Label>
              <Input
                id="recovery-new-pin"
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="PIN de 4 a 8 dígitos"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-confirm-pin">Confirmar PIN</Label>
              <Input
                id="recovery-confirm-pin"
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="Repita o PIN"
              />
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-center font-medium text-emerald-700">
              PIN redefinido com sucesso!
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Você pode fechar esta janela e entrar com o novo PIN.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "credentials" && (
            <>
              <Button variant="outline" type="button" onClick={handleClose} disabled={busy}>
                Fechar
              </Button>
              <Button
                type="button"
                onClick={() => void handleVerifyCredentials()}
                disabled={busy || !savedConfig || !password}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                Verificar credenciais
              </Button>
            </>
          )}

          {step === "profile" && (
            <>
              <Button variant="outline" type="button" onClick={handleBack} disabled={busy}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button
                type="button"
                onClick={() => void handleResetPin()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Redefinir PIN
              </Button>
            </>
          )}

          {step === "success" && (
            <Button type="button" onClick={handleSuccess}>
              Entrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
