/**
 * Testes do componente ConfirmDialog
 *
 * Verifica renderização condicional (aberto/fechado), callbacks
 * dos botões e variante destructive.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../confirm-dialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirmar ação',
    description: 'Tem certeza?',
    confirmLabel: 'Sim',
    cancelLabel: 'Não',
    onConfirm: vi.fn(),
  };

  // ─── Renderização ────────────────────────────────────────

  it('renderiza o diálogo quando open=true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirmar ação')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não' })).toBeInTheDocument();
  });

  it('usa labels padrão quando não fornecidos', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Título"
        description="Descrição"
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Confirmar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar' }),
    ).toBeInTheDocument();
  });

  // ─── Callbacks ───────────────────────────────────────────

  it('chama onOpenChange(false) ao clicar no botão Cancelar', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Não' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('chama onConfirm ao clicar no botão Confirmar', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog {...defaultProps} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'Sim' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ─── Variante destructive ────────────────────────────────

  it('não aplica classe destructive quando variant=default', () => {
    render(<ConfirmDialog {...defaultProps} variant="default" />);

    const confirmButton = screen.getByRole('button', { name: 'Sim' });
    expect(confirmButton).not.toHaveClass('bg-destructive');
  });

  it('aplica classe bg-destructive quando variant=destructive', () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    const confirmButton = screen.getByRole('button', { name: 'Sim' });
    expect(confirmButton).toHaveClass('bg-destructive');
    expect(confirmButton).toHaveClass('text-destructive-foreground');
  });
});
