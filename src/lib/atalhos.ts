/** Atalhos do app inteiro: a lista do guia (Ctrl+/) e de Perfil › Tutorial. */
export interface Atalho {
  teclas: string[];
  acao: string;
}

export const ATALHOS: Atalho[] = [
  { teclas: ["Ctrl", "K"], acao: "Buscar" },
  { teclas: ["Alt", "N"], acao: "Nova entrada" },
  { teclas: ["Alt", "V"], acao: "Novo orçamento de venda" },
  { teclas: ["/"], acao: "Ir para a busca da tela" },
  { teclas: ["Ctrl", "L"], acao: "Bloquear (sair do computador)" },
  { teclas: ["Ctrl", "/"], acao: "Ver atalhos" },
];
