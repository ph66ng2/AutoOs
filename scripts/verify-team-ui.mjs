/** UI smoke + screenshots with isolated, in-memory demo data. No production DB. */
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

process.env.VITE_E2E_MOCK = "1";
process.env.VITE_E2E_TEAM = "1";
const previewDir = process.env.AUTOOS_PREVIEW_DIR ?? "docs/previews";
const server = await createServer({ server: { host: "127.0.0.1", port: 1420 } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AUTOOS_PREVIEW_BROWSER ? { executablePath: process.env.AUTOOS_PREVIEW_BROWSER } : {}),
  args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--no-zygote", "--single-process", "--use-gl=disabled", "--use-angle=disabled"],
});
const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem("autoos_app_mode", "standard");
  localStorage.setItem("autoos:release-highlights:0.6.0:portal-insumos-perfil", "seen");
});
try {
  await page.goto("http://127.0.0.1:1420/perfil");
  const entry = page.getByRole("dialog").filter({ hasText: "Selecionar perfil da sessão" });
  await expect(entry).toBeVisible();
  await entry.getByLabel("PIN do perfil", { exact: true }).fill("1234");
  await entry.getByRole("button", { name: "Entrar com este perfil" }).click();
  await expect(entry).not.toBeVisible();
  await expect(page.getByText("Ivan Santos", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[aria-label^="Carregando aplicativo"]')).toHaveCount(0, { timeout: 30000 });
  await mkdir(previewDir, { recursive: true });
  await page.screenshot({ path: `${previewDir}/equipe-acessos.png`, fullPage: true });

  await page.getByLabel("Nome do colaborador", { exact: true }).fill("Lucas Almeida");
  await page.getByRole("radio", { name: /^Financeiro/ }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Orçamentos e valores" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Gerenciar equipe" })).not.toBeChecked();
  await page.locator("#novo-colaborador").screenshot({ path: `${previewDir}/cadastro-permissoes.png` });
  await page.getByLabel("PIN inicial", { exact: true }).fill("2468");
  await page.getByLabel("Confirmar PIN", { exact: true }).fill("2468");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.locator("#novo-colaborador").screenshot({ path: `${previewDir}/cadastro-revisao.png` });
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Perfil Lucas Almeida criado", exact: true })).toBeVisible();
  await expect(page.getByText("Lucas Almeida", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Paulo Medeiros", { exact: true }).first()).toBeVisible();

  // Editing and PIN setup return to the refreshed list without switching identity.
  const ivan = page.getByRole("listitem").filter({ hasText: "Ivan Santos" });
  await ivan.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nome do colaborador", { exact: true }).fill("Ivan Silva");
  await page.getByLabel("Seu PIN de administrador", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(page.getByRole("list", { name: "Colaboradores" }).getByText("Ivan Silva", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Acesso de Ivan Silva atualizado com sucesso." })).toBeVisible();
  const ana = page.getByRole("listitem").filter({ hasText: "Ana Costa" });
  await ana.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Novo PIN", { exact: true }).fill("4321");
  await page.getByLabel("Confirmar novo PIN", { exact: true }).fill("4321");
  await page.getByLabel("Seu PIN de administrador", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(ana.getByText("PIN configurado neste PC")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "PIN de Ana Costa configurado neste computador com sucesso." })).toBeVisible();
  await ana.getByRole("button", { name: "Desativar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(page.getByText("Ana Costa", { exact: true })).not.toBeVisible();
  await page.getByLabel("Mostrar inativos").check();
  await ana.getByRole("button", { name: "Reativar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(ana.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Cadastrar outra pessoa" }).click();
  await expect(page.locator("#novo-colaborador")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveJSProperty("clientWidth", 390);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Equipe e acessos", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Equipe e acessos", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Equipe e acessos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Equipe e acessos", exact: true })).not.toBeVisible();
  await page.screenshot({ path: `${previewDir}/equipe-mobile.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  console.log("TEAM_UI_OK: create, review, edit, local PIN, deactivate/reactivate, responsive layout; mocked IPC only.");
} catch(error) {
  console.log("UI URL",page.url(),"ERRORS",errors,"BODY",(await page.locator("body").innerText()).slice(0,6000));
  await page.screenshot({path:"/tmp/autoos-ui-failure.png",fullPage:true});
  throw error;
} finally {
  await browser.close();
  await server.close();
}
