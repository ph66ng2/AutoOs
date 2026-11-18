/**
 * Modais das ações de uma venda de insumos (V.5): enviar, aprovar, recusa por falta de
 * estoque, cancelar aprovado, e as confirmações de reprovar, entregar, cancelar e excluir.
 * Abre só o modal da ação, sem o orçamento por trás. As regras e os comandos são os de
 * `useAcoesOrcamentoInsumos`; o PIN continua com ensureSensitiveAccess (sem campo de PIN aqui).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormaPagamentoFields } from "@/components/equipamentos/FormaPagamentoFields";
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { textoDoErro, useAcoesOrcamentoInsumos } from "@/hooks/useAcoesOrcamentoInsumos";
import type { AcaoInicialOrcamentoInsumos } from "@/hooks/useOrcamentoInsumosEditor";
import { db } from "@/lib/db";
import { acoesOrcamentoInsumos, emailDestinatario, nomeDestinatario, telefoneDestinatario } from "@/lib/orcamento-insumos";
import { cn, formatCurrency } from "@/lib/utils";
import { formatarTelefone } from "@/lib/validations";
import type { FormaPagamentoCodigo, OrcamentoInsumosDetalhe } from "@/types";

type Fase =
  | { tipo: "fechado" }
  | { tipo: "carregando" }
  | { tipo: "enviar"; canal: "EMAIL" | "WHATSAPP" | "PDF" }
  | { tipo: "aprovar" }
  | { tipo: "recusa"; faltas: FaltaAprovacao[] }
  | { tipo: "cancelarAprovado" }
  | { tipo: "confirmar"; acao: "reprovar" | "entregar" | "cancelar" | "excluir" }
  /** `voltarAoEnvio`: a prévia saiu de "Ver PDF" no Enviar; fechar volta para lá. */
  | { tipo: "pdf"; voltarAoEnvio?: "EMAIL" | "WHATSAPP" | "PDF" };

export interface FaltaAprovacao {
  descricao: string;
  necessario: number;
  disponivel: number;
}

/** Lê as linhas "- Item: precisa de N, há M em estoque" da recusa do backend (mensagem_falta_de_estoque). */
export function faltasDaRecusa(mensagem: string): FaltaAprovacao[] | null {
  if (!/^Estoque insuficiente/.test(mensagem.trim())) return null;
  const faltas: FaltaAprovacao[] = [];
  for (const linha of mensagem.split("\n")) {
    const achado = /^-\s*(.+): precisa de (\d+), há (-?\d+) em estoque/.exec(linha.trim());
    if (achado) faltas.push({ descricao: achado[1], necessario: Number(achado[2]), disponivel: Number(achado[3]) });
  }
  return faltas;
}

interface AcaoVendaDialogProps {
  /** Ação a abrir; null = nada aberto. "editar" e "renovar" são páginas e não passam por aqui. */
  acao: AcaoInicialOrcamentoInsumos | null;
  vendaId: number | null;
  /** A página já tem o orçamento; a lista não, e ele é carregado aqui. */
  venda?: OrcamentoInsumosDetalhe | null;
  /** Para onde "Dar entrada no estoque" volta depois de salvar a entrada. */
  voltarPara: string;
  onFechar: () => void;
  onAlterado?: () => void;
  onExcluido?: (numero: string) => void;
}

const ICONE_CONFIRMACAO = {
  reprovar: { icone: CircleAlert, classe: "bg-status-wait-bg text-status-wait" },
  entregar: { icone: Package, classe: "bg-status-wait-bg text-status-wait" },
  cancelar: { icone: CircleAlert, classe: "bg-status-wait-bg text-status-wait" },
  excluir: { icone: Trash2, classe: "bg-status-bad-bg text-status-bad" },
} as const;

function OpcaoEnvio({
  marcada,
  desabilitada,
  titulo,
  detalhe,
  onEscolher,
}: {
  marcada: boolean;
  desabilitada?: boolean;
  titulo: string;
  detalhe: string;
  onEscolher: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-rapida",
        marcada ? "border-primary bg-acc-soft/40" : "hover:bg-muted/60",
        desabilitada && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name="canal-envio"
        className="mt-1 h-4 w-4 accent-primary"
        checked={marcada}
        disabled={desabilitada}
        onChange={onEscolher}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{detalhe}</span>
      </span>
    </label>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="whitespace-pre-line rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-2.5 text-sm text-status-bad">
      {children}
    </p>
  );
}

export function AcaoVendaDialog({ acao, vendaId, venda, voltarPara, onFechar, onAlterado, onExcluido }: AcaoVendaDialogProps) {
  const navigate = useNavigate();
  const [detalhe, setDetalhe] = useState<OrcamentoInsumosDetalhe | null>(venda ?? null);
  const [fase, setFase] = useState<Fase>({ tipo: "fechado" });
  const [codigoPagamento, setCodigoPagamento] = useState<FormaPagamentoCodigo | "">("");
  const [detalhePagamento, setDetalhePagamento] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [confirmaDevolucao, setConfirmaDevolucao] = useState(false);

  const {
    podeSalvarPdf,
    ocupado,
    erro,
    setErro,
    pdf,
    setPdf,
    liberar,
    gerarPdf,
    salvarPdf,
    enviar,
    aprovar,
    reprovar,
    cancelar,
    entregar,
    excluir,
  } = useAcoesOrcamentoInsumos({ detalhe, aplicarDetalhe: setDetalhe, onChanged: onAlterado, onExcluido });

  function fechar() {
    setFase({ tipo: "fechado" });
    setErro(null);
    setErroLocal(null);
    onFechar();
  }

  // Cada ação pedida abre o modal dela; a lista carrega o orçamento antes.
  useEffect(() => {
    if (!acao || vendaId == null) {
      setFase({ tipo: "fechado" });
      return;
    }
    let ativo = true;
    setErro(null);
    setErroLocal(null);
    setConfirmaDevolucao(false);
    setCodigoPagamento("");
    setDetalhePagamento("");

    async function abrir(carregado: OrcamentoInsumosDetalhe) {
      const permitidas = acoesOrcamentoInsumos(carregado.status);
      switch (acao) {
        case "pdf":
          setFase({ tipo: "pdf" });
          return;
        case "email":
        case "whatsapp":
          if (permitidas.enviar) setFase({ tipo: "enviar", canal: acao === "email" ? "EMAIL" : "WHATSAPP" });
          else onFechar();
          return;
        case "aprovar":
          if (!permitidas.aprovar || !(await liberar("Aprovar orçamento de insumos", "Informe o PIN para aprovar e baixar o estoque."))) {
            if (ativo) onFechar();
            return;
          }
          if (ativo) setFase({ tipo: "aprovar" });
          return;
        case "cancelar":
          if (!permitidas.cancelar) onFechar();
          else setFase(permitidas.cancelarDevolveEstoque ? { tipo: "cancelarAprovado" } : { tipo: "confirmar", acao: "cancelar" });
          return;
        case "reprovar":
        case "entregar":
        case "excluir":
          if (permitidas[acao]) setFase({ tipo: "confirmar", acao });
          else onFechar();
          return;
        default:
          onFechar();
      }
    }

    if (venda && venda.id === vendaId) {
      setDetalhe(venda);
      void abrir(venda);
    } else {
      setFase({ tipo: "carregando" });
      db.obterOrcamentoInsumos(vendaId)
        .then((carregado) => {
          if (!ativo) return;
          setDetalhe(carregado);
          void abrir(carregado);
        })
        .catch((causa) => {
          if (ativo) setErroLocal(textoDoErro(causa));
        });
    }
    return () => {
      ativo = false;
    };
    // Abre de novo só quando a ação ou a venda pedida mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acao, vendaId]);

  // O PDF é gerado quando o orçamento da ação está pronto.
  useEffect(() => {
    if (fase.tipo === "pdf" && detalhe && !pdf) void gerarPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase.tipo, detalhe]);

  const faltasAgora = useMemo(
    () => (detalhe?.itens ?? []).filter((item) => item.saldo_estoque != null && item.saldo_estoque < item.quantidade),
    [detalhe],
  );

  if (!detalhe && fase.tipo !== "carregando") return null;
  const numero = detalhe?.numero_exibicao ?? "";

  async function confirmarEnvio(canal: "EMAIL" | "WHATSAPP" | "PDF") {
    if (canal === "PDF") {
      setFase({ tipo: "pdf" });
      return;
    }
    if (await enviar(canal)) fechar();
  }

  async function confirmarAprovacao() {
    if (!codigoPagamento) {
      setErroLocal("Escolha uma forma de pagamento para aprovar o orçamento.");
      return;
    }
    if (codigoPagamento === "OUTRO" && !detalhePagamento.trim()) {
      setErroLocal("Descreva a forma de pagamento escolhida em Outro.");
      return;
    }
    setErroLocal(null);
    const falha = await aprovar({ codigo: codigoPagamento, detalhe: codigoPagamento === "OUTRO" ? detalhePagamento.trim() : null });
    if (!falha) {
      fechar();
      return;
    }
    const faltas = faltasDaRecusa(falha);
    if (faltas) {
      setErro(null);
      setFase({ tipo: "recusa", faltas });
    }
  }

  async function confirmarAcao(acaoConfirmada: "reprovar" | "entregar" | "cancelar" | "excluir" | "cancelarAprovado") {
    if (!(await liberar("Confirmar ação financeira", "Informe o PIN para continuar com o orçamento de insumos."))) return;
    const falha =
      acaoConfirmada === "reprovar" ? await reprovar()
      : acaoConfirmada === "entregar" ? await entregar()
      : acaoConfirmada === "excluir" ? await excluir()
      : await cancelar(acaoConfirmada === "cancelarAprovado");
    if (!falha) fechar();
  }

  function darEntrada(falta: FaltaAprovacao) {
    const item = detalhe?.itens.find((it) => it.descricao === falta.descricao);
    if (!item) return;
    const quantidade = falta.necessario - Math.max(falta.disponivel, 0);
    fechar();
    navigate(`/insumos?entrada=${item.produto_id}&quantidade=${quantidade}&voltar=${encodeURIComponent(voltarPara)}`);
  }

  const mensagemErro = erroLocal ?? erro;

  // ─── Enviar ───
  const email = detalhe ? emailDestinatario(detalhe) : "";
  const telefone = detalhe ? telefoneDestinatario(detalhe) : "";
  const destinatario = detalhe ? nomeDestinatario(detalhe) : "";
  const recusaEmail = detalhe?.cliente_receber_email === false;
  const recusaWhatsapp = detalhe?.cliente_receber_whatsapp === false;
  const canal = fase.tipo === "enviar" ? fase.canal : "EMAIL";
  const rotuloEnvio = canal === "EMAIL" ? "Enviar por e-mail" : canal === "WHATSAPP" ? "Enviar por WhatsApp" : "Gerar e salvar PDF";
  const validadeTexto = detalhe?.validade ? ` · vence ${detalhe.validade.slice(8, 10)}/${detalhe.validade.slice(5, 7)}` : "";

  return (
    <>
      <Dialog open={fase.tipo === "carregando"} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent tamanho="p">
          <DialogHeader>
            <DialogTitle>Carregando orçamento...</DialogTitle>
            <DialogDescription className="sr-only">Buscando o orçamento para a ação escolhida.</DialogDescription>
          </DialogHeader>
          {erroLocal && <Erro>{erroLocal}</Erro>}
        </DialogContent>
      </Dialog>

      {detalhe && (
        <>
          <Dialog open={fase.tipo === "enviar"} onOpenChange={(aberto) => !aberto && fechar()}>
            <DialogContent tamanho="m">
              <DialogHeader>
                <DialogTitle>Enviar orçamento {numero}</DialogTitle>
                <DialogDescription>
                  {detalhe.cliente_nome} · {formatCurrency(detalhe.valor_total)}{validadeTexto}
                </DialogDescription>
              </DialogHeader>
              <div role="radiogroup" aria-label="Como enviar" className="space-y-2.5">
                <OpcaoEnvio
                  marcada={canal === "EMAIL"}
                  desabilitada={!email}
                  titulo={`E-mail para ${destinatario}`}
                  detalhe={email ? `${email} · com o PDF em anexo` : "Sem e-mail cadastrado no cliente nem no contato"}
                  onEscolher={() => setFase({ tipo: "enviar", canal: "EMAIL" })}
                />
                {recusaEmail && <p className="rounded-xl bg-status-wait-bg px-4 py-2.5 text-sm text-status-wait">Este cliente pediu para não receber e-mail.</p>}
                <OpcaoEnvio
                  marcada={canal === "WHATSAPP"}
                  desabilitada={!telefone}
                  titulo={`WhatsApp para ${destinatario}`}
                  detalhe={telefone ? `${formatarTelefone(telefone)} · texto do orçamento` : "Sem telefone cadastrado no cliente nem no contato"}
                  onEscolher={() => setFase({ tipo: "enviar", canal: "WHATSAPP" })}
                />
                {recusaWhatsapp && <p className="rounded-xl bg-status-wait-bg px-4 py-2.5 text-sm text-status-wait">Este cliente pediu para não receber WhatsApp.</p>}
                {podeSalvarPdf && (
                  <OpcaoEnvio
                    marcada={canal === "PDF"}
                    titulo="Salvar o PDF"
                    detalhe={detalhe.status === "RASCUNHO" ? "Para entregar por outro meio. Marca como Enviado ao salvar." : "Para entregar por outro meio."}
                    onEscolher={() => setFase({ tipo: "enviar", canal: "PDF" })}
                  />
                )}
              </div>
              {mensagemErro && <Erro>{mensagemErro}</Erro>}
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="link" className="px-0" onClick={() => setFase({ tipo: "pdf", voltarAoEnvio: canal })}>
                  Ver PDF
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>
                  <Button type="button" onClick={() => void confirmarEnvio(canal)} disabled={ocupado || (canal === "EMAIL" && !email) || (canal === "WHATSAPP" && !telefone)}>
                    {ocupado ? "Enviando..." : rotuloEnvio}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={fase.tipo === "aprovar"} onOpenChange={(aberto) => !aberto && !ocupado && fechar()}>
            <DialogContent tamanho="m">
              <DialogHeader>
                <DialogTitle>Aprovar {numero}</DialogTitle>
                <DialogDescription className="sr-only">Escolha a forma de pagamento para aprovar.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-muted px-4 py-3 text-sm">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-semibold">{detalhe.cliente_nome}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(detalhe.valor_total)}</dd>
                <dt className="text-muted-foreground">Estoque</dt>
                <dd className={cn("font-semibold", faltasAgora.length > 0 && "text-status-wait")}>
                  {faltasAgora.length === 0
                    ? `${detalhe.itens.length} ${detalhe.itens.length === 1 ? "item" : "itens"} com saldo suficiente`
                    : `falta saldo de ${faltasAgora.map((item) => item.descricao).join(", ")}`}
                </dd>
              </dl>
              <FormaPagamentoFields
                codigo={codigoPagamento}
                detalhe={detalhePagamento}
                onCodigoChange={(valor) => { setCodigoPagamento(valor); setErroLocal(null); }}
                onDetalheChange={(valor) => { setDetalhePagamento(valor); setErroLocal(null); }}
                required
                disabled={ocupado}
              />
              {mensagemErro && <Erro>{mensagemErro}</Erro>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Cancelar</Button>
                <Button type="button" onClick={() => void confirmarAprovacao()} disabled={ocupado}>
                  {ocupado ? "Aprovando..." : "Aprovar e baixar estoque"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={fase.tipo === "recusa"} onOpenChange={(aberto) => !aberto && fechar()}>
            <DialogContent tamanho="m">
              <DialogHeader>
                <DialogTitle>Não deu para aprovar {numero}</DialogTitle>
                <DialogDescription>Nada foi baixado do estoque.</DialogDescription>
              </DialogHeader>
              {fase.tipo === "recusa" && (
                <div role="alert" className="rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
                  <p className="font-semibold">Estoque insuficiente</p>
                  <ul>
                    {fase.faltas.map((falta) => (
                      <li key={falta.descricao}>
                        {falta.descricao}: precisa de {falta.necessario}, há {Math.max(falta.disponivel, 0)} em estoque.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Não existe aprovação parcial. Dê entrada no estoque dos itens que faltam ou mude as quantidades, salve e aprove de novo.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar}>Fechar</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    fechar();
                    navigate(`/vendas/${detalhe.id}/editar`);
                  }}
                >
                  Editar quantidades
                </Button>
                {fase.tipo === "recusa" && fase.faltas.length === 1 && (
                  <Button type="button" onClick={() => darEntrada(fase.faltas[0])}>Dar entrada no estoque</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={fase.tipo === "cancelarAprovado"} onOpenChange={(aberto) => !aberto && !ocupado && fechar()}>
            <DialogContent tamanho="m">
              <DialogHeader>
                <DialogTitle>Cancelar {numero} aprovado</DialogTitle>
                <DialogDescription className="sr-only">Confirme a devolução dos itens ao estoque.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 rounded-xl bg-muted px-4 py-3 text-sm">
                <dt className="text-muted-foreground">Volta ao estoque</dt>
                <dd className="font-semibold">{detalhe.itens.map((item) => `${item.quantidade} ${item.descricao}`).join(" · ")}</dd>
              </dl>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Checkbox checked={confirmaDevolucao} onCheckedChange={(marcado) => setConfirmaDevolucao(marcado === true)} />
                Confirmo que os itens não foram entregues e voltam ao estoque
              </label>
              {mensagemErro && <Erro>{mensagemErro}</Erro>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar} disabled={ocupado}>Voltar</Button>
                <Button type="button" variant="destructive" disabled={!confirmaDevolucao || ocupado} onClick={() => void confirmarAcao("cancelarAprovado")}>
                  Cancelar e devolver ao estoque
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {fase.tipo === "confirmar" && (
            <ConfirmacaoVenda
              acao={fase.acao}
              venda={detalhe}
              ocupado={ocupado}
              erro={mensagemErro}
              onVoltar={fechar}
              onConfirmar={() => void confirmarAcao(fase.acao)}
            />
          )}

          <PdfPreviewDialog
            artifact={fase.tipo === "pdf" ? pdf : null}
            onOpenChange={(aberto) => {
              if (!aberto) {
                setPdf(null);
                if (fase.tipo === "pdf" && fase.voltarAoEnvio) setFase({ tipo: "enviar", canal: fase.voltarAoEnvio });
                else fechar();
              }
            }}
            onDownload={podeSalvarPdf ? salvarPdf : undefined}
          />
        </>
      )}
    </>
  );
}

const TEXTO_CONFIRMACAO = {
  reprovar: {
    titulo: (n: string) => `Reprovar ${n}?`,
    descricao: () => "O cliente recusou. O orçamento fica reprovado e não pode mais ser aprovado. O estoque não muda.",
    botao: "Reprovar",
  },
  entregar: {
    titulo: (n: string) => `Marcar ${n} como entregue?`,
    descricao: () => "Confirma que os itens chegaram ao cliente. Depois disso o orçamento não pode mais ser cancelado.",
    botao: "Marcar entregue",
  },
  cancelar: {
    titulo: (n: string) => `Cancelar ${n}?`,
    descricao: (venda: OrcamentoInsumosDetalhe) =>
      `${venda.status === "RASCUNHO" ? "O rascunho" : "O orçamento"} fica cancelado. O estoque não muda porque nada foi baixado.`,
    botao: "Cancelar orçamento",
  },
  excluir: {
    titulo: (n: string) => `Excluir ${n} de vez?`,
    descricao: () => "O orçamento e os itens são apagados. O estoque não muda e o número não é reaproveitado. Não dá para desfazer.",
    botao: "Excluir orçamento",
  },
} as const;

/** Confirmação P (440px) com ícone, título com o número, Voltar e a ação. */
function ConfirmacaoVenda({
  acao,
  venda,
  ocupado,
  erro,
  onVoltar,
  onConfirmar,
}: {
  acao: "reprovar" | "entregar" | "cancelar" | "excluir";
  venda: OrcamentoInsumosDetalhe;
  ocupado: boolean;
  erro: string | null;
  onVoltar: () => void;
  onConfirmar: () => void;
}) {
  const texto = TEXTO_CONFIRMACAO[acao];
  const { icone: Icone, classe } = ICONE_CONFIRMACAO[acao];
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !ocupado && onVoltar()}>
      <DialogContent tamanho="p" role="alertdialog">
        <DialogHeader className="space-y-3">
          <span aria-hidden="true" className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl", classe)}>
            <Icone className="h-[22px] w-[22px]" />
          </span>
          <DialogTitle>{texto.titulo(venda.numero_exibicao)}</DialogTitle>
          <DialogDescription>{texto.descricao(venda)}</DialogDescription>
        </DialogHeader>
        {erro && <Erro>{erro}</Erro>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onVoltar} disabled={ocupado}>Voltar</Button>
          <Button type="button" variant={acao === "entregar" ? "default" : "destructive"} disabled={ocupado} onClick={onConfirmar}>
            {texto.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
