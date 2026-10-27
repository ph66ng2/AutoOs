import { useState } from "react";
import { Globe, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { PublicStatusLinkDialog } from "@/components/equipamentos/PublicStatusLinkDialog";
import { QuemRespondeNoPortal } from "@/components/equipamentos/QuemRespondeNoPortal";
import { usePortalCliente } from "@/components/equipamentos/portal-cliente-context";
import {
  DECISAO_TEXTO,
  MOTIVO_FALHA,
  TIPO_SOLICITACAO_TEXTO,
  formatarHora,
  formatarValor,
  origemTexto,
  textoOrdemCompra,
} from "@/components/equipamentos/portal-cliente-format";
import { protocoloSolicitacao, telefoneParaExibir } from "@/lib/contato-cliente";
import { SENSITIVE_PERMISSIONS } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border p-3" aria-label={titulo}>
      <h4 className="text-sm font-semibold">{titulo}</h4>
      {children}
    </section>
  );
}

/**
 * Painel do Portal do Cliente do atendimento: publicação do orçamento, quem responde, link de
 * acompanhamento sem login e o registro de mensagens e respostas (com rolagem própria).
 */
export function PortalClientePanel({ open, onOpenChange }: Props) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const portal = usePortalCliente();
  const { equipamento, info, busy, error, respostaFinal } = portal;
  const [linkAberto, setLinkAberto] = useState(false);
  const aguardando = equipamento.status === "AGUARDANDO_APROVACAO";

  async function abrirLink() {
    const liberado = await ensureSensitiveAccess({
      title: "Link de acompanhamento sem login",
      description: "Confirme o acesso para consultar e gerenciar os links de acompanhamento deste atendimento.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    });
    if (liberado) setLinkAberto(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Portal do Cliente</DialogTitle>
            <DialogDescription>
              {equipamento.marca} {equipamento.modelo}: o que o cliente vê e responde em status.bmitag.com.br.
            </DialogDescription>
          </DialogHeader>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <div className="space-y-3">
            <Secao titulo="Orçamento no portal">
              {info ? (
                <p className="text-sm text-muted-foreground">
                  Versão {info.versao} enviada em {formatarHora(info.criadaEm)} · {formatarValor(info.valorTotal)}
                  {info.validoAte ? ` · válida até ${formatarHora(info.validoAte)}` : ""}
                  {info.encerradaMotivo
                    ? aguardando
                      ? " · encerrada (o orçamento ou a etapa mudou; publique uma nova versão)"
                      : " · encerrada (o atendimento já passou da etapa de aprovação)"
                    : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Este orçamento ainda não foi publicado no portal.</p>
              )}
              {info && !info.aceiteOnlineAtivo && (
                <p className="text-xs text-muted-foreground">
                  As respostas pelo Portal do Cliente estão desligadas: o cliente vê o orçamento, mas não aceita nem recusa por lá.
                </p>
              )}
              {aguardando && !respostaFinal && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={portal.publicar} disabled={busy}>
                    Publicar no Portal do Cliente
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {info
                      ? "Alterou o orçamento? Publique de novo: a versão anterior deixa de aceitar respostas."
                      : "O cliente vê e responde ao orçamento em status.bmitag.com.br."}
                  </span>
                </div>
              )}
              {aguardando && respostaFinal && (
                <p className="text-xs text-muted-foreground">
                  Há uma resposta do cliente pendente: publicar de novo criaria outra versão e anularia essa resposta.
                </p>
              )}
            </Secao>

            {aguardando && (
              <Secao titulo="Quem responde">
                <QuemRespondeNoPortal />
              </Secao>
            )}

            <Secao titulo="Link de acompanhamento sem login">
              <p className="text-xs text-muted-foreground">
                Link individual que mostra só o andamento do atendimento, sem senha. Não permite aceitar nem recusar.
              </p>
              <Button size="sm" variant="outline" onClick={() => void abrirLink()}>
                <Link2 className="mr-2 h-4 w-4" /> Gerenciar link de acompanhamento
              </Button>
            </Secao>

            {info && info.solicitacoes.length > 0 && (
              <Secao titulo="Mensagens do cliente">
                <ul className="max-h-48 space-y-2 overflow-y-auto pr-1 text-xs">
                  {info.solicitacoes.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2">
                      <span className={item.tratadaEm ? "text-muted-foreground" : ""}>
                        <strong>{TIPO_SOLICITACAO_TEXTO[item.tipo]}</strong> · {protocoloSolicitacao(item)}
                        {item.contato ? ` · ${item.contato}` : ""} · {formatarHora(item.criadaEm)}
                        {item.contatoTelefone ? ` · ${telefoneParaExibir(item.contatoTelefone)}` : ""}
                        {item.contatoEmail ? ` · ${item.contatoEmail}` : ""}
                        <br />
                        <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.mensagem}</span>
                      </span>
                      {item.tratadaEm ? (
                        <span className="shrink-0 text-muted-foreground">tratada</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => portal.tratarSolicitacao(item.id)}>
                          Marcar como tratada
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}

            {info && info.historico.length > 0 && (
              <Secao titulo={`Histórico de respostas (${info.historico.length})`}>
                <ul className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
                  {info.historico.map((item) => {
                    const oc = textoOrdemCompra(item);
                    return (
                      <li key={item.id}>
                        {formatarHora(item.registradaEm)} · {origemTexto(item)} {DECISAO_TEXTO[item.decisao]}
                        {oc ? ` · ${oc}` : ""}
                        {item.aplicadaEm ? ` · aplicada em ${formatarHora(item.aplicadaEm)}${item.aplicadaPeloSistema ? " (efetivação automática)" : ""}` : ""}
                        {item.efetivacaoFalhouEm ? ` · efetivação falhou: ${MOTIVO_FALHA[item.efetivacaoErro ?? ""] ?? item.efetivacaoErro ?? "motivo não informado"}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </Secao>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <PublicStatusLinkDialog equipamento={equipamento} open={linkAberto} onOpenChange={setLinkAberto} />
    </>
  );
}
