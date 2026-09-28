export const CATEGORIA_OPTIONS = [
  { value: "TODOS", label: "Todas as Categorias" },
  { value: "IMPRESSORA", label: "Impressora" },
  { value: "PEÇA", label: "Peça" },
  { value: "ETIQUETA", label: "Etiqueta" },
  { value: "RIBBON", label: "Ribbon" },
  { value: "OUTROS", label: "Outros" },
];

export function categoriaProdutoLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  return CATEGORIA_OPTIONS.find((option) => option.value === trimmed)?.label ?? trimmed;
}
