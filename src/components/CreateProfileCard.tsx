import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  KeyRound,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfilePermissions } from "@/components/ProfilePermissions";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { PROFILE_PRESETS, PERMISSION_DETAILS } from "@/lib/profile-presets";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import type { SecurityProfile, SensitivePermission } from "@/types";

type Props = { profiles: SecurityProfile[]; onCreated: () => Promise<void> };
const steps = ["Pessoa e função", "Acesso e PIN", "Revisão"];

export function CreateProfileCard({ profiles, onCreated }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("ATENDENTE");
  const [permissions, setPermissions] = useState<SensitivePermission[]>([]);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trimmedName = name.trim();
  const preset = PROFILE_PRESETS.find((item) => item.role === role)!;
  const duplicate = profiles.some(
    (profile) =>
      profile.nome.trim().toLocaleLowerCase("pt-BR") ===
      trimmedName.toLocaleLowerCase("pt-BR"),
  );
  const nameError =
    trimmedName.length < 3
      ? "Informe um nome com pelo menos 3 caracteres."
      : duplicate
        ? "Já existe um perfil com este nome. Escolha outro nome."
        : null;
  const pinError = !/^\d{4,8}$/.test(pin)
    ? "Use de 4 a 8 dígitos numéricos."
    : null;
  const confirmError = confirmPin !== pin ? "Os PINs não conferem." : null;

  function goTo(next: number) {
    setStep(next);
    setSubmitted(false);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function continueStep() {
    setSubmitted(true);
    if ((step === 0 && nameError) || (step === 1 && (pinError || confirmError)))
      return;
    goTo(step + 1);
  }
  function reset() {
    setCreatedName(null);
    setName("");
    setRole("ATENDENTE");
    setPermissions([]);
    setPin("");
    setConfirmPin("");
    goTo(0);
  }
  async function createProfile() {
    if (nameError || pinError || confirmError || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await SensitiveAccessService.createProfile(
        { nome: trimmedName, role, permissions },
        pin,
      );
      setCreatedName(trimmedName);
      setPin("");
      setConfirmPin("");
      toast.success(`Perfil ${trimmedName} criado com sucesso.`);
      try {
        await onCreated();
      } catch {
        setError(
          "O perfil foi criado, mas a lista não atualizou. Atualize a lista antes de cadastrar outra pessoa.",
        );
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(mensagemVisivelAoOperador(message) ?? message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Card id="novo-colaborador" className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-cyan-600" /> Novo colaborador
        </CardTitle>
        <CardDescription>
          Uma pessoa, uma função e somente as permissões necessárias.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {createdName ? (
          <div className="space-y-5 py-5 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <div role="status">
              <h3 className="text-xl font-semibold">
                Perfil {createdName} criado
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua sessão continua a mesma. O novo colaborador já pode entrar
                com o PIN neste computador.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button onClick={reset}>Cadastrar outra pessoa</Button>
          </div>
        ) : (
          <>
            <ol
              aria-label="Etapas do cadastro"
              className="mb-7 grid grid-cols-3 gap-2"
            >
              {steps.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === step ? "step" : undefined}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-xs sm:text-sm ${index <= step ? "border-cyan-600 text-cyan-700 dark:text-cyan-400" : "border-muted text-muted-foreground"}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index <= step ? "bg-cyan-600 text-white" : "bg-muted"}`}
                  >
                    {index < step ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
            <form
              onChange={() => setError(null)}
              onSubmit={(event) => {
                event.preventDefault();
                if (step < 2) continueStep();
                else void createProfile();
              }}
              className="space-y-6"
            >
              <h3
                ref={heading}
                tabIndex={-1}
                className="text-lg font-semibold outline-none"
              >
                {steps[step]}
              </h3>
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Nome do colaborador</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ex.: Ivan Santos"
                      maxLength={80}
                      aria-invalid={submitted && !!nameError}
                      aria-describedby={
                        submitted && nameError
                          ? "profile-name-error"
                          : undefined
                      }
                    />
                    {submitted && nameError && (
                      <p
                        id="profile-name-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {nameError}
                      </p>
                    )}
                  </div>
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium">
                      Função inicial
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {PROFILE_PRESETS.map((item) => (
                        <label
                          key={item.role}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${role === item.role ? "border-cyan-600 bg-cyan-500/5 ring-1 ring-cyan-600" : "hover:bg-muted/40"}`}
                        >
                          <input
                            type="radio"
                            name="profile-role"
                            value={item.role}
                            checked={role === item.role}
                            onChange={() => {
                              setRole(item.role);
                              setPermissions([...item.permissions]);
                            }}
                            className="mt-1 accent-cyan-600"
                          />
                          <span>
                            <span className="font-medium">{item.label}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              {step === 1 && (
                <>
                  <ProfilePermissions
                    permissions={permissions}
                    onChange={(next) => {
                      setRole("CUSTOM");
                      setPermissions(next);
                    }}
                    disabled={role === "ADMIN"}
                  />
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <KeyRound className="h-4 w-4" /> PIN neste computador
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      O perfil é compartilhado pelo banco, mas o PIN é local. Em
                      outro computador, um administrador precisa configurar o
                      acesso antes da entrada.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="profile-pin">PIN inicial</Label>
                      <Input
                        id="profile-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pin}
                        onChange={(event) =>
                          setPin(
                            event.target.value.replace(/\D/g, "").slice(0, 8),
                          )
                        }
                        maxLength={8}
                        aria-invalid={submitted && !!pinError}
                      />
                      {submitted && pinError && (
                        <p role="alert" className="text-sm text-destructive">
                          {pinError}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-pin-confirm">Confirmar PIN</Label>
                      <Input
                        id="profile-pin-confirm"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={confirmPin}
                        onChange={(event) =>
                          setConfirmPin(
                            event.target.value.replace(/\D/g, "").slice(0, 8),
                          )
                        }
                        maxLength={8}
                        aria-invalid={submitted && !!confirmError}
                      />
                      {submitted && confirmError && (
                        <p role="alert" className="text-sm text-destructive">
                          {confirmError}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
              {step === 2 && (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Novo acesso
                    </p>
                    <p className="mt-1 text-xl font-semibold">{trimmedName}</p>
                    <Badge variant="outline" className="mt-2">
                      {preset.label}
                    </Badge>
                  </div>
                  <div className="border-t pt-4">
                    <p className="mb-2 text-sm font-medium">
                      Além do acesso operacional básico:
                    </p>
                    {permissions.length ? (
                      <ul className="space-y-2 text-sm">
                        {permissions.map((permission) => (
                          <li key={permission} className="flex gap-2">
                            <Check className="h-4 w-4 shrink-0 text-cyan-600" />
                            <span>
                              {PERMISSION_DETAILS[permission].description}
                              {PERMISSION_DETAILS[permission].critical && (
                                <strong className="ml-1 text-amber-700">
                                  Acesso sensível.
                                </strong>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma permissão sensível liberada.
                      </p>
                    )}
                  </div>
                  <p className="border-t pt-4 text-sm text-muted-foreground">
                    PIN de {pin.length} dígitos configurado neste computador.
                    Sua sessão não será trocada.
                  </p>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between border-t pt-5">
                <span className="text-xs text-muted-foreground">
                  Etapa {step + 1} de 3
                </span>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => goTo(step - 1)}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                    </Button>
                  )}
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? "Criando..."
                      : step === 2
                        ? "Criar perfil"
                        : "Continuar"}
                    {step < 2 && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
