import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HistoricoOs } from "./HistoricoOs";
import type { EquipamentoHistoricoEvento } from "@/types";

const eventos: EquipamentoHistoricoEvento[] = [
  { tipo: "ETAPA", data: "2026-11-08T10:00:00Z", status: "RECEBIDO", motivo: "Entrada registrada", autor: "Marina" },
  { tipo: "MUDANCA_STATUS", data: "2026-11-09T10:00:00Z", status_anterior: "RECEBIDO", status: "EM_VERIFICACAO", motivo: "Início da verificação" },
];

describe("HistoricoOs", () => {
  it("abre o evento mais recente e alterna os outros pelo cabeçalho, que é um botão só", () => {
    render(<HistoricoOs eventos={eventos} />);
    const botoes = screen.getAllByRole("button");
    expect(botoes).toHaveLength(2);
    expect(botoes[1]).toHaveAttribute("aria-expanded", "true");
    expect(botoes[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Início da verificação")).toBeVisible();

    fireEvent.click(botoes[0]);
    expect(botoes[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Registrado por Marina")).toBeInTheDocument();
    const corpo = document.getElementById(botoes[0].getAttribute("aria-controls")!);
    expect(corpo).not.toBeNull();
  });

  it("o nome do botão é o texto visível (mudança de status e data)", () => {
    render(<HistoricoOs eventos={eventos} />);
    expect(screen.getByRole("button", { name: /Recebido → Em Verificação/ })).toBeInTheDocument();
  });
});
