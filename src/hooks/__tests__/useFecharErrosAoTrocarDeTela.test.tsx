import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

vi.mock("sonner", () => ({
  toast: { dismiss: vi.fn(), getToasts: vi.fn(() => [{ id: "erro-app-1" }]) },
}));

import { toast } from "sonner";
import { useFecharErrosAoTrocarDeTela } from "../useNotification";

let irPara: (rota: string) => void = () => {};
function Sonda() {
  useFecharErrosAoTrocarDeTela();
  const navigate = useNavigate();
  irPara = (rota) => navigate(rota);
  return null;
}

describe("useFecharErrosAoTrocarDeTela", () => {
  it("não fecha nada ao montar; fecha os erros ao mudar de tela, não ao mudar só a busca", () => {
    render(<MemoryRouter initialEntries={["/equipamentos"]}><Sonda /></MemoryRouter>);
    expect(toast.dismiss).not.toHaveBeenCalled();

    act(() => irPara("/equipamentos?status=PRONTO"));
    expect(toast.dismiss).not.toHaveBeenCalled();

    act(() => irPara("/clientes"));
    expect(toast.dismiss).toHaveBeenCalledWith("erro-app-1");
  });
});
