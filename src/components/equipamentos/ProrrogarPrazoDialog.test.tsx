import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProrrogarPrazoDialog } from "@/components/equipamentos/ProrrogarPrazoDialog";
import { dataIsoEmDias } from "@/lib/orcamento-prazo";

const mocks = vi.hoisted(() => ({
  buscar: vi.fn(),
  prorrogar: vi.fn(),
  publicar: vi.fn(),
  ensure: vi.fn(),
  toastOk: vi.fn(),
  toastWarn: vi.fn(),
  enviar: vi.fn(),
}));
vi.mock("@/lib/envio-orcamento", () => ({ prorrogarEEnviar: mocks.enviar }));

vi.mock("@/lib/db", () => ({
  db: {
    buscarEquipamento: mocks.buscar,
    prorrogarPrazoOrcamento: mocks.prorrogar,
    publicarOrcamentoPortal: mocks.publicar,
  },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastOk, warning: mocks.toastWarn } }));

const NOVO_PRAZO = "2099-03-15";

function abrir(enviar = false) {
  const onOpenChange = vi.fn();
  const onConcluido = vi.fn();
  const onEnvioManual = vi.fn();
  render(<ProrrogarPrazoDialog open onOpenChange={onOpenChange} equipamentoId={7} onConcluido={onConcluido} onEnvioManual={onEnvioManual} />);
  fireEvent.change(screen.getByLabelText("Novo prazo de aprovação"), { target: { value: NOVO_PRAZO } });
  if (!enviar) fireEvent.click(screen.getByLabelText(/Enviar o orçamento ao cliente agora/));
  return { onOpenChange, onConcluido, onEnvioManual };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensure.mockResolvedValue(true);
  mocks.buscar.mockResolvedValue({ id: 7, atualizado_em: "t-novo" });
  mocks.prorrogar.mockResolvedValue({ prorrogado: true, respostaPendente: null });
  mocks.publicar.mockResolvedValue({ nova: false, versao: 2 });
});

describe("ProrrogarPrazoDialog", () => {
  it("usa hoje + 7 dias como padrão e hoje como mínimo", () => {
    render(<ProrrogarPrazoDialog open onOpenChange={vi.fn()} equipamentoId={7} onConcluido={vi.fn()} />);
    const campo = screen.getByLabelText("Novo prazo de aprovação");
    expect(campo).toHaveValue(dataIsoEmDias(7));
    expect(campo).toHaveAttribute("min", dataIsoEmDias(0));
  });

  it("prorroga com a data escolhida e depois publica", async () => {
    const { onOpenChange, onConcluido } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));

    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({
      title: "Prorrogar prazo e publicar",
      anyPermission: ["FINANCIAL_ACTIONS", "PREPARE_QUOTES"],
    }));
    expect(mocks.prorrogar).toHaveBeenCalledWith({ equipamentoId: 7, novoPrazo: NOVO_PRAZO, expectedUpdatedEm: "t-novo" });
    expect(mocks.publicar).toHaveBeenCalledWith(7);
    expect(mocks.toastOk).toHaveBeenCalledWith("Prazo prorrogado até 15/03/2099 e orçamento publicado no portal.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("não faz nada se o acesso sensível for negado", async () => {
    mocks.ensure.mockResolvedValue(false);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalled());
    expect(mocks.prorrogar).not.toHaveBeenCalled();
  });

  it("pergunta sobre resposta pendente e repete confirmando", async () => {
    mocks.prorrogar
      .mockResolvedValueOnce({ prorrogado: false, respostaPendente: { decisao: "APROVAR" } })
      .mockResolvedValueOnce({ prorrogado: true, respostaPendente: null });
    const { onConcluido } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));

    expect(await screen.findByText("O cliente já respondeu. Prorrogar anula a resposta pendente. Continuar?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(mocks.prorrogar).toHaveBeenCalledTimes(2);
    expect(mocks.prorrogar).toHaveBeenLastCalledWith({
      equipamentoId: 7, novoPrazo: NOVO_PRAZO, expectedUpdatedEm: "t-novo", confirmarRespostaPendente: true,
    });
    expect(mocks.publicar).toHaveBeenCalledWith(7);
  });

  it("não prorroga se o operador recusar anular a resposta", async () => {
    mocks.prorrogar.mockResolvedValue({ prorrogado: false, respostaPendente: { decisao: "APROVAR" } });
    const { onConcluido } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));

    await screen.findByText(/O cliente já respondeu/);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" }).at(-1)!);

    await waitFor(() => expect(screen.queryByText(/O cliente já respondeu/)).not.toBeInTheDocument());
    expect(mocks.prorrogar).toHaveBeenCalledTimes(1);
    expect(mocks.publicar).not.toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
  });

  it("mostra o erro da prorrogação e não fecha", async () => {
    mocks.prorrogar.mockRejectedValue("Conflito de concorrência");
    const { onOpenChange, onConcluido } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Conflito de concorrência");
    expect(mocks.publicar).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
  });

  it("avisa quando prorrogou mas a publicação falhou", async () => {
    mocks.publicar.mockRejectedValue("Sem contato no portal");
    const { onOpenChange } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Prorrogar e publicar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Prazo prorrogado, mas a publicação falhou: Sem contato no portal",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe("com envio ao cliente", () => {
    it("vem marcado e usa prorrogarEEnviar com a data escolhida", async () => {
      mocks.enviar.mockResolvedValue({
        prorrogado: true, publicado: true, whatsapp: { enviado: true }, email: { enviado: true }, avisos: ["Aviso X"],
      });
      const { onConcluido, onOpenChange } = abrir(true);
      expect(screen.getByLabelText(/Enviar o orçamento ao cliente agora/)).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Prorrogar e enviar" }));

      await waitFor(() => expect(onConcluido).toHaveBeenCalled());
      expect(mocks.enviar).toHaveBeenCalledWith({ id: 7, atualizado_em: "t-novo" }, NOVO_PRAZO, expect.any(Function));
      expect(mocks.prorrogar).not.toHaveBeenCalled();
      expect(mocks.toastOk).toHaveBeenCalledWith(
        "Prazo prorrogado até 15/03/2099, orçamento publicado no portal, WhatsApp enviado, e-mail enviado.",
      );
      expect(mocks.toastWarn).toHaveBeenCalledWith("Aviso X");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("sobe o envio manual por onEnvioManual", async () => {
      const envio = { equipamentoId: 7 };
      mocks.enviar.mockResolvedValue({ prorrogado: true, publicado: true, envioManual: envio, avisos: [] });
      const { onEnvioManual, onConcluido } = abrir(true);
      fireEvent.click(screen.getByRole("button", { name: "Prorrogar e enviar" }));
      await waitFor(() => expect(onConcluido).toHaveBeenCalled());
      expect(onEnvioManual).toHaveBeenCalledWith(envio);
    });

    it("recusar a resposta pendente não envia nem conclui", async () => {
      mocks.enviar.mockImplementation(async (_e: unknown, _d: string, confirmar: () => Promise<boolean>) => {
        const ok = await confirmar();
        return { prorrogado: false, publicado: false, avisos: [], respostaPendenteRecusada: !ok };
      });
      const { onConcluido, onEnvioManual } = abrir(true);
      fireEvent.click(screen.getByRole("button", { name: "Prorrogar e enviar" }));
      await screen.findByText(/O cliente já respondeu/);
      fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" }).at(-1)!);
      await waitFor(() => expect(screen.queryByText(/O cliente já respondeu/)).not.toBeInTheDocument());
      expect(mocks.toastOk).not.toHaveBeenCalled();
      expect(onEnvioManual).not.toHaveBeenCalled();
      expect(onConcluido).not.toHaveBeenCalled();
    });
  });
});
