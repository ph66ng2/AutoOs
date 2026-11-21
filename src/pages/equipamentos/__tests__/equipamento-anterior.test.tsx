import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { EquipamentoFormData } from "@/lib/validations";
import type { Equipamento } from "@/types";
import { AnteriorEmAtendimentoAviso } from "@/components/equipamentos/AnteriorEmAtendimentoAviso";
import {
  atendimentoEncerrado,
  preencherDadosDoEquipamentoAnterior,
  rotuloStatusEquipamento,
  usarEquipamentoAnteriorNoCadastro,
} from "../equipamento-anterior";

const anterior = {
  id: 9,
  serial_number: "ZD-0042",
  patrimonio: "PAT-77",
  marca: "Honeywell",
  modelo: "PC42t",
  tipo: "Impressora",
  status: "ENTREGUE",
  defeito_relatado: "defeito do atendimento antigo",
  acessorios: "Fonte",
  observacoes: "obs antiga",
} as Equipamento;

const valoresDoNovoCadastro: EquipamentoFormData = {
  serial_number: "",
  patrimonio: "",
  marca: "",
  modelo: "",
  tipo: "",
  status: "RECEBIDO",
  defeito_relatado: "Não imprime",
  acessorios: ["Cabo de Força"],
  acessorios_outros: "Caixa",
  observacoes: "Cliente com pressa",
};

function formComValores() {
  return renderHook(() => useForm<EquipamentoFormData>({ defaultValues: valoresDoNovoCadastro })).result.current;
}

describe("equipamento anterior no cadastro", () => {
  it("só atendimentos ENTREGUE ou ABANDONADO servem de base", () => {
    expect(atendimentoEncerrado({ status: "ENTREGUE" })).toBe(true);
    expect(atendimentoEncerrado({ status: "ABANDONADO" })).toBe(true);
    for (const status of ["RECEBIDO", "EM_MANUTENCAO", "AGUARDANDO_APROVACAO", "PRONTO", "REPROVADO"]) {
      expect(atendimentoEncerrado({ status })).toBe(false);
    }
  });

  it("preenche série, patrimônio, marca, modelo e tipo", () => {
    const form = formComValores();
    preencherDadosDoEquipamentoAnterior(form, anterior);

    expect(form.getValues()).toMatchObject({
      serial_number: "ZD-0042",
      patrimonio: "PAT-77",
      marca: "Honeywell",
      modelo: "PC42t",
      tipo: "Impressora",
    });
  });

  it("não altera defeito, acessórios, outros acessórios, observação nem status", () => {
    const form = formComValores();
    preencherDadosDoEquipamentoAnterior(form, anterior);

    const valores = form.getValues();
    expect(valores.defeito_relatado).toBe("Não imprime");
    expect(valores.acessorios).toEqual(["Cabo de Força"]);
    expect(valores.acessorios_outros).toBe("Caixa");
    expect(valores.observacoes).toBe("Cliente com pressa");
    expect(valores.status).toBe("RECEBIDO");
  });

  it("copia a marca digitada em Outro como texto e limpa patrimônio vazio", () => {
    const form = formComValores();
    form.setValue("patrimonio", "ANTIGO");
    preencherDadosDoEquipamentoAnterior(form, { ...anterior, marca: "Marca Rara", patrimonio: null } as unknown as Equipamento);

    expect(form.getValues("marca")).toBe("Marca Rara");
    expect(form.getValues("patrimonio")).toBe("");
  });

  it("atendimento encerrado com série repetida preenche e já confirma o novo ciclo", async () => {
    const form = formComValores();
    const buscar = vi.fn().mockResolvedValue([anterior]);
    const resultado = await usarEquipamentoAnteriorNoCadastro(form, anterior, buscar);

    expect(buscar).toHaveBeenCalledWith("ZD-0042");
    expect(resultado).toEqual({ tipo: "preenchido", registros: [anterior], confirmarNovoCiclo: true });
    expect(form.getValues("serial_number")).toBe("ZD-0042");
  });

  it("série sem outros registros preenche sem confirmar novo ciclo, mesmo se a busca falhar", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const form = formComValores();
    const resultado = await usarEquipamentoAnteriorNoCadastro(form, { ...anterior, status: "ABANDONADO" } as Equipamento, vi.fn().mockRejectedValue(new Error("falha")));

    expect(resultado).toEqual({ tipo: "preenchido", registros: [], confirmarNovoCiclo: false });
    expect(form.getValues("modelo")).toBe("PC42t");
    erro.mockRestore();
  });

  it("equipamento em atendimento não preenche nada nem consulta a série", async () => {
    const form = formComValores();
    const buscar = vi.fn();
    const resultado = await usarEquipamentoAnteriorNoCadastro(form, { ...anterior, status: "EM_MANUTENCAO" } as Equipamento, buscar);

    expect(resultado).toEqual({ tipo: "em_atendimento" });
    expect(buscar).not.toHaveBeenCalled();
    expect(form.getValues()).toEqual(valoresDoNovoCadastro);
  });

  it("mostra o status em português e oferece abrir o atendimento", () => {
    expect(rotuloStatusEquipamento("EM_MANUTENCAO")).toBe("Em Manutenção");
    const aoAbrir = vi.fn();
    const emAtendimento = { ...anterior, status: "EM_MANUTENCAO" } as Equipamento;
    render(<AnteriorEmAtendimentoAviso equipamento={emAtendimento} onAbrirAtendimento={aoAbrir} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/ainda está em atendimento: Em Manutenção/);
    expect(screen.getByRole("alert")).toHaveTextContent(/Os dados não foram preenchidos/);
    fireEvent.click(screen.getByRole("button", { name: "Abrir atendimento" }));
    expect(aoAbrir).toHaveBeenCalledWith(emAtendimento);
  });
});

describe("série repetida: preencher vazios e garantia", () => {
  it("preencherVaziosComAnterior só completa campos vazios e não mexe na série", async () => {
    const { preencherVaziosComAnterior } = await import("../equipamento-anterior");
    const { result } = renderHook(() => useForm<EquipamentoFormData>({
      defaultValues: { serial_number: "ZD-0042", patrimonio: "", marca: "Zebra", modelo: "", tipo: "", status: "RECEBIDO", defeito_relatado: "", acessorios: [], acessorios_outros: "", observacoes: "" },
    }));
    preencherVaziosComAnterior(result.current, { ...anterior, serial_number: "OUTRA" } as Equipamento);
    expect(result.current.getValues()).toMatchObject({ serial_number: "ZD-0042", patrimonio: "PAT-77", marca: "Zebra", modelo: "PC42t", tipo: "Impressora" });
  });

  it("retornoNaGarantia conta da data de saída e só para entregue", async () => {
    const { retornoNaGarantia, ultimaPassagem, linhaRetornoGarantia } = await import("../equipamento-anterior");
    expect(retornoNaGarantia({ status: "ENTREGUE", data_saida: "2026-08-23" }, 90, "2026-11-21")).toEqual({ diasDesdeEntrega: 90 });
    expect(retornoNaGarantia({ status: "ENTREGUE", data_saida: "2026-08-22" }, 90, "2026-11-21")).toBeNull();
    expect(retornoNaGarantia({ status: "ABANDONADO", data_saida: "2026-11-01" }, 90, "2026-11-21")).toBeNull();
    expect(retornoNaGarantia({ status: "ENTREGUE", data_saida: undefined }, 90, "2026-11-21")).toBeNull();
    expect(retornoNaGarantia({ status: "ENTREGUE", data_saida: "2026-11-01" }, 0, "2026-11-21")).toBeNull();
    expect(retornoNaGarantia({ status: "ENTREGUE", data_saida: "2026-11-01" }, null, "2026-11-21")).toBeNull();
    const ultima = ultimaPassagem([{ id: 3, data_entrada: "2026-01-01" }, { id: 9, data_entrada: "2026-03-01" }, { id: 8, data_entrada: "2026-03-01" }] as Equipamento[]);
    expect(ultima?.id).toBe(9);
    expect(linhaRetornoGarantia({ id: 9 }, 90)).toBe("Retorno da OS #9 dentro da garantia de 90 dias dos serviços.");
  });
});
