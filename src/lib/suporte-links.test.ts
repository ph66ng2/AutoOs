import { describe, expect, it } from "vitest";
import { linkPermitido, segmentosDoSuporte, textoSimplesDoSuporte } from "@/lib/suporte-links";

const RELEASE = "https://github.com/ph66ng2/AutoOs/releases/download/v0.6.4/AutoOS_0.6.4_x64-setup.exe";

describe("links do suporte", () => {
  it("<url|rótulo> do Slack vira link com o rótulo", () => {
    expect(segmentosDoSuporte(`Baixe aqui: <${RELEASE}|Baixar AutoOS 0.6.4>`)).toEqual([
      { tipo: "texto", texto: "Baixe aqui: " },
      { tipo: "link", texto: "Baixar AutoOS 0.6.4", url: RELEASE },
    ]);
  });

  it("<url> sem rótulo mostra a URL", () => {
    expect(segmentosDoSuporte(`<${RELEASE}>`)).toEqual([{ tipo: "link", texto: RELEASE, url: RELEASE }]);
  });

  it("URL solta da allowlist vira link sem levar a pontuação do fim da frase", () => {
    expect(segmentosDoSuporte(`Veja ${RELEASE}. Depois instale.`)).toEqual([
      { tipo: "texto", texto: "Veja " },
      { tipo: "link", texto: RELEASE, url: RELEASE },
      { tipo: "texto", texto: ". Depois instale." },
    ]);
    expect(segmentosDoSuporte("(https://status.bmitag.com.br/x)")[1]).toEqual({ tipo: "link", texto: "https://status.bmitag.com.br/x", url: "https://status.bmitag.com.br/x" });
  });

  it("fora da allowlist fica só texto", () => {
    expect(segmentosDoSuporte("Baixe https://exemplo.com/x.exe")).toEqual([{ tipo: "texto", texto: "Baixe https://exemplo.com/x.exe" }]);
    expect(segmentosDoSuporte("<javascript:alert(1)|clique>")).toEqual([{ tipo: "texto", texto: "clique" }]);
    for (const url of [
      "http://github.com/ph66ng2/AutoOs/releases/x",
      "https://github.com/outro/AutoOs/releases/x",
      "https://github.com/ph66ng2/AutoOs/issues/1",
      "https://bmitag.com.br.evil.com/x",
      "https://user:senha@status.bmitag.com.br/",
      "https://status.bmitag.com.br:8443/",
      "file:///C:/x.exe",
      "data:text/html,oi",
    ]) {
      expect(linkPermitido(url), url).toBe(false);
    }
    expect(linkPermitido("https://status.bmitag.com.br/")).toBe(true);
  });

  it("desfaz &amp;, &lt; e &gt; e mantém <isto> e as quebras de linha", () => {
    expect(segmentosDoSuporte("a &lt;b&gt; &amp; <isto>\nlinha 2")).toEqual([{ tipo: "texto", texto: "a <b> & <isto>\nlinha 2" }]);
    expect(segmentosDoSuporte(`<${RELEASE}?a=1&amp;b=2|x>`)[0]).toEqual({ tipo: "link", texto: "x", url: `${RELEASE}?a=1&b=2` });
  });

  it("texto simples para o aviso usa o rótulo", () => {
    expect(textoSimplesDoSuporte(`Baixe <${RELEASE}|Baixar 0.6.4>.`)).toBe("Baixe Baixar 0.6.4.");
  });
});
