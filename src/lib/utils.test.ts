/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  utils.test.ts — Testes da lib utils                          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Testes para funções utilitárias do projeto                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatCurrencyOrMissing, formatDate, parseDecimalBr } from '@/lib/utils';

describe('cn (classnames utility)', () => {
  it('deve combinar classes simples', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deve filtrar valores falsy', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('deve mesclar classes Tailwind corretamente', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });
});

describe('formatCurrency', () => {
  it('deve formatar valor como BRL', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1.234,56');
    expect(result).toContain('R$');
  });

  it('deve formatar zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0,00');
  });

  it('deve formatar valores negativos', () => {
    const result = formatCurrency(-50);
    expect(result).toContain('50,00');
    expect(result).toContain('-');
  });

  it('mostra sem preço quando o valor é zero ou ausente', () => {
    expect(formatCurrencyOrMissing(0)).toBe('sem preço');
    expect(formatCurrencyOrMissing(null)).toBe('sem preço');
    expect(formatCurrencyOrMissing(15)).toContain('15,00');
  });
});

describe('parseDecimalBr', () => {
  it('aceita vírgula decimal pt-BR', () => {
    expect(parseDecimalBr('1234,50')).toBe(1234.5);
    expect(parseDecimalBr('1.234,50')).toBe(1234.5);
  });

  it('trata ponto com três dígitos como milhar pt-BR', () => {
    expect(parseDecimalBr('1.234')).toBe(1234);
  });

  it('aceita ponto decimal com até dois dígitos', () => {
    expect(parseDecimalBr('1234.50')).toBe(1234.5);
    expect(parseDecimalBr('1.5')).toBe(1.5);
  });

  it('aceita prefixo R$ e espaço não separável', () => {
    expect(parseDecimalBr('R$ 1.234,50')).toBe(1234.5);
    expect(parseDecimalBr(`R$\u00a01.234,50`)).toBe(1234.5);
    expect(parseDecimalBr('abc')).toBeNaN();
  });
});

describe('formatDate', () => {
  it('deve formatar data ISO para formato brasileiro', () => {
    const result = formatDate('2024-01-15');
    expect(result).toBe('15/01/2024');
  });

  it('deve retornar vazio para data inválida', () => {
    const result = formatDate('');
    expect(result).toBe('');
  });

  it('deve lidar com data com hora', () => {
    const result = formatDate('2024-12-25T10:30:00');
    expect(result).toBe('25/12/2024');
  });
});
