import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecisaoOrcamentoCard } from "@/components/equipamentos/DecisaoOrcamentoCard";
import type { DecisaoOrcamentoInfo, Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  informada: vi.fn(),
  ensure: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    obterDecisaoOrcamento: mocks.obter,
    registrarDecisaoInformada: mocks.informada,
    criarLinkDecisaoOrcamento: vi.fn(),
    revogarLinkDecisaoOrcamento: vi.fn(),
  },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));

const equipamento = { id: 7, status: "AGUARDANDO_APROVACAO", atualizado_em: "t1" } as Equipamento;

function info(overrides: Partial<DecisaoOrcamentoInfo> = {}): DecisaoOrcamentoInfo {
  return {
    versaoId: 1,
    versao: 1,
    valorTotal: 250,
    criadaEm: "2026-10-14T12:00:00Z",
    aceiteOnlineAtivo: true,
    linkStatus: "ativo",
    historico: [],
    podeAplicar: false,
    ...overrides,
  };
}

const respostaPortal = {
  id: 9,
  origem: "PORTAL" as const,
  decisao: "APROVAR" as const,
  registradaEm: "2026-10-14T14:32:00Z",
};

describe("DecisaoOrcamentoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(true);
  });

  it("mostra a resposta aguardando conferência e só libera a aplicação depois da janela", async () => {
    const onRespostaVista = vi.fn();
    const onAplicar = vi.fn();
    mocks.obter.mockResolvedValue(info({
      resposta: respostaPortal,
      historico: [respostaPortal],
      aplicavelAPartirDe: "2026-10-14T14:47:00Z",
      podeAplicar: false,
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={onRespostaVista} onAplicar={onAplicar} />);

    expect(await screen.findByText(/Cliente respondeu: aprovou — aguardando conferência/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e aplicar decisão/i })).toBeDisabled();
    expect(onRespostaVista).toHaveBeenLastCalledWith(9);
  });

  it("aplica com a decisão do cliente quando a janela terminou", async () => {
    const onAplicar = vi.fn();
    mocks.obter.mockResolvedValue(info({ resposta: respostaPortal, historico: [respostaPortal], podeAplicar: true }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={onAplicar} />);

    const botao = await screen.findByRole("button", { name: /revisar e aplicar decisão/i });
    fireEvent.click(botao);
    expect(onAplicar).toHaveBeenCalledWith("aprovar");
  });

  it("não reporta resposta quando a versão foi encerrada por edição do orçamento", async () => {
    const onRespostaVista = vi.fn();
    mocks.obter.mockResolvedValue(info({
      encerradaMotivo: "ORCAMENTO_ALTERADO",
      resposta: respostaPortal,
      historico: [respostaPortal],
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={onRespostaVista} onAplicar={vi.fn()} />);

    await waitFor(() => expect(onRespostaVista).toHaveBeenCalledWith(0));
    expect(screen.queryByRole("button", { name: /revisar e aplicar decisão/i })).not.toBeInTheDocument();
  });

  it("registra decisão informada à equipe somente após a liberação com PIN", async () => {
    mocks.obter.mockResolvedValue(null);
    mocks.informada.mockResolvedValue(undefined);
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /cliente recusou/i }));
    await waitFor(() => expect(mocks.informada).toHaveBeenCalledWith(7, "RECUSAR"));

    mocks.informada.mockClear();
    mocks.ensure.mockResolvedValue(false);
    fireEvent.click(screen.getByRole("button", { name: /cliente aprovou/i }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalledTimes(2));
    expect(mocks.informada).not.toHaveBeenCalled();
  });
});
