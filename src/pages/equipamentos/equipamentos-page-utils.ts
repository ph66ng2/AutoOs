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
import { getCorrectionStates, getNextStates } from "@/lib/status-fsm";

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
export function getProximosStatus(statusAtual: string): string[] {
  return getNextStates(statusAtual);
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

export function getStatusCorrecao(statusAtual: string): string[] {
  return getCorrectionStates(statusAtual);
}

/** OS só de garantia (R$ 0) não envia orçamento ao cliente: não pede contato. */
export function precisaPerguntarQuemRecebeOrcamento(precisaContato: boolean, osSoDeGarantia: boolean) {
  return precisaContato && !osSoDeGarantia;
}
