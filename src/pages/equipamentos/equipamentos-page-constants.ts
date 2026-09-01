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
  "Impressora de Código de Barra",
  "Coletor de Dados",
  "Leitor de Dados",
  "Impressora de Cartão",
  "Outro",
];

/** Valores mais recorrentes no recebimento técnico. */
export const MARCA_EQUIPAMENTO_OPTIONS = ["Zebra", "Argox", "Datacard", "Outro"];

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
  Ivan: "ivan@bmitag.com.br",
  Isaias: "isaias@bmitag.com.br",
};

export const TECNICOS_DISPONIVEIS: TecnicoDisponivel[] = ["Ivan", "Isaias"];
