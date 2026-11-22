import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

const avisos = vi.hoisted(() => [] as { id: string }[]);

vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn((id: string) => {
      const i = avisos.findIndex((a) => a.id === id);
      if (i >= 0) avisos.splice(i, 1);
    }),
    getToasts: vi.fn(() => [...avisos]),
    error: vi.fn((_titulo: string, opcoes: { id: string }) => {
      avisos.push({ id: opcoes.id });
      return opcoes.id;
    }),
  },
}));

import { toast } from "sonner";
import { notificarErro, useFecharErrosAoTrocarDeTela } from "../useNotification";

let irPara: (rota: string, replace?: boolean) => void = () => {};
function Sonda() {
  useFecharErrosAoTrocarDeTela();
  const navigate = useNavigate();
  irPara = (rota, replace) => navigate(rota, { replace });
  return null;
}

describe("useFecharErrosAoTrocarDeTela", () => {
  beforeEach(() => {
    avisos.length = 0;
    vi.mocked(toast.dismiss).mockClear();
  });

  it("não fecha nada ao montar; fecha os erros ao mudar de tela, não ao mudar só a busca", () => {
    avisos.push({ id: "erro-app-1" });
    render(<MemoryRouter initialEntries={["/equipamentos"]}><Sonda /></MemoryRouter>);
    expect(toast.dismiss).not.toHaveBeenCalled();

    act(() => irPara("/equipamentos?status=PRONTO"));
    expect(toast.dismiss).not.toHaveBeenCalled();

    act(() => irPara("/clientes"));
    expect(toast.dismiss).toHaveBeenCalledWith("erro-app-1");
  });

  it("erro mostrado logo antes de navegar continua na tela; os anteriores fecham", () => {
    render(<MemoryRouter initialEntries={["/equipamentos/5/editar"]}><Sonda /></MemoryRouter>);
    avisos.push({ id: "erro-app-antigo" });

    let novo = "";
    act(() => {
      novo = `erro-app-${notificarErro("Equipamentos", "Abrir edição", new Error("falhou"), { manterAoTrocarDeTela: true }).id}`;
      irPara("/equipamentos", true);
    });
    expect(toast.dismiss).toHaveBeenCalledWith("erro-app-antigo");
    expect(toast.dismiss).not.toHaveBeenCalledWith(novo);
    expect(avisos.map((a) => a.id)).toEqual([novo]);

    // Na troca seguinte ele fecha como qualquer outro.
    act(() => irPara("/clientes"));
    expect(toast.dismiss).toHaveBeenCalledWith(novo);
    expect(avisos).toEqual([]);
  });
});
