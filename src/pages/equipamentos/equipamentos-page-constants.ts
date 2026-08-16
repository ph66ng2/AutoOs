import type { TecnicoDisponivel } from "@/components/equipamentos/VerificacaoTecnica";
import {
  STATUS_LABELS,
  type EquipamentoImagemCategoria,
  type StatusEquipamento,
} from "@/types";

export const STATUS_OPTIONS = [
  { value: "TODOS", label: "Todos os Status" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export const TIPO_OPTIONS = [
  "Impressora Térmico Direta",
  "Coletor de Dados",
  "Leitor de Dados",
  "Impressora de Cartão",
  "Outro",
];

/** Valores mais recorrentes no recebimento técnico. "Outro" mantém o cadastro aberto. */
export const MARCA_EQUIPAMENTO_OPTIONS = ["Zebra", "Datacard", "Outro"];

/**
 * Modelos atendidos com maior frequência. O valor salvo continua sendo texto,
 * para não restringir equipamentos já cadastrados ou novos modelos.
 */
export const MODELO_EQUIPAMENTO_OPTIONS = [
  "ZD220",
  "ZD230",
  "ZD421",
  "GC420T",
  "ZT230",
  "ZT410",
  "ZT411",
  "ZT420",
  "ZC100",
  "ZC300",
  "Outro",
];

export const STATUS_SENSIVEIS = new Set([
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "REPROVADO",
  "ORCAMENTO_VENCIDO",
  "ENTREGUE",
  "ABANDONADO",
]);

export const CATEGORIA_IMAGEM_LABELS: Record<EquipamentoImagemCategoria, string> = {
  ENTRADA: "entrada",
  SAIDA: "saída",
  VERIFICACAO: "verificação",
};

export const STATUS_BADGE_LABELS_PADRAO: Partial<Record<StatusEquipamento, string>> = {
  RECEBIDO: "Recebido",
  EM_VERIFICACAO: "Em Verificação",
  VERIFICADO: "Verificado",
  AGUARDANDO_APROVACAO: "Aguard. Aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  EM_MANUTENCAO: "Em Manutenção",
  AGUARDANDO_PECA: "Aguard. Peça",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  ORCAMENTO_VENCIDO: "Orçam. Vencido",
  ABANDONADO: "Abandonado",
};

export const EMAIL_POR_TECNICO: Record<string, string> = {
  Ivan: "ivan@bmicode.com",
  Isaias: "isaias@bmicode.com",
};

export const TECNICOS_DISPONIVEIS: TecnicoDisponivel[] = ["Ivan", "Isaias"];
