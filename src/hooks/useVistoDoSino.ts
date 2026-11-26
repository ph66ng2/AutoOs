import { useCallback, useEffect, useRef, useState } from "react";
import { aoAbrir, comChaves, gravarVistos, lerVistos, subirMarcaPortal, type Vistos } from "@/lib/sino-visto";

/** Retrato do "visto" quando uma consulta da conta do portal começou. */
export interface ConsultaDoPortal {
  readonly portalAte: number;
  readonly abertura: number;
  readonly geracao: number;
}

/**
 * "Visto" do sino (abrir zera o número sem marcar nada como lido), com todas as proteções contra
 * respostas fora de hora num lugar só. As regras em si são funções puras em `sino-visto.ts`.
 *
 * - `perfilId` mudou: carrega o "visto" do perfil novo na hora (antes da próxima consulta) e
 *   descarta o que ainda chegar para o anterior.
 * - `abrir()`: guarda as não lidas de agora, sobe a marca do portal e invalida a conta do portal
 *   que ainda estava a caminho. Depois busca o maior não lido do portal (`buscarMaiorPortal`),
 *   porque a lista da última consulta pode estar atrasada.
 * - Com o sino aberto (`aberto`), o que aparece em `chavesNaoLidas` também fica visto.
 * - Conta do portal: `iniciarConsultaPortal()` antes de pedir e `registrarContaPortal()` com a
 *   resposta; a resposta só vale se nada mudou no meio (perfil, abertura ou marca).
 */
export function useVistoDoSino({
  perfilId,
  aberto,
  chavesNaoLidas,
  buscarMaiorPortal,
}: {
  perfilId: number | null;
  aberto: boolean;
  /** Avisos internos (`aviso:…`) e erros do app (`erro:…`) ainda não lidos. */
  chavesNaoLidas: string[];
  /** Maior id de alerta do portal não lido agora; `null` com o portal desligado. */
  buscarMaiorPortal: (() => Promise<number>) | null;
}) {
  const [vistos, setVistos] = useState<Vistos>(() => lerVistos(perfilId));
  const [novosPortal, setNovosPortal] = useState(0);
  // Refs: callbacks e respostas assíncronas leem sempre o valor de agora.
  const vistosRef = useRef(vistos);
  const perfilRef = useRef(perfilId);
  const aberturas = useRef(0);
  const geracao = useRef(0);
  const chavesRef = useRef(chavesNaoLidas);
  chavesRef.current = chavesNaoLidas;
  const buscarMaiorRef = useRef(buscarMaiorPortal);
  buscarMaiorRef.current = buscarMaiorPortal;

  /** Aplica uma regra, grava e já deixa o ref com o resultado (sem esperar o próximo render). */
  const aplicar = useCallback((regra: (atual: Vistos) => Vistos) => {
    const proximo = regra(vistosRef.current);
    if (proximo === vistosRef.current) return;
    vistosRef.current = proximo;
    gravarVistos(perfilRef.current, proximo);
    setVistos(proximo);
  }, []);

  useEffect(() => {
    if (perfilRef.current === perfilId) return;
    perfilRef.current = perfilId;
    geracao.current += 1;
    const doPerfil = lerVistos(perfilId);
    vistosRef.current = doPerfil;
    setVistos(doPerfil);
    setNovosPortal(0);
  }, [perfilId]);

  const abrir = useCallback(({ avisosCarregados, portalMaiorId }: { avisosCarregados: boolean; portalMaiorId: number }) => {
    aberturas.current += 1;
    const minhaGeracao = geracao.current;
    aplicar((atual) => aoAbrir(atual, { chavesNaoLidas: chavesRef.current, avisosCarregados, portalMaiorId }));
    setNovosPortal(0);
    const buscar = buscarMaiorRef.current;
    if (!buscar) return;
    void buscar()
      .then((maior) => {
        if (minhaGeracao === geracao.current) aplicar((atual) => subirMarcaPortal(atual, maior));
      })
      .catch(() => undefined);
  }, [aplicar]);

  const chavesTexto = chavesNaoLidas.join("|");
  useEffect(() => {
    if (aberto && chavesTexto) aplicar((atual) => comChaves(atual, chavesTexto.split("|")));
  }, [aberto, chavesTexto, aplicar]);

  const iniciarConsultaPortal = useCallback((): ConsultaDoPortal => ({
    portalAte: vistosRef.current.portalAte,
    abertura: aberturas.current,
    geracao: geracao.current,
  }), []);

  const registrarContaPortal = useCallback((consulta: ConsultaDoPortal, novos: number) => {
    const valeAinda = consulta.geracao === geracao.current
      && consulta.abertura === aberturas.current
      && consulta.portalAte === vistosRef.current.portalAte;
    if (valeAinda) setNovosPortal(novos);
  }, []);

  return { vistos, novosPortal, abrir, iniciarConsultaPortal, registrarContaPortal };
}
