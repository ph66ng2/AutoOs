import { mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { RELEASE_HIGHLIGHTS_STORAGE_KEY } from "../src/lib/releaseHighlightsKey";

const seed = JSON.parse(readFileSync("e2e/fixtures/ui-screenshot-seed.json", "utf8")) as {
  marker: string;
  portal: { contato: { nomeExibicao: string } };
};
const outDir = "e2e/ui-screenshots";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem("autoos_app_mode", "standard");
    localStorage.setItem(key, "seen");
  }, RELEASE_HIGHLIGHTS_STORAGE_KEY);
});

test("captura as telas principais com dados sintéticos", async ({ page }) => {
  expect(seed.marker).toBe("CI-UI-SCREENSHOT");
  mkdirSync(outDir, { recursive: true });

  await page.goto("/");
  const entry = page.getByRole("dialog").filter({ hasText: "Quem está usando o AutoOS?" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: /CI Admin Screenshot/ }).click();
  await page.screenshot({ path: `${outDir}/08-selecao-perfil.png`, animations: "disabled" });
  await entry.getByRole("button", { name: /CI Admin Screenshot/ }).click();
  await entry.getByLabel("PIN do perfil", { exact: true }).fill("1234");
  await entry.getByRole("button", { name: "Entrar com este perfil" }).click();
  await expect(entry).toBeHidden();
  await expect(page.locator('[aria-label^="Carregando aplicativo"]')).toHaveCount(0);

  const highlights = page.getByRole("button", { name: "Começar a usar" });
  if (await highlights.isVisible()) await highlights.click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByText("Zebra ZD620").first()).toBeVisible();
  await expect(page.getByText("Ribbon sintético CI").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/01-home.png`, fullPage: true, animations: "disabled" });

  const openScreen = (name: string) =>
    page.getByRole("navigation").getByRole("link", { name, exact: true }).click();

  await openScreen("Clientes");
  await expect(page.locator("h1", { hasText: "Clientes" })).toBeVisible();
  await expect(page.getByText("Oficina do Porto Sintética").first()).toBeVisible();
  await expect(page.getByText("Marina Screenshot").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/02-clientes.png`, fullPage: true, animations: "disabled" });

  await openScreen("Equipamentos");
  await expect(page.locator("h1", { hasText: "Equipamentos" })).toBeVisible();
  await expect(page.getByText("CI-UI-ZD620").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/03-equipamentos.png`, fullPage: true, animations: "disabled" });

  await page.getByRole("button", { name: "Abrir detalhes de Zebra ZD620" }).click();
  const detalhes = page.getByRole("dialog").filter({ hasText: "Detalhes do Equipamento" });
  await expect(detalhes).toBeVisible();
  await expect(detalhes.getByText("CI-UI-ZD620").first()).toBeVisible();
  await expect(detalhes.getByText("Nenhuma foto de entrada foi registrada para este equipamento.")).toBeVisible();
  await page.screenshot({ path: `${outDir}/04-atendimento-os.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(detalhes).toBeHidden();

  await openScreen("Insumos/Peças");
  await expect(page.locator("h1", { hasText: "Insumos/Peças & Estoque" })).toBeVisible();
  await expect(page.getByText("Etiqueta sintética CI").first()).toBeVisible();
  await expect(page.getByText("Ribbon sintético CI").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/05-insumos-estoque.png`, fullPage: true, animations: "disabled" });

  await openScreen("Perfil");
  await expect(page.locator("h1", { hasText: "CI Admin Screenshot" })).toBeVisible();
  await expect(page.getByText("O que você pode fazer")).toBeVisible();
  await page.screenshot({ path: `${outDir}/09-perfil-visao-geral.png`, fullPage: true, animations: "disabled" });

  await page.getByRole("tab", { name: "Equipe" }).click();
  await expect(page.getByText("CI Admin Screenshot").first()).toBeVisible();
  await expect(page.getByText("CI Tecnico Screenshot").first()).toBeVisible();
  await expect(page.getByText("CI Atendente Screenshot").first()).toBeVisible();
  await page.screenshot({ path: `${outDir}/06-equipe-acessos.png`, fullPage: true, animations: "disabled" });

  await openScreen("Configurações");
  await expect(page.locator("h1", { hasText: "Configurações" })).toBeVisible();
  const portal = page.getByText("Portal do Cliente: funcionamento", { exact: true });
  await expect(portal).toBeVisible();
  await expect(page.getByRole("switch", { name: "Portal ligado" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Clientes podem responder orçamentos" })).toHaveAttribute("aria-checked", "true");
  const nomeExibido = page.getByLabel("Nome exibido");
  await expect(nomeExibido).toHaveValue(seed.portal.contato.nomeExibicao);
  await page.setViewportSize({ width: 1680, height: 1800 });
  await portal.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(nomeExibido).toBeInViewport();
  await page.screenshot({ path: `${outDir}/07-portal-config.png`, animations: "disabled" });
});
