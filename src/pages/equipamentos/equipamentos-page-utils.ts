import type { TecnicoDisponivel } from "@/components/equipamentos/VerificacaoTecnica";
import type { EquipamentoFormData } from "@/lib/validations";
import { db } from "@/lib/db";
import type { EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";
import type {
  Equipamento,
  EquipamentoImagemCategoria,
  ResultadoAutomacao,
} from "@/types";
import { MENSAGEM_AGUARDANDO_TOTAL_ZERO, MENSAGEM_TOTAL_ZERO_SEM_GARANTIA, MENSAGEM_ZERAR_APROVADO_PAGO } from "@/lib/orcamento-estoque";
import { STATUS_SENSIVEIS } from "./equipamentos-page-constants";
import { getCorrectionStates, getNextStates, normalizeStatusKey } from "@/lib/status-fsm";

export function extrairTecnicoInicialDeObservacoes(observacoes?: string | null): TecnicoDisponivel | null {
  if (!observacoes) return null;
  const match = observacoes.match(/^Técnico inicial:\s*(Ivan|Isaias)\b/m);
  return (match?.[1] as TecnicoDisponivel | undefined) || null;
}

export function removerTecnicoInicialDasObservacoes(observacoes?: string | null) {
  if (!observacoes) return "";
  return observacoes
    .replace(/^Técnico inicial:.*(?:\r?\n)?/m, "")
    .trim();
}

export function mensagemResultadoCanais(resultado: ResultadoAutomacao) {
  if (!resultado.canais) return "";
  const linhas: string[] = [];
  const whatsapp = resultado.canais.whatsapp;
  const email = resultado.canais.email;

  if (whatsapp) {
    linhas.push(
      whatsapp.enviado
        ? "WhatsApp: enviado com sucesso."
        : `WhatsApp: não enviado${whatsapp.erro ? ` (${whatsapp.erro})` : "."}`
    );
  }
  if (email) {
    linhas.push(
      email.enviado
        ? "Email: enviado com sucesso."
        : `Email: não enviado${email.erro ? ` (${email.erro})` : "."}`
    );
  }
  return linhas.join("\n");
}

export function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function statusExigeAcessoSensivel(
  status: string,
  valorOrcamento?: number,
  prazoAprovacao?: string,
  valorFinal?: number,
) {
  return Boolean(
    STATUS_SENSIVEIS.has(status) ||
    valorOrcamento != null ||
    valorFinal != null ||
    (prazoAprovacao && prazoAprovacao.trim())
  );
}

export function whatsappNaoConfigurado(erro?: string) {
  return (erro || "").toLowerCase().includes("configure o whatsapp primeiro");
}

export function traduzirErroSalvarEquipamento(erro?: string) {
  const mensagem = (erro || "").toLowerCase();
  if (mensagem.includes("ux_equipamentos_patrimonio_when_present")) {
    return "Já existe um equipamento com este patrimônio. Informe outro código ou deixe o campo em branco.";
  }
  if (mensagem.includes("ux_equipamentos_serial")) {
    return "Já existe um equipamento com este número de série.";
  }
  return erro || "Erro ao salvar equipamento.";
}

export async function buscarEquipamentoDuplicado(
  data: EquipamentoFormData,
  editandoId?: number
): Promise<{ equipamento: Equipamento; campo: "serial_number" | "patrimonio" } | null> {
  const todos = await db.listarEquipamentos();
  const serial = (data.serial_number || "").trim().toLowerCase();
  const patrimonio = (data.patrimonio || "").trim().toLowerCase();

  const porSerial = todos.find((eq) =>
    eq.id !== editandoId &&
    (eq.serial_number || "").trim().toLowerCase() === serial
  );
  if (porSerial) {
    return { equipamento: porSerial, campo: "serial_number" };
  }

  if (patrimonio) {
    const porPatrimonio = todos.find((eq) =>
      eq.id !== editandoId &&
      (eq.patrimonio || "").trim().toLowerCase() === patrimonio
    );
    if (porPatrimonio) {
      return { equipamento: porPatrimonio, campo: "patrimonio" };
    }
  }

  return null;
}

export function filtrarImagensPorCategoria(
  imagens: EquipamentoImagemDraft[],
  categoria: EquipamentoImagemCategoria,
) {
  return imagens.filter((imagem) => imagem.categoria === categoria);
}

/**
 * Retorna array de status permitidos a partir do status atual.
 * Define o fluxo de transição (máquina de estados).
 */
export function getProximosStatus(
  statusAtual: string,
  opcoes: { semPreSelecao?: boolean } = {},
): string[] {
  const proximos = getNextStates(statusAtual);
  // Reabrir pelo "Mudar Status" sem pré-seleção fica com "Nova proposta" (ver ReabrirOrcamentoDialog).
  if (opcoes.semPreSelecao && normalizeStatusKey(statusAtual) === "REPROVADO") {
    return proximos.filter((status) => status !== "AGUARDANDO_APROVACAO");
  }
  return proximos;
}

export function reabreOrcamentoSemAjuste(statusAtual: string, novoStatus: string) {
  return statusAtual === "REPROVADO" && novoStatus === "AGUARDANDO_APROVACAO";
}

/** Total do orçamento ao enviar para aprovação: 0,00 e vazio não passam. Itens em garantia podem ser 0. */
export function totalOrcamentoAprovacaoValido(valor: number) {
  return Number.isFinite(valor) && valor > 0;
}

const STATUS_DEPOIS_APROVACAO = [
  "APROVADO",
  "EM_MANUTENCAO",
  "AGUARDANDO_PECA",
  "PRONTO",
  "ENTREGUE",
];

/** Ajuste: AGUARDANDO nunca fica R$ 0; APROVADO pago não zera; garantia 0 só fora desses casos. */
export function totalOrcamentoAjusteValido(
  valor: number,
  soGarantia: boolean,
  status?: string,
  valorAnterior?: number | null,
) {
  if (status === "AGUARDANDO_APROVACAO") {
    return totalOrcamentoAprovacaoValido(valor);
  }
  if (
    STATUS_DEPOIS_APROVACAO.includes(status ?? "")
    && (Number(valorAnterior) || 0) > 0
    && Number.isFinite(valor)
    && valor === 0
  ) {
    return false;
  }
  return totalOrcamentoAprovacaoValido(valor)
    || (Number.isFinite(valor) && valor === 0 && soGarantia);
}

export function mensagemAjusteTotalZero(
  status?: string,
  valorAnterior?: number | null,
) {
  if (status === "AGUARDANDO_APROVACAO") {
    return MENSAGEM_AGUARDANDO_TOTAL_ZERO;
  }
  if (STATUS_DEPOIS_APROVACAO.includes(status ?? "") && (Number(valorAnterior) || 0) > 0) {
    return MENSAGEM_ZERAR_APROVADO_PAGO;
  }
  return MENSAGEM_TOTAL_ZERO_SEM_GARANTIA;
}

/** Em APROVADO e REPROVADO a decisão é corrigida por "Corrigir decisão", não por status. */
const STATUS_COM_DECISAO_PROPRIA = ["APROVADO", "REPROVADO"];

export function getStatusCorrecao(statusAtual: string): string[] {
  const correcoes = getCorrectionStates(statusAtual);
  if (STATUS_COM_DECISAO_PROPRIA.includes(normalizeStatusKey(statusAtual))) {
    return correcoes.filter((status) => status !== "AGUARDANDO_APROVACAO");
  }
  return correcoes;
}

const SECOES_ACOES_OS = ["Orçamento", "Corrigir um engano", "Equipamento"] as const;

const SECAO_POR_ACAO_OS: Record<string, (typeof SECOES_ACOES_OS)[number]> = {
  orcamento_pdf: "Orçamento",
  alterar_orcamento: "Orçamento",
  pecas_os: "Orçamento",
  whatsapp_orcamento: "Orçamento",
  corrigir_status: "Corrigir um engano",
  corrigir_decisao: "Corrigir um engano",
  desfazer_aprovacao: "Corrigir um engano",
};

/** Seção do menu "Mais" da OS. Ações fora das listas caem em "Equipamento". */
export function secaoAcaoOs(id: string): string {
  return SECAO_POR_ACAO_OS[id] ?? "Equipamento";
}

/** Marca cada ação com a seção dela e ordena por seção, mantendo a ordem original dentro de cada uma. */
export function agruparAcoesOs<T extends { id: string; group?: string }>(acoes: T[]): T[] {
  const comSecao = acoes.map((acao, indice) => ({ acao: { ...acao, group: secaoAcaoOs(acao.id) } as T, indice }));
  const ordemSecao = (secao: string) => SECOES_ACOES_OS.indexOf(secao as (typeof SECOES_ACOES_OS)[number]);
  return comSecao
    .sort((a, b) => ordemSecao(a.acao.group ?? "") - ordemSecao(b.acao.group ?? "") || a.indice - b.indice)
    .map(({ acao }) => acao);
}

/** OS só de garantia (R$ 0) não envia orçamento ao cliente: não pede contato. */
export function precisaPerguntarQuemRecebeOrcamento(precisaContato: boolean, osSoDeGarantia: boolean) {
  return precisaContato && !osSoDeGarantia;
}
