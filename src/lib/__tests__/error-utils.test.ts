import { describe, it, expect, vi } from 'vitest';
import { formatAppError, formatErrorForCopy, formatToastMessage } from '../error-utils';
import { MENSAGEM_ERRO_GENERICO } from '../operator-errors';

describe('error-utils', () => {
  describe('formatAppError', () => {
    it('handles Error instance', () => {
      const err = new Error('Test error');
      const result = formatAppError({ context: 'Test', action: 'Do thing', error: err });
      expect(result.type).toBe('error');
      expect(result.context).toBe('Test');
      expect(result.action).toBe('Do thing');
      expect(result.message).toBe('Test error');
      expect(result.technicalDetails).toBe(err.stack);
      expect(result.originalError).toBe(err);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('handles string error', () => {
      const result = formatAppError({ context: 'X', action: 'Y', error: 'Plain string error' });
      expect(result.message).toBe('Plain string error');
      expect(result.technicalDetails).toBeUndefined();
    });

    it('handles unknown/fallback', () => {
      const result = formatAppError({ context: 'X', action: 'Y', error: null });
      expect(result.message).toBe('Ocorreu um erro inesperado.');
    });

    it('traduz o código estruturado de duplicidade e a cópia não leva a constraint', () => {
      const result = formatAppError({
        context: 'Clientes',
        action: 'Salvar cliente',
        error: new Error('AUTOOS:23505:ux_clientes_documento_ativo'),
      });
      expect(result.message).toContain('cliente já está cadastrado');
      expect(result.technicalDetails).toBeUndefined();
      const copied = formatErrorForCopy(result);
      expect(copied).toContain('cliente já está cadastrado');
      expect(copied).not.toContain('ux_clientes_documento_ativo');
      expect(copied.toLowerCase()).not.toContain('constraint');
      expect(copied).not.toContain('23505');
    });

    it('troca SQL que não é duplicidade por mensagem genérica e não copia o detalhe', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const raw = 'syntax error at or near "FROM" (SQLSTATE 42601)';
      const err = new Error(raw);
      const result = formatAppError({ context: 'Insumos', action: 'Salvar insumo', error: err });
      expect(result.message).toBe(MENSAGEM_ERRO_GENERICO);
      expect(result.technicalDetails).toBeUndefined();
      expect(result.message).not.toContain('42601');
      expect(result.message.toLowerCase()).not.toContain('syntax');
      const copied = formatErrorForCopy(result);
      expect(copied).toContain(MENSAGEM_ERRO_GENERICO);
      expect(copied).not.toContain('42601');
      expect(copied.toLowerCase()).not.toContain('syntax');
      expect(copied.toLowerCase()).not.toContain('constraint');
      expect(copied).not.toContain('Detalhes Técnicos');
      expect(spy).toHaveBeenCalledWith('[AutoOS] detalhe técnico ocultado do operador', err);
      spy.mockRestore();
    });

    it('não copia SQL nem constraint mesmo quando os detalhes técnicos vêm preenchidos', () => {
      const copied = formatErrorForCopy({
        type: 'error',
        context: 'Insumos',
        action: 'Salvar insumo',
        message: 'Falhou ao salvar',
        timestamp: new Date('2024-01-01'),
        technicalDetails: 'duplicate key value violates unique constraint "ux_produtos_codigo_key" SQLSTATE 23505',
      });
      expect(copied).toContain('Falhou ao salvar');
      expect(copied).not.toContain('ux_produtos_codigo_key');
      expect(copied.toLowerCase()).not.toContain('constraint');
      expect(copied).not.toContain('23505');
      expect(copied).not.toContain('duplicate key');
      expect(copied).not.toContain('Detalhes Técnicos');
    });
  });

  describe('formatErrorForCopy', () => {
    it('formats error for clipboard', () => {
      const err = {
        type: 'error' as const, context: 'Test', action: 'Save',
        message: 'Failed', timestamp: new Date('2024-01-01'),
      };
      const result = formatErrorForCopy(err);
      expect(result).toContain('Contexto: Test');
      expect(result).toContain('Ação: Save');
      expect(result).toContain('Mensagem: Failed');
    });

    it('includes technical details when present', () => {
      const err = {
        type: 'error' as const, context: 'X', action: 'Y',
        message: 'Msg', timestamp: new Date(),
        technicalDetails: 'Stack trace here',
      };
      const result = formatErrorForCopy(err);
      expect(result).toContain('--- Detalhes Técnicos ---');
      expect(result).toContain('Stack trace here');
    });
  });

  describe('formatToastMessage', () => {
    it('returns "context — action" when action present', () => {
      expect(formatToastMessage({ context: 'Equipamentos', action: 'Salvar', message: 'Ok' }))
        .toBe('Equipamentos — Salvar');
    });

    it('returns message when no action', () => {
      expect(formatToastMessage({ context: 'X', message: 'Hello' }))
        .toBe('Hello');
    });
  });
});
