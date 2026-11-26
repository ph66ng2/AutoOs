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
  "ABANDONADO",
]);

/** Fases em que o orçamento já existe: PDF e alteração de valor ficam no menu. */
export const STATUS_COM_ORCAMENTO = [
  "VERIFICADO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "REPROVADO",
  "EM_MANUTENCAO",
  "AGUARDANDO_PECA",
  "PRONTO",
  "ENTREGUE",
  "ORCAMENTO_VENCIDO",
  "ABANDONADO",
];

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

/** Chips do filtro da lista: "Todos" e os status na ordem do fluxo (desvios logo depois de onde acontecem). */
const ORDEM_FILTRO_STATUS: StatusEquipamento[] = [
  "RECEBIDO",
  "EM_VERIFICACAO",
  "VERIFICADO",
  "AGUARDANDO_APROVACAO",
  "APROVADO",
  "EM_MANUTENCAO",
  "AGUARDANDO_PECA",
  "PRONTO",
  "ENTREGUE",
  "ORCAMENTO_VENCIDO",
  "REPROVADO",
  "ABANDONADO",
];

export const OPCOES_FILTRO_STATUS = [
  { value: "TODOS", label: "Todos" },
  ...ORDEM_FILTRO_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
];

/** Encerrados que quase ninguém filtra: ficam no menu "Outros"; o resto vira pílula, como no canvas. */
const STATUS_FILTRO_OUTROS = new Set<string>(["ENTREGUE", "ABANDONADO"]);
/** Rótulo da pílula: o nome da etapa (o "Orçam." do selo não precisa caber aqui). */
const ROTULO_PILULA: Partial<Record<string, string>> = { ORCAMENTO_VENCIDO: "Vencido" };
export const FILTRO_STATUS_PRINCIPAIS = OPCOES_FILTRO_STATUS
  .filter((opcao) => !STATUS_FILTRO_OUTROS.has(opcao.value))
  .map((opcao) => ({ ...opcao, titulo: opcao.label, label: ROTULO_PILULA[opcao.value] ?? opcao.label }));
export const FILTRO_STATUS_OUTROS = OPCOES_FILTRO_STATUS.filter((opcao) => STATUS_FILTRO_OUTROS.has(opcao.value));


