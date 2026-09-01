import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Balcao from "@/pages/Balcao";
import { CounterLayout } from "@/components/CounterLayout";

const db = vi.hoisted(() => ({
  buscarEquipamentosPorSerial: vi.fn(), criarEquipamento: vi.fn(), listarEquipamentos: vi.fn(),
  listarClientes: vi.fn(), atualizarStatusEquipamento: vi.fn(), buscarEquipamento: vi.fn(), salvarVerificacao: vi.fn(), abrirPainelImpressorasWindows: vi.fn(),
}));
const ensureSensitiveAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status: { active_profile_name: "Atendente", unlocked: true }, ensureSensitiveAccess, lockSensitiveAccess: vi.fn(), openProfileSelector: vi.fn() }),
}));
vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: ({ onClienteSelecionado }: { onClienteSelecionado: (client: unknown) => void }) => <button onClick={() => onClienteSelecionado({ id: 9, nome: "Cliente balcão", telefone: "71999999999" })}>Selecionar cliente de teste</button>,
}));
vi.mock("@/components/equipamentos/DocumentosEquipamento", () => ({ DocumentosEquipamento: () => <div>Documentos</div> }));
vi.mock("@/components/equipamentos/PdfPreviewDialog", () => ({ PdfPreviewDialog: () => null }));

function renderCounter() {
  return render(<MemoryRouter initialEntries={["/balcao"]}><Routes><Route element={<CounterLayout onChangeMode={vi.fn()} />}><Route path="/balcao" element={<Balcao />} /></Route></Routes></MemoryRouter>);
}

describe("Modo Balcão", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
    vi.clearAllMocks();
    db.buscarEquipamentosPorSerial.mockResolvedValue([]);
    db.criarEquipamento.mockResolvedValue({ id: 42, serial_number: "SN-42", marca: "Zebra", modelo: "ZD220", tipo: "Impressora", status: "RECEBIDO", data_entrada: "2026-09-01" });
  });

  async function reachReview(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /nova entrada/i }));
    await user.click(screen.getByRole("button", { name: /selecionar cliente/i }));
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    const fields = screen.getAllByRole("textbox");
    await user.type(fields[0]!, "SN-42");
    await user.click(screen.getAllByRole("combobox")[0]!);
    await user.click(await screen.findByRole("option", { name: "Zebra" }));
    await user.type(fields[1]!, "ZD220");
    await user.click(screen.getAllByRole("combobox")[1]!);
    await user.click(await screen.findByRole("option", { name: /código de barra/i }));
    await user.type(fields[3]!, "Não imprime etiquetas");
    await user.click(screen.getByRole("button", { name: /continuar para o laudo/i }));
    await user.click(screen.getByRole("button", { name: /recapitular/i }));
  }

  it("cria uma entrada recebida depois da conferência", async () => {
    const user = userEvent.setup(); renderCounter(); await reachReview(user);
    await user.click(screen.getByRole("button", { name: /salvar como recebido/i }));
    await waitFor(() => expect(db.criarEquipamento).toHaveBeenCalledWith(expect.objectContaining({ status: "RECEBIDO", cliente_id: 9, serial_number: "SN-42" })));
    expect(await screen.findByText(/entrada registrada/i)).toBeInTheDocument();
  });

  it("exige confirmação para serial com ciclo anterior", async () => {
    db.buscarEquipamentosPorSerial.mockResolvedValue([{ id: 1, serial_number: "SN-42", marca: "Zebra", modelo: "ZD220", tipo: "Impressora" }]);
    const user = userEvent.setup(); renderCounter(); await reachReview(user);
    await user.click(screen.getByRole("button", { name: /salvar como recebido/i }));
    expect(await screen.findByText(/confirme a criação de um novo ciclo/i)).toBeInTheDocument();
    expect(db.criarEquipamento).not.toHaveBeenCalled();
  });

  it("preserva a conferência quando o backend falha", async () => {
    db.criarEquipamento.mockRejectedValue(new Error("Banco indisponível"));
    const user = userEvent.setup(); renderCounter(); await reachReview(user);
    await user.click(screen.getByRole("button", { name: /salvar como recebido/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Banco indisponível");
    expect(screen.getByText("Recapitulação")).toBeInTheDocument();
  });

  it("não entrega quando o PIN é negado e mantém o detalhe aberto", async () => {
    db.listarEquipamentos.mockResolvedValue([{ id: 8, serial_number: "SN-8", marca: "Zebra", modelo: "ZD220", tipo: "Impressora", status: "PRONTO", data_entrada: "2026-09-01", atualizado_em: "token" }]);
    ensureSensitiveAccess.mockResolvedValue(false);
    const user = userEvent.setup(); renderCounter();
    await user.click(screen.getByRole("button", { name: /buscar equipamento/i }));
    await user.type(screen.getByRole("textbox"), "SN-8");
    await waitFor(() => expect(screen.getByText(/atendimento #8/i)).toBeInTheDocument());
    await user.click(screen.getByText(/atendimento #8/i));
    await user.click(screen.getByRole("button", { name: /marcar como entregue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não foi autorizada");
    expect(screen.getByText("Zebra ZD220")).toBeInTheDocument();
    expect(db.atualizarStatusEquipamento).not.toHaveBeenCalled();
  });

  it("bloqueia retirada em transição inválida", async () => {
    db.listarEquipamentos.mockResolvedValue([{ id: 7, serial_number: "SN-7", marca: "Zebra", modelo: "ZD220", tipo: "Impressora", status: "RECEBIDO", data_entrada: "2026-09-01" }]);
    const user = userEvent.setup(); renderCounter();
    await user.click(screen.getByRole("button", { name: /buscar equipamento/i }));
    await user.type(screen.getByRole("textbox"), "SN-7");
    await waitFor(() => expect(screen.getByText(/atendimento #7/i)).toBeInTheDocument());
    await user.click(screen.getByText(/atendimento #7/i));
    expect(screen.getByRole("button", { name: /marcar como entregue/i })).toBeDisabled();
    expect(screen.getByText(/só é permitida em um status compatível/i)).toBeInTheDocument();
  });

  it("registra o laudo imediato e abre o painel de impressoras do Windows", async () => {
    db.abrirPainelImpressorasWindows.mockResolvedValue(undefined);
    db.salvarVerificacao.mockResolvedValue({ id: 3 });
    const user = userEvent.setup(); renderCounter();
    await user.click(screen.getByRole("button", { name: /nova entrada/i }));
    await user.click(screen.getByRole("button", { name: /selecionar cliente/i }));
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    const fields = screen.getAllByRole("textbox");
    await user.type(fields[0]!, "SN-42");
    await user.click(screen.getAllByRole("combobox")[0]!);
    await user.click(await screen.findByRole("option", { name: "Zebra" }));
    await user.type(fields[1]!, "ZD220");
    await user.click(screen.getAllByRole("combobox")[1]!);
    await user.click(await screen.findByRole("option", { name: /código de barra/i }));
    await user.type(fields[3]!, "Não imprime etiquetas");
    await user.click(screen.getByRole("button", { name: /continuar para o laudo/i }));
    await user.click(screen.getByRole("button", { name: /abrir painel de controle/i }));
    expect(db.abrirPainelImpressorasWindows).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /impresso corretamente/i }));
    await user.type(screen.getByRole("textbox"), "Etiqueta de teste legível.");
    await user.click(screen.getByRole("button", { name: /recapitular/i }));
    await user.click(screen.getByRole("button", { name: /salvar como recebido/i }));
    await waitFor(() => expect(db.salvarVerificacao).toHaveBeenCalledWith(expect.objectContaining({
      diagnostico: expect.stringContaining("Etiqueta de teste legível."),
      observacoes: expect.stringContaining("Impresso corretamente"),
    })));
  });
});
