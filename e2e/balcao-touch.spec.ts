import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

// O resumo de novidades abre quando o splash sai e cobriria o painel no meio do teste.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("autoos:release-highlights:0.5.6:fotos-celular", "seen"));
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  test(`modo balcão funciona em ${viewport.width}×${viewport.height} com toque`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/balcao");
    await expect(page.getByRole("heading", { name: /como deseja trabalhar/i })).toBeVisible();
    await page.getByRole("button", { name: /modo balcão/i }).tap();
    await expect(page.getByRole("heading", { name: /atendimento de balcão/i })).toBeVisible();
    const newEntryBounds = await page.getByRole("button", { name: /nova entrada/i }).boundingBox();
    expect(newEntryBounds?.height).toBeGreaterThanOrEqual(48);
    await page.getByRole("button", { name: "Painel operacional", exact: true }).tap();
    await expect(page.getByRole("heading", { name: /painel operacional/i })).toBeVisible();
  });
}
