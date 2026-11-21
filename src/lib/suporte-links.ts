/**
 * Links nas respostas do suporte (ex.: a Erykah manda o download de um hotfix publicado como
 * release no GitHub). O Slack escreve `<url|rótulo>` ou `<url>`; também pode vir `https://…` solto.
 *
 * Só vira link clicável o que está na allowlist: `https:` sem usuário/senha nem porta, e o host
 * `github.com` no caminho `/ph66ng2/AutoOs/releases/…` ou um host terminado em `.bmitag.com.br`.
 * Todo o resto (outros domínios, `http:`, `javascript:`, `file:`, `data:`…) fica como texto.
 */
export type SegmentoSuporte = { tipo: "texto"; texto: string } | { tipo: "link"; texto: string; url: string };

export function desfazerEscapesSlack(texto: string): string {
  return texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function linkPermitido(url: string): boolean {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  if (alvo.protocol !== "https:" || alvo.username || alvo.password || alvo.port) return false;
  const host = alvo.hostname.toLowerCase();
  if (host === "github.com") return alvo.pathname.toLowerCase().startsWith("/ph66ng2/autoos/releases/");
  return host.endsWith(".bmitag.com.br");
}

/** Pontuação que termina a frase e não faz parte da URL solta. */
const FIM_DE_FRASE = /[.,;:!?)\]}'"]+$/;
const TOKEN = /<([^<>|\s]+)(?:\|([^<>]*))?>|https:\/\/[^\s<>]+/g;

export function segmentosDoSuporte(texto: string): SegmentoSuporte[] {
  const segmentos: SegmentoSuporte[] = [];
  const somarTexto = (trecho: string) => {
    if (!trecho) return;
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo?.tipo === "texto") ultimo.texto += trecho;
    else segmentos.push({ tipo: "texto", texto: trecho });
  };
  let desde = 0;
  for (const achado of texto.matchAll(TOKEN)) {
    const inicio = achado.index ?? 0;
    somarTexto(desfazerEscapesSlack(texto.slice(desde, inicio)));
    desde = inicio + achado[0].length;
    if (achado[1] !== undefined) {
      const alvo = desfazerEscapesSlack(achado[1]);
      const rotulo = achado[2] !== undefined ? desfazerEscapesSlack(achado[2]).trim() : "";
      if (!alvo.includes(":")) {
        // `<isto>` não é marcação de link: fica como foi escrito.
        somarTexto(desfazerEscapesSlack(achado[0]));
      } else if (linkPermitido(alvo)) {
        segmentos.push({ tipo: "link", texto: rotulo || alvo, url: alvo });
      } else {
        somarTexto(rotulo || alvo);
      }
      continue;
    }
    const bruto = achado[0];
    const sobra = bruto.match(FIM_DE_FRASE)?.[0] ?? "";
    const url = desfazerEscapesSlack(bruto.slice(0, bruto.length - sobra.length));
    if (linkPermitido(url)) segmentos.push({ tipo: "link", texto: url, url });
    else somarTexto(url);
    somarTexto(sobra);
  }
  somarTexto(desfazerEscapesSlack(texto.slice(desde)));
  return segmentos;
}

/** Texto corrido (sem marcação), para avisos curtos. */
export function textoSimplesDoSuporte(texto: string): string {
  return segmentosDoSuporte(texto).map((segmento) => segmento.texto).join("");
}

/** Download (instalador/arquivo de release) ou página. */
export function linkDeDownload(url: string): boolean {
  return /\/releases\/download\//i.test(url) || /\.(exe|msi|zip)$/i.test(new URL(url).pathname);
}
