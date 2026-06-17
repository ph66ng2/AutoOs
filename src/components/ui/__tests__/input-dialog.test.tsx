/**
 * Testes do componente InputDialog
 *
 * Verifica renderização com input/label, digitação,
 * confirmação via Enter e validação.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputDialog } from '../input-dialog';

describe('InputDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Renomear',
    description: 'Digite o novo nome',
    label: 'Nome',
    placeholder: 'Digite aqui...',
    confirmLabel: 'Salvar',
    cancelLabel: 'Fechar',
    onConfirm: vi.fn(),
  };

  // ─── Renderização ────────────────────────────────────────

  it('renderiza com título, descrição, label e input', () => {
    render(<InputDialog {...defaultProps} />);

    expect(screen.getByText('Renomear')).toBeInTheDocument();
    expect(screen.getByText('Digite o novo nome')).toBeInTheDocument();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Digite aqui...'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Salvar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fechar' }),
    ).toBeInTheDocument();
  });

  it('não renderiza descrição quando não fornecida', () => {
    const props = { ...defaultProps };
    delete (props as Partial<typeof defaultProps>).description;

    render(<InputDialog {...props} />);

    expect(screen.queryByText('Digite o novo nome')).not.toBeInTheDocument();
  });

  // ─── Digitação ───────────────────────────────────────────

  it('inicia com defaultValue', () => {
    render(<InputDialog {...defaultProps} defaultValue="valor inicial" />);

    const input = screen.getByPlaceholderText('Digite aqui...');
    expect(input).toHaveValue('valor inicial');
  });

  it('atualiza valor ao digitar', async () => {
    const user = userEvent.setup();
    render(<InputDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'novo valor');

    expect(input).toHaveValue('novo valor');
  });

  // ─── Confirmação ─────────────────────────────────────────

  it('chama onConfirm com o valor e fecha ao clicar em Confirmar', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <InputDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'novo nome');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onConfirm).toHaveBeenCalledWith('novo nome');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('confirma ao pressionar Enter no input', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <InputDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'novo nome');
    await user.keyboard('{Enter}');

    expect(onConfirm).toHaveBeenCalledWith('novo nome');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ─── Validação ───────────────────────────────────────────

  it('exibe erro de validação quando validate retorna mensagem', async () => {
    const validate = vi.fn((value: string) =>
      value.length < 5 ? 'Mínimo 5 caracteres' : null,
    );
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <InputDialog
        {...defaultProps}
        validate={validate}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // Deve exibir a mensagem de erro
    expect(screen.getByText('Mínimo 5 caracteres')).toBeInTheDocument();

    // onConfirm não deve ser chamado (validação falhou)
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('permite confirmação quando validate retorna null', async () => {
    const validate = vi.fn((_value: string) => null);
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <InputDialog
        {...defaultProps}
        validate={validate}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onConfirm).toHaveBeenCalledWith('abc');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('limpa erro de validação ao alterar o valor', async () => {
    const validate = vi.fn((value: string) =>
      value.length < 5 ? 'Mínimo 5 caracteres' : null,
    );
    const user = userEvent.setup();

    render(
      <InputDialog {...defaultProps} validate={validate} onConfirm={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // Erro visível
    expect(screen.getByText('Mínimo 5 caracteres')).toBeInTheDocument();

    // Altera o valor — erro deve sumir
    await user.type(input, 'de');
    expect(screen.queryByText('Mínimo 5 caracteres')).not.toBeInTheDocument();
  });

  // ─── Reset ao reabrir ────────────────────────────────────

  it('reseta valor e erro quando o diálogo abre', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const validate = vi.fn((value: string) =>
      value.length < 3 ? 'Muito curto' : null,
    );

    const { rerender } = render(
      <InputDialog
        {...defaultProps}
        open={true}
        defaultValue=""
        validate={validate}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByPlaceholderText('Digite aqui...');
    await user.type(input, 'ab');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // Erro visível
    expect(screen.getByText('Muito curto')).toBeInTheDocument();

    // Fecha e reabre
    rerender(
      <InputDialog
        {...defaultProps}
        open={false}
        defaultValue=""
        validate={validate}
        onConfirm={onConfirm}
      />,
    );
    rerender(
      <InputDialog
        {...defaultProps}
        open={true}
        defaultValue=""
        validate={validate}
        onConfirm={onConfirm}
      />,
    );

    // O input deve estar vazio (resetado) e sem erro
    await waitFor(() => {
      const freshInput = screen.getByPlaceholderText('Digite aqui...');
      expect(freshInput).toHaveValue('');
      expect(screen.queryByText('Muito curto')).not.toBeInTheDocument();
    });
  });
});
