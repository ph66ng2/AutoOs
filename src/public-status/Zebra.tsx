import zebra from "./marca/zebra.svg";
import zebraAzul from "./marca/zebra-blue.svg";
import zebraLaco from "./marca/zebra-bow.svg";
import zebraCoroa from "./marca/zebra-crown.svg";
import zebraVerde from "./marca/zebra-green.svg";
import { TITLE_STAGE } from "./StatusView";

/**
 * Mascote do portal (zebrinha em pixel art da marca). Muda com a etapa do atendimento:
 * recebido → padrão, em verificação → azul, aguardando você → laço, em manutenção → verde,
 * pronto/entregue → coroa. É só enfeite: a etapa sempre está escrita ao lado.
 */
export const ZEBRAS = { padrao: zebra, azul: zebraAzul, laco: zebraLaco, verde: zebraVerde, coroa: zebraCoroa } as const;
export type Pelagem = keyof typeof ZEBRAS;

export function pelagemDoTitulo(titulo: string, concluido = false): Pelagem {
  if (concluido) return "coroa";
  const etapa = TITLE_STAGE[titulo];
  if (!etapa || etapa.deviation) return "padrao";
  if (etapa.tone === "amber") return "laco";
  if (etapa.index >= 4) return "coroa";
  if (etapa.index === 3) return "verde";
  if (etapa.index >= 1) return "azul";
  return "padrao";
}

type Props = { pelagem: Pelagem; className?: string };

export function Zebra({ pelagem, className }: Props) {
  return (
    <img
      className={`portal-zebra${className ? ` ${className}` : ""}`}
      src={ZEBRAS[pelagem]}
      alt=""
      aria-hidden="true"
      width={20}
      height={23}
      draggable={false}
      data-pelagem={pelagem}
    />
  );
}

/** Manada da marca espiando por cima do cartão de entrada. */
export function Manada() {
  const ordem: Pelagem[] = ["azul", "laco", "coroa", "verde", "padrao"];
  return (
    <div className="portal-manada" aria-hidden="true">
      {ordem.map((pelagem) => <Zebra key={pelagem} pelagem={pelagem} />)}
    </div>
  );
}
