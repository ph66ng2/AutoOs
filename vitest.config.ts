/// <reference types="vitest" />
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  vitest.config.ts — Configuração de Testes Unitários         ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Framework: Vitest + Testing Library + jsdom                 ║
 * ║  Execução: npm run test                                       ║
 * ║  UI: npm run test:ui                                          ║
 * ║  Coverage: npm run test:coverage                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Ambiente de teste
    environment: 'jsdom',
    
    // Arquivos de setup (ex: jest-dom matchers)
    setupFiles: ['./src/test/setup.ts'],
    
    // Incluir arquivos de teste
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    
    // Excluir E2E tests do Playwright
    exclude: ['e2e/**/*', 'node_modules/**/*'],
    
    // Globals para não precisar importar describe/it/expect
    globals: true,

    // No Windows, o pool "forks" pode falhar/intermitir (startup lento/AV).
    // Padronizamos em threads e reduzimos paralelismo para tornar `npm run test:run` reprodutível.
    pool: 'threads',
    fileParallelism: false,
    maxWorkers: 1,
    
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**/*',
        'src/main.tsx',
      ],
    },
    
    // CSS
    css: true,
  },
  poolOptions: {
    threads: {
      singleThread: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
