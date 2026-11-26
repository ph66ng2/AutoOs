import { AlarmClock, PackageCheck, PackageOpen, Printer, ShoppingBag, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AvisoInterno } from "@/types";

export interface VisualAviso {
  Icone: LucideIcon;
  chip: string;
  rotulo: string;
}

/** Ícone, cor e rótulo de cada tipo de aviso interno (as cores são os tons de status do DS). */
export const VISUAL_AVISO: Record<AvisoInterno["tipo"], VisualAviso> = {
  "os-nova": { Icone: Printer, chip: "bg-status-work-bg text-status-work", rotulo: "Nova OS" },
  "vence-amanha": { Icone: AlarmClock, chip: "bg-status-wait-bg text-status-wait", rotulo: "Orçamento" },
  "pronto-parado": { Icone: PackageCheck, chip: "bg-status-wait-bg text-status-wait", rotulo: "Retirada" },
  "peca-chegou": { Icone: PackageOpen, chip: "bg-status-ok-bg text-status-ok", rotulo: "Peça" },
  "estoque-baixo": { Icone: TriangleAlert, chip: "bg-status-bad-bg text-status-bad", rotulo: "Estoque" },
  "venda-aprovada": { Icone: ShoppingBag, chip: "bg-status-ok-bg text-status-ok", rotulo: "Venda" },
};

/** Para onde o aviso leva: a OS, a venda ou a lista de insumos com o filtro de estoque baixo. */
export function destinoDoAviso(aviso: AvisoInterno): { path: string; state?: Record<string, unknown> } | null {
  if (aviso.equipamentoId) return { path: "/equipamentos", state: { equipamentoId: aviso.equipamentoId } };
  if (aviso.vendaId) return { path: `/vendas/${aviso.vendaId}` };
  if (aviso.tipo === "estoque-baixo") return { path: "/insumos", state: { estoqueBaixo: true } };
  return null;
}

export const ROTULO_ABRIR_AVISO: Record<AvisoInterno["tipo"], string> = {
  "os-nova": "Abrir OS",
  "vence-amanha": "Abrir OS",
  "pronto-parado": "Abrir OS",
  "peca-chegou": "Abrir OS",
  "estoque-baixo": "Ver estoque",
  "venda-aprovada": "Abrir venda",
};
