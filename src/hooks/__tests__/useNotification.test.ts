import { describe, it, expect, vi } from 'vitest';

// Mock sonner before importing the hook
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock error-utils to ensure consistent test behavior
vi.mock('@/lib/error-utils', () => ({
  formatAppError: vi.fn((params) => ({
    type: 'error' as const,
    context: params.context,
    action: params.action,
    message: params.error instanceof Error ? params.error.message : String(params.error),
    technicalDetails: params.error instanceof Error ? params.error.stack : undefined,
    originalError: params.error,
    timestamp: new Date(),
  })),
  copyErrorDetails: vi.fn().mockResolvedValue(true),
  formatToastMessage: vi.fn((params) => {
    if (params.action) return `${params.context} — ${params.action}`;
    return params.message;
  }),
}));

import { useNotification } from '../useNotification';
import { toast } from 'sonner';

describe('useNotification', () => {
  const { success, error, warning, info } = useNotification();

  it('success calls toast.success with correct args', () => {
    success('Equipamentos', 'Saved', 'Salvar');
    expect(toast.success).toHaveBeenCalledWith(
      'Equipamentos — Salvar',
      expect.objectContaining({ description: 'Saved', duration: 3000 })
    );
  });

  it('success without action', () => {
    success('Dashboard', 'Loaded');
    expect(toast.success).toHaveBeenCalledWith(
      'Loaded',
      expect.objectContaining({ duration: 3000 })
    );
  });

  it('error calls toast.error with Infinity and copy action', () => {
    const err = new Error('DB fail');
    error('Equipamentos', 'Save', err);
    expect(toast.error).toHaveBeenCalledWith(
      'Equipamentos — Save',
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: 'Copiar detalhes' }),
      })
    );
  });

  it('warning calls toast.warning with 5s', () => {
    warning('Equipamentos', 'No data found');
    expect(toast.warning).toHaveBeenCalledWith(
      'No data found',
      expect.objectContaining({ duration: 5000 })
    );
  });

  it('info calls toast.info with 4s', () => {
    info('Equipamentos', 'Sending...');
    expect(toast.info).toHaveBeenCalledWith(
      'Sending...',
      expect.objectContaining({ duration: 4000 })
    );
  });

  it('returns all 4 methods', () => {
    const result = useNotification();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('warning');
    expect(result).toHaveProperty('info');
  });
});
