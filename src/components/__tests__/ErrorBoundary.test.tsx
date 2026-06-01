/**
 * Testes do componente ErrorBoundary
 *
 * Verifica renderização normal de children, fallback em caso
 * de erro, e presença dos botões Copiar e Recarregar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Componente que lança erro intencionalmente para teste
function Bomba({ deveExplodir }: { deveExplodir?: boolean }) {
  if (deveExplodir) {
    throw new Error('Erro simulado para teste');
  }
  return <p>Renderizado com sucesso</p>;
}

// Spy de console.error para suprimir logs esperados durante os testes
const consoleErrorSpy = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});

// Mock do clipboard
const clipboardWriteTextSpy = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: clipboardWriteTextSpy },
  writable: true,
  configurable: true,
});

// Mock do window.location.reload
const reloadSpy = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: reloadSpy },
  writable: true,
  configurable: true,
});

describe('ErrorBoundary', () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
    clipboardWriteTextSpy.mockClear();
    reloadSpy.mockClear();
  });

  afterEach(() => {
    // Nenhuma limpeza adicional necessária
  });

  // ─── Renderização normal ─────────────────────────────────

  it('renderiza children normalmente quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>Conteúdo seguro</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Conteúdo seguro')).toBeInTheDocument();
  });

  // ─── Fallback em erro ────────────────────────────────────

  it('exibe fallback quando um componente filho lança erro', () => {
    // Suprime o log de erro do React no console durante o teste
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    // Deve exibir a mensagem de fallback
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(
      screen.getByText(/Ocorreu um erro inesperado/i),
    ).toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });

  it('não renderiza children que causaram erro', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    expect(
      screen.queryByText('Renderizado com sucesso'),
    ).not.toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });

  // ─── Botões no fallback ──────────────────────────────────

  it('renderiza botão "Copiar detalhes" no fallback', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText('Copiar detalhes'),
    ).toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });

  it('renderiza botão "Recarregar página" no fallback', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText('Recarregar página'),
    ).toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });

  it('copia detalhes para clipboard ao clicar em "Copiar detalhes"', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Copiar detalhes'));

    expect(clipboardWriteTextSpy).toHaveBeenCalledTimes(1);
    const copiedText = clipboardWriteTextSpy.mock.calls[0][0];
    expect(copiedText).toContain('Erro simulado para teste');

    reactErrorSpy.mockRestore();
  });

  it('chama window.location.reload ao clicar em "Recarregar página"', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Recarregar página'));

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    reactErrorSpy.mockRestore();
  });

  // ─── Toggle de detalhes técnicos ─────────────────────────

  it('exibe toggle "Ver detalhes técnicos" no fallback', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    // O botão contém HTML entities, buscamos pelo texto visível parcial
    const toggleButton = screen.getByText(/Ver detalhes/, { exact: false });
    expect(toggleButton).toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });

  it('exibe mensagem de erro ao expandir detalhes técnicos', () => {
    const reactErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomba deveExplodir />
      </ErrorBoundary>,
    );

    const toggleButton = screen.getByText(/Ver detalhes/, { exact: false });
    fireEvent.click(toggleButton);

    // Deve exibir a mensagem do erro
    expect(
      screen.getByText('Erro simulado para teste'),
    ).toBeInTheDocument();

    reactErrorSpy.mockRestore();
  });
});
