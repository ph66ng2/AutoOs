/**
 * Regras de tela do orçamento de venda avulsa de insumos (OI-<n>).
 *
 * Só apoio: o backend (Rust) recalcula todos os valores e é quem decide o que é permitido.
 * Aqui ficam o cálculo da prévia do total, o saldo, as ações por status e os textos de envio.
 */
import { todayLocalIsoDate } from "@/lib/date-utils";
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

/** Cores do selo de status (Tailwind), com par claro/escuro. */
export const STATUS_ORCAMENTO_INSUMOS_COR: Record<StatusOrcamentoInsumos, string> = {
  RASCUNHO: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200",
  ENVIADO: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200",
  APROVADO: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200",
  REPROVADO: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200",
  CANCELADO: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300",
  ENTREGUE: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200",
};

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
