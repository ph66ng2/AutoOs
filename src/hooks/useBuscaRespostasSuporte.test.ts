import { describe, expect, it } from "vitest";
import { avisosDeResposta } from "./useBuscaRespostasSuporte";
import { intervaloDeBusca, marcarEnvioAoSuporte } from "@/lib/suporte-ponte";

describe("respostas do suporte", () => {
  it("um aviso por chamado, com a última resposta, sem marcação do Slack e curto", () => {
    const longa = "x".repeat(200);
    const avisos = avisosDeResposta([
      { chamado_id: 12, autor_nome: null, texto: "Primeira", automatica: true },
      { chamado_id: 12, autor_nome: null, texto: "_Não envie_ o *orçamento*\nainda", automatica: true },
      { chamado_id: 9, autor_nome: "Paulo", texto: longa, automatica: false },
    ]);
    expect(avisos).toEqual([
      { chamadoId: 12, titulo: "Suporte respondeu o chamado #12", texto: "Não envie o orçamento ainda" },
      { chamadoId: 9, titulo: "Suporte respondeu o chamado #9", texto: `${"x".repeat(139)}…` },
    ]);
  });

  it("busca a cada 10 s nos 3 minutos depois de um envio, depois a cada 60 s", () => {
    marcarEnvioAoSuporte(1_000_000);
    expect(intervaloDeBusca(1_000_000 + 60_000)).toBe(10_000);
    expect(intervaloDeBusca(1_000_000 + 3 * 60_000 + 1)).toBe(60_000);
  });
});
