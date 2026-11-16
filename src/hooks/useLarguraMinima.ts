import { useEffect, useState } from "react";

/**
 * Verdadeiro quando a janela tem pelo menos `px` de largura. Sem `matchMedia`
 * (testes em jsdom), considera tela larga: o layout de computador é o padrão.
 */
export function useLarguraMinima(px: number): boolean {
  const consulta = `(min-width: ${px}px)`;
  const ler = () => (typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(consulta).matches);
  const [larga, setLarga] = useState(ler);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setLarga(mq.matches);
    aoMudar();
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [consulta]);

  return larga;
}
