import zebra from "./marca/zebra.svg";
import zebraAzul from "./marca/zebra-blue.svg";
import zebraLaco from "./marca/zebra-bow.svg";
import zebraCoroa from "./marca/zebra-crown.svg";
import zebraVerde from "./marca/zebra-green.svg";

/** Mascote do portal (zebrinha em pixel art da marca). Só enfeite: fica fora do leitor de tela. */
const ZEBRAS = [zebraAzul, zebraLaco, zebraCoroa, zebraVerde, zebra];

/** Manada da marca espiando por cima do cartão de entrada (só na tela de entrar). */
export function Manada() {
  return (
    <div className="portal-manada" aria-hidden="true">
      {ZEBRAS.map((src) => (
        <img key={src} className="portal-zebra" src={src} alt="" width={20} height={23} draggable={false} />
      ))}
    </div>
  );
}
