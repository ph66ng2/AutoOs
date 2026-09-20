export const CATEGORIA_OPTIONS = [
  { value: "TODOS", label: "Todas as Categorias" },
  { value: "TONER", label: "Toner" },
  { value: "CARTUCHO", label: "Cartucho" },
  { value: "CILINDRO", label: "Cilindro" },
  { value: "FUSOR", label: "Fusor" },
  { value: "ROLO", label: "Rolo" },
  { value: "PEÇA", label: "Peça" },
  { value: "OUTRO", label: "Outro" },
];

export function categoriaProdutoLabel(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "—";
  return CATEGORIA_OPTIONS.find((option) => option.value === trimmed)?.label ?? trimmed;
}
