import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommunicationEmailDialog } from "@/components/equipamentos/CommunicationEmailDialog";

describe("CommunicationEmailDialog", () => {
  it("mantém a entrada manual temporária e deixa a caixa de salvar desmarcada", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<CommunicationEmailDialog
      open
      recipient={{ nome: "Empresa Teste", endereco: "", origem: "sem_envio" }}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      onSkip={vi.fn()}
    />);

    expect(screen.getByText("Empresa Teste")).toBeInTheDocument();
    expect(screen.getByText("Sem endereço cadastrado")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.change(screen.getByLabelText("E-mail para este envio"), { target: { value: "manual@empresa.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("manual@empresa.test", false));
  });

  it("não envia quando o e-mail manual é inválido e permite cancelar a comunicação", async () => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn();
    render(<CommunicationEmailDialog
      open
      recipient={{ nome: "Empresa Teste", endereco: "", origem: "sem_envio" }}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      onSkip={onSkip}
    />);

    fireEvent.change(screen.getByLabelText("E-mail para este envio"), { target: { value: "invalido" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/e-mail válido/i);

    fireEvent.click(screen.getByRole("button", { name: /cancelar envio/i }));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
  });
});
