import type { Equipamento } from "@/types";

/**
 * Cada OS é uma linha de `equipamentos`; o mesmo aparelho volta com o mesmo
 * número de série (serial_number não é único). Esta função junta as OS por
 * aparelho para mostrar quantas vezes ele passou pela assistência.
 */
export interface EquipamentoHistorico {
  chave: string;
  marca: string;
  modelo: string;
  serial: string;
  /** OS do aparelho, da mais recente para a mais antiga. */
  passagens: Equipamento[];
  /** OS que chegaram a Pronto (manutenção concluída), entregues ou não. */
  servicosFeitos: number;
  ultimaEntrada: string;
  /** Última alteração em qualquer OS do aparelho (atualizado_em; sem ele, a entrada). */
  ultimaMovimentacao: string;
  /** Status da OS mais recente. */
  statusAtual: string;
  emAberto: boolean;
}

const STATUS_FECHADOS = new Set(["ENTREGUE", "ABANDONADO"]);

export function osEmAberto(status: string): boolean {
  return !STATUS_FECHADOS.has(status);
}

function chaveDoAparelho(eq: Equipamento): string {
  const serial = (eq.serial_number ?? "").trim().toUpperCase();
  // Sem número de série não dá para saber se é o mesmo aparelho: cada OS fica sozinha.
  return serial ? `serial:${serial}` : `os:${eq.id ?? `${eq.marca}-${eq.modelo}-${eq.data_entrada}`}`;
}

function movimentacao(os: Equipamento): string {
  return os.atualizado_em || os.data_entrada || "";
}

function maisRecentePrimeiro(a: Equipamento, b: Equipamento): number {
  const porData = (b.data_entrada ?? "").localeCompare(a.data_entrada ?? "");
  return porData !== 0 ? porData : (b.id ?? 0) - (a.id ?? 0);
}

export function agruparHistoricoEquipamentos(lista: Equipamento[]): EquipamentoHistorico[] {
  const grupos = new Map<string, Equipamento[]>();
  for (const eq of lista) {
    const chave = chaveDoAparelho(eq);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(eq);
    else grupos.set(chave, [eq]);
  }

  const historico = [...grupos.entries()].map(([chave, oss]): EquipamentoHistorico => {
    const passagens = [...oss].sort(maisRecentePrimeiro);
    const atual = passagens[0];
    return {
      chave,
      marca: atual.marca,
      modelo: atual.modelo,
      serial: atual.serial_number,
      passagens,
      servicosFeitos: passagens.filter((os) => Boolean(os.data_pronto)).length,
      ultimaEntrada: atual.data_entrada,
      ultimaMovimentacao: passagens.map(movimentacao).reduce((maior, data) => (data > maior ? data : maior), ""),
      statusAtual: atual.status,
      emAberto: osEmAberto(atual.status),
    };
  });

  // O aparelho mexido por último vem primeiro.
  return historico.sort((a, b) => b.ultimaMovimentacao.localeCompare(a.ultimaMovimentacao));
}
