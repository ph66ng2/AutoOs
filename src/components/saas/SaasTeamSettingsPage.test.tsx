import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaasTeamSettingsPage } from "@/components/saas/SaasTeamSettingsPage";
import type { SaasCompanyUser, SaasOperationalProfileOption, SupabaseSaasUsersRepository } from "@/lib/data/saas-users-repository";
import type { SaasSession } from "@/types/saas-auth";

type TeamRepository = Pick<
  SupabaseSaasUsersRepository,
  "listUsers" | "listActiveProfiles" | "invite" | "resendInvite" | "changeProfile" | "deactivate" | "reactivate"
>;

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ADMIN_ID = "a0000000-0000-4000-8000-000000000011";
const PROFILE_TECH_ID = "a0000000-0000-4000-8000-000000000014";
const PENDING_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTIVE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INACTIVE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const session: SaasSession = {
  accessToken: "admin-jwt",
  refreshToken: "admin-refresh",
  expiresAt: 1_900_000_000,
  identity: {
    userId: ADMIN_ID,
    companyId: "b0000000-0000-4000-8000-000000000001",
    profileId: PROFILE_ADMIN_ID,
    email: "admin@example.test",
  },
  profile: { id: PROFILE_ADMIN_ID, name: "Admin", role: "ADMIN", permissions: [] },
};

const profiles: SaasOperationalProfileOption[] = [
  { id: PROFILE_ADMIN_ID, name: "Administrador", role: "ADMIN", permissions: [] },
  { id: PROFILE_TECH_ID, name: "Técnico", role: "TECNICO", permissions: ["CLIENTS_READ"] },
];

const adminUser: SaasCompanyUser = {
  user_id: ADMIN_ID,
  email: "admin@example.test",
  profile_id: PROFILE_ADMIN_ID,
  profile_name: "Administrador",
  profile_role: "ADMIN",
  profile_active: true,
  status: "active",
  legacy_admin: false,
  invited_at: null,
  updated_at: "2026-09-23T12:00:00Z",
};

const pendingUser: SaasCompanyUser = {
  user_id: PENDING_ID,
  email: "pendente@example.test",
  profile_id: PROFILE_TECH_ID,
  profile_name: "Técnico",
  profile_role: "TECNICO",
  profile_active: true,
  status: "pending",
  legacy_admin: false,
  invited_at: "2026-09-23T10:00:00Z",
  updated_at: "2026-09-23T10:00:00Z",
};

const activeUser: SaasCompanyUser = {
  ...pendingUser,
  user_id: ACTIVE_ID,
  email: "ativo@example.test",
  status: "active",
};

const inactiveUser: SaasCompanyUser = {
  ...activeUser,
  user_id: INACTIVE_ID,
  email: "inativo@example.test",
  status: "inactive",
};

function makeRepository(users: SaasCompanyUser[] = [adminUser, pendingUser, activeUser, inactiveUser]): TeamRepository {
  const listUsers = vi.fn<TeamRepository["listUsers"]>().mockResolvedValue(users);
  const listActiveProfiles = vi.fn<TeamRepository["listActiveProfiles"]>().mockResolvedValue(profiles);
  const invite = vi.fn<TeamRepository["invite"]>().mockResolvedValue({ status: "pending", userId: PENDING_ID });
  const resendInvite = vi.fn<TeamRepository["resendInvite"]>().mockResolvedValue({ status: "pending", userId: PENDING_ID, resent: true });
  const changeProfile = vi.fn<TeamRepository["changeProfile"]>().mockResolvedValue({ status: "active" });
  const deactivate = vi.fn<TeamRepository["deactivate"]>().mockResolvedValue({ status: "inactive" });
  const reactivate = vi.fn<TeamRepository["reactivate"]>().mockResolvedValue({ status: "active" });
  return { listUsers, listActiveProfiles, invite, resendInvite, changeProfile, deactivate, reactivate };
}

async function renderPage(repository: TeamRepository) {
  const user = userEvent.setup();
  render(<SaasTeamSettingsPage session={session} repository={repository} />);
  await screen.findByRole("textbox", { name: "E-mail do funcionário" });
  return user;
}

describe("SaasTeamSettingsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the server list, status, profiles, and pending invitation actions", async () => {
    const repository = makeRepository();
    await renderPage(repository);

    expect(screen.getByRole("heading", { name: "Equipe e Acessos" })).toBeInTheDocument();
    expect(screen.getByText("pendente@example.test")).toBeInTheDocument();
    expect(screen.getByText("Convite pendente")).toBeInTheDocument();
    expect(screen.getByText("inativo@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar" })).toBeInTheDocument();
    expect(repository.listUsers).toHaveBeenCalledOnce();
    expect(repository.listActiveProfiles).toHaveBeenCalledOnce();
  });

  it("preserves the invite form when the server rejects the invitation", async () => {
    const repository = makeRepository([]);
    vi.mocked(repository.invite).mockRejectedValueOnce(new Error("A operação pode remover o último ADMIN ativo."));
    const user = await renderPage(repository);

    const email = screen.getByRole("textbox", { name: "E-mail do funcionário" });
    await user.type(email, "novo@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByText(/último ADMIN ativo/)).toBeInTheDocument();
    expect(email).toHaveValue("novo@example.test");
  });

  it("clears the email and refreshes the server list only after an invite succeeds", async () => {
    const repository = makeRepository([]);
    const invitedUser = { ...pendingUser, email: "novo@example.test" };
    vi.mocked(repository.listUsers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invitedUser]);
    const user = await renderPage(repository);

    const email = screen.getByRole("textbox", { name: "E-mail do funcionário" });
    await user.type(email, "novo@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(await within(screen.getByRole("table")).findByText("novo@example.test")).toBeInTheDocument();
    expect(email).toHaveValue("");
    expect(repository.invite).toHaveBeenCalledWith("novo@example.test", PROFILE_ADMIN_ID);
    expect(repository.listUsers).toHaveBeenCalledTimes(2);
  });

  it("resends a pending invitation and shows a server-confirmed result", async () => {
    const repository = makeRepository([pendingUser]);
    const user = await renderPage(repository);

    await user.click(screen.getByRole("button", { name: "Reenviar" }));

    expect(repository.resendInvite).toHaveBeenCalledWith(PENDING_ID);
    expect(await screen.findByRole("status")).toHaveTextContent("Convite reenviado para pendente@example.test");
  });

  it("requires confirmation before changing profile and does not apply optimistic state", async () => {
    const repository = makeRepository([activeUser]);
    vi.mocked(repository.listUsers)
      .mockResolvedValueOnce([activeUser])
      .mockResolvedValueOnce([{ ...activeUser, profile_id: PROFILE_ADMIN_ID, profile_name: "Administrador", profile_role: "ADMIN" }]);
    const user = await renderPage(repository);
    const profile = screen.getByRole("combobox", { name: "Perfil de ativo@example.test" });

    await user.selectOptions(profile, PROFILE_ADMIN_ID);
    await user.click(screen.getByRole("button", { name: "Salvar perfil de ativo@example.test" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(repository.changeProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Alterar perfil" }));
    await waitFor(() => expect(repository.changeProfile).toHaveBeenCalledWith(ACTIVE_ID, PROFILE_ADMIN_ID));
    await waitFor(() => expect(profile).toHaveValue(PROFILE_ADMIN_ID));
    expect(repository.listUsers).toHaveBeenCalledTimes(2);
  });

  it("confirms deactivation and displays the state returned by the server", async () => {
    const repository = makeRepository([activeUser]);
    vi.mocked(repository.listUsers)
      .mockResolvedValueOnce([activeUser])
      .mockResolvedValueOnce([{ ...activeUser, status: "inactive" }]);
    const user = await renderPage(repository);

    await user.click(screen.getByRole("button", { name: "Inativar" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("perderá o acesso à empresa imediatamente");
    expect(repository.deactivate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Inativar acesso" }));

    await waitFor(() => expect(repository.deactivate).toHaveBeenCalledWith(ACTIVE_ID));
    expect(await screen.findByText("Inativo")).toBeInTheDocument();
  });

  it("confirms reactivation and keeps it unavailable when its profile is inactive", async () => {
    const inactiveProfile = { ...inactiveUser, profile_active: false };
    const repository = makeRepository([inactiveProfile]);
    const user = await renderPage(repository);

    expect(screen.getByRole("button", { name: "Reativar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reativar" })).toHaveAttribute("title", "Ative o perfil antes de reativar o usuário.");
  });

  it("confirms reactivation when the assigned profile is active", async () => {
    const repository = makeRepository([inactiveUser]);
    vi.mocked(repository.listUsers)
      .mockResolvedValueOnce([inactiveUser])
      .mockResolvedValueOnce([{ ...inactiveUser, status: "active" }]);
    const user = await renderPage(repository);

    await user.click(screen.getByRole("button", { name: "Reativar" }));
    await user.click(screen.getByRole("button", { name: "Reativar acesso" }));

    await waitFor(() => expect(repository.reactivate).toHaveBeenCalledWith(INACTIVE_ID));
    expect(await screen.findByText("Ativo")).toBeInTheDocument();
  });

  it("allows an active user with an inactive profile to move to an active profile", async () => {
    const blockedProfileUser = {
      ...activeUser,
      profile_id: "a0000000-0000-4000-8000-000000000099",
      profile_name: "Perfil antigo",
      profile_active: false,
    };
    const repository = makeRepository([blockedProfileUser]);
    const user = await renderPage(repository);
    const profile = screen.getByRole("combobox", { name: "Perfil de ativo@example.test" });
    const save = screen.getByRole("button", { name: "Salvar perfil de ativo@example.test" });

    expect(profile).toBeEnabled();
    await user.selectOptions(profile, PROFILE_ADMIN_ID);
    await user.click(save);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alterar perfil" }));

    await waitFor(() => expect(repository.changeProfile).toHaveBeenCalledWith(ACTIVE_ID, PROFILE_ADMIN_ID));
  });
});
