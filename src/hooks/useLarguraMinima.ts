import { useEffect, useState } from "react";

/**
 * Verdadeiro quando a janela tem pelo menos `px` de largura. Sem `matchMedia`
 * (testes em jsdom) devolve `semConsulta`: por padrão, tela larga.
 */
export function useLarguraMinima(px: number, semConsulta = true): boolean {
  const consulta = `(min-width: ${px}px)`;
  const ler = () => (typeof window === "undefined" || typeof window.matchMedia !== "function" ? semConsulta : window.matchMedia(consulta).matches);
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
