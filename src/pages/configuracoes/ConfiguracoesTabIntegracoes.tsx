import { useState, type ReactNode } from "react";
import { Controller, type Control, type SubmitHandler, type UseFormHandleSubmit, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { MensagensProntasCard } from "@/components/configuracoes/MensagensProntasCard";
import { SuporteSlackCard } from "@/components/configuracoes/SuporteSlackCard";
import type { SmtpFormValues, WhatsappFormValues } from "./configuracoes-shared";

export type ConfiguracoesTabIntegracoesProps = {
  canConfigureSmtp: boolean;
  canConfigureWhatsapp: boolean;
  register: UseFormRegister<SmtpFormValues>;
  handleSubmit: UseFormHandleSubmit<SmtpFormValues>;
  control: Control<SmtpFormValues>;
  onSubmit: (values: SmtpFormValues) => Promise<boolean | void>;
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
  /** Valores salvos do SMTP, para o resumo do cartão. */
  resumoSmtp: { host: string; port: number; use_tls: boolean; from_email: string };
  whatsappUrl: string;
};

/** Selo de situação do cartão: configurado ou não (não há registro de envio para dizer "conectado"). */
function Situacao({ ok, rotuloOk = "Configurado" }: { ok: boolean; rotuloOk?: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-status-ok-bg text-status-ok" : "bg-status-wait-bg text-status-wait"}`}>
      {ok ? rotuloOk : "Não configurado"}
    </span>
  );
}

function LinhaResumo({ rotulo, detalhe, valor }: { rotulo: string; detalhe?: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t py-3 first:border-t-0">
      <div>
        <p className="text-sm font-semibold">{rotulo}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
      <div className="text-right font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{valor}</div>
    </div>
  );
}

/** Cabeçalho do cartão de integração: nome, o que faz e a situação. */
function TopoIntegracao({ titulo, descricao, situacao }: { titulo: string; descricao: string; situacao: ReactNode }) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
      <div className="space-y-1">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {situacao}
    </CardHeader>
  );
}

function hostDe(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

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
  resumoSmtp,
  whatsappUrl,
}: ConfiguracoesTabIntegracoesProps) {
  const [editandoSmtp, setEditandoSmtp] = useState(false);
  const [editandoWhatsapp, setEditandoWhatsapp] = useState(false);
  const [editandoFotos, setEditandoFotos] = useState(false);
  const fecharSmtp = () => { setEditandoSmtp(false); void handleSmtpEditToggle(false); };
  return (
    <TabsContent value="smtp" className="mt-0 space-y-4 p-5 md:p-6">
      <h2 className="text-xl font-bold">Integrações</h2>
      <Card>
        <TopoIntegracao
          titulo="E-mail (SMTP)"
          descricao="Envio de orçamentos e avisos. A senha fica no cofre do sistema, nunca no banco."
          situacao={<Situacao ok={hasPassword} />}
        />
        <CardContent>
          {canConfigureSmtp && !editandoSmtp && (
            <>
              <LinhaResumo
                rotulo="Servidor"
                detalhe={resumoSmtp.host ? `Porta ${resumoSmtp.port}${resumoSmtp.use_tls ? (resumoSmtp.port === 465 ? " com TLS" : " com STARTTLS") : " sem TLS"}` : undefined}
                valor={resumoSmtp.host || "—"}
              />
              <LinhaResumo rotulo="Remetente" valor={resumoSmtp.from_email || "—"} />
              {status && <p className="pb-2 text-sm text-muted-foreground">{status}</p>}
              <Button variant="outline" size="sm" onClick={() => { setEditandoSmtp(true); void handleSmtpEditToggle(true); }}>Editar</Button>
            </>
          )}
          {canConfigureSmtp && editandoSmtp ? (
            <form onSubmit={handleSubmit(async (values) => {
              if (await onSubmit(values)) fecharSmtp();
            })} className="space-y-4">

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
                  <Input id="from_name" placeholder="Nome da empresa" {...register("from_name")} disabled={!smtpEditUnlocked || saving} />
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={fecharSmtp} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving || !smtpEditUnlocked}>
                  {saving ? "Salvando..." : "Salvar configuração"}
                </Button>
              </div>
            </form>
          ) : !canConfigureSmtp && (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar SMTP. Troque para um perfil com essa permissão para editar este bloco.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <TopoIntegracao
          titulo="WhatsApp"
          descricao="Envio pela API configurada. O token fica no cofre do sistema."
          situacao={<Situacao ok={whatsappHasToken && Boolean(whatsappUrl)} />}
        />
        <CardContent>
          {canConfigureWhatsapp && !editandoWhatsapp && (
            <>
              <LinhaResumo rotulo="Endereço da API" detalhe="Evolution" valor={whatsappUrl ? hostDe(whatsappUrl) : "—"} />
              {whatsappStatus && <p className="pb-2 text-sm text-muted-foreground">{whatsappStatus}</p>}
              <Button variant="outline" size="sm" onClick={() => setEditandoWhatsapp(true)}>Editar</Button>
            </>
          )}
          {canConfigureWhatsapp && editandoWhatsapp ? (
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditandoWhatsapp(false)} disabled={savingWhatsapp}>Fechar</Button>
                <Button type="submit" disabled={savingWhatsapp}>
                  {savingWhatsapp ? "Salvando..." : "Salvar configuração"}
                </Button>
              </div>
            </form>
          ) : !canConfigureWhatsapp && (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar a API de WhatsApp. Troque para um perfil com essa permissão para editar este bloco.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <TopoIntegracao
          titulo="Fotos pelo celular"
          descricao="O celular manda fotos para este PC enquanto o QR estiver aberto."
          situacao={<Situacao ok rotuloOk="Pronto" />}
        />
        <CardContent>
          {canConfigurePhotoTunnel && !editandoFotos && (
            <>
              <LinhaResumo
                rotulo="Túnel"
                detalhe={photoTunnelEnvOverride ? "Definido por variável de ambiente" : undefined}
                valor={photoTunnelHasToken || photoTunnelEnvOverride ? `Fixo: ${photoTunnelPublicHost}` : "Automático por PC"}
              />
              {photoTunnelStatus && <p className="pb-2 text-sm text-muted-foreground">{photoTunnelStatus}</p>}
              <Button variant="outline" size="sm" onClick={() => setEditandoFotos(true)}>Editar</Button>
            </>
          )}
          {canConfigurePhotoTunnel && editandoFotos ? (
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditandoFotos(false)} disabled={savingPhotoTunnel}>Fechar</Button>
                <Button type="submit" disabled={savingPhotoTunnel}>
                  {savingPhotoTunnel ? "Salvando..." : "Salvar token do túnel"}
                </Button>
              </div>
            </form>
          ) : !canConfigurePhotoTunnel && (
            <div className="rounded-lg border border-status-wait/30 bg-status-wait-bg p-4 text-sm text-status-wait">
              O perfil ativo não possui permissão para configurar o túnel de fotos. Use um perfil com Comunicação externa.
            </div>
          )}
        </CardContent>
      </Card>

      {canConfigureSmtp && <MensagensProntasCard />}
      {canConfigureSmtp && <SuporteSlackCard />}
    </TabsContent>
  );
}
