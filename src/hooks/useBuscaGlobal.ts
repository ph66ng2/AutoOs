import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { STATUS_LABELS, type StatusEquipamento } from "@/types";

export type GrupoResultado = "Telas" | "Equipamentos" | "Clientes" | "Insumos";

export interface ResultadoBusca {
  chave: string;
  grupo: GrupoResultado;
  titulo: string;
  detalhe?: string;
  /** Rota e estado de navegação ao escolher. */
  destino: { path: string; state?: Record<string, unknown> };
  aoAbrir?: () => void;
}

export interface TelaBuscavel {
  label: string;
  path: string;
  /** Algo a fazer antes de navegar (ex.: trocar para o Modo Balcão). */
  aoAbrir?: () => void;
}

const POR_GRUPO = 5;
const ESPERA_MS = 200;

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Telas cujo nome contém o termo (sem acento e caixa). */
export function telasQueCasam(telas: TelaBuscavel[], termo: string): ResultadoBusca[] {
  const alvo = semAcento(termo.trim());
  if (!alvo) return [];
  return telas
    .filter((tela) => semAcento(tela.label).includes(alvo))
    .map((tela) => ({ chave: `tela:${tela.path}`, grupo: "Telas" as const, titulo: tela.label, destino: { path: tela.path }, aoAbrir: tela.aoAbrir }));
}

/**
 * Busca do Ctrl+K: OS (série, patrimônio, cliente, CPF/CNPJ), clientes e insumos, cinco de cada,
 * com as mesmas buscas das listas (primeira página, que no backend é a 0). Cada fonte falha sozinha (sem sessão, sem permissão).
 */
export function useBuscaGlobal(termo: string, telas: TelaBuscavel[]) {
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const busca = termo.trim();
    const daTela = telasQueCasam(telas, busca);
    if (busca.length < 2) {
      setResultados(daTela);
      setBuscando(false);
      return;
    }
    let vivo = true;
    // Resultados do termo anterior saem já: Enter durante a busca nunca abre o item errado.
    setResultados(daTela);
    setBuscando(true);
    const espera = window.setTimeout(() => {
      const seguro = <T,>(promessa: () => Promise<T>) => Promise.resolve().then(promessa).catch(() => null);
      void Promise.all([
        seguro(() => db.listarEquipamentosPaginados(busca, undefined, 0)),
        seguro(() => db.listarClientesPaginados(busca, 0)),
        seguro(() => db.listarProdutosPaginados(busca, undefined, false, 0)),
      ]).then(([equipamentos, clientes, produtos]) => {
        if (!vivo) return;
        const lista: ResultadoBusca[] = [...daTela];
        for (const eq of (equipamentos?.items ?? []).slice(0, POR_GRUPO)) {
          if (eq.id == null) continue;
          const status = STATUS_LABELS[eq.status as StatusEquipamento] ?? eq.status;
          lista.push({
            chave: `eq:${eq.id}`,
            grupo: "Equipamentos",
            titulo: `${eq.marca} ${eq.modelo}`.trim(),
            detalhe: [eq.serial_number, eq.cliente_nome, status].filter(Boolean).join(" · "),
            destino: { path: `/equipamentos/${eq.id}` },
          });
        }
        for (const cliente of (clientes?.items ?? []).slice(0, POR_GRUPO)) {
          if (cliente.id == null) continue;
          lista.push({
            chave: `cli:${cliente.id}`,
            grupo: "Clientes",
            titulo: cliente.nome ?? "Cliente",
            detalhe: cliente.documento || cliente.cpf_cnpj || cliente.telefone || undefined,
            destino: { path: `/clientes/${cliente.id}/equipamentos` },
          });
        }
        for (const produto of (produtos?.items ?? []).slice(0, POR_GRUPO)) {
          if (produto.id == null) continue;
          lista.push({
            chave: `prod:${produto.id}`,
            grupo: "Insumos",
            titulo: produto.nome,
            detalhe: [produto.codigo, produto.categoria].filter(Boolean).join(" · "),
            destino: { path: "/insumos", state: { busca: produto.nome } },
          });
        }
        setResultados(lista);
        setBuscando(false);
      });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [termo, telas]);

  return { resultados, buscando };
}
