import { describe, it, expect } from 'vitest';
import { formatAppError, formatErrorForCopy, formatToastMessage } from '../error-utils';

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
