/**
 * Testes do componente FormValidationError
 *
 * Verifica renderização condicional, ícone AlertCircle e estilos.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormValidationError } from '../form-validation-error';

describe('FormValidationError', () => {
  it('retorna null quando message é undefined', () => {
    const { container } = render(<FormValidationError />);
    expect(container.firstChild).toBeNull();
  });

  it('retorna null quando message é string vazia', () => {
    const { container } = render(<FormValidationError message="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza a mensagem quando fornecida', () => {
    render(<FormValidationError message="Campo obrigatório" />);
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('renderiza o ícone AlertCircle', () => {
    const { container } = render(
      <FormValidationError message="Erro de validação" />,
    );
    // O ícone AlertCircle renderiza como um SVG dentro do componente
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('aplica classe de cor vermelha (text-red-500)', () => {
    render(<FormValidationError message="Erro" />);
    const paragraph = screen.getByText('Erro').closest('p');
    expect(paragraph).toHaveClass('text-red-500');
  });

  it('aplica layout flex com gap', () => {
    render(<FormValidationError message="Erro" />);
    const paragraph = screen.getByText('Erro').closest('p');
    expect(paragraph).toHaveClass('flex');
    expect(paragraph).toHaveClass('gap-1');
  });

  it('aplica className customizada', () => {
    render(<FormValidationError message="Erro" className="my-class" />);
    const paragraph = screen.getByText('Erro').closest('p');
    expect(paragraph).toHaveClass('my-class');
  });
});
