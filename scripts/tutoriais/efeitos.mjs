/**
 * Efeitos de gravação compartilhados pelos scripts de vídeo tutorial.
 *
 * - destacar(): anel pulsante desenhado no DOM ao redor de um elemento (aparece no vídeo).
 * - zoomar(): registra na linha do tempo um zoom suave sobre um elemento; o zoom em si é
 *   aplicado depois, por acabamento.mjs (ffmpeg), para não mexer no layout da página.
 * - secao(): marca a troca de seção (acabamento faz um fade rápido por preto).
 *
 * Uso: const tl = criarLinhaDoTempo({ largura, altura });  // logo antes de criar a página
 *      ... await destacar(page, locator); await zoomar(page, locator, tl, { escala: 1.7 });
 *      await tl.salvar("caminho/linha.json");               // depois de gravar
 */
import { writeFile } from "node:fs/promises";

export function criarLinhaDoTempo({ largura, altura }) {
  const inicio = Date.now();
  const dados = { largura, altura, zooms: [], secoes: [] };
  return {
    dados,
    /** Segundos desde o início da gravação. */
    agora: () => (Date.now() - inicio) / 1000,
    async salvar(arquivo) {
      await writeFile(arquivo, JSON.stringify(dados, null, 2));
    },
  };
}

export const pausa = (page, ms) => page.waitForTimeout(ms);

/** Anel pulsante ao redor do elemento por `ms` milissegundos. */
export async function destacar(page, locator, { ms = 2200, cor = "#f59e0b" } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const caixa = await locator.boundingBox();
  if (!caixa) return;
  await page.evaluate(({ caixa, ms, cor }) => {
    const anel = document.createElement("div");
    const m = 8;
    anel.setAttribute("data-tutorial-anel", "");
    anel.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;border:4px solid ${cor};`
      + `border-radius:14px;left:${caixa.x - m}px;top:${caixa.y - m}px;width:${caixa.width + 2 * m}px;`
      + `height:${caixa.height + 2 * m}px;box-shadow:0 0 0 0 ${cor}99;`;
    document.documentElement.appendChild(anel);
    const animacao = anel.animate(
      [
        { boxShadow: `0 0 0 0 ${cor}aa`, opacity: 0 },
        { boxShadow: `0 0 0 12px ${cor}00`, opacity: 1, offset: 0.25 },
        { boxShadow: `0 0 0 0 ${cor}aa`, opacity: 1, offset: 0.5 },
        { boxShadow: `0 0 0 12px ${cor}00`, opacity: 1, offset: 0.75 },
        { boxShadow: `0 0 0 0 ${cor}00`, opacity: 0 },
      ],
      { duration: ms, easing: "ease-in-out" },
    );
    animacao.onfinish = () => anel.remove();
  }, { caixa, ms, cor });
  await page.waitForTimeout(ms);
}

/** Registra um zoom suave (0,5 s para entrar e para sair) centrado no elemento e espera `ms`. */
export async function zoomar(page, locator, tl, { escala = 1.6, ms = 3000 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const caixa = await locator.boundingBox();
  if (!caixa) return;
  const ini = tl.agora();
  tl.dados.zooms.push({
    ini,
    fim: ini + ms / 1000,
    cx: caixa.x + caixa.width / 2,
    cy: caixa.y + caixa.height / 2,
    escala,
  });
  await page.waitForTimeout(ms);
}

/** Marca o início de uma seção: o acabamento faz um fade rápido por preto neste instante. */
export function secao(tl) {
  tl.dados.secoes.push(tl.agora());
}
