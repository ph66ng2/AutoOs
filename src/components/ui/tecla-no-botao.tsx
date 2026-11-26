/**
 * Tecla que faz o mesmo que o botão, ao lado do rótulo: "Cancelar (Esc)". Some em tela de
 * toque/celular, onde não há teclado.
 */
export function TeclaNoBotao({ tecla }: { tecla: string }) {
  return (
    <span aria-hidden="true" className="ml-1.5 hidden text-xs font-normal opacity-70 md:inline">
      ({tecla})
    </span>
  );
}
