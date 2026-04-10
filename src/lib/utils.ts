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
