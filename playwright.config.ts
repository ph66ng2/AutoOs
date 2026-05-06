/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  playwright.config.ts — Configuração de Testes E2E            ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Framework: Playwright                                        ║
 * ║  Execução: npm run e2e                                        ║
 * ║  UI: npm run e2e:ui                                           ║
 * ║                                                               ║
 * ║  NOTA: Para Tauri, testes E2E são executados no browser      ║
 * ║  simulando a interface web. Para testes nativos, usar        ║
 * ║  tauri-driver (não configurado aqui).                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { defineConfig, devices } from '@playwright/test';

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
  },
});
