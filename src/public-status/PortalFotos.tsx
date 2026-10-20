import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CategoriaFoto, FotoAtendimento } from "./portal-api";

const GRUPOS: Array<{ categoria: CategoriaFoto; rotulo: string }> = [
  { categoria: "ENTRADA", rotulo: "Entrada" },
  { categoria: "VERIFICACAO", rotulo: "Verificação" },
  { categoria: "SAIDA", rotulo: "Saída" },
];

type Props = {
  fotos: FotoAtendimento[];
  equipamento: string;
  /** Orçamento aguardando resposta: o cliente vê o problema na hora de decidir. */
  destaque?: boolean;
};

/** Galeria compacta por categoria; toque/clique abre a foto ampliada com navegação. */
export default function PortalFotos({ fotos, equipamento, destaque = false }: Props) {
  const [aberta, setAberta] = useState<number | null>(null);

  const grupos = useMemo(
    () => GRUPOS.map((g) => ({ ...g, itens: fotos.filter((f) => f.categoria === g.categoria) })).filter((g) => g.itens.length > 0),
    [fotos],
  );
  // Ordem de navegação = ordem de exibição (grupo a grupo).
  const ordem = useMemo(() => grupos.flatMap((g) => g.itens.map((foto, i) => ({ foto, rotulo: g.rotulo, posicao: i + 1, total: g.itens.length }))), [grupos]);

  if (ordem.length === 0) return null;

  const alt = (item: (typeof ordem)[number]) => `Foto de ${item.rotulo.toLowerCase()} ${item.posicao} de ${item.total} - ${equipamento}`;

  return (
    <section className={`portal-fotos${destaque ? " is-destaque" : ""}`} aria-labelledby="portal-fotos-titulo">
      <h2 id="portal-fotos-titulo">{destaque ? "Fotos do equipamento" : "Fotos"}</h2>
      {destaque && <p className="answer-hint">Veja o estado do equipamento antes de decidir. Toque em uma foto para ampliar.</p>}
      {grupos.map((grupo) => (
        <div className="portal-fotos-grupo" key={grupo.categoria}>
          <h3>{grupo.rotulo} <span>({grupo.itens.length})</span></h3>
          <ul>
            {grupo.itens.map((foto, i) => {
              const indice = ordem.findIndex((o) => o.foto.id === foto.id);
              return (
                <li key={foto.id}>
                  <button type="button" className="portal-foto-miniatura" onClick={() => setAberta(indice)} aria-label={`Ampliar ${alt(ordem[indice]).toLowerCase()}`}>
                    <img src={foto.url} alt={alt({ ...ordem[indice], posicao: i + 1 })} width={96} height={96} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {aberta !== null && ordem[aberta] && (
        <Ampliada
          item={ordem[aberta]}
          alt={alt(ordem[aberta])}
          indice={aberta}
          total={ordem.length}
          onFechar={() => setAberta(null)}
          onMover={(delta) => setAberta((atual) => (atual === null ? null : (atual + delta + ordem.length) % ordem.length))}
        />
      )}
    </section>
  );
}

function Ampliada({ item, alt, indice, total, onFechar, onMover }: {
  item: { foto: FotoAtendimento; rotulo: string };
  alt: string;
  indice: number;
  total: number;
  onFechar: () => void;
  onMover: (delta: number) => void;
}) {
  const fechar = useRef<HTMLButtonElement>(null);
  const handler = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") onFechar();
    else if (event.key === "ArrowRight") onMover(1);
    else if (event.key === "ArrowLeft") onMover(-1);
  }, [onFechar, onMover]);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    fechar.current?.focus();
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      anterior?.focus?.();
    };
  }, [handler]);

  const { foto } = item;
  return (
    <div className="portal-lightbox" role="dialog" aria-modal="true" aria-label={`Foto ampliada: ${item.rotulo}`} onClick={onFechar}>
      <div className="portal-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span>{item.rotulo} · {indice + 1} de {total}</span>
        <button ref={fechar} type="button" className="portal-lightbox-close" onClick={onFechar}>Fechar</button>
      </div>
      <img
        className="portal-lightbox-img"
        src={foto.url}
        alt={alt}
        width={foto.largura ?? undefined}
        height={foto.altura ?? undefined}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
      />
      {total > 1 && (
        <div className="portal-lightbox-nav" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => onMover(-1)} aria-label="Foto anterior">‹ Anterior</button>
          <button type="button" onClick={() => onMover(1)} aria-label="Próxima foto">Próxima ›</button>
        </div>
      )}
    </div>
  );
}
