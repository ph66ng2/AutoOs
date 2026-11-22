export const CATEGORIA_OPTIONS = [
  { value: "TODOS", label: "Todas as Categorias" },
  { value: "IMPRESSORA", label: "Impressora" },
  { value: "PEÇA", label: "Peça" },
  { value: "ETIQUETA", label: "Etiqueta" },
  { value: "RIBBON", label: "Ribbon" },
  { value: "OUTROS", label: "Outros" },
  // Mantidos para leitura/edição enquanto ambientes antigos recebem a migration.
  { value: "TONER", label: "Toner" },
  { value: "CARTUCHO", label: "Cartucho" },
  { value: "CILINDRO", label: "Cilindro" },
  { value: "FUSOR", label: "Fusor" },
  { value: "ROLO", label: "Rolo" },
  { value: "OUTRO", label: "Outro" },
];

export const MINIMO_POR_CATEGORIA: Record<string, number> = {
  IMPRESSORA: 0,
  PEÇA: 1,
  ETIQUETA: 1,
  RIBBON: 2,
  OUTROS: 0,
};

export const CATEGORIA_CANONICA_VALUES = Object.keys(MINIMO_POR_CATEGORIA);

export function categoriaProdutoLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  return CATEGORIA_OPTIONS.find((option) => option.value === trimmed)?.label ?? trimmed;
}
