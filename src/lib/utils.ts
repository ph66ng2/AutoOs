/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/utils.ts — Utilitários Gerais                          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Funções utilitárias usadas em todo o projeto.              ║
 * ║                                                              ║
 * ║  DEPENDE DE: clsx, tailwind-merge                            ║
 * ║                                                              ║
 * ║  USADO POR: Todos os componentes UI (shadcn/ui)             ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina classes CSS condicionalmente com merge do Tailwind.
 * Usa clsx para condicional e tailwind-merge para resolver conflitos.
 * 
 * @param inputs - Classes CSS ou objetos condicionais
 * @returns String de classes combinadas
 * 
 * @example
 * cn("px-4 py-2", isActive && "bg-blue-500", { "opacity-50": disabled })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata valor numérico como moeda brasileira (BRL).
 * 
 * @param value - Valor numérico a formatar
 * @returns String formatada (ex: "R$ 1.234,56")
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Peça ou serviço sem preço cadastrado: não mostra R$ 0,00. */
export function formatCurrencyOrMissing(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "sem preço";
  return formatCurrency(value);
}

/** Interpreta "1.234,50" ou "1234.50". Vírgula é decimal; ponto com 3 dígitos é milhar pt-BR. */
export function parseDecimalBr(value: string): number {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return Number.NaN;
  if (trimmed.includes(",")) {
    const last = trimmed.lastIndexOf(",");
    const inteiro = trimmed.slice(0, last).replace(/\./g, "").replace(/,/g, "");
    const frac = trimmed.slice(last + 1).replace(/\D/g, "");
    return Number(`${inteiro}.${frac}`);
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    return Number(trimmed.replace(/\./g, ""));
  }
  return Number(trimmed);
}

/**
 * Formata data ISO para formato brasileiro (DD/MM/YYYY).
 * Usa parsing direto do string para evitar problemas de timezone.
 * 
 * @param dateString - Data em formato ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)
 * @returns String formatada (ex: "15/01/2024") ou vazio se inválido
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  // Parse direto do formato ISO para evitar problemas de timezone
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
