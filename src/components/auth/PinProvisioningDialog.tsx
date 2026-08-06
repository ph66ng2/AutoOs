import { useState } from "react";
import { Check, KeyRound, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
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
import { Card, CardContent } from "@/components/ui/card";

type PinProvisioningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (profileId: number) => void;
};

type Step = "code" | "pin" | "confirm" | "success";

export function PinProvisioningDialog({
  open,
  onOpenChange,
  onSuccess,
}: PinProvisioningDialogProps) {
  const [step, setStep] = useState<Step>("code");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [profileName, setProfileName] = useState("");

  const resetState = () => {
    setStep("code");
    setLoading(false);
    setError(null);
    setEnrollmentCode("");
    setPin("");
    setPinConfirm("");
    setProfileName("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const validateEnrollmentCode = async () => {
    const code = enrollmentCode.trim().toUpperCase();
    if (code.length !== 12) {
      setError("O código deve ter exatamente 12 caracteres");
      return;
    }
    if (!/^[A-HJ-KM-NP-Z2-9]+$/.test(code)) {
      setError("O código contém caracteres inválidos");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await db.validateEnrollmentCode(code);
      setStep("pin");
      toast.success("Código validado com sucesso");
    } catch (err) {
      const msg = String(err);
      if (msg.includes("já utilizado")) {
        setError("Este código já foi utilizado");
      } else if (msg.includes("inválido")) {
        setError("Código de enrollment inválido");
      } else {
        setError("Erro ao validar código. Verifique sua conexão.");
      }
      toast.error("Erro na validação", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionPin = async () => {
    if (pin.length < 4 || pin.length > 8) {
      setError("O PIN deve ter entre 4 e 8 dígitos");
      return;
    }
    if (pin !== pinConfirm) {
      setError("Os PINs não coincidem");
      return;
    }
    if (!profileName.trim()) {
      setError("Informe o nome do perfil");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await db.provisionPinWithEnrollment({
        enrollmentCode: enrollmentCode.trim().toUpperCase(),
        pin,
        profileName: profileName.trim(),
      });
      setStep("success");
      onSuccess?.(result.profileId);
      toast.success("PIN configurado com sucesso");
    } catch (err) {
      setError("Erro ao configurar PIN. Tente novamente.");
      toast.error("Erro ao provisionar PIN", { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: "code", label: "Código" },
    { key: "pin", label: "PIN" },
    { key: "confirm", label: "Confirmar" },
    { key: "success", label: "Concluído" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Configuração Inicial
          </DialogTitle>
          <DialogDescription>
            {step === "code" && "Insira o código de enrollment fornecido pelo administrador."}
            {step === "pin" && "Defina um PIN para acesso ao sistema."}
            {step === "confirm" && "Confirme o PIN e o nome do perfil."}
            {step === "success" && "Seu dispositivo foi configurado com sucesso."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="enrollment-code">Código de Enrollment</Label>
              <Input
                id="enrollment-code"
                value={enrollmentCode}
                onChange={(e) =>
                  setEnrollmentCode(
                    e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase()
                  )
                }
                placeholder="Ex: ABCD2345EFGH"
                maxLength={12}
                className="font-mono text-lg tracking-widest uppercase"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validateEnrollmentCode();
                }}
              />
              <p className="text-xs text-muted-foreground">
                12 caracteres alfanuméricos (sem 0, 1, I, O)
              </p>
            </div>
            <Button
              className="w-full"
              onClick={validateEnrollmentCode}
              disabled={loading || enrollmentCode.length !== 12}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validando...
                </>
              ) : (
                "Validar Código"
              )}
            </Button>
          </div>
        )}

        {step === "pin" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome do Perfil</Label>
              <Input
                id="profile-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex.: João Silva - Técnico"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4-8 dígitos)</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="Digite seu PIN"
                disabled={loading}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("code")}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={() => setStep("confirm")}
                disabled={pin.length < 4 || !profileName.trim()}
              >
                Próximo
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin-confirm">Confirmar PIN</Label>
              <Input
                id="pin-confirm"
                type="password"
                inputMode="numeric"
                value={pinConfirm}
                onChange={(e) =>
                  setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="Confirme seu PIN"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleProvisionPin();
                }}
              />
            </div>
            <Card className="bg-muted/40">
              <CardContent className="pt-4 text-sm space-y-1">
                <p>
                  <span className="font-medium">Perfil:</span> {profileName}
                </p>
                <p>
                  <span className="font-medium">PIN:</span> {"•".repeat(pin.length)}
                </p>
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("pin")}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={handleProvisionPin}
                disabled={loading || pinConfirm !== pin}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configurando...
                  </>
                ) : (
                  "Configurar PIN"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Configuração Concluída</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Seu PIN foi configurado. Você já pode acessar o sistema.
              </p>
            </div>
            <Button onClick={() => handleOpenChange(false)}>
              <KeyRound className="mr-2 h-4 w-4" />
              Acessar Sistema
            </Button>
          </div>
        )}

        {step !== "success" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
