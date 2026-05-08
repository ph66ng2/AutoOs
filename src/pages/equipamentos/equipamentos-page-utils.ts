import type { TecnicoDisponivel } from "@/components/equipamentos/VerificacaoTecnica";
import type { EquipamentoFormData } from "@/lib/validations";
import { db } from "@/lib/db";
import type { EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";
import type {
  Equipamento,
  EquipamentoImagemCategoria,
  ResultadoAutomacao,
} from "@/types";
import { STATUS_SENSIVEIS } from "./equipamentos-page-constants";

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
  const transicoes: Record<string, string[]> = {
    RECEBIDO: ["EM_VERIFICACAO"],
    EM_VERIFICACAO: ["VERIFICADO"],
    VERIFICADO: ["AGUARDANDO_APROVACAO"],
    AGUARDANDO_APROVACAO: ["APROVADO", "REPROVADO", "ORCAMENTO_VENCIDO"],
    APROVADO: ["EM_MANUTENCAO"],
    EM_MANUTENCAO: ["AGUARDANDO_PECA", "PRONTO"],
    AGUARDANDO_PECA: ["EM_MANUTENCAO"],
    PRONTO: ["ENTREGUE"],
    REPROVADO: ["ENTREGUE", "ABANDONADO"],
    ORCAMENTO_VENCIDO: ["ABANDONADO", "AGUARDANDO_APROVACAO"],
    ENTREGUE: [],
    ABANDONADO: [],
  };
  return transicoes[statusAtual] || [];
}
