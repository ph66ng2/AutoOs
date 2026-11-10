import { describe, expect, it } from "vitest";
import { getReleaseHighlightsContent } from "./release-highlights-content";

describe("conteúdo empacotado de novidades", () => {
  it("renderiza os itens gerados para a mesma versão", () => {
    const data = { version: "1.2.3", title: "Novidades", description: "Confira", highlights: [{ title: "Busca melhorada" }] };
    expect(getReleaseHighlightsContent("1.2.3", data).highlights).toEqual([{ title: "Busca melhorada" }]);
  });

  it.each([null, {}, { version: "1.2.3", title: "Novidades", description: "Confira", highlights: [] }])(
    "usa um resumo genérico quando o JSON está vazio, ausente ou inválido: %j", (data) => {
      expect(getReleaseHighlightsContent("1.2.3", data).title).toBe("AutoOS atualizado");
    },
  );

  it("não mostra os textos da versão anterior se o build usar o JSON de fallback", () => {
    const content = getReleaseHighlightsContent("1.2.3");
    expect(content.description).toContain("1.2.3");
    expect(content.highlights).toEqual([]);
  });
});
