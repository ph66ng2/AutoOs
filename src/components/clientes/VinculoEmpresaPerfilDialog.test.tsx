import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VinculoEmpresaPerfilDialog } from "./VinculoEmpresaPerfilDialog";

describe("VinculoEmpresaPerfilDialog", () => {
  it("permite vincular a única empresa ativa com PIN explícito", () => {
    const onConfirm = vi.fn();
    render(
      <VinculoEmpresaPerfilDialog
        open
        previa={{ perfil_id: 1, perfil_nome: "Administrador Local", empresas_ativas: [{ id: 7, nome: "AutoOS", email: "admin@autoos.test" }] }}
        loading={false}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    const action = screen.getByRole("button", { name: "Vincular e continuar" });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText("PIN do administrador *"), { target: { value: "2468" } });
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledWith({ empresa_id: 7 }, "2468");
  });

  it("exige nome e email explícitos ao cadastrar a empresa interna", () => {
    const onConfirm = vi.fn();
    render(
      <VinculoEmpresaPerfilDialog
        open
        previa={{ perfil_id: 1, perfil_nome: "Administrador Local", empresas_ativas: [] }}
        loading={false}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email administrativo *"), { target: { value: "admin@autoos.test" } });
    fireEvent.change(screen.getByLabelText("PIN do administrador *"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular e continuar" }));
    expect(onConfirm).toHaveBeenCalledWith({
      nova_empresa_nome: "AutoOS",
      nova_empresa_email: "admin@autoos.test",
      nova_empresa_cnpj: undefined,
    }, "2468");
  });
});
