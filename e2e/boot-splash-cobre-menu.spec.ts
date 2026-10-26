import { expect, test } from "@playwright/test";
import { RELEASE_HIGHLIGHTS_STORAGE_KEY } from "../src/lib/releaseHighlightsKey";

/**
 * Enquanto o splash de abertura está na tela, nada do aplicativo pode aparecer por cima dele.
 * A sidebar do Layout já escapou disso: o `z-50` dela vencia o `z-40` do splash.
 * jsdom não calcula empilhamento, por isso a checagem é no navegador, com `elementFromPoint`
 * numa grade que cobre a tela inteira (pega a sidebar e qualquer outro elemento que escape).
 */
test("o splash de abertura cobre a tela inteira, inclusive o menu lateral", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "seen");
    // Sem modo escolhido o app abre o diálogo de escolha, que fica acima do splash de propósito.
    localStorage.setItem("autoos_app_mode", "standard");
  }, RELEASE_HIGHLIGHTS_STORAGE_KEY);
  await page.goto("/");

  await expect(page.getByRole("status", { name: /Carregando aplicativo/ })).toBeVisible();
  await expect(page.locator("#main-sidebar")).toBeAttached();

  const descobertos = await page.evaluate(() => {
    const colunas = 16;
    const linhas = 9;
    const fora: string[] = [];
    for (let linha = 0; linha < linhas; linha += 1) {
      for (let coluna = 0; coluna < colunas; coluna += 1) {
        const x = Math.floor(((coluna + 0.5) / colunas) * window.innerWidth);
        const y = Math.floor(((linha + 0.5) / linhas) * window.innerHeight);
        const topo = document.elementFromPoint(x, y);
        if (!topo?.closest('[role="status"][aria-label^="Carregando aplicativo"]')) {
          fora.push(`(${x}, ${y}) ${topo?.tagName.toLowerCase() ?? "nada"}#${topo?.id ?? ""}`);
        }
      }
    }
    return fora;
  });

  expect(descobertos, "pontos da tela em que algo aparece por cima do splash").toEqual([]);
});

test("passado o splash, o menu lateral aparece e responde no computador", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "seen");
    localStorage.setItem("autoos_app_mode", "standard");
  }, RELEASE_HIGHLIGHTS_STORAGE_KEY);
  await page.goto("/");

  await expect(page.getByRole("status", { name: /Carregando aplicativo/ })).toHaveCount(0, { timeout: 30_000 });
  const menu = page.getByRole("navigation").getByRole("link", { name: "Clientes", exact: true });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page).toHaveURL(/\/clientes$/);
});

test("no celular a gaveta do menu continua acima do fundo escuro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => {
    localStorage.setItem(key, "seen");
    localStorage.setItem("autoos_app_mode", "standard");
  }, RELEASE_HIGHLIGHTS_STORAGE_KEY);
  await page.goto("/");

  await expect(page.getByRole("status", { name: /Carregando aplicativo/ })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Abrir menu" }).click();

  const gaveta = page.locator("#main-sidebar");
  await expect(gaveta).toBeVisible();
  const noTopo = await gaveta.evaluate((element) => {
    const caixa = element.getBoundingClientRect();
    const topo = document.elementFromPoint(caixa.left + caixa.width / 2, caixa.top + 200);
    return Boolean(topo && element.contains(topo));
  });
  expect(noTopo, "a gaveta precisa ficar acima do fundo escuro do menu").toBe(true);
});
