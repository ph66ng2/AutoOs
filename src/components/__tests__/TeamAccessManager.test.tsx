import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamAccessManager } from "../TeamAccessManager";
const service = vi.hoisted(() => ({ listProfiles: vi.fn(), updateProfile: vi.fn(), issueAccessCode: vi.fn(), deactivateProfile: vi.fn(), reactivateProfile: vi.fn(), createProfileWithCode: vi.fn() }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: service }));
const profiles = [
  { id: 1, nome: "Paulo", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, pin_required: true, ativo: true },
  { id: 2, nome: "Ivan", role: "TECNICO", permissions: ["STOCK_CONTROL"], pin_configured: false, pin_required: true, ativo: true, onboarding_pendente: true },
  { id: 3, nome: "Maria", role: "ATENDENTE", permissions: [], pin_configured: true, pin_required: true, ativo: false },
];
describe("gestão da equipe", () => {
  beforeEach(() => { vi.resetAllMocks(); service.listProfiles.mockResolvedValue(profiles); });
  it("mostra quem aguarda o primeiro acesso e permite buscar e incluir inativos", async () => {
    const user = userEvent.setup();
    render(<TeamAccessManager activeProfileId={1} onChanged={vi.fn()} />);
    await screen.findByText("Ivan");
    expect(screen.getByText("Aguardando 1º acesso")).toBeInTheDocument();
    expect(screen.queryByText("Maria")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Mostrar inativos"));
    expect(screen.getByText("Maria")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar colaborador"), "Ivan");
    expect(screen.queryByText("Maria")).not.toBeInTheDocument();
    expect(screen.getByText("Ivan")).toBeInTheDocument();
  });
  it("exige PIN administrativo e preserva função e permissões ao editar", async () => {
    const user = userEvent.setup(); const changed = vi.fn().mockResolvedValue(undefined);
    render(<TeamAccessManager activeProfileId={1} onChanged={changed} />);
    await screen.findByText("Ivan");
    await user.click(screen.getAllByRole("button", { name: "Editar", exact: true })[1]);
    await user.click(screen.getByRole("button", { name: "Confirmar alteração" }));
    expect(service.updateProfile).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Seu PIN de administrador"), "1234");
    await user.click(screen.getByRole("button", { name: "Confirmar alteração" }));
    await waitFor(() => expect(service.updateProfile).toHaveBeenCalledWith(2, { nome: "Ivan", role: "TECNICO", permissions: ["STOCK_CONTROL"] }, "1234"));
    expect(changed).toHaveBeenCalledOnce();
  });
  it("sem a trava 0.5.6, reativa perfil sem permissões", async () => {
    const user = userEvent.setup();
    service.reactivateProfile.mockResolvedValue(undefined);
    render(<TeamAccessManager activeProfileId={1} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByText("Ivan");
    await user.click(screen.getByLabelText("Mostrar inativos"));
    await user.click(screen.getByRole("button", { name: "Reativar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar alteração" }));
    await waitFor(() => expect(service.reactivateProfile).toHaveBeenCalled());
    expect(screen.queryByText(/0\.5\.6/)).not.toBeInTheDocument();
  });
  it("cancelar desativação não altera o acesso", async () => {
    const user = userEvent.setup(); render(<TeamAccessManager activeProfileId={1} onChanged={vi.fn()} />);
    await screen.findByText("Ivan");
    await user.click(screen.getAllByRole("button", { name: "Desativar", exact: true })[1]);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(service.deactivateProfile).not.toHaveBeenCalled();
  });
  it("gera novo código só com o PIN do administrador e mostra o código", async () => {
    const user = userEvent.setup();
    service.issueAccessCode.mockResolvedValue({ profile_id: 2, nome: "Ivan", codigo: "ABC-234", expira_em: "2026-10-19T12:00:00Z" });
    render(<TeamAccessManager activeProfileId={1} onChanged={vi.fn()} />);
    await screen.findByText("Ivan");
    await user.click(screen.getAllByRole("button", { name: "Novo código", exact: true })[1]);
    await user.click(screen.getByRole("button", { name: "Gerar código" }));
    expect(service.issueAccessCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Seu PIN de administrador"), "1234");
    await user.click(screen.getByRole("button", { name: "Gerar código" }));
    await waitFor(() => expect(service.issueAccessCode).toHaveBeenCalledWith(2, "1234"));
    expect(await screen.findByText("ABC-234")).toBeInTheDocument();
  });

  it("não fecha o cadastro de perfil enquanto a criação está em andamento", async () => {
    const user = userEvent.setup();
    let concluir!: (valor: { profile_id: number; nome: string; codigo: string; expira_em: string }) => void;
    service.createProfileWithCode.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    render(<TeamAccessManager activeProfileId={1} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByText("Ivan");
    await user.click(screen.getByRole("button", { name: /Novo perfil/ }));
    await user.type(screen.getByLabelText("Nome provisório"), "Nova pessoa");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText("Seu PIN de administrador"), "1234");
    await user.click(screen.getByRole("button", { name: "Criar e gerar código" }));
    expect(await screen.findByRole("button", { name: "Criando..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Criando...")).toBeInTheDocument();
    concluir({ profile_id: 9, nome: "Nova pessoa", codigo: "AAA-111", expira_em: "2026-12-01T00:00:00Z" });
    expect(await screen.findByText("AAA-111")).toBeInTheDocument();
  });
});
