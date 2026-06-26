import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  KeyRound,
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
  const [creds, setCreds] = useState<DatabaseConnectionConfig>({
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
  });
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
      if (!cancelled && config) {
        setCreds((prev) => ({
          ...prev,
          host: config.host || prev.host,
          port: config.port || prev.port,
          database: config.database || prev.database,
          username: config.username || prev.username,
        }));
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

  const updateCred = (field: keyof DatabaseConnectionConfig, value: string | number) => {
    setCreds((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleVerifyCredentials = async () => {
    setBusy(true);
    setError(null);

    const result = await db.verificarCredenciaisBanco(creds);

    if (result.success) {
      setStep("profile");
    } else {
      setError(result.error || "Credenciais inválidas. Verifique os dados e tente novamente.");
    }

    setBusy(false);
  };

  const handleResetPin = async () => {
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
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="recovery-host">Host</Label>
                <Input
                  id="recovery-host"
                  value={creds.host}
                  onChange={(e) => updateCred("host", e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recovery-port">Porta</Label>
                <Input
                  id="recovery-port"
                  type="number"
                  value={creds.port}
                  onChange={(e) => updateCred("port", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-database">Banco de Dados</Label>
              <Input
                id="recovery-database"
                value={creds.database}
                onChange={(e) => updateCred("database", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-username">Usuário</Label>
              <Input
                id="recovery-username"
                value={creds.username}
                onChange={(e) => updateCred("username", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recovery-password">Senha</Label>
              <Input
                id="recovery-password"
                type="password"
                value={creds.password}
                onChange={(e) => updateCred("password", e.target.value)}
                placeholder="Senha do PostgreSQL"
              />
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
                disabled={busy}
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
