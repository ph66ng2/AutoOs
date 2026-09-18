/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  playwright.config.ts — Configuração de Testes E2E            ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Framework: Playwright                                        ║
 * ║  Execução: npm run e2e                                        ║
 * ║  UI: npm run e2e:ui                                           ║
 * ║                                                               ║
 * ║  NOTA: Playwright usa VITE_E2E_MOCK=1 (store in-memory via alias).  ║
 * ║  Isso valida fluxos de UI/IPC mockado — não substitui Tauri+Postgres. ║
 * ║  Integração real: npm run qa:integrations / e2e:real.              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { defineConfig, devices } from '@playwright/test';
import { RELEASE_HIGHLIGHTS_STORAGE_KEY } from './src/components/ReleaseHighlightsDialog';
import { DAILY_BOOT_OPENING_STORAGE_KEY } from './src/lib/daily-boot-opening';
import { todayLocalIsoDate } from './src/lib/date-utils';

export default defineConfig({
  // Diretório dos testes E2E
  testDir: './e2e',
  
  // Arquivo de resultado
  outputDir: './e2e/results',
  
  // Timeout por teste (60 segundos)
  timeout: 90 * 1000,

  // No Windows local, executar um worker reduz timeouts no cold start do Vite.
  workers: 1,
  
  // Retries em CI
  retries: process.env.CI ? 2 : 0,
  
  // Reporters
  reporter: [
    ['html', { outputFolder: './e2e/report' }],
    ['list'],
  ],
  
  // Configurações globais
  use: {
    // URL base do servidor de desenvolvimento
    baseURL: 'http://localhost:1420',

    navigationTimeout: 90 * 1000,
    
    // Tirar screenshot em falha
    screenshot: 'only-on-failure',
    
    // Vídeo em caso de falha
    video: 'retain-on-failure',
    
    // Trace para debugging
    trace: 'on-first-retry',

    // Dialog de novidades não deve interceptar fluxos E2E de balcão/navegação.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:1420',
          localStorage: [
            { name: RELEASE_HIGHLIGHTS_STORAGE_KEY, value: 'seen' },
            { name: DAILY_BOOT_OPENING_STORAGE_KEY, value: todayLocalIsoDate() },
          ],
        },
      ],
    },
  },
  
  // Projetos (navegadores) - apenas Chromium para velocidade
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  // Servidor de desenvolvimento (inicia automaticamente)
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      VITE_E2E_MOCK: '1',
    },
  },
});
