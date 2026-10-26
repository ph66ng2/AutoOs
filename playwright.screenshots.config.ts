/**
 * Screenshots de UI para revisão de PR.
 * Sobe o Vite com VITE_E2E_SCREENSHOTS=1. O mock lê o JSON exportado
 * do Postgres local test_autoos; o webview Tauri não entra neste fluxo.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "ui-screenshots.spec.ts",
  outputDir: "./e2e/ui-screenshots/test-output",
  timeout: 180 * 1000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:1420",
    navigationTimeout: 60 * 1000,
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
    viewport: { width: 1680, height: 1050 },
    reducedMotion: "reduce",
    locale: "pt-BR",
    timezoneId: "America/Bahia",
    colorScheme: "light",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1680, height: 1050 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      VITE_E2E_MOCK: "1",
      VITE_E2E_SCREENSHOTS: "1",
    },
  },
});
