import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import {
  SENSITIVE_PERMISSION_LABELS,
  type SecurityProfile,
  type SensitiveAccessStatus,
  type SensitivePermission,
} from "@/types";

export type ConfiguracoesTabSegurancaProps = {
  canManageProfiles: boolean;
  securityAdminUnlocked: boolean;
  securityBusy: boolean;
  handleSecurityAdminToggle: (nextValue: boolean) => void | Promise<void>;
  accessStatus: SensitiveAccessStatus | null;
  trocarPerfilAtivo: (profileId: number) => void | Promise<void>;
  currentPin: string;
  setCurrentPin: (value: string) => void;
  newPin: string;
  setNewPin: (value: string) => void;
  confirmPin: string;
  setConfirmPin: (value: string) => void;
  trocarMeuPin: () => void | Promise<void>;
  managedProfileId: number | null;
  setManagedProfileId: (value: number | null) => void;
  profilesCatalog: SecurityProfile[];
  managedProfile: SecurityProfile | null;
  editProfileName: string;
  setEditProfileName: (value: string) => void;
  editProfileRole: string;
  setEditProfileRole: (value: string) => void;
  editPermissions: SensitivePermission[];
  setEditPermissions: (value: SensitivePermission[]) => void;
  permissionOptions: SensitivePermission[];
  togglePermission: (
    currentPermissions: SensitivePermission[],
    permission: SensitivePermission,
    setter: (value: SensitivePermission[]) => void,
  ) => void;
  desativarPerfilSelecionado: () => void | Promise<void>;
  reativarPerfilSelecionado: () => void | Promise<void>;
  salvarPerfilAtual: () => void | Promise<void>;
  resetPin: string;
  setResetPin: (value: string) => void;
  resetPinConfirm: string;
  setResetPinConfirm: (value: string) => void;
  resetarPinPerfil: () => void | Promise<void>;
  newProfileName: string;
  setNewProfileName: (value: string) => void;
  newProfileRole: string;
  setNewProfileRole: (value: string) => void;
  newProfilePermissions: SensitivePermission[];
  setNewProfilePermissions: (value: SensitivePermission[]) => void;
  newProfilePin: string;
  setNewProfilePin: (value: string) => void;
  newProfilePinConfirm: string;
  setNewProfilePinConfirm: (value: string) => void;
  newProfileNoPin: boolean;
  setNewProfileNoPin: (value: boolean) => void;
  criarPerfil: () => void | Promise<void>;
  securityMessage: string | null;
};

export function ConfiguracoesTabSeguranca({
  canManageProfiles,
  securityAdminUnlocked,
  securityBusy,
  handleSecurityAdminToggle,
  accessStatus,
  trocarPerfilAtivo,
  currentPin,
  setCurrentPin,
  newPin,
  setNewPin,
  confirmPin,
  setConfirmPin,
  trocarMeuPin,
  managedProfileId,
  setManagedProfileId,
  profilesCatalog,
  managedProfile,
  editProfileName,
  setEditProfileName,
  editProfileRole,
  setEditProfileRole,
  editPermissions,
  setEditPermissions,
  permissionOptions,
  togglePermission,
  desativarPerfilSelecionado,
  reativarPerfilSelecionado,
  salvarPerfilAtual,
  resetPin,
  setResetPin,
  resetPinConfirm,
  setResetPinConfirm,
  resetarPinPerfil,
  newProfileName,
  setNewProfileName,
  newProfileRole,
  setNewProfileRole,
  newProfilePermissions,
  setNewProfilePermissions,
  newProfilePin,
  setNewProfilePin,
  newProfilePinConfirm,
  setNewProfilePinConfirm,
  newProfileNoPin,
  setNewProfileNoPin,
  criarPerfil,
  securityMessage,
}: ConfiguracoesTabSegurancaProps) {
  return (
    <TabsContent value="seguranca" className="space-y-4">
      {canManageProfiles && (
        <Card>
          <CardHeader>
            <CardTitle>Desbloqueio administrativo</CardTitle>
            <CardDescription>
              Mudanças de PIN, criação de perfil e gestão de permissões exigem liberação com PIN/Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                checked={securityAdminUnlocked}
                onCheckedChange={(value) => void handleSecurityAdminToggle(!!value)}
                disabled={securityBusy}
              />
              <div>
                <p className="text-sm font-medium">Liberar alterações sensíveis de segurança</p>
                <p className="text-xs text-muted-foreground">
                  Sem esta liberação, o painel fica em modo leitura.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Perfil ativo</CardTitle>
          <CardDescription>
            O acesso sensivel atual esta associado ao perfil {accessStatus?.active_profile_name || "selecionado"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="font-medium">{accessStatus?.active_profile_name || "Perfil sem nome"}</div>
            <div className="text-muted-foreground">Papel: {accessStatus?.active_role || "-"}</div>
            <div className="mt-2 text-muted-foreground">
              Permissoes: {accessStatus?.permissions.length ? accessStatus.permissions.join(", ") : "nenhuma"}
            </div>
            <div className="mt-4 space-y-2">
              <Label>Selecionar perfil da sessão</Label>
              <Select
                value={accessStatus?.active_profile_id ? String(accessStatus.active_profile_id) : undefined}
                onValueChange={(value) => void trocarPerfilAtivo(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  {accessStatus?.profiles.map((profile) => (
                    <SelectItem key={`active-${profile.id}`} value={String(profile.id)}>
                      {profile.nome} ({profile.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A troca do perfil ativo encerra o desbloqueio atual e passa a usar o PIN do perfil escolhido.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="current-pin">PIN atual</Label>
              <Input id="current-pin" type="password" inputMode="numeric" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pin">Novo PIN</Label>
              <Input id="new-pin" type="password" inputMode="numeric" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-pin">Confirmar novo PIN</Label>
              <Input id="confirm-new-pin" type="password" inputMode="numeric" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy} />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => void trocarMeuPin()} disabled={securityBusy || !securityAdminUnlocked}>
                {securityBusy ? "Processando..." : "Trocar meu PIN"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageProfiles && (
        <Card>
          <CardHeader>
            <CardTitle>Perfis e permissoes</CardTitle>
            <CardDescription>Crie perfis locais, ajuste permissoes sensiveis e redefina PINs quando necessario.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Perfil para editar</Label>
                <Select value={managedProfileId ? String(managedProfileId) : undefined} onValueChange={(value) => setManagedProfileId(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profilesCatalog.map((profile) => (
                      <SelectItem key={profile.id} value={String(profile.id)}>
                        {profile.nome} ({profile.role}){profile.ativo ? "" : " • inativo"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-profile-name">Nome</Label>
                <Input id="edit-profile-name" value={editProfileName} onChange={(event) => setEditProfileName(event.target.value)} disabled={!securityAdminUnlocked || securityBusy || !managedProfile?.ativo} />
                {managedProfile && (
                  <p className="text-xs text-muted-foreground">
                    {managedProfile.pin_configured ? "PIN configurado" : "PIN pendente"}
                    {managedProfile.ativo ? "" : " • perfil inativo"}
                    {managedProfile.is_default ? " • perfil ativo padrão" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select value={editProfileRole} onValueChange={(value) => {
                  setEditProfileRole(value);
                  if (value === "ADMIN") {
                    setEditPermissions(permissionOptions);
                  } else {
                    setEditPermissions([]);
                  }
                }} disabled={!securityAdminUnlocked || securityBusy || !managedProfile?.ativo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                O perfil ADMIN recebe todas as permissoes automaticamente. No papel CUSTOM, voce escolhe cada permissao abaixo.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {permissionOptions.map((permission) => (
                <label key={permission} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox
                    checked={editProfileRole === "ADMIN" ? true : editPermissions.includes(permission)}
                    disabled={!securityAdminUnlocked || securityBusy || editProfileRole === "ADMIN" || !managedProfile?.ativo}
                    onCheckedChange={() => togglePermission(editPermissions, permission, setEditPermissions)}
                  />
                  <span>{SENSITIVE_PERMISSION_LABELS[permission]}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
              {managedProfile?.ativo ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => void desativarPerfilSelecionado()}
                  disabled={securityBusy || !securityAdminUnlocked || !managedProfileId}
                >
                  Desativar perfil
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => void reativarPerfilSelecionado()}
                  disabled={securityBusy || !securityAdminUnlocked || !managedProfileId}
                >
                  Reativar perfil
                </Button>
              )}
              <Button type="button" onClick={() => void salvarPerfilAtual()} disabled={securityBusy || !securityAdminUnlocked || !managedProfileId || !managedProfile?.ativo}>
                {securityBusy ? "Salvando..." : "Salvar perfil"}
              </Button>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Resetar PIN do perfil selecionado</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-pin">Novo PIN</Label>
                  <Input id="reset-pin" type="password" inputMode="numeric" value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy || !managedProfile?.ativo} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-pin-confirm">Confirmar novo PIN</Label>
                  <Input id="reset-pin-confirm" type="password" inputMode="numeric" value={resetPinConfirm} onChange={(event) => setResetPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy || !managedProfile?.ativo} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => void resetarPinPerfil()} disabled={securityBusy || !securityAdminUnlocked || !managedProfileId || !managedProfile?.ativo}>
                  Redefinir PIN do perfil
                </Button>
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Criar novo perfil</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-profile-name">Nome</Label>
                  <Input id="new-profile-name" value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Ex.: Estoque Local" disabled={!securityAdminUnlocked || securityBusy} />
                </div>
                <div className="space-y-2">
                  <Label>Papel</Label>
                <Select value={newProfileRole} onValueChange={(value) => {
                  setNewProfileRole(value);
                  if (value === "ADMIN") {
                    setNewProfilePermissions(permissionOptions);
                  } else {
                    setNewProfilePermissions([]);
                  }
                }} disabled={!securityAdminUnlocked || securityBusy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um papel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                      <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {permissionOptions.map((permission) => (
                  <label key={`new-${permission}`} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <Checkbox
                      checked={newProfileRole === "ADMIN" ? true : newProfilePermissions.includes(permission)}
                      disabled={!securityAdminUnlocked || securityBusy || newProfileRole === "ADMIN"}
                      onCheckedChange={() => togglePermission(newProfilePermissions, permission, setNewProfilePermissions)}
                    />
                    <span>{SENSITIVE_PERMISSION_LABELS[permission]}</span>
                  </label>
                ))}
              </div>

              {newProfileRole === "CUSTOM" && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox
                    id="new-profile-no-pin"
                    checked={newProfileNoPin}
                    onCheckedChange={(value) => setNewProfileNoPin(!!value)}
                    disabled={!securityAdminUnlocked || securityBusy}
                  />
                  <Label htmlFor="new-profile-no-pin" className="text-sm font-normal cursor-pointer">
                    Este perfil não terá PIN (login por nome apenas)
                  </Label>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-profile-pin">PIN inicial</Label>
                  <Input id="new-profile-pin" type="password" inputMode="numeric" value={newProfilePin} onChange={(event) => setNewProfilePin(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy || newProfileNoPin} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-profile-pin-confirm">Confirmar PIN inicial</Label>
                  <Input id="new-profile-pin-confirm" type="password" inputMode="numeric" value={newProfilePinConfirm} onChange={(event) => setNewProfilePinConfirm(event.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!securityAdminUnlocked || securityBusy || newProfileNoPin} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void criarPerfil()} disabled={securityBusy || !securityAdminUnlocked}>
                  Criar perfil
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {securityMessage && (
        <ErrorAlert variant="info" message={securityMessage} />
      )}
    </TabsContent>
  );
}
