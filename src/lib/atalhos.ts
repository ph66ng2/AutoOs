/** Guia de atalhos de teclado: a mesma lista no "?" e em Perfil › Tutorial. */
export interface Atalho {
  teclas: string[];
  acao: string;
}

export interface GrupoAtalhos {
  titulo: string;
  atalhos: Atalho[];
}

export const GUIA_ATALHOS: GrupoAtalhos[] = [
  {
    titulo: "Em qualquer tela",
    atalhos: [
      { teclas: ["Ctrl", "K"], acao: "Buscar equipamento, cliente, insumo ou tela" },
      { teclas: ["N"], acao: "Nova entrada de equipamento" },
      { teclas: ["/"], acao: "Ir para a busca da tela" },
      { teclas: ["?"], acao: "Mostrar os atalhos" },
    ],
  },
  {
    titulo: "Na busca (Ctrl+K)",
    atalhos: [
      { teclas: ["↑", "↓"], acao: "Escolher o resultado" },
      { teclas: ["Enter"], acao: "Abrir o resultado escolhido" },
      { teclas: ["Esc"], acao: "Fechar a busca" },
    ],
  },
  {
    titulo: "Nas listas",
    atalhos: [
      { teclas: ["Ctrl", "clique"], acao: "Combinar vários status no filtro de equipamentos" },
    ],
  },
  {
    titulo: "Em janelas e formulários",
    atalhos: [
      { teclas: ["Esc"], acao: "Fechar a janela (a Nova entrada fica guardada como rascunho)" },
    ],
  },
];

/** As letras sozinhas (N, /, ?) não valem dentro de um campo nem com uma janela aberta. */
export const OBSERVACAO_ATALHOS = "N, / e ? não valem enquanto você digita num campo. Com uma janela aberta, nenhum atalho troca de tela.";
