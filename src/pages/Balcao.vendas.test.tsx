import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Balcao from "@/pages/Balcao";
import { CounterLayout } from "@/components/CounterLayout";

const db = vi.hoisted(() => ({
  listarEquipamentosPaginados: vi.fn(),
  listarEquipamentos: vi.fn(),
  listarOrcamentosInsumos: vi.fn(),
  obterOrcamentoInsumos: vi.fn(),
  marcarOrcamentoInsumosEntregue: vi.fn(),
}));
const acesso = vi.hoisted(() => ({ ensureSensitiveAccess: vi.fn(), hasPermission: vi.fn(() => true), openProfileSelector: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    status: { active_profile_name: "Marina Alves", unlocked: true },
    ensureSensitiveAccess: acesso.ensureSensitiveAccess,
    hasPermission: acesso.hasPermission,
    lockSensitiveAccess: vi.fn(),
    openProfileSelector: acesso.openProfileSelector,
  }),
}));
vi.mock("@/components/equipamentos/DocumentosEquipamento", () => ({ DocumentosEquipamento: () => <div>Documentos</div> }));

const equipamentoPronto = {
  id: 5, serial_number: "L42-55102", marca: "Elgin", modelo: "L42 Pro", tipo: "Impressora", status: "PRONTO",
  data_entrada: "2026-11-01", atualizado_em: "2026-11-10 12:00:00+00", cliente_nome: "Farmácia Vida", valor_orcamento: 320,
};
function venda(id: number, numero: number, status: string) {
  return {
    id, empresa_id: 1, numero, numero_exibicao: `OI-${numero}`, cliente_id: 3, cliente_nome: "Farmácia Vida", status,
    desconto: 0, valor_subtotal: 598, valor_total: 598, forma_pagamento_codigo: status === "APROVADO" ? "PIX" : null,
    criado_em: "2026-11-05 12:00:00+00", atualizado_em: "2026-11-12 13:40:00+00", decidido_em: status === "APROVADO" ? "2026-11-12 13:40:00+00" : null,
    total_itens: 1, categorias_itens: "ribbon",
  };
}
const detalhe = {
  ...venda(32, 32, "APROVADO"), contato_nome: "Caio Nunes", contato_telefone: "11977665544",
  itens: [{ id: 1, orcamento_id: 32, produto_id: 9, descricao: "Ribbon resina 110x300", categoria: "RIBBON", quantidade: 13, valor_unitario: 46, valor_total: 598 }],
};

function renderBalcao() {
  return render(
    <MemoryRouter initialEntries={["/balcao"]}>
      <Routes>
        <Route element={<CounterLayout onChangeMode={vi.fn()} />}>
          <Route path="/balcao" element={<Balcao />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Balcão: entregar venda de insumos (V.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acesso.hasPermission.mockReturnValue(true);
    acesso.ensureSensitiveAccess.mockResolvedValue(true);
    db.listarEquipamentosPaginados.mockImplementation(async (_b: unknown, status?: string) =>
      status === "PRONTO" ? { items: [equipamentoPronto], total: 4 } : { items: [], total: 0 },
    );
    db.listarOrcamentosInsumos.mockImplementation(async ({ status, busca }: { status?: string; busca?: string }) => {
      if (status === "APROVADO") return { items: [venda(32, 32, "APROVADO")], total: 1 };
      if (busca) return { items: [venda(32, 32, "APROVADO"), venda(35, 35, "ENVIADO"), venda(30, 30, "ENTREGUE")], total: 3 };
      return { items: [], total: 0 };
    });
    db.listarEquipamentos.mockResolvedValue([]);
    db.obterOrcamentoInsumos.mockResolvedValue(detalhe);
    db.marcarOrcamentoInsumosEntregue.mockResolvedValue({ ...detalhe, status: "ENTREGUE" });
  });

  it("o bloco soma equipamentos prontos e vendas aprovadas, e a fila mostra a etiqueta e a forma de pagamento", async () => {
    renderBalcao();
    expect(await screen.findByRole("button", { name: /Entregar ao cliente.*5/ })).toBeInTheDocument();
    const fila = screen.getByRole("heading", { name: "Prontos para retirada" }).closest("section")!;
    expect(within(fila).getByText("Insumos")).toBeInTheDocument();
    expect(within(fila).getByText("R$ 598,00 · Pix")).toBeInTheDocument();
    expect(within(fila).queryByText(/a receber|pago\b/i)).not.toBeInTheDocument();
  });

  it("busca por OI-n mostra a venda aprovada com botão e a não aprovada com o motivo; o filtro Insumos separa", async () => {
    const usuario = userEvent.setup();
    renderBalcao();
    await usuario.click(await screen.findByRole("button", { name: /Entregar ao cliente/ }));
    await usuario.type(screen.getByLabelText("Quem veio buscar?"), "OI-3");
    expect(await screen.findByText(/OI-35 · 1 item · ribbon · Enviado/)).toBeInTheDocument();
    expect(screen.getByText("Ainda não dá para entregar: o cliente não aprovou este orçamento.")).toBeInTheDocument();
    expect(screen.queryByText(/OI-30/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Registrar Entrega" })).toHaveLength(1);
    await usuario.click(screen.getByRole("button", { name: /^Equipamentos/ }));
    expect(screen.queryByText(/OI-32/)).not.toBeInTheDocument();
  });

  it("entregar confirma, pede o PIN com Ações financeiras e chama o mesmo marcar entregue", async () => {
    const usuario = userEvent.setup();
    renderBalcao();
    const fila = (await screen.findByRole("heading", { name: "Prontos para retirada" })).closest("section")!;
    await within(fila).findByText("Insumos");
    const linhaVenda = within(fila).getByText("Insumos").closest("li")!;
    await usuario.click(within(linhaVenda).getByRole("button", { name: "Registrar Entrega" }));

    expect(await screen.findByText("O que o cliente leva")).toBeInTheDocument();
    expect(screen.getByText("13 × Ribbon resina 110x300")).toBeInTheDocument();
    expect(screen.getByText("Pix · escolhido na aprovação")).toBeInTheDocument();
    expect(screen.getByText(/não registra se o pagamento foi recebido/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Registrar entrega" }));
    const confirmacao = await screen.findByRole("dialog", { name: "Entregar OI-32 para Farmácia Vida?" });
    expect(db.marcarOrcamentoInsumosEntregue).not.toHaveBeenCalled();
    await usuario.click(within(confirmacao).getByRole("button", { name: "Confirmar entrega" }));

    expect(acesso.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    expect(db.marcarOrcamentoInsumosEntregue).toHaveBeenCalledWith(32, "2026-11-12 13:40:00+00");
    expect(await screen.findByRole("heading", { name: "OI-32 entregue" })).toBeInTheDocument();
  });

  it("PIN negado não entrega", async () => {
    acesso.ensureSensitiveAccess.mockResolvedValue(false);
    const usuario = userEvent.setup();
    renderBalcao();
    const fila = (await screen.findByRole("heading", { name: "Prontos para retirada" })).closest("section")!;
    const linhaVenda = (await within(fila).findByText("Insumos")).closest("li")!;
    fireEvent.click(within(linhaVenda).getByRole("button", { name: "Registrar Entrega" }));
    await usuario.click(await screen.findByRole("button", { name: "Registrar entrega" }));
    await usuario.click(await screen.findByRole("button", { name: "Confirmar entrega" }));
    expect(await screen.findByText("A entrega não foi autorizada.")).toBeInTheDocument();
    expect(db.marcarOrcamentoInsumosEntregue).not.toHaveBeenCalled();
  });

  it("perfil sem Ações financeiras vê o motivo e não tem o botão de entregar", async () => {
    acesso.hasPermission.mockReturnValue(false);
    const usuario = userEvent.setup();
    renderBalcao();
    const fila = (await screen.findByRole("heading", { name: "Prontos para retirada" })).closest("section")!;
    const linhaVenda = (await within(fila).findByText("Insumos")).closest("li")!;
    await usuario.click(within(linhaVenda).getByRole("button", { name: "Registrar Entrega" }));
    expect(await screen.findByText("Este perfil não pode registrar entregas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar entrega" })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Trocar perfil" }));
    expect(acesso.openProfileSelector).toHaveBeenCalled();
  });
});
