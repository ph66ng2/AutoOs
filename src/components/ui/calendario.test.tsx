import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Calendario, atalhosPadrao, somarDiasUteis } from "./calendario";
import { DateIsoInput } from "./date-iso-input";

function Campo({ inicial = "", onChange }: { inicial?: string; onChange?: (iso: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return <DateIsoInput aria-label="Data" value={valor} onValueChange={(iso) => { setValor(iso); onChange?.(iso); }} />;
}

describe("DateIsoInput com calendário", () => {
  it("o ícone abre o calendário no mês da data; escolher um dia preenche e fecha", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Campo inicial="2026-11-10" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Abrir calendário" }));
    expect(screen.getByText("novembro de 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /20 de novembro de 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-20");
    expect(screen.getByLabelText("Data")).toHaveValue("20/11/2026");
    expect(screen.queryByText("novembro de 2026")).not.toBeInTheDocument();
  });

  it("clicar em outro campo com o calendário aberto deixa o foco lá; Esc devolve ao campo", async () => {
    const user = userEvent.setup();
    render(<><Campo inicial="2026-11-10" /><input aria-label="Outro campo" /></>);
    await user.click(screen.getByRole("button", { name: "Abrir calendário" }));
    await user.click(screen.getByLabelText("Outro campo"));
    expect(screen.getByLabelText("Outro campo")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Abrir calendário" }));
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Data")).toHaveFocus();
  });

  it("Alt+↓ no campo abre o calendário", async () => {
    const user = userEvent.setup();
    render(<Campo inicial="2026-11-10" />);
    await user.click(screen.getByLabelText("Data"));
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByRole("grid", { name: "novembro de 2026" })).toBeInTheDocument();
  });
});

describe("Calendario", () => {
  const hoje = new Date(2026, 10, 23); // segunda, 23/11/2026

  it("dia escolhido marcado, hoje como data atual, dias antes do mínimo bloqueados", () => {
    render(<Calendario valor="2026-11-25" onEscolher={vi.fn()} min="2026-11-23" hoje={hoje} />);
    expect(screen.getByRole("button", { name: /25 de novembro/ }).closest("[role=gridcell]")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /23 de novembro/ })).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("button", { name: /22 de novembro/ })).toBeDisabled();
  });

  it("teclado: setas andam pelos dias, PgDn troca de mês, Enter escolhe", async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    render(<Calendario valor="2026-11-25" onEscolher={onEscolher} hoje={hoje} />);
    screen.getByRole("button", { name: /25 de novembro/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /26 de novembro/ })).toHaveFocus();
    await user.keyboard("{PageDown}");
    expect(screen.getByText("dezembro de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /26 de dezembro/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onEscolher).toHaveBeenCalledWith("2026-12-26");
  });

  it("atalhos de prazo: 3 dias úteis pula o fim de semana", async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    render(<Calendario onEscolher={onEscolher} hoje={hoje} atalhos={atalhosPadrao("prazo", hoje)} />);
    await user.click(screen.getByRole("button", { name: "Em 3 dias úteis" }));
    expect(onEscolher).toHaveBeenCalledWith("2026-11-26");
    expect(somarDiasUteis(new Date(2026, 10, 27), 1).getDate()).toBe(30);
  });

  it("trocar de mês pelo botão leva o dia ativo junto (a grade segue alcançável pelo Tab)", async () => {
    const user = userEvent.setup();
    render(<Calendario valor="2026-11-25" onEscolher={vi.fn()} hoje={hoje} />);
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByRole("button", { name: /25 de dezembro/ })).toHaveAttribute("tabindex", "0");
  });

  it("data vencida antes do mínimo: o dia ativo vai para o primeiro dia permitido, e as setas não saem do intervalo", async () => {
    const user = userEvent.setup();
    render(<Calendario valor="2026-10-15" onEscolher={vi.fn()} min="2026-11-23" hoje={hoje} />);
    const primeiro = screen.getByRole("button", { name: /23 de novembro/ });
    expect(primeiro).toHaveAttribute("tabindex", "0");
    expect(primeiro).not.toBeDisabled();
    primeiro.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: /23 de novembro/ })).toHaveFocus();
  });
});
