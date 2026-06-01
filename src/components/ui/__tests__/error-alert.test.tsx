/**
 * Testes do componente ErrorAlert
 *
 * Verifica renderização por variante, omissão quando vazio,
 * toggle de detalhes técnicos e botão de cópia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorAlert } from '../error-alert';

// Mock copyErrorDetails
const mockCopyErrorDetails = vi.fn();

vi.mock('@/lib/error-utils', () => ({
  copyErrorDetails: (...args: unknown[]) => mockCopyErrorDetails(...args),
}));

describe('ErrorAlert', () => {
  beforeEach(() => {
    mockCopyErrorDetails.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Renderização condicional ────────────────────────────

  it('retorna null quando não há message nem technicalDetails', () => {
    const { container } = render(<ErrorAlert />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza quando apenas message está presente', () => {
    render(<ErrorAlert message="Algo deu errado" />);
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
  });

  it('renderiza quando apenas technicalDetails está presente', () => {
    render(<ErrorAlert technicalDetails="Stack trace..." />);
    expect(screen.getByText('Ver detalhes técnicos')).toBeInTheDocument();
  });

  // ─── Variantes ───────────────────────────────────────────

  it('aplica estilo da variante error (default)', () => {
    render(<ErrorAlert message="Erro crítico" />);
    const alert = screen.getByText('Erro crítico').closest('div.rounded-lg')!;
    expect(alert).toHaveClass('border-destructive/30');
    expect(alert).toHaveClass('bg-destructive/5');
  });

  it('aplica estilo da variante warning', () => {
    render(<ErrorAlert variant="warning" message="Aviso" />);
    const alert = screen.getByText('Aviso').closest('div.rounded-lg')!;
    expect(alert).toHaveClass('border-amber-200');
  });

  it('aplica estilo da variante info', () => {
    render(<ErrorAlert variant="info" message="Informação" />);
    const alert = screen.getByText('Informação').closest('div.rounded-lg')!;
    expect(alert).toHaveClass('border-blue-200');
  });

  it('aplica estilo da variante success', () => {
    render(<ErrorAlert variant="success" message="Sucesso" />);
    const alert = screen.getByText('Sucesso').closest('div.rounded-lg')!;
    expect(alert).toHaveClass('border-emerald-200');
  });

  // ─── Contexto e ação ─────────────────────────────────────

  it('exibe contexto e ação quando fornecidos', () => {
    render(
      <ErrorAlert
        context="Backup"
        action="Falha ao exportar"
        message="Arquivo não encontrado"
      />,
    );
    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Falha ao exportar')).toBeInTheDocument();
    expect(screen.getByText('Arquivo não encontrado')).toBeInTheDocument();
  });

  // ─── Detalhes técnicos (toggle) ──────────────────────────

  it('exibe botão "Ver detalhes técnicos" quando technicalDetails é fornecido', () => {
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);
    expect(
      screen.getByText('Ver detalhes técnicos'),
    ).toBeInTheDocument();
  });

  it('não mostra o conteúdo dos detalhes até o toggle ser clicado', () => {
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);
    expect(screen.queryByText('stack trace...')).not.toBeInTheDocument();
  });

  it('exibe detalhes técnicos ao clicar no toggle', async () => {
    const user = userEvent.setup();
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);

    await user.click(screen.getByText('Ver detalhes técnicos'));

    expect(screen.getByText('stack trace...')).toBeInTheDocument();
    expect(
      screen.getByText('Ocultar detalhes técnicos'),
    ).toBeInTheDocument();
  });

  it('oculta detalhes técnicos ao clicar novamente no toggle', async () => {
    const user = userEvent.setup();
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);

    await user.click(screen.getByText('Ver detalhes técnicos'));
    await user.click(screen.getByText('Ocultar detalhes técnicos'));

    expect(screen.queryByText('stack trace...')).not.toBeInTheDocument();
  });

  // ─── Botão de cópia ──────────────────────────────────────

  it('renderiza botão de cópia quando technicalDetails está presente', () => {
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);
    expect(
      screen.getByTitle('Copiar detalhes'),
    ).toBeInTheDocument();
  });

  it('não renderiza botão de cópia sem technicalDetails', () => {
    render(<ErrorAlert message="Erro" />);
    expect(
      screen.queryByTitle('Copiar detalhes'),
    ).not.toBeInTheDocument();
  });

  it('chama copyErrorDetails ao clicar no botão de cópia', async () => {
    mockCopyErrorDetails.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);

    await user.click(screen.getByTitle('Copiar detalhes'));

    expect(mockCopyErrorDetails).toHaveBeenCalledTimes(1);
    expect(mockCopyErrorDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'Erro',
        technicalDetails: 'stack trace...',
      }),
    );
  });

  it('exibe mensagem "Detalhes copiados" após cópia bem-sucedida', async () => {
    mockCopyErrorDetails.mockResolvedValueOnce(true);
    vi.useFakeTimers();

    render(<ErrorAlert message="Erro" technicalDetails="stack trace..." />);

    // Use fireEvent instead of userEvent — userEvent.setup() hangs with fake timers
    fireEvent.click(screen.getByTitle('Copiar detalhes'));

    // Resolve a promise microtask para que o .then() do mock execute
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Detalhes copiados/i),
    ).toBeInTheDocument();

    // Avança 2s e verifica que a mensagem some
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(
      screen.queryByText(/Detalhes copiados/i),
    ).not.toBeInTheDocument();
  });

  // ─── className customizado ───────────────────────────────

  it('aplica className customizada', () => {
    render(
      <ErrorAlert message="Erro" className="my-custom-class" />,
    );
    const alert = screen.getByText('Erro').closest('div.rounded-lg')!;
    expect(alert).toHaveClass('my-custom-class');
  });
});
