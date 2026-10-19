import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { datasDasEtapas, StatusView } from "./StatusView";

const base = {
  equipamento: "Zebra ZT230",
  titulo: "Estamos analisando seu equipamento",
  orientacao: "Aguarde.",
  statusAlteradoEm: "2026-10-01T12:00:00.000Z",
};

describe("StatusView sem dados do portal (link antigo #/c/)", () => {
  it("renderiza como antes: sem botões nas etapas e sem tooltips", () => {
    render(<StatusView {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Estamos analisando seu equipamento" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Etapas do atendimento" });
    expect(within(nav).getByText("Etapas do atendimento")).toBeInTheDocument();
    expect(within(nav).getAllByRole("listitem")).toHaveLength(6);
    expect(within(nav).queryByRole("button")).toBeNull();
    expect(nav.querySelector(".timeline-when")).toBeNull();
    expect(screen.getByText("Etapa registrada em")).toBeInTheDocument();
    expect(nav.querySelector("[aria-current='step']")).toHaveTextContent("Em verificação");
  });

  it("título de entregue sem `concluido` continua sendo o título original", () => {
    render(<StatusView {...base} titulo="Equipamento entregue" />);
    expect(screen.getByRole("heading", { level: 1, name: "Equipamento entregue" })).toBeInTheDocument();
    expect(screen.queryByText("Atendimento concluído")).toBeNull();
  });

  it("etapas vazias (portal sem registros) também não criam botões", () => {
    render(<StatusView {...base} etapas={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StatusView com etapas do portal", () => {
  const etapas = [
    { status: "RECEBIDO" as const, em: "2026-09-28T12:00:00Z" },
    { status: "EM_VERIFICACAO" as const, em: "2026-09-29T12:00:00Z" },
    { status: "VERIFICADO" as const, em: "2026-09-30T12:00:00Z" },
  ];

  it("agrupa status por etapa usando a primeira data", () => {
    const { porEtapa, desvio } = datasDasEtapas([...etapas, { status: "REPROVADO", em: "2026-10-02T12:00:00Z" }]);
    expect(porEtapa[0]).toBe("2026-09-28T12:00:00Z");
    expect(porEtapa[1]).toBe("2026-09-29T12:00:00Z");
    expect(porEtapa[2]).toBeNull();
    expect(desvio).toBe("2026-10-02T12:00:00Z");
  });

  it("revela a data ao tocar e some ao sair do foco", () => {
    render(<StatusView {...base} etapas={etapas} />);
    const botao = screen.getByRole("button", { name: /Recebido/ });
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(botao.closest("li")).toHaveClass("is-open");
    fireEvent.blur(botao);
    expect(botao).toHaveAttribute("aria-expanded", "false");
  });

  it("concluído: título e todas as etapas marcadas", () => {
    render(<StatusView {...base} titulo="Equipamento entregue" concluido etapas={[{ status: "ENTREGUE", em: "2026-10-05T12:00:00Z" }]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Atendimento concluído" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Etapas do atendimento" });
    expect(nav.querySelectorAll("li.is-complete")).toHaveLength(6);
    expect(nav.querySelector("[aria-current='step']")).toBeNull();
  });
});
