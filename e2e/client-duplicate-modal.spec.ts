import { expect, test } from "@playwright/test";

test("aviso de CPF duplicado aparece sobre o cadastro e permite voltar ou buscar", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("autoos:release-highlights:0.5.6:fotos-celular", "seen"));
  await page.goto("/clientes");
  await page.getByRole("button", { name: /AutoOS Completo/ }).click();
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Novo Cliente" }).click();
  await page.getByLabel("CPF ou CNPJ *").fill("52998224725");
  await page.getByPlaceholder("Nome completo do cliente").fill("Cliente já cadastrado");
  await page.getByRole("button", { name: "Cadastrar" }).click();

  const aviso = page.getByRole("alertdialog", { name: "CPF/CNPJ já cadastrado" });
  await expect(aviso).toBeVisible();
  const zIndex = await aviso.evaluate((element) => getComputedStyle(element).zIndex);
  expect(Number(zIndex)).toBeGreaterThan(50);

  await page.getByRole("button", { name: "Corrigir documento" }).click();
  await expect(page.getByRole("dialog", { name: "Novo Cliente" })).toBeVisible();
  await expect(page.getByLabel("CPF ou CNPJ *")).toHaveValue("529.982.247-25");

  await page.getByRole("button", { name: "Cadastrar" }).click();
  await aviso.getByRole("button", { name: "Buscar cliente existente" }).click();
  await expect(page.getByRole("dialog", { name: "Novo Cliente" })).not.toBeVisible();
  await expect(page.getByPlaceholder("Buscar por nome, razão social, CPF/CNPJ, telefone, email...")).toHaveValue("52998224725");
});
