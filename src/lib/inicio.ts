import type { Equipamento } from "@/types";

export interface MesBancada {
  mes: number; // 1..12
  rotulo: string; // "Jan"
  entraram: number;
  entregues: number;
  reprovados: number;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Ano e mês (1..12) de uma data do banco ("2026-11-09", "2026-11-09 17:02:00" ou ISO). */
function anoMes(valor?: string | null): [number, number] | null {
  const casamento = valor?.match(/^(\d{4})-(\d{2})/);
  return casamento ? [Number(casamento[1]), Number(casamento[2])] : null;
}

/**
 * Movimento da bancada no ano: quantos entraram (data de entrada), quantos foram entregues
 * (data de saída de quem está ENTREGUE) e quantos foram reprovados (data da reprovação), por mês.
 */
export function movimentoDaBancada(equipamentos: Equipamento[], ano: number): MesBancada[] {
  const meses = MESES.map((rotulo, indice) => ({ mes: indice + 1, rotulo, entraram: 0, entregues: 0, reprovados: 0 }));
  const somar = (valor: string | null | undefined, campo: "entraram" | "entregues" | "reprovados") => {
    const data = anoMes(valor);
    if (data && data[0] === ano) meses[data[1] - 1][campo] += 1;
  };
  for (const eq of equipamentos) {
    somar(eq.data_entrada, "entraram");
    if (eq.status === "ENTREGUE") somar(eq.data_saida, "entregues");
    somar(eq.data_reprovacao, "reprovados");
  }
  return meses;
}

/** Variação em % de `atual` sobre `anterior`; null quando não há base para comparar. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora local. */
export function saudacao(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
