export const CATEGORIA_OPTIONS = [
  { value: "TODOS", label: "Todas as Categorias" },
  { value: "IMPRESSORA", label: "Impressora" },
  { value: "PEÇA", label: "Peça" },
  { value: "ETIQUETA", label: "Etiqueta" },
  { value: "RIBBON", label: "Ribbon" },
  { value: "OUTROS", label: "Outros" },
];

export const MINIMO_POR_CATEGORIA: Record<string, number> = {
  IMPRESSORA: 0,
  ETIQUETA: 1,
  RIBBON: 2,
  PEÇA: 1,
  OUTROS: 0,
};

export function categoriaProdutoLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  return CATEGORIA_OPTIONS.find((option) => option.value === trimmed)?.label ?? trimmed;
}
