import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Trash2,
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
import { toast } from "sonner";
import { db } from "@/lib/db";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { DatabaseConfigService } from "@/lib/db-config";
import type { DatabaseConnectionConfig, SecurityProfile } from "@/types";

interface ProfileDeleteDialogProps {
  open: boolean;
  profile: SecurityProfile | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type DeleteStep = "pin" | "credentials" | "confirm" | "success";

export function ProfileDeleteDialog({
  open,
  profile,
  onClose,
  onSuccess,
}: ProfileDeleteDialogProps) {
  const [step, setStep] = useState<DeleteStep>("pin");
  const [savedConfig, setSavedConfig] = useState<DatabaseConnectionConfig | null>(null);
  const [adminPin, setAdminPin] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setStep("pin");
    setAdminPin("");
    setDbPassword("");
    setShowDbPassword(false);
    setConfirmText("");
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
                setError("Configuração de banco não encontrada.");
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

  const handleVerifyPin = () => {
    if (!adminPin || adminPin.length < 4) {
      setError("Informe o PIN do administrador (4 a 8 dígitos).");
      return;
    }
    setError(null);
    setStep("credentials");
  };

  const handleVerifyCredentials = async () => {
    if (!savedConfig) {
      setError("Configuração de banco não encontrada.");
      return;
    }

    if (!dbPassword) {
      setError("Informe a senha do PostgreSQL.");
      return;
    }

    setBusy(true);
    setError(null);

    const creds: DatabaseConnectionConfig = {
      ...savedConfig,
      password: dbPassword,
    };

    const result = await db.verificarCredenciaisBanco(creds);

    if (!result.success) {
      setError(result.error || "Credenciais inválidas. Verifique os dados e tente novamente.");
    } else {
      setStep("confirm");
    }

    setBusy(false);
  };

  const handleDelete = async () => {
    if (!profile) {
      setError("Nenhum perfil selecionado.");
      return;
    }

    if (confirmText.trim().toUpperCase() !== "EXCLUIR") {
      setError('Digite EXCLUIR para confirmar a exclusão permanente.');
      return;
    }

    if (!savedConfig) {
      setError("Configuração de banco não encontrada.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const creds: DatabaseConnectionConfig = {
        ...savedConfig,
        password: dbPassword,
      };

      await SensitiveAccessService.deletarPerfil(profile.id, adminPin, creds);
      toast.success("Perfil excluído permanentemente.");
      setStep("success");
    } catch (e: any) {
      setError(e?.message || e?.toString() || "Falha ao excluir o perfil.");
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    if (step === "credentials") {
      setStep("pin");
    } else if (step === "confirm") {
      setStep("credentials");
    }
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Trash2 className="h-5 w-5 text-red-500" />
            )}
            <DialogTitle>Excluir perfil</DialogTitle>
          </div>
          <DialogDescription>
            {step === "pin" && "Informe o PIN do administrador para iniciar a exclusão."}
            {step === "credentials" && "Informe a senha do PostgreSQL para verificação adicional."}
            {step === "confirm" && `Confirme a exclusão permanente do perfil ${profile?.nome ?? ""}.`}
            {step === "success" && "Concluído!"}
          </DialogDescription>
        </DialogHeader>

        {step === "pin" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Digite o PIN do perfil administrador atual para verificar sua identidade.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="delete-admin-pin">PIN do administrador</Label>
              <Input
                id="delete-admin-pin"
                type="password"
                inputMode="numeric"
                value={adminPin}
                onChange={(e) => {
                  setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                  setError(null);
                }}
                placeholder="PIN de 4 a 8 dígitos"
                autoFocus
              />
            </div>
          </div>
        )}

        {step === "credentials" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Digite a senha do banco de dados PostgreSQL para verificação adicional.
              As demais informações já estão salvas na configuração do sistema.
            </p>

            {savedConfig && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <div>Host: {savedConfig.host}</div>
                <div>Porta: {savedConfig.port}</div>
                <div>Banco: {savedConfig.database}</div>
                <div>Usuário: {savedConfig.username}</div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="delete-db-password">Senha do PostgreSQL</Label>
              <div className="relative">
                <Input
                  id="delete-db-password"
                  type={showDbPassword ? "text" : "password"}
                  value={dbPassword}
                  onChange={(e) => {
                    setDbPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Senha do PostgreSQL"
                  className="pr-10"
                  disabled={!savedConfig}
                  autoFocus
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowDbPassword((v) => !v)}
                  aria-label={showDbPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showDbPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
              <p className="font-medium">Atenção: esta ação é irreversível!</p>
              <p>
                O perfil <strong>{profile?.nome}</strong> será excluído permanentemente do sistema,
                incluindo seu PIN e histórico de auditoria vinculado.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm-text">
                Digite <strong>EXCLUIR</strong> para confirmar
              </Label>
              <Input
                id="delete-confirm-text"
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  setError(null);
                }}
                placeholder="EXCLUIR"
                className="uppercase"
                autoFocus
              />
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-center font-medium text-emerald-700">
              Perfil excluído com sucesso!
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Você pode fechar esta janela.
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
          {step === "pin" && (
            <>
              <Button variant="outline" type="button" onClick={handleClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleVerifyPin()}
                disabled={busy || adminPin.length < 4}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeft className="mr-2 h-4 w-4 rotate-180" />
                )}
                Continuar
              </Button>
            </>
          )}

          {step === "credentials" && (
            <>
              <Button variant="outline" type="button" onClick={handleBack} disabled={busy}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button
                type="button"
                onClick={() => void handleVerifyCredentials()}
                disabled={busy || !savedConfig || !dbPassword}
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

          {step === "confirm" && (
            <>
              <Button variant="outline" type="button" onClick={handleBack} disabled={busy}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Excluir permanentemente
              </Button>
            </>
          )}

          {step === "success" && (
            <Button type="button" onClick={handleSuccess}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
