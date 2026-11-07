import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfilePermissions } from "@/components/ProfilePermissions";
import { perfilCompativel056, PERMISSOES_056 } from "@/lib/compatibilidade-056";
import { SENSITIVE_PERMISSIONS, type SensitivePermission } from "@/types";

const AVISO = /até todos os computadores atualizarem para a 0\.6\.0/;

describe("ProfilePermissions com a trava 0.5.6", () => {
  it("só oferece permissões aceitas pela 0.5.6 e mostra o aviso", () => {
    render(<ProfilePermissions permissions={[]} onChange={vi.fn()} role="CUSTOM" travaAtiva />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(PERMISSOES_056.length);
    expect(screen.queryByLabelText(/Portal do Cliente/)).toBeNull();
    expect(screen.queryByLabelText(/Elaborar e enviar/)).toBeNull();
    expect(screen.getByText(AVISO)).toBeTruthy();
  });

  it("toda permissão oferecida é compatível", () => {
    render(<ProfilePermissions permissions={[]} onChange={vi.fn()} role="CUSTOM" travaAtiva />);
    for (const permission of Object.values(SENSITIVE_PERMISSIONS)) {
      if (PERMISSOES_056.includes(permission)) {
        expect(perfilCompativel056("CUSTOM", [permission], true).ok).toBe(true);
      }
    }
  });

  it("permissão nova já existente aparece marcada e pode ser desmarcada", () => {
    const onChange = vi.fn();
    render(
      <ProfilePermissions
        permissions={["STOCK_CONTROL", "PREPARE_QUOTES"] as SensitivePermission[]}
        onChange={onChange}
        role="CUSTOM"
        travaAtiva
      />,
    );
    const box = screen.getByLabelText(/Elaborar e enviar/);
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(["STOCK_CONTROL"]);
  });

  it("ADMIN e trava desligada oferecem tudo, sem aviso", () => {
    const total = Object.values(SENSITIVE_PERMISSIONS).length;
    const { unmount } = render(<ProfilePermissions permissions={[]} onChange={vi.fn()} role="ADMIN" travaAtiva />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(total);
    expect(screen.queryByText(AVISO)).toBeNull();
    unmount();
    render(<ProfilePermissions permissions={[]} onChange={vi.fn()} role="CUSTOM" travaAtiva={false} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(total);
  });
});
