/**
 * Regras de tela do orçamento de venda avulsa de insumos (OI-<n>).
 *
 * Só apoio: o backend (Rust) recalcula todos os valores e é quem decide o que é permitido.
 * Aqui ficam o cálculo da prévia do total, o saldo, as ações por status e os textos de envio.
 */
import { parseTimestampPostgres, todayLocalIsoDate } from "@/lib/date-utils";
import type { StatusFamilia } from "@/lib/status-familia";
import { formatCurrency } from "@/lib/utils";
import type {
  OrcamentoInsumos,
  OrcamentoInsumosDetalhe,
  StatusOrcamentoInsumos,
} from "@/types";

export const STATUS_ORCAMENTO_INSUMOS_LABEL: Record<StatusOrcamentoInsumos, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  CANCELADO: "Cancelado",
  ENTREGUE: "Entregue",
};

/** Família de cor de cada situação (mesmas cinco famílias dos equipamentos). */
export const STATUS_ORCAMENTO_INSUMOS_FAMILIA: Record<StatusOrcamentoInsumos, StatusFamilia> = {
  RASCUNHO: "neutral",
  ENVIADO: "wait",
  APROVADO: "ok",
  REPROVADO: "bad",
  CANCELADO: "neutral",
  ENTREGUE: "neutral",
};

/** Cores do selo de status (Tailwind), com par claro/escuro. */
export const STATUS_ORCAMENTO_INSUMOS_COR: Record<StatusOrcamentoInsumos, string> = {
  RASCUNHO: "bg-status-neutral-bg text-status-neutral border-status-neutral/30",
  ENVIADO: "bg-status-wait-bg text-status-wait border-status-wait/30",
  APROVADO: "bg-status-ok-bg text-status-ok border-status-ok/30",
  REPROVADO: "bg-status-bad-bg text-status-bad border-status-bad/30",
  CANCELADO: "bg-status-neutral-bg text-status-neutral border-status-neutral/30",
  ENTREGUE: "bg-status-neutral-bg text-status-neutral border-status-neutral/30",
};

/**
 * Barra de etapas da lista de vendas, no mesmo desenho da lista de equipamentos:
 * Rascunho → Enviado → Aprovado → Entregue. Reprovado para onde aconteceu (no envio);
 * Cancelado não mostra avanço. Vencido pinta a barra de `bad` sem mudar a etapa.
 */
export const TOTAL_ETAPAS_VENDA = 4;

const ETAPA_VENDA: Record<StatusOrcamentoInsumos, number> = {
  RASCUNHO: 1,
  ENVIADO: 2,
  APROVADO: 3,
  ENTREGUE: 4,
  REPROVADO: 2,
  CANCELADO: 0,
};

export function etapaVenda(status: StatusOrcamentoInsumos): number {
  return ETAPA_VENDA[status] ?? 0;
}

export function familiaVenda(status: StatusOrcamentoInsumos, vencido: boolean): StatusFamilia {
  return vencido ? "bad" : STATUS_ORCAMENTO_INSUMOS_FAMILIA[status] ?? "neutral";
}

/** Categorias que podem entrar num orçamento de insumos: tudo do estoque, menos impressoras. */
export function categoriaOrcavel(categoria: string | undefined | null): boolean {
  return (categoria ?? "").trim().toUpperCase() !== "IMPRESSORA";
}

export function paraCentavos(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) : 0;
}

export function deCentavos(centavos: number): number {
  return centavos / 100;
}

export interface LinhaOrcamentoInsumos {
  produto_id: number;
  descricao: string;
  categoria: string;
  quantidade: number;
  valor_unitario: number;
  /** Saldo do produto no estoque, quando conhecido. */
  saldo?: number | null;
}

export interface TotaisOrcamentoInsumos {
  /** Total de cada linha, na mesma ordem. */
  linhas: number[];
  subtotal: number;
  desconto: number;
  total: number;
  /** O desconto digitado passa do subtotal (o backend recusaria). */
  descontoExcedido: boolean;
}

/** Prévia do total, em centavos inteiros para não acumular erro de ponto flutuante. */
export function calcularTotaisOrcamentoInsumos(
  linhas: Pick<LinhaOrcamentoInsumos, "quantidade" | "valor_unitario">[],
  desconto: number,
): TotaisOrcamentoInsumos {
  const totaisLinhas = linhas.map(
    (linha) => Math.max(0, Math.floor(linha.quantidade || 0)) * paraCentavos(linha.valor_unitario),
  );
  const subtotal = totaisLinhas.reduce((soma, valor) => soma + valor, 0);
  const descontoCentavos = paraCentavos(desconto);
  const descontoExcedido = descontoCentavos > subtotal;
  return {
    linhas: totaisLinhas.map(deCentavos),
    subtotal: deCentavos(subtotal),
    desconto: deCentavos(descontoCentavos),
    total: deCentavos(Math.max(0, subtotal - descontoCentavos)),
    descontoExcedido,
  };
}

/** Linhas cujo saldo atual não cobre a quantidade pedida. */
export function linhasSemSaldo(linhas: LinhaOrcamentoInsumos[]): LinhaOrcamentoInsumos[] {
  return linhas.filter(
    (linha) => linha.saldo != null && Math.floor(linha.quantidade || 0) > linha.saldo,
  );
}

/** Preço de venda do produto quando existe (> 0); senão 0, para a pessoa preencher. */
export function valorUnitarioPadrao(precoVenda?: number | null): number {
  return precoVenda != null && Number.isFinite(precoVenda) && precoVenda > 0 ? precoVenda : 0;
}

/** Validade padrão: hoje + 7 dias, em AAAA-MM-DD (data local, sem passar por UTC). */
export function validadePadraoOrcamentoInsumos(hoje = new Date(), dias = 7): string {
  const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias, 12);
  return todayLocalIsoDate(data);
}

/**
 * Orçamento em aberto (RASCUNHO ou ENVIADO) cuja validade já passou.
 * Compara texto AAAA-MM-DD; sem validade nunca vence.
 */
export function orcamentoInsumosVencido(
  o: Pick<OrcamentoInsumos, "status" | "validade">,
  hoje = todayLocalIsoDate(),
): boolean {
  if (o.status !== "RASCUNHO" && o.status !== "ENVIADO") return false;
  if (!o.validade) return false;
  return o.validade < hoje;
}

export interface AcoesOrcamentoInsumos {
  editar: boolean;
  salvar: boolean;
  gerarPdf: boolean;
  enviar: boolean;
  aprovar: boolean;
  reprovar: boolean;
  cancelar: boolean;
  entregar: boolean;
  /** Cancelar devolve itens ao estoque e pede confirmação. */
  cancelarDevolveEstoque: boolean;
  /** Excluir de vez (só CANCELADO). */
  excluir: boolean;
}

/** Ações do diálogo por status. `existente` = já foi salvo (tem número). */
export function acoesOrcamentoInsumos(
  status: StatusOrcamentoInsumos | null | undefined,
): AcoesOrcamentoInsumos {
  const novo = status == null;
  const aberto = status === "RASCUNHO" || status === "ENVIADO";
  return {
    editar: novo || aberto,
    salvar: novo || aberto,
    gerarPdf: !novo,
    enviar: aberto,
    aprovar: aberto,
    reprovar: aberto,
    cancelar: aberto || status === "APROVADO",
    entregar: status === "APROVADO",
    cancelarDevolveEstoque: status === "APROVADO",
    excluir: status === "CANCELADO",
  };
}

export function formaPagamentoRotulo(
  codigo?: string | null,
  detalhe?: string | null,
): string {
  const rotulos: Record<string, string> = {
    PIX: "Pix",
    BOLETO: "Boleto bancário",
    CARTAO_CREDITO: "Cartão de crédito",
    CARTAO_DEBITO: "Cartão de débito",
    DINHEIRO: "Dinheiro",
    TRANSFERENCIA: "Transferência bancária",
    A_COMBINAR: "A combinar",
    OUTRO: "Outro",
  };
  if (!codigo) return "Definida na aprovação";
  const rotulo = rotulos[codigo] ?? codigo;
  return codigo === "OUTRO" && detalhe?.trim() ? `${rotulo}: ${detalhe.trim()}` : rotulo;
}

function dataBr(valor?: string | null): string {
  if (!valor) return "";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

/** Nome para tratar a pessoa: contato escolhido ou o próprio cliente. */
export function nomeDestinatario(orcamento: Pick<OrcamentoInsumos, "contato_nome" | "cliente_nome">): string {
  return orcamento.contato_nome?.trim() || orcamento.cliente_nome?.trim() || "cliente";
}

/** E-mail do contato escolhido; sem ele, o do cadastro do cliente. */
export function emailDestinatario(
  orcamento: Pick<OrcamentoInsumos, "contato_email" | "cliente_email">,
): string {
  return orcamento.contato_email?.trim() || orcamento.cliente_email?.trim() || "";
}

/** Telefone do contato escolhido; sem ele, o do cadastro do cliente. */
export function telefoneDestinatario(
  orcamento: Pick<OrcamentoInsumos, "contato_telefone" | "cliente_telefone">,
): string {
  return orcamento.contato_telefone?.trim() || orcamento.cliente_telefone?.trim() || "";
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function assuntoEmailOrcamentoInsumos(orcamento: OrcamentoInsumos): string {
  return `Orçamento de insumos ${orcamento.numero_exibicao} - BMI TAG`;
}

/** Texto do e-mail: o PDF segue em anexo. */
export function montarEmailOrcamentoInsumos(orcamento: OrcamentoInsumosDetalhe): { texto: string; html: string } {
  const nome = nomeDestinatario(orcamento);
  const validade = dataBr(orcamento.validade);
  const itens = orcamento.itens.map(
    (item) => `- ${item.quantidade}x ${item.descricao}: ${formatCurrency(item.valor_total)}`,
  );
  const abertura = `Segue o orçamento de insumos ${orcamento.numero_exibicao}.`;
  const desconto = orcamento.desconto > 0 ? `Desconto: ${formatCurrency(orcamento.desconto)}\n` : "";
  const total = `Total: ${formatCurrency(orcamento.valor_total)}`;
  const prazo = validade ? `Este orçamento é válido até ${validade}.` : "";
  const fecho = "O PDF com os detalhes segue em anexo. Para aprovar ou tirar dúvidas, responda este e-mail.";

  const texto = [
    `Olá, ${nome}.`,
    "",
    abertura,
    "",
    ...itens,
    "",
    `${desconto}${total}`,
    prazo,
    "",
    fecho,
    "",
    "Atenciosamente,",
    "Equipe BMI TAG",
  ]
    .filter((linha, indice, todas) => !(linha === "" && todas[indice - 1] === ""))
    .join("\n");

  const linhasHtml = orcamento.itens
    .map((item) => `<li>${item.quantidade}x ${escapeHtml(item.descricao)}: ${escapeHtml(formatCurrency(item.valor_total))}</li>`)
    .join("");
  const html = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <p>Olá, <strong>${escapeHtml(nome)}</strong>.</p>
        <p>Segue o orçamento de insumos <strong>${escapeHtml(orcamento.numero_exibicao)}</strong>.</p>
        <ul>${linhasHtml}</ul>
        ${orcamento.desconto > 0 ? `<p>Desconto: ${escapeHtml(formatCurrency(orcamento.desconto))}</p>` : ""}
        <p><strong>Total: ${escapeHtml(formatCurrency(orcamento.valor_total))}</strong></p>
        ${prazo ? `<p>${escapeHtml(prazo)}</p>` : ""}
        <p>${escapeHtml(fecho)}</p>
        <p>Atenciosamente,<br />Equipe BMI TAG</p>
      </div>`;
  return { texto, html };
}

/** Mensagem curta de WhatsApp (sem anexo): itens e total. */
export function montarMensagemWhatsappOrcamentoInsumos(orcamento: OrcamentoInsumosDetalhe): string {
  const validade = dataBr(orcamento.validade);
  const itens = orcamento.itens.map((item) => `- ${item.quantidade}x ${item.descricao}`);
  return [
    `Olá, ${nomeDestinatario(orcamento)}! Segue o orçamento de insumos ${orcamento.numero_exibicao} da BMI TAG:`,
    "",
    ...itens,
    "",
    orcamento.desconto > 0 ? `Desconto: ${formatCurrency(orcamento.desconto)}` : "",
    `Total: ${formatCurrency(orcamento.valor_total)}`,
    validade ? `Válido até ${validade}.` : "",
    "",
    "Para aprovar ou tirar dúvidas, é só responder esta mensagem.",
  ]
    .filter((linha, indice, todas) => !(linha === "" && (indice === 0 || todas[indice - 1] === "")))
    .join("\n")
    .trim();
}

export type TipoAcaoVenda = "enviar" | "aprovar" | "renovar" | "entregar" | "ver";

/**
 * Ação principal da linha em Vendas de insumos (decisão 23 do redesign).
 * Vencido não pode ser aprovado: a ação vira "Renovar validade", que abre a edição.
 */
export function proximaAcaoVenda(
  status: StatusOrcamentoInsumos,
  vencido: boolean,
): { rotulo: string; tipo: TipoAcaoVenda } {
  if ((status === "RASCUNHO" || status === "ENVIADO") && vencido) return { rotulo: "Renovar validade", tipo: "renovar" };
  if (status === "RASCUNHO") return { rotulo: "Enviar", tipo: "enviar" };
  if (status === "ENVIADO") return { rotulo: "Aprovar", tipo: "aprovar" };
  if (status === "APROVADO") return { rotulo: "Marcar entregue", tipo: "entregar" };
  return { rotulo: "Ver", tipo: "ver" };
}

/** "20/11" de uma data AAAA-MM-DD ou de um instante do PostgreSQL, no fuso de Salvador. */
function diaMesVenda(valor?: string | null): string {
  if (!valor) return "";
  const soData = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return `${soData[3]}/${soData[2]}`;
  const instante = parseTimestampPostgres(valor);
  if (Number.isNaN(instante.getTime())) return "";
  return instante.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Bahia" });
}

function comData(rotulo: string, valor?: string | null): string {
  const data = diaMesVenda(valor);
  return data ? `${rotulo} ${data}` : rotulo;
}

/**
 * Coluna "Prazo ou data": a validade só importa em Rascunho e Enviado; nas outras
 * situações mostra quando o orçamento chegou onde está. Cancelado não tem data própria
 * no banco, então mostra quando foi criado.
 */
export function prazoOuData(
  o: Pick<OrcamentoInsumos, "status" | "validade" | "decidido_em" | "entregue_em" | "criado_em" | "forma_pagamento_codigo">,
  hoje = todayLocalIsoDate(),
): string {
  switch (o.status) {
    case "RASCUNHO":
    case "ENVIADO":
      if (!o.validade) return "sem validade";
      return o.validade < hoje ? comData("venceu", o.validade) : comData("vence", o.validade);
    case "APROVADO": {
      const texto = comData("aprovado", o.decidido_em);
      return o.forma_pagamento_codigo ? `${texto} · ${formaPagamentoRotulo(o.forma_pagamento_codigo)}` : texto;
    }
    case "ENTREGUE":
      return comData("entregue", o.entregue_em);
    case "REPROVADO":
      return comData("reprovado", o.decidido_em);
    default:
      return comData("criado", o.criado_em);
  }
}
