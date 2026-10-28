import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import { ProfileDeleteDialog } from "@/components/ProfileDeleteDialog";
import { PROFILE_PRESETS } from "@/lib/profile-presets";
import { securityPermissionLabel, securityRoleLabel } from "@/lib/security-profile-labels";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

export type ConfiguracoesTabSegurancaProps = {
  canManageProfiles: boolean;
  securityAdminUnlocked: boolean;
  securityBusy: boolean;
  handleSecurityAdminToggle: (nextValue: boolean) => void | Promise<void>;
  accessStatus: SensitiveAccessStatus | null;
  managedProfileId: number | null;
  setManagedProfileId: (value: number | null) => void;
  profilesCatalog: SecurityProfile[];
  managedProfile: SecurityProfile | null;
  securityMessage: string | null;
  securityMessageVariant?: "error" | "info" | "success";
  onClearSecurityMessage?: () => void;
  inactivityLockEnabled: boolean;
  onToggleInactivityLock: (enabled: boolean) => void | Promise<void>;
  deleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onDeleteSuccess: () => void | Promise<void>;
};

export function ConfiguracoesTabSeguranca({
  canManageProfiles,
  securityAdminUnlocked,
  securityBusy,
  handleSecurityAdminToggle,
  accessStatus,
  managedProfileId,
  setManagedProfileId,
  profilesCatalog,
  managedProfile,
  securityMessage,
  securityMessageVariant = "error",
  onClearSecurityMessage,
  inactivityLockEnabled,
  onToggleInactivityLock,
  deleteDialogOpen,
  onDeleteDialogOpenChange,
  onDeleteSuccess,
}: ConfiguracoesTabSegurancaProps) {
  const activeProfiles = profilesCatalog.filter((profile) => profile.ativo);
  const pinConfiguredCount = activeProfiles.filter((profile) => profile.pin_configured).length;
  const pinMissingCount = activeProfiles.length - pinConfiguredCount;

  return (
    <TabsContent value="seguranca" className="space-y-4" onChange={onClearSecurityMessage}>
      {securityMessage && <div role={securityMessageVariant === "error" ? "alert" : "status"} aria-live={securityMessageVariant === "error" ? "assertive" : "polite"}>
        <ErrorAlert variant={securityMessageVariant} message={securityMessage} />
      </div>}
      <Card>
        <CardHeader>
          <CardTitle>Meu PIN</CardTitle>
          <CardDescription>
            A troca do seu PIN fica em Equipe e acessos, na aba Segurança.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end">
            <Button asChild variant="outline"><Link to="/perfil">Trocar meu PIN em Equipe e acessos</Link></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perfil ativo</CardTitle>
          <CardDescription>
            O acesso sensível atual está associado ao perfil {accessStatus?.active_profile_name || "selecionado"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="font-medium">{accessStatus?.active_profile_name || "Perfil sem nome"}</div>
            <div className="text-muted-foreground">Papel: {securityRoleLabel(accessStatus?.active_role || accessStatus?.profiles.find((profile) => profile.id === accessStatus.active_profile_id)?.role)}</div>
            <div className="mt-2 text-muted-foreground">
              Permissões: {accessStatus?.permissions.length ? accessStatus.permissions.map(securityPermissionLabel).join(", ") : "nenhuma"}
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageProfiles && (
        <Card>
          <CardHeader>
            <CardTitle>Equipe e acessos</CardTitle>
            <CardDescription>
              Cadastro, edição, PIN, desativação e reativação de pessoas ficam em Equipe e acessos.
              Modelos prontos: {PROFILE_PRESETS.map((preset) => preset.label).join(", ")}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="font-medium">{activeProfiles.length} {activeProfiles.length === 1 ? "pessoa ativa" : "pessoas ativas"}</div>
                <div className="text-muted-foreground">
                  {pinConfiguredCount} com PIN configurado neste PC
                  {pinMissingCount > 0 ? `, ${pinMissingCount} com PIN não configurado neste PC` : ""}
                </div>
              </div>
              <Button asChild variant="outline"><Link to="/perfil">Abrir Equipe e acessos</Link></Button>
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                id="inactivity-lock-toggle"
                checked={inactivityLockEnabled}
                onCheckedChange={(value) => void onToggleInactivityLock(!!value)}
                disabled={securityBusy}
              />
              <Label htmlFor="inactivity-lock-toggle" className="cursor-pointer">
                <p className="text-sm font-medium">Bloqueio por inatividade</p>
                <p className="text-xs text-muted-foreground">
                  Exige PIN novamente após período de inatividade
                </p>
              </Label>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-red-700">Excluir perfil</h3>
              <p className="text-sm text-muted-foreground">
                A exclusão é irreversível e exige verificação dupla (PIN do administrador + credenciais do banco).
                Para apenas impedir o acesso de alguém, use Desativar em Equipe e acessos.
              </p>

              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id="delete-unlock-toggle"
                  checked={securityAdminUnlocked}
                  onCheckedChange={(value) => void handleSecurityAdminToggle(!!value)}
                  disabled={securityBusy}
                />
                <Label htmlFor="delete-unlock-toggle" className="cursor-pointer">
                  <p className="text-sm font-medium">Liberar exclusão de perfis</p>
                  <p className="text-xs text-muted-foreground">
                    Confirme seu PIN de administrador para habilitar a exclusão nesta sessão.
                  </p>
                </Label>
              </div>

              <div className="space-y-2 md:max-w-sm">
                <Label>Perfil a excluir</Label>
                <Select value={managedProfileId ? String(managedProfileId) : undefined} onValueChange={(value) => setManagedProfileId(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profilesCatalog.map((profile) => (
                      <SelectItem key={profile.id} value={String(profile.id)}>
                        {profile.nome} ({securityRoleLabel(profile.role)}){profile.ativo ? "" : " • inativo"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {managedProfile && (
                  <p className="text-xs text-muted-foreground">
                    {managedProfile.pin_configured ? "PIN configurado neste PC" : "PIN não configurado neste PC"}
                    {managedProfile.ativo ? "" : " • perfil inativo"}
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => onDeleteDialogOpenChange(true)}
                disabled={securityBusy || !securityAdminUnlocked || !managedProfileId || !managedProfile?.ativo}
              >
                Excluir perfil permanentemente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ProfileDeleteDialog
        open={deleteDialogOpen}
        profile={managedProfile}
        onClose={() => onDeleteDialogOpenChange(false)}
        onSuccess={() => void onDeleteSuccess()}
      />
    </TabsContent>
  );
}
