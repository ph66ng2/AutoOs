import { Controller, type Control, type SubmitHandler, type UseFormHandleSubmit, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import type { SmtpFormValues, WhatsappFormValues } from "./configuracoes-shared";

export type ConfiguracoesTabIntegracoesProps = {
  canConfigureSmtp: boolean;
  canConfigureWhatsapp: boolean;
  register: UseFormRegister<SmtpFormValues>;
  handleSubmit: UseFormHandleSubmit<SmtpFormValues>;
  control: Control<SmtpFormValues>;
  onSubmit: SubmitHandler<SmtpFormValues>;
  saving: boolean;
  status: string | null;
  smtpEditUnlocked: boolean;
  handleSmtpEditToggle: (nextValue: boolean) => void | Promise<void>;
  hasPassword: boolean;
  registerWhatsapp: UseFormRegister<WhatsappFormValues>;
  handleSubmitWhatsapp: UseFormHandleSubmit<WhatsappFormValues>;
  onSubmitWhatsapp: SubmitHandler<WhatsappFormValues>;
  savingWhatsapp: boolean;
  whatsappStatus: string | null;
  whatsappHasToken: boolean;
  canConfigurePhotoTunnel: boolean;
  photoTunnelToken: string;
  onPhotoTunnelTokenChange: (value: string) => void;
  onSubmitPhotoTunnel: () => void | Promise<void>;
  savingPhotoTunnel: boolean;
  photoTunnelStatus: string | null;
  photoTunnelHasToken: boolean;
  photoTunnelEnvOverride: boolean;
  photoTunnelPublicHost: string;
};

export function ConfiguracoesTabIntegracoes({
  canConfigureSmtp,
  canConfigureWhatsapp,
  register,
  handleSubmit,
  control,
  onSubmit,
  saving,
  status,
  smtpEditUnlocked,
  handleSmtpEditToggle,
  hasPassword,
  registerWhatsapp,
  handleSubmitWhatsapp,
  onSubmitWhatsapp,
  savingWhatsapp,
  whatsappStatus,
  whatsappHasToken,
  canConfigurePhotoTunnel,
  photoTunnelToken,
  onPhotoTunnelTokenChange,
  onSubmitPhotoTunnel,
  savingPhotoTunnel,
  photoTunnelStatus,
  photoTunnelHasToken,
  photoTunnelEnvOverride,
  photoTunnelPublicHost,
}: ConfiguracoesTabIntegracoesProps) {
  return (
    <TabsContent value="smtp" className="mt-0 space-y-4 p-5 md:p-6">
      <h2 className="text-xl font-bold">Integrações</h2>
      <Card>
        <CardHeader>
          <CardTitle>SMTP (email real)</CardTitle>
        </CardHeader>
        <CardContent>
          {canConfigureSmtp ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox
                  checked={smtpEditUnlocked}
                  onCheckedChange={(value) => void handleSmtpEditToggle(!!value)}
                  disabled={saving}
                />
                <div className="space-y-1">
                  <Label>Liberar edição SMTP (requer PIN/Admin)</Label>
                  <p className="text-xs text-muted-foreground">
                    Por padrão os campos ficam bloqueados para evitar alterações acidentais.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input id="host" placeholder="smtp.gmail.com" {...register("host")} disabled={!smtpEditUnlocked || saving} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Porta</Label>
                  <Input id="port" type="number" min={1} max={65535} {...register("port", { valueAsNumber: true })} disabled={!smtpEditUnlocked || saving} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Usuário</Label>
                  <Input id="username" placeholder="email@dominio.com" {...register("username")} disabled={!smtpEditUnlocked || saving} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="from_name">Nome do Remetente</Label>
                  <Input id="from_name" placeholder="BMITAG" {...register("from_name")} disabled={!smtpEditUnlocked || saving} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="from_email">Email do Remetente</Label>
                  <Input id="from_email" placeholder="contato@dominio.com" {...register("from_email")} disabled={!smtpEditUnlocked || saving} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha / App Password</Label>
                  <Input id="password" type="password" placeholder={hasPassword ? "Senha já configurada" : "Digite a senha"} {...register("password")} disabled={!smtpEditUnlocked || saving} />
                  {hasPassword && (
                    <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual.</p>
                  )}
                  {!hasPassword && (
                    <p className="text-xs text-status-wait">⚠️ Para Gmail, use uma Senha de App (não sua senha normal). Gere em: myaccount.google.com/apppasswords</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Controller
                  name="use_tls"
                  control={control}
                  render={({ field }) => (
                    <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(!!value)} disabled={!smtpEditUnlocked || saving} />
                  )}
                />
                <Label>Usar TLS/STARTTLS</Label>
              </div>

              {status && (
                <p className="text-sm text-muted-foreground">{status}</p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={saving || !smtpEditUnlocked}>
                  {saving ? "Salvando..." : "Salvar configuração"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar SMTP. Troque para um perfil com essa permissão para editar este bloco.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp API</CardTitle>
        </CardHeader>
        <CardContent>
          {canConfigureWhatsapp ? (
            <form onSubmit={handleSubmitWhatsapp(onSubmitWhatsapp)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp-provider">Provider</Label>
                  <Input id="whatsapp-provider" readOnly {...registerWhatsapp("provider")} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="whatsapp-api-url">API URL</Label>
                  <Input
                    id="whatsapp-api-url"
                    placeholder="http://localhost:8080/message/sendText/minha-instancia"
                    {...registerWhatsapp("api_url")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe a URL final do endpoint sendText da sua instância Evolution.
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="whatsapp-token">Token da API</Label>
                  <Input
                    id="whatsapp-token"
                    type="password"
                    placeholder={whatsappHasToken ? "Token já configurado" : "Digite o token da API"}
                    {...registerWhatsapp("token")}
                  />
                  {whatsappHasToken && (
                    <p className="text-xs text-muted-foreground">Deixe em branco para manter o token atual.</p>
                  )}
                </div>
              </div>

              {whatsappStatus && (
                <p className="text-sm text-muted-foreground">{whatsappStatus}</p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={savingWhatsapp}>
                  {savingWhatsapp ? "Salvando..." : "Salvar configuração"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar a API de WhatsApp. Troque para um perfil com essa permissão para editar este bloco.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotos pelo celular</CardTitle>
        </CardHeader>
        <CardContent>
          {canConfigurePhotoTunnel ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmitPhotoTunnel();
              }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-status-work/30 bg-status-work-bg p-4 text-sm text-status-work space-y-2">
                <p>
                  Coloque o <code>cloudflared</code> no PATH ou na pasta AutoOS de cada PC que for gerar QR. Não precisa criar DNS nem colar token.
                </p>
                <p>
                  O campo abaixo é opcional: só use se quiser o hostname fixo <strong>{photoTunnelPublicHost || "fotos.bmitag.com.br"}</strong> (aí um PC por vez).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="photo-tunnel-token">Token do túnel Cloudflare</Label>
                <Input
                  id="photo-tunnel-token"
                  type="password"
                  autoComplete="off"
                  value={photoTunnelToken}
                  onChange={(event) => onPhotoTunnelTokenChange(event.target.value)}
                  placeholder={photoTunnelHasToken ? "Token já configurado" : "Cole o token do conector"}
                  disabled={savingPhotoTunnel}
                />
                {photoTunnelEnvOverride && (
                  <p className="text-xs text-muted-foreground">
                    A variável AUTOOS_PHOTO_TUNNEL_TOKEN está definida e tem prioridade sobre o valor salvo aqui.
                  </p>
                )}
                {photoTunnelHasToken && !photoTunnelEnvOverride && (
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco e salve para remover o token e voltar ao túnel automático por PC.
                  </p>
                )}
              </div>

              {photoTunnelStatus && (
                <p className="text-sm text-muted-foreground">{photoTunnelStatus}</p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={savingPhotoTunnel}>
                  {savingPhotoTunnel ? "Salvando..." : "Salvar token do túnel"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar o túnel de fotos. Use um perfil com Comunicação externa.
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
