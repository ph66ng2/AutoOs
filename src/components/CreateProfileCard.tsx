import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { SENSITIVE_PERMISSION_LABELS, SENSITIVE_PERMISSIONS, type SecurityProfile, type SensitivePermission } from "@/types";

type Props = {
  profiles: SecurityProfile[];
  onCreated: () => Promise<void>;
};

const permissionOptions = Object.values(SENSITIVE_PERMISSIONS);

export function CreateProfileCard({ profiles, onCreated }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"CUSTOM" | "ADMIN">("CUSTOM");
  const [permissions, setPermissions] = useState<SensitivePermission[]>([]);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const trimmedName = name.trim();
  const duplicate = profiles.some((profile) => profile.nome.trim().toLocaleLowerCase("pt-BR") === trimmedName.toLocaleLowerCase("pt-BR"));
  const nameError = trimmedName.length < 3
    ? "Informe um nome com pelo menos 3 caracteres."
    : duplicate ? "Já existe um perfil com este nome. Escolha outro nome." : null;
  const permissionsError = role === "CUSTOM" && permissions.length === 0 ? "Selecione ao menos uma permissão." : null;
  const pinError = !/^\d{4,8}$/.test(pin) ? "Use de 4 a 8 dígitos numéricos." : null;
  const confirmError = confirmPin !== pin ? "Os PINs não conferem." : null;
  const pinMismatch = pin.length > 0 && confirmPin.length > 0 && pin !== confirmPin;
  const valid = !nameError && !permissionsError && !pinError && !confirmError;

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setCreatedName(null);
    if (!valid || busy) return;

    setBusy(true);
    try {
      await SensitiveAccessService.createProfile({
        nome: trimmedName,
        role,
        permissions: role === "ADMIN" ? permissionOptions : permissions,
      }, pin);
      setCreatedName(trimmedName);
      setName("");
      setRole("CUSTOM");
      setPermissions([]);
      setPin("");
      setConfirmPin("");
      setSubmitted(false);
      toast.success(`Perfil ${trimmedName} criado`);
      try {
        await onCreated();
      } catch {
        setError("O perfil foi criado, mas a lista não atualizou. Reabra a aba Perfil para vê-lo.");
      }
    } catch (cause) {
      const message = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "Não foi possível criar o perfil.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Criar perfil</CardTitle>
        <CardDescription>Defina o acesso de uma pessoa. O novo perfil aparecerá na lista da sessão após a criação.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void createProfile(event)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome do perfil</Label>
              <Input id="profile-name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} placeholder="Ex.: Operador do balcão" maxLength={80} disabled={busy} aria-invalid={submitted && !!nameError} />
              {submitted && nameError && <p className="text-sm text-destructive" role="alert">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-role">Tipo de acesso</Label>
              <Select value={role} onValueChange={(value: "CUSTOM" | "ADMIN") => { setRole(value); setError(null); }} disabled={busy}>
                <SelectTrigger id="profile-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="CUSTOM">Personalizado</SelectItem><SelectItem value="ADMIN">Administrador</SelectItem></SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Administrador recebe todas as permissões.</p>
            </div>
          </div>

          <fieldset className="space-y-3" disabled={busy || role === "ADMIN"}>
            <legend className="text-sm font-medium">Permissões {role === "CUSTOM" ? "do perfil" : "incluídas no acesso de administrador"}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {permissionOptions.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox checked={role === "ADMIN" || permissions.includes(permission)} onCheckedChange={() => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])} />
                  <span>{SENSITIVE_PERMISSION_LABELS[permission]}</span>
                </label>
              ))}
            </div>
            {submitted && permissionsError && <p className="text-sm text-destructive" role="alert">{permissionsError}</p>}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-pin">PIN inicial</Label>
              <Input id="profile-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => { setPin(event.target.value); setError(null); }} maxLength={8} disabled={busy} aria-invalid={submitted && !!pinError} />
              {submitted && pinError && <p className="text-sm text-destructive" role="alert">{pinError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-pin-confirm">Confirmar PIN</Label>
              <Input id="profile-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(event) => { setConfirmPin(event.target.value); setError(null); }} maxLength={8} disabled={busy} aria-invalid={submitted && !!confirmError} />
              {(pinMismatch || (submitted && confirmError)) && <p className="text-sm text-destructive" role="alert">{confirmError}</p>}
            </div>
          </div>
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
          {createdName && <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">Perfil {createdName} criado. Para usá-lo, escolha esse perfil em “Ver perfis e decidir”.</p>}
          <div className="flex justify-end"><Button type="submit" disabled={busy || pinMismatch || (submitted && !valid)}>{busy ? "Criando..." : "Criar perfil"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
