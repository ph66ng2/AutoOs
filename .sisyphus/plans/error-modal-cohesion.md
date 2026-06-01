# Padronização de Modais de Erro e Notificações

## TL;DR

> **Resumo**: Substituir todos os 38+ `alert()` nativos do browser, 1 `window.prompt()` e 1 `window.confirm()` por um sistema de notificações coeso com o design do app (Sonner para toasts, AlertDialog para confirmações, ErrorAlert para erros inline), padronizar mensagens com contexto (onde + o quê), e unificar os 5 padrões visuais de erro existentes.

> **Entregáveis**:
> - Sistema de notificações completo (toast success/error/warning/info via Sonner)
> - Componentes ErrorAlert, FormValidationError, ConfirmDialog, InputDialog
> - ErrorBoundary no nível App
> - Utilitário centralizado de erros (formatAppError com contexto + detalhes técnicos)
> - Hook useNotification (wrapper do Sonner com formato padronizado)
> - Migração de todos os alert() calls para o novo sistema
> - Surfacing de erros ocultos dos hooks (useClientes, useEquipamentos, etc.)
> - Padronização de 5 padrões visuais de erro em 1
> - Tests-after com Vitest

> **Esforço Estimado**: Large (18 tarefas de implementação + 4 de verificação)
> **Execução Paralela**: SIM - 4 waves
> **Caminho Crítico**: T1 → T4 → T9 (Equipamentos) → T18 → Final

---

## Context

### Pedido Original
"Quero que os Modals de erro tenham coesão com a aparência do Software, e que padronize o texto para saber exatamente qual o erro e onde ele ocorre."

### Resumo da Entrevista
**Decisões**:
- Tipos de notificação: TODOS (erro, sucesso, aviso, informação)
- Público: Híbrido (mensagem amigável + detalhes técnicos expandíveis)
- Ações no modal: Botão "Copiar detalhes"
- Form validation: Padronizar também
- Testes: Tests-after com Vitest

**Pesquisa - Problemas Encontrados**:
- 38+ browser `alert()` calls (sem estilo nenhum)
- 1 `window.prompt()` + 1 `window.confirm()` (native, sem estilo)
- 5 padrões de erro visuais diferentes (text-red-500, text-red-600, text-red-700, amber-50/amber-900, text-muted-foreground)
- Hooks com error state NUNCA exibidos na UI (useClientes, useEquipamentos, useInsumos, useServicos)
- Sem Toast/Sonner, sem AlertDialog, sem ErrorBoundary
- Apenas 2 funções utilitárias de erro (traduzirErroSalvarEquipamento, whatsappNaoConfigurado)

### Revisão Metis
**Gaps Resolvidos**:
- Toast auto-dismiss: success=3s, warning=5s, error=dismiss manual
- Toast stacking: máximo 3 visíveis (Sonner `visibleToasts={3}`)
- Copy details: copia message + context + timestamp + error.stack
- ErrorBoundary: Wraps App, mostra mensagem amigável + retry/reload
- Hook errors: Toast para erros de carregamento de dados
- Form validation: Continua inline abaixo de cada campo (componente padronizado)
- Deduplicação: mesma mensagem em 5s → atualiza toast existente
- Dark mode: Sonner respeita CSS variables automaticamente
- Erros antes do React: ErrorBoundary não captura → não é escopo deste plano
- Clipboard fallback: Mostra detalhes em seção expandível com "Selecionar tudo"

**Guardrails Adicionados**:
- NÃO modificar hooks internamente - apenas ler error state existente
- NÃO adicionar novas dependências além de Sonner e AlertDialog
- NÃO mudar lógica de validação dos forms - apenas padronizar visual
- Error utility: apenas formatação de mensagens, sem logging/storage
- NÃO alterar CSS variables existentes, apenas adicionar warning/info se necessário
- NÃO modificar arquivos .rs (backend Rust)

---

## Objetivos do Trabalho

### Objetivo Central
Criar um sistema de feedback visual coeso que substitua os diálogos nativos do browser e padronize todas as mensagens de erro/sucesso/aviso do app.

### Entregáveis Concretos
- `src/components/ui/sonner.tsx` + Toaster em App.tsx
- `src/components/ui/alert-dialog.tsx` (shadcn)
- `src/types/notification.ts` (tipos e interfaces)
- `src/lib/error-utils.ts` (formatAppError, createContextMessage, copyErrorDetails)
- `src/components/ErrorBoundary.tsx`
- `src/hooks/useNotification.ts`
- `src/components/ui/error-alert.tsx`
- `src/components/ui/form-validation-error.tsx`
- `src/components/ui/confirm-dialog.tsx`
- `src/components/ui/input-dialog.tsx`
- Todas as páginas migradas sem `alert()` calls

### Definition of Done
- [ ] `grep -r "alert(" src/ --include="*.tsx" --include="*.ts"` retorna 0 (exceto tipos/comentários legítimos)
- [ ] `grep -r "window.prompt" src/` retorna 0
- [ ] `grep -r "window.confirm" src/` retorna 0
- [ ] Todos os toasts seguem o formato padronizado (tipo + contexto + mensagem)
- [ ] ErrorBoundary.render() exibe mensagem amigável em PT-BR
- [ ] `npm run test:run` passa com novos testes
- [ ] `npx tsc --noEmit` sem erros
- [ ] `cd src-tauri && cargo check` sem erros

### Must Have
- Todos os `alert()` substituídos por toast ou AlertDialog
- `window.prompt` substituído por InputDialog
- `window.confirm` substituído por ConfirmDialog
- Mensagens padronizadas: "[Contexto] [Ação] — [Mensagem amigável]" + detalhes técnicos expandíveis
- Botão "Copiar detalhes" em erros
- ErrorBoundary no nível App
- Surfacing dos erros dos hooks
- Cohesão visual com o design system existente (azul primário, vermelho destrutivo)

### Must NOT Have (Guardrails)
- NÃO modificar lógica interna dos hooks (apenas ler `error` state existente)
- NÃO adicionar bibliotecas além de Sonner e astis (shadcn)
- NÃO alterar variáveis CSS existentes (apenas adicionar warning/info se necessário)
- NÃO mudar lógica de validação dos forms (apenas padronizar componente visual)
- NÃO criar sistema de logging/telemetria de erros
- NÃO modificar arquivos Rust (.rs)
- NÃO redesenhar layout de páginas existentes
- NÃO adicionar react-hook-form ou zod (já existe nos forms)

---

## Estratégia de Verificação (OBRIGATÓRIA)

> **ZERO INTERVENÇÃO HUMANA** - TODA verificação é executada por agente. Sem exceções.
> Critérios de aceitação que exigem "usuário testa manualmente" são PROIBIDOS.

### Decisão de Testes
- **Infraestrutura existe**: SIM (Vitest + Playwright)
- **Testes automatizados**: YES (tests-after)
- **Framework**: Vitest para unitários, Playwright para QA de browser
- **Abordagem**: Criar testes após implementação de cada componente

### Política de QA
Cada tarefa DEVE incluir cenários de QA executados por agente (ver template de TODOs).
Evidências salvas em `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright (skill playwright) - navegar, interagir, assert DOM, screenshots
- **Componentes**: Vitest - render, simular eventos, verificar output
- **Utilitários**: Vitest - chamar funções, verificar retorno
- **Build**: Bash - executar tsc --noEmit, cargo check

---

## Estratégia de Execução

### Waves Paralelas

```
Wave 1 (Fundação - 6 tarefas paralelas, independentes):
├── T1: Instalar Sonner + AlertDialog + config [quick]
├── T2: Criar tipos de notificação (notification.ts) [quick]
├── T3: Criar error utility (error-utils.ts) [quick]
├── T4: Criar ErrorBoundary [quick]
├── T5: Criar useNotification hook [quick]
└── T6: Adicionar CSS vars para warning/info [quick]

Wave 2 (Componentes UI - 4 tarefas paralelas, dependem Wave 1):
├── T7: ErrorAlert component (depends: T3, T6) [unspecified-low]
├── T8: FormValidationError component (depends: T3) [unspecified-low]
├── T9: ConfirmDialog component (depends: T1) [unspecified-low]
└── T10: InputDialog component (depends: T1) [unspecified-low]

Wave 3 (Migração - 7 tarefas, máximo paralelismo):
├── T11: Migrar Equipamentos.tsx (depends: T5, T7, T9, T10) [deep]
├── T12: Migrar Clientes page + surfacing hooks (depends: T5, T7) [unspecified-high]
├── T13: Migrar Insumos page + surfacing hooks (depends: T5, T7) [unspecified-high]
├── T14: Migrar Servicos page + surfacing hooks (depends: T5) [unspecified-high]
├── T15: Migrar VerificacaoTecnica + ClienteSelector (depends: T5) [quick]
├── T16: Migrar Configuracoes error displays (depends: T7) [unspecified-high]
└── T17: Migrar form validation patterns (depends: T8) [unspecified-high]

Wave 4 (Testes - 3 tarefas paralelas, dependem Wave 3):
├── T18: Vitest - error-utils + useNotification (depends: T3, T5) [quick]
├── T19: Vitest - UI components (depends: T7-T10) [unspecified-high]
└── T20: Build + type-check final (depends: all) [quick]

Wave FINAL (Verificação - 4 reviews paralelos):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
→ Apresentar resultados → Obter OK explícito do usuário

Caminho Crítico: T1 → T5 → T11 (Equipamentos) → T20 → F1-F4 → OK usuário
Speedup Paralelo: ~65% mais rápido que sequencial
Máx. Concorrentes: 7 (Wave 1)
```

### Matriz de Dependências

| Task | Depende de | Bloqueia | Wave |
|------|-----------|----------|------|
| T1 | - | T5, T9, T10 | 1 |
| T2 | - | T3, T5, T7-T10 | 1 |
| T3 | T2 | T5, T7, T8, T11-T17 | 1 |
| T4 | - | T19 | 1 |
| T5 | T1, T3 | T11-T15 | 1 |
| T6 | - | T7 | 1 |
| T7 | T3, T6 | T11, T12, T13, T16 | 2 |
| T8 | T3 | T17 | 2 |
| T9 | T1 | T11 | 2 |
| T10 | T1 | T11 | 2 |
| T11 | T5, T7, T9, T10 | T20 | 3 |
| T12 | T5, T7 | T20 | 3 |
| T13 | T5, T7 | T20 | 3 |
| T14 | T5 | T20 | 3 |
| T15 | T5 | T20 | 3 |
| T16 | T7 | T20 | 3 |
| T17 | T8 | T20 | 3 |
| T18 | T3, T5 | - | 4 |
| T19 | T7-T10, T4 | - | 4 |
| T20 | T11-T17 | F1-F4 | 4 |

### Resumo de Dispatch de Agentes

- **Wave 1**: 6 agentes - T1-T4 → `quick`, T5 → `quick`, T6 → `quick`
- **Wave 2**: 4 agentes - T7-T8 → `unspecified-low`, T9-T10 → `unspecified-low`
- **Wave 3**: 7 agentes - T11 → `deep`, T12-T14 → `unspecified-high`, T15 → `quick`, T16-T17 → `unspecified-high`
- **Wave 4**: 3 agentes - T18 → `quick`, T19 → `unspecified-high`, T20 → `quick`
- **FINAL**: 4 agentes - F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Instalar Sonner + AlertDialog + Configurar Toaster

  **What to do**:
  - Rodar `npx shadcn@latest add sonner` para instalar o componente Sonner (toast library)
  - Rodar `npx shadcn@latest add alert-dialog` para instalar o AlertDialog
  - Adicionar o componente `<Toaster />` do Sonner no layout raiz (`src/App.tsx` ou arquivo de layout principal)
  - Configurar o `<Toaster>` com: `position="top-right"`, `visibleToasts={3}`, `richColors={true}`, `closeButton={true}`, `duration={5000}`
  - Verificar que o Sonner respeita as CSS variables do tema (dark mode automático)
  - Adicionar import do `sonner` CSS se necessário (já deve vir com o shadcn component)

  **Must NOT do**:
  - NÃO modificar variáveis CSS existentes (apenas adicionar se necessário)
  - NÃO criar componentes customizados de toast (usar Sonner diretamente via hook)
  - NÃO adicionar libs além de Sonner

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5, T6)
  - **Blocks**: T5, T9, T10
  - **Blocked By**: None

  **References**:
  - `src/App.tsx` — Layout raiz onde `<Toaster />` deve ser adicionado
  - `src/index.css` — CSS variables existentes para tema dark/light
  - `tailwind.config.js` — Configuração do Tailwind com cores customizadas
  - `package.json` — Dependências atuais (verificar conflitos)
  - Documentação Sonner: https://sonner.emilkowal.dev/ — API e configuração

  **WHY**: Sonner é a lib de toast recomendada pelo shadcn/ui e já integra com as CSS variables do tema. O `<Toaster />` deve ficar no topo da árvore React para funcionar globalmente. `visibleToasts={3}` evita flood visual e `richColors` dá cores semânticas automáticas.

  **Acceptance Criteria**:
  - [ ] `npx shadcn@latest add sonner` executado com sucesso
  - [ ] `npx shadcn@latest add alert-dialog` executado com sucesso
  - [ ] `<Toaster />` presente no layout raiz com props configuradas
  - [ ] `npx tsc --noEmit` sem erros
  - [ ] `npm run dev` renderiza sem crash, Toaster visível no DOM

  **QA Scenarios**:
  ```
  Scenario: Toaster appears in app layout
    Tool: Playwright
    Preconditions: App running with `npm run tauri dev`
    Steps:
      1. Navigate to any page
      2. Evaluate: document.querySelector('[data-sonner-toaster]') exists
      3. Verify Toaster has attribute position="top-right"
    Expected Result: Toaster element found with correct position
    Failure Indicators: Toaster element not found, wrong position attribute
    Evidence: .sisyphus/evidence/task-1-toaster-mounted.png
  ```

  **Commit**: YES (groups with T2-T6)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/components/ui/sonner.tsx, src/components/ui/alert-dialog.tsx, src/App.tsx, package.json`
  - Pre-commit: `npx tsc --noEmit`

- [x] 2. Criar Tipos de Notificação (notification.ts)

  **What to do**:
  - Criar `src/types/notification.ts`
  - Definir tipos TypeScript:
    ```typescript
    export type NotificationType = 'success' | 'error' | 'warning' | 'info';

    export interface AppError {
      type: 'error';
      context: string;        // Onde ocorreu: "Equipamentos", "Clientes", etc.
      action: string;         // O que estava fazendo: "Salvar equipamento", "Criar cliente"
      message: string;        // Mensagem amigável em PT-BR
      technicalDetails?: string;  // Stack trace ou detalhes técnicos
      originalError?: unknown;    // Erro original paraCopy
      timestamp: Date;
    }

    export interface NotificationMessage {
      type: NotificationType;
      context: string;
      action?: string;
      message: string;
      technicalDetails?: string;
      duration?: number;       // ms, override default
      actionLabel?: string;    // Label para botão de ação (ex: "Copiar detalhes")
      onAction?: () => void;   // Callback do botão de ação
    }

    export interface ErrorDisplayProps {
      error: AppError;
      showDetails?: boolean;   // Se detalhes técnicos são expandíveis
      showCopyButton?: boolean;
      className?: string;
      variant?: 'inline' | 'card' | 'toast';
    }

    export interface FormValidationErrorProps {
      message?: string;
      className?: string;
    }

    export interface ConfirmDialogProps {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description: string;
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: 'default' | 'destructive';
      onConfirm: () => void;
    }

    export interface InputDialogProps {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description?: string;
      label: string;
      placeholder?: string;
      defaultValue?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm: (value: string) => void;
      validate?: (value: string) => string | null; // Returns error message or null
    }
    ```
  - Exportar todos os tipos

  **Must NOT do**:
  - NÃO adicionar lógica de negócio nos tipos
  - NÃO importar libs externas nos tipos

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4, T5, T6)
  - **Blocks**: T3, T5, T7-T10
  - **Blocked By**: None

  **References**:
  - `src/types/` — Tipos existentes do projeto para seguir convenção de import/export
  - `src/types/index.ts` — Se existir barrel export, adicionar lá

  **WHY**: Tipos centralizados garantem consistência entre todos os componentes e a hook useNotification. A estrutura `context + action + message + technicalDetails` atende ao requisito de "qual erro + onde ocorre".

  **Acceptance Criteria**:
  - [ ] Arquivo `src/types/notification.ts` criado com todos os tipos
  - [ ] Tipos exportados corretamente
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Types are importable and correct
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run: npx tsc --noEmit
      2. Create temp file that imports all types from notification.ts
      3. Verify no type errors
    Expected Result: All types compile without errors
    Failure Indicators: Type errors, missing exports
    Evidence: .sisyphus/evidence/task-2-types-compile.txt

  Scenario: Types match notification requirements
    Tool: Bash
    Preconditions: Types file created
    Steps:
      1. Grep for NotificationType in notification.ts
      2. Grep for AppError in notification.ts
      3. Grep for ConfirmDialogProps in notification.ts
    Expected Result: All required types found
    Failure Indicators: Missing type definitions
    Evidence: .sisyphus/evidence/task-2-types-content.txt
  ```

  **Commit**: YES (groups with T1, T3-T6)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/types/notification.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 3. Criar Error Utility (error-utils.ts)

  **What to do**:
  - Criar `src/lib/error-utils.ts` com as seguintes funções:
    ```typescript
    import { AppError, NotificationMessage, NotificationType } from '@/types/notification';

    // Formatar um erro desconhecido em AppError estruturado
    export function formatAppError(params: {
      context: string;
      action: string;
      error: unknown;
      type?: 'error';
    }): AppError {
      const error = params.error;
      let message = 'Ocorreu um erro inesperado.';
      let technicalDetails: string | undefined;

      if (error instanceof Error) {
        message = error.message || message;
        technicalDetails = error.stack;
      } else if (typeof error === 'string') {
        message = error;
      }

      return {
        type: 'error',
        context: params.context,
        action: params.action,
        message,
        technicalDetails,
        originalError: error,
        timestamp: new Date(),
      };
    }

    // Criar mensagem de notificação padronizada
    export function createNotificationMessage(params: {
      type: NotificationType;
      context: string;
      action?: string;
      message: string;
      technicalDetails?: string;
    }): NotificationMessage {
      return {
        type: params.type,
        context: params.context,
        action: params.action,
        message: params.message,
        technicalDetails: params.technicalDetails,
      };
    }

    // Copiar detalhes do erro para clipboard
    export async function copyErrorDetails(error: AppError): Promise<boolean> {
      const details = formatErrorForCopy(error);
      try {
        await navigator.clipboard.writeText(details);
        return true;
      } catch {
        // Fallback: não copia, mas não crasha
        return false;
      }
    }

    // Formatar erro para cópia (human-readable)
    export function formatErrorForCopy(error: AppError): string {
      const lines = [
        `Contexto: ${error.context}`,
        `Ação: ${error.action}`,
        `Mensagem: ${error.message}`,
        `Data/Hora: ${error.timestamp.toISOString()}`,
      ];
      if (error.technicalDetails) {
        lines.push('', '--- Detalhes Técnicos ---', error.technicalDetails);
      }
      return lines.join('\n');
    }

    // Criar mensagem de erro amigável com contexto para toasts
    // Formato: "[Contexto] Ação — mensagem"
    export function formatToastMessage(notification: NotificationMessage): string {
      if (notification.action) {
        return `${notification.context} — ${notification.action}`;
      }
      return notification.message;
    }

    // Manter compatibilidade com traduzirErroSalvarEquipamento existente
    export { traduzirErroSalvarEquipamento } from '@/pages/equipamentos/equipamentos-page-utils';
    export { whatsappNaoConfigurado } from '@/pages/equipamentos/equipamentos-page-utils';
    ```
  - Certificar que `traduzirErroSalvarEquipamento` e `whatsappNaoConfigurado` são re-exportados para compatibilidade

  **Must NOT do**:
  - NÃO criar sistema de logging ou telemetria
  - NÃO modificar as funções existentes em equipamentos-page-utils.ts
  - NÃO adicionar storage/persistência de erros
  - NÃO criar categorias de severidade complexas

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (depends only on T2 types)
  - **Parallel Group**: Wave 1 (with T1, T4, T5, T6) — note: can start after T2 but parallel with others
  - **Blocks**: T5, T7, T8, T11-T17
  - **Blocked By**: T2

  **References**:
  - `src/types/notification.ts` — Tipos a usar (AppError, NotificationMessage)
  - `src/pages/equipamentos/equipamentos-page-utils.ts:66-70` — Funções existentes `traduzirErroSalvarEquipamento` e `whatsappNaoConfigurado` para re-exportar
  - `src/lib/utils.ts` — Convenção de utilitários do projeto

  **WHY**: O utilitário centraliza a formatação de erros para que todas as mensagens sigam o padrão "Contexto + Ação + Mensagem". Re-exportar funções existentes garante compatibilidade durante a migração gradual.

  **Acceptance Criteria**:
  - [ ] Arquivo `src/lib/error-utils.ts` criado com todas as funções
  - [ ] `formatAppError` converte Error, string e unknown em AppError
  - [ ] `copyErrorDetails` usa navigator.clipboard com fallback
  - [ ] `formatToastMessage` gera string no formato "[Contexto] ação"
  - [ ] Re-exports de funções existentes funcionam
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: formatAppError handles Error instance
    Tool: Bash (node)
    Steps:
      1. Import formatAppError from error-utils
      2. Call with { context: "Equipamentos", action: "Salvar", error: new Error("Teste") }
      3. Assert result.type === "error"
      4. Assert result.context === "Equipamentos"
      5. Assert result.action === "Salvar"
    Expected Result: AppError structured object with all fields populated
    Evidence: .sisyphus/evidence/task-3-format-error.txt

  Scenario: formatAppError handles string error
    Tool: Bash (node)
    Steps:
      1. Call formatAppError({ context: "Clientes", action: "Criar", error: "Erro de teste" })
      2. Assert result.message === "Erro de teste"
    Expected Result: String error mapped to message field

  Scenario: copyErrorDetails with clipboard fallback
    Tool: Bash (node)
    Steps:
      1. Create AppError object
      2. Call copyErrorDetails() in environment without clipboard
      3. Verify function returns false (doesn't crash)
    Expected Result: Returns false gracefully, no exception thrown
  ```

  **Commit**: YES (groups with T1, T2, T4-T6)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/lib/error-utils.ts`

- [x] 4. Criar ErrorBoundary Component

  **What to do**:
  - Criar `src/components/ErrorBoundary.tsx`
  - Implementar React ErrorBoundary com:
    - `componentDidCatch` para logar erro no console
    - Estado de erro com `hasError`, `error`, `errorInfo`
    - Render de fallback amigável em PT-BR:
      - Ícone de erro (lucide-react `AlertTriangle`)
      - Título: "Algo deu errado"
      - Mensagem: "Ocorreu um erro inesperado. Tente recarregar a página."
      - Se error.message existe, mostrar em seção expandível "Ver detalhes técnicos"
      - Botão "Copiar detalhes" usando `copyErrorDetails`
      - Botão "Recarregar página" que chama `window.location.reload()`
    - Estilo: Card com borda destructive, bg-destructive/5, coeso com design system
  - Adicionar ErrorBoundary no App.tsx envolvendo o router/layout principal
  - Usar cores do design system (destructive para erro, primary para botões)

  **Must NOT do**:
  - NÃO enviar erros para serviço remoto (telemetria)
  - NÃO adicionar sistema de auto-recovery
  - NÃO usar classes de CSS hardcoded — usar Tailwind + vars do tema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T5, T6)
  - **Blocks**: T19
  - **Blocked By**: None (uses basic React patterns, no project dependencies)

  **References**:
  - `src/App.tsx` — Onde adicionar ErrorBoundary envolvendo o layout
  - `src/index.css` — CSS variables (destructive color: `--destructive`, `--destructive-foreground`)
  - `tailwind.config.js` — Classes Tailwind disponíveis (destructive, bg-destructive, etc.)
  - `src/components/ui/card.tsx` — Card component para referência de estilo
  - `lucide-react` — Ícone `AlertTriangle` para fallback visual

  **WHY**: ErrorBoundary captura erros não tratados na renderização, impedindo tela branca. O fallback com botão de recarregar e detalhes expandíveis atende ao requisito de "saber qual o erro e onde ocorre".

  **Acceptance Criteria**:
  - [ ] Arquivo `src/components/ErrorBoundary.tsx` criado
  - [ ] ErrorBoundary envolve layout principal em App.tsx
  - [ ] Fallback renderiza com título, mensagem, detalhes expandíveis em PT-BR
  - [ ] Botão "Copiar detalhes" funcional (clipboard)
  - [ ] Botão "Recarregar página" funcional (window.location.reload)
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: ErrorBoundary catches render error
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Inject a component that throws in render (temporary test component)
      2. Navigate to page with error
      3. Verify ErrorBoundary fallback appears with "Algo deu errado"
      4. Click "Ver detalhes técnicos" expand
      5. Verify error message visible
      6. Click "Recarregar página"
    Expected Result: Fallback UI shown with error details, reload works
    Failure Indicators: White screen, no fallback, crash
    Evidence: .sisyphus/evidence/task-4-error-boundary.png

  Scenario: Copy details button works
    Tool: Playwright
    Preconditions: ErrorBoundary fallback visible
    Steps:
      1. Trigger error boundary
      2. Click "Copiar detalhes" button
      3. Verify clipboard contains context + error info
    Expected Result: Clipboard populated with formatted error text
    Evidence: .sisyphus/evidence/task-4-copy-details.txt
  ```

  **Commit**: YES (groups with T1-T3, T5, T6)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/components/ErrorBoundary.tsx, src/App.tsx`

- [x] 5. Criar useNotification Hook

  **What to do**:
  - Criar `src/hooks/useNotification.ts`
  - Implementar hook que encapsula o Sonner `toast` com formato padronizado:
    ```typescript
    import { toast } from 'sonner';
    import { NotificationMessage, AppError } from '@/types/notification';
    import { formatAppError, copyErrorDetails, formatToastMessage } from '@/lib/error-utils';

    export function useNotification() {
      const success = (context: string, message: string, action?: string) => {
        toast.success(formatToastMessage({ type: 'success', context, action, message }), {
          description: message,
          duration: 3000,
        });
      };

      const error = (context: string, action: string, error: unknown) => {
        const appError = formatAppError({ context, action, error });
        const errorMessage = appError.message;
        toast.error(formatToastMessage({ type: 'error', context, action, message: errorMessage }), {
          description: errorMessage,
          duration: Infinity, // Manual dismiss
          action: {
            label: 'Copiar detalhes',
            onClick: () => copyErrorDetails(appError),
          },
        });
      };

      const warning = (context: string, message: string, action?: string) => {
        toast.warning(formatToastMessage({ type: 'warning', context, action, message }), {
          description: message,
          duration: 5000,
        });
      };

      const info = (context: string, message: string, action?: string) => {
        toast.info(formatToastMessage({ type: 'info', context, action, message }), {
          description: message,
          duration: 4000,
        });
      };

      return { success, error, warning, info };
    }
    ```
  - Duração por tipo: success=3s, warning=5s, info=4s, error=Infinity (manual dismiss)
  - Erros sempre têm botão "Copiar detalhes"
  - Mensagem no formato: "[Contexto] — Ação" ou "[Contexto] — mensagem"

  **Must NOT do**:
  - NÃO criar estado React para notificações (Sonner gerencia isso)
  - NÃO adicionar sistema de fila ou deduplicação (Sonner já tem `visibleToasts`)
  - NÃO modificar Sonner internals

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1 and T3)
  - **Parallel Group**: Wave 1 (with T4, T6, after T1+T3)
  - **Blocks**: T11-T15 (all migration tasks use this hook)
  - **Blocked By**: T1 (Sonner install), T3 (error-utils)

  **References**:
  - `src/types/notification.ts` — Tipos NotificationMessage, AppError
  - `src/lib/error-utils.ts` — Funções formatAppError, copyErrorDetails, formatToastMessage
  - Sonner docs: https://sonner.emilkowal.dev/ — API toast.success(), toast.error(), etc.
  - `src/hooks/useClientes.ts` — Referência de convenção de hooks do projeto
  - `src/App.tsx` — Onde Toaster está montado

  **WHY**: O hook padroniza como todas as notificações são disparadas no app. Toda página usará `const { success, error, warning, info } = useNotification()` em vez de chamar `toast` diretamente, garantindo formato consistente.

  **Acceptance Criteria**:
  - [ ] Arquivo `src/hooks/useNotification.ts` criado
  - [ ] Hook exporta { success, error, warning, info }
  - [ ] Erros têm durations=Infinity e botão "Copiar detalhes"
  - [ ] Success=3s, warning=5s, info=4s
  - [ ] Mensagens formatadas como "[Contexto] — Ação"
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: success notification displays correctly
    Tool: Playwright
    Preconditions: App running with Toaster
    Steps:
      1. Trigger a success notification via console or test button
      2. Verify toast appears with success style (green)
      3. Verify toast auto-dismisses after ~3 seconds
    Expected Result: Green success toast appears, disappears after 3s
    Evidence: .sisyphus/evidence/task-5-success-toast.png

  Scenario: error notification has copy details button
    Tool: Playwright
    Preconditions: App running with Toaster
    Steps:
      1. Trigger an error notification
      2. Verify toast appears with error style (red)
      3. Verify "Copiar detalhes" action button is visible
      4. Verify toast does NOT auto-dismiss (stays on screen)
      5. Click "Copiar detalhes"
    Expected Result: Red error toast with action button, persists until manual dismiss, clipboard populated
    Evidence: .sisyphus/evidence/task-5-error-toast.png
  ```

  **Commit**: YES (groups with T1-T4, T6)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/hooks/useNotification.ts`

- [x] 6. Adicionar CSS Variables para Warning e Info

  **What to do**:
  - Editar `src/index.css` para adicionar variáveis CSS de tema para warning e info caso não existam:
    - Adicionar `--warning` e `--warning-foreground` em `:root` e `.dark`
    - Adicionar `--info` e `--info-foreground` em `:root` e `.dark`
  - Adicionar cores correspondentes no `tailwind.config.js` se necessário (extensão do tema)
  - Valores sugeridos:
    - Warning: `--warning: 38 92% 50%` (amber/laranja), `--warning-foreground: 0 0% 100%` (branco)
    - Info: `--info: 199 89% 48%` (azul-ciano), `--info-foreground: 0 0% 100%` (branco)
  - Dark mode:
    - Warning dark: `--warning: 38 92% 50%`, `--warning-foreground: 0 0% 100%`
    - Info dark: `--info: 199 89% 48%`, `--info-foreground: 0 0% 100%`

  **Must NOT do**:
  - NÃO modificar variáveis CSS existentes (primary, destructive, etc.)
  - NÃO remover ou alterar o tema dark existente
  - NÃO adicionar animaçõescomplexas

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1-T5)
  - **Blocks**: T7 (ErrorAlert usa cores de warning)
  - **Blocked By**: None

  **References**:
  - `src/index.css` — Bloco `:root` e `.dark` com todas as variáveis atuais
  - `tailwind.config.js` — Extensão de cores do Tailwind, adicionar warning/info

  **WHY**: O Sonner usa `--destructive` para erros mas não tem cores nativas para warning/info. Adicionar essas variáveis garante consistência visual entre toasts, ErrorAlert e demais componentes.

  **Acceptance Criteria**:
  - [ ] Variáveis `--warning`, `--warning-foreground`, `--info`, `--info-foreground` em `:root`
  - [ ] Variáveis correspondentes em `.dark`
  - [ ] Tailwind config estendido com cores `warning` e `info`
  - [ ] `npx tsc --noEmit` sem erros
  - [ ] Build do app sem erros

  **QA Scenarios**:
  ```
  Scenario: CSS variables are applied in dark and light mode
    Tool: Playwright
    Steps:
      1. Navigate to any page
      2. Evaluate getComputedStyle(document.documentElement).getPropertyValue('--warning') exists
      3. Evaluate getComputedStyle(document.documentElement).getPropertyValue('--info') exists
      4. Toggle dark mode (if applicable) and re-check
    Expected Result: Both --warning and --info variables exist in light and dark themes
    Evidence: .sisyphus/evidence/task-6-css-vars.txt
  ```

  **Commit**: YES (groups with T1-T5)
  - Message: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary, hook, css)`
  - Files: `src/index.css, tailwind.config.js`

- [x] 7. Criar ErrorAlert Component

  **What to do**:
  - Criar `src/components/ui/error-alert.tsx`
  - Componente React para exibição inline de erros, substituindo os 5 padrões visuais inconsistentes
  - Props baseadas em `ErrorDisplayProps` de `src/types/notification.ts`
  - Variantes visuais:
    - `variant="error"` (default): borda red-200, bg-red-50, texto red-700, ícone AlertCircle
    - `variant="warning"`: borda amber-200, bg-amber-50, texto amber-900, ícone AlertTriangle
    - `variant="info"`: borda blue-200, bg-blue-50, texto blue-700, ícone Info
    - `variant="success"`: borda emerald-200, bg-emerald-50, texto emerald-700, ícone CheckCircle
  - Funcionalidades:
    - Seção expandível "Ver detalhes técnicos" (colapsada por default)
    - Botão "Copiar" que chama `copyErrorDetails` do error-utils
    - Usa `cn()` para classes condicionais
    - Usa ícones do lucide-react
    - Todas as mensagens em PT-BR
  - Exemplo de uso: `<ErrorAlert variant="error" context="Equipamentos" action="Salvar" message="Não foi possível salvar" technicalDetails={error.stack} />`

  **Must NOT do**:
  - NÃO usar cores hardcoded — usar CSS variables do design system onde possível
  - NÃO adicionar animações complexas (apenas expand/collapse simples)
  - NÃO criar sistema de logging

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8, T9, T10 after Wave 1)
  - **Parallel Group**: Wave 2 (with T8, T9, T10)
  - **Blocks**: T11, T12, T13, T16
  - **Blocked By**: T3 (error-utils), T6 (CSS vars)

  **References**:
  - `src/types/notification.ts` — ErrorDisplayProps type
  - `src/lib/error-utils.ts` — formatAppError, copyErrorDetails
  - `src/lib/utils.ts` — cn() utility
  - `src/components/ui/card.tsx` — Referência de estrutura de card component shadcn
  - `src/components/ui/badge.tsx` — Referência de variantes com CVA
  - `src/index.css` — CSS variables (destructive, warning, info)
  - `lucide-react` — AlertCircle, AlertTriangle, Info, CheckCircle icons
  - `src/pages/configuracoes/ConfiguracoesTabInfra.tsx:73-75` — Padrão existente: `border border-amber-200 bg-amber-50 text-amber-900` (usar como referência)

  **WHY**: ErrorAlert unifica 5 padrões visuais diferentes em 1 componente com variante consistente. A seção expandível atende ao requisito de detalhes técnicos híbridos. O botão "Copiar" usa o utilitário já criado.

  **Acceptance Criteria**:
  - [ ] Arquivo `src/components/ui/error-alert.tsx` criado
  - [ ] 4 variantes visuais (error, warning, info, success)
  - [ ] Seção "Ver detalhes técnicos" expandível
  - [ ] Botão "Copiar" funcional
  - [ ] Usa cn() e CSS variables
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: ErrorAlert renders all variants correctly
    Tool: Playwright
    Preconditions: App running with test page showing all ErrorAlert variants
    Steps:
      1. Render ErrorAlert variant="error" with a test error
      2. Verify red border, red background, AlertCircle icon visible
      3. Render variant="warning" — verify amber styling
      4. Render variant="info" — verify blue styling
      5. Render variant="success" — verify emerald styling
    Expected Result: Each variant renders with correct colors and icons
    Evidence: .sisyphus/evidence/task-7-error-alert-variants.png

  Scenario: Technical details expand and copy works
    Tool: Playwright
    Preconditions: ErrorAlert with technical details rendered
    Steps:
      1. Verify details section is collapsed by default
      2. Click "Ver detalhes técnicos" toggle
      3. Verify details section expanded with stack trace visible
      4. Click "Copiar" button
      5. Verify clipboard contains formatted error text
    Expected Result: Expand/collapse works, copy populates clipboard
    Failure Indicators: Details always visible, copy button does nothing
    Evidence: .sisyphus/evidence/task-7-details-expand.png
  ```

  **Commit**: YES (groups with T8-T10)
  - Message: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Files: `src/components/ui/error-alert.tsx`

- [x] 8. Criar FormValidationError Component

  **What to do**:
  - Criar `src/components/ui/form-validation-error.tsx`
  - Componente React para erros de validação de formulário, padronizando o padrão `text-xs text-red-500`
  - Props: `message?: string`, `className?: string`
  - Renderiza `<p className="text-xs text-red-500 {className}">{message}</p>` quando message existe, null caso contrário
  - Usa ícone AlertCircle (pequeno, inline) do lucide-react
  - Selo visual: pequeno ícone + texto em vermelho, consistente com ErrorAlert variant="error"

  **Must NOT do**:
  - NÃO mudar lógica de validação dos forms (Zod, react-hook-form)
  - NÃO adicionar animações
  - NÃO mudar a estrutura dos forms existentes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, T9, T10)
  - **Parallel Group**: Wave 2 (with T7, T9, T10)
  - **Blocks**: T17 (form validation migration)
  - **Blocked By**: T3 (error-utils types)

  **References**:
  - `src/types/notification.ts` — FormValidationErrorProps type
  - `src/lib/utils.ts` — cn() utility
  - `src/components/clientes/ClienteFormularioCampos.tsx:48-139` — Padrão existente: `{form.formState.errors.<field> && <p className="text-xs text-red-500">{form.formState.errors.<field>.message}</p>}`
  - `src/pages/insumos/InsumosDialogs.tsx:60-264` — Padrão similar em Insumos
  - `lucide-react` — AlertCircle icon

  **WHY**: Hoje existem ~20 campos com erros inline usando `text-xs text-red-500`. O componente padroniza o visual, adiciona ícone e garante consistência. Migração é simples: `<FormValidationError message={errors.field?.message} />`.

  **Acceptance Criteria**:
  - [ ] Arquivo `src/components/ui/form-validation-error.tsx` criado
  - [ ] Renderiza `<p>` com ícone + texto quando message existe
  - [ ] Retorna null quando message é undefined/null/empty
  - [ ] Usa text-xs text-red-500 + ícone AlertCircle
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: FormValidationError renders with message
    Tool: Playwright
    Steps:
      1. Render FormValidationError message="Campo obrigatório"
      2. Verify p element with text-xs text-red-500 classes
      3. Verify AlertCircle icon visible
      4. Verify text content is "Campo obrigatório"
    Expected Result: Error message with icon displays correctly

  Scenario: FormValidationError returns null without message
    Tool: Playwright
    Steps:
      1. Render FormValidationError message={undefined}
      2. Verify no DOM element rendered
      3. Render FormValidationError message=""
      4. Verify no DOM element rendered
    Expected Result: Nothing rendered when no error
  ```

  **Commit**: YES (groups with T7, T9, T10)
  - Message: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Files: `src/components/ui/form-validation-error.tsx`

- [x] 9. Criar ConfirmDialog Component

  **What to do**:
  - Criar `src/components/ui/confirm-dialog.tsx`
  - Componente React baseado no AlertDialog do shadcn, com interface simplificada
  - Props usam `ConfirmDialogProps` de `src/types/notification.ts`:
    - `open`, `onOpenChange`, `title`, `description`, `confirmLabel` (default: "Confirmar"), `cancelLabel` (default: "Cancelar"), `variant` (default | destructive), `onConfirm`
  - Comportamento:
    - Quando `variant="destructive"`: botão confirmar usa `bg-destructive text-destructive-foreground`
    - Focus trap no dialog (já fornecido pelo AlertDialog)
    - Close on ESC e click fora
  - Usado para substituir `window.confirm()` e diálogos de confirmação destrutiva (excluir, etc.)

  **Must NOT do**:
  - NÃO adicionar funcionalidade além de confirmar/cancelar
  - NÃO modificar o AlertDialog base do shadcn
  - NÃO criar sistema de fila de dialogs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, T8, T10)
  - **Parallel Group**: Wave 2 (with T7, T8, T10)
  - **Blocks**: T11 (Equipamentos uses window.confirm)
  - **Blocked By**: T1 (AlertDialog install)

  **References**:
  - `src/types/notification.ts` — ConfirmDialogProps type
  - `src/components/ui/alert-dialog.tsx` — AlertDialog base do shadcn (instalado em T1)
  - `src/components/ui/dialog.tsx` — Referência de padrão de dialog existente (close button, overlay, etc.)
  - `tailwind.config.js` — destructive color slot
  - `src/pages/equipamentos/Equipamentos.tsx:458` — Uso atual: `if (window.confirm("..."))` — caso real de uso

  **WHY**: O app tem 1 `window.confirm()` que precisa ser substituído. ConfirmDialog fornece uma interface limpa e reutilizável baseada no AlertDialog do shadcn, com variante destructive para ações destrutivas (excluir).

  **Acceptance Criteria**:
  - [ ] Arquivo `src/components/ui/confirm-dialog.tsx` criado
  - [ ] Variantes "default" e "destructive" funcionam
  - [ ] Focus trap funciona (Tab não escapa do dialog)
  - [ ] Close on ESC funciona
  - [ ] onConfirm e onCancel chamados corretamente
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: ConfirmDialog renders with destructive variant
    Tool: Playwright
    Steps:
      1. Render ConfirmDialog open={true} variant="destructive" title="Excluir item" description="Esta ação não pode ser desfeita."
      2. Verify dialog appears with overlay
      3. Verify destructive-styled confirm button (red background)
      4. Verify "Cancelar" and "Confirmar" buttons visible
      5. Click "Cancelar" — verify dialog closes, onConfirm NOT called
    Expected Result: Destructive dialog with red confirm button, cancel closes dialog

  Scenario: ConfirmDialog keyboard interaction
    Tool: Playwright
    Steps:
      1. Open ConfirmDialog
      2. Press ESC — verify dialog closes
      3. Open ConfirmDialog again
      4. Press Tab — verify focus stays within dialog (focus trap)
    Expected Result: ESC closes, focus trapped inside dialog
  ```

  **Commit**: YES (groups with T7, T8, T10)
  - Message: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Files: `src/components/ui/confirm-dialog.tsx`

- [x] 10. Criar InputDialog Component

  **What to do**:
  - Criar `src/components/ui/input-dialog.tsx`
  - Componente React baseado no AlertDialog + Input do shadcn, para substituir `window.prompt()`
  - Props usam `InputDialogProps` de `src/types/notification.ts`:
    - `open`, `onOpenChange`, `title`, `description?`, `label`, `placeholder?`, `defaultValue?`, `confirmLabel` (default: "Confirmar"), `cancelLabel` (default: "Cancelar"), `onConfirm: (value: string) => void`, `validate?: (value: string) => string | null`
  - Comportamento:
    - Campo de texto (Input) com label
    - Validação opcional via prop `validate` — se retorna string, mostra erro inline
    - Enter confirma, ESC cancela
    - Focus automático no campo de input
  - Usado para substituir o `window.prompt` em Equipamentos.tsx (solicitarEmailParaEnvio)

  **Must NOT do**:
  - NÃO criar formulário complexo (é para input simples)
  - NÃO adicionar tipos de campo além de texto (textarea, number, etc.)
  - NÃO modificar o AlertDialog base

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, T8, T9)
  - **Parallel Group**: Wave 2 (with T7, T8, T9)
  - **Blocks**: T11 (Equipamentos uses window.prompt)
  - **Blocked By**: T1 (AlertDialog install)

  **References**:
  - `src/types/notification.ts` — InputDialogProps type
  - `src/components/ui/alert-dialog.tsx` — AlertDialog base do shadcn
  - `src/components/ui/input.tsx` — Input component do shadcn para referência
  - `src/components/ui/label.tsx` — Label component do shadcn
  - `src/pages/equipamentos/Equipamentos.tsx:809` — Uso atual: `solicitarEmailParaEnvio()` usa `window.prompt("Digite o email...")` — caso real

  **WHY**: O app tem 1 `window.prompt()` (para solicitar email) que precisa ser substituído. InputDialog oferece UI coesa com o app em vez do diálogo nativo do browser. A validação inline permite feedback imediato.

  **Acceptance Criteria**:
  - [ ] Arquivo `src/components/ui/input-dialog.tsx` criado
  - [ ] Input com label renderiza corretamente
  - [ ] Enter confirma e chama onConfirm com valor digitado
  - [ ] ESC cancela e fecha dialog
  - [ ] Validação inline funciona (validate retorna erro → mostra mensagem)
  - [ ] Focus automático no input ao abrir
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: InputDialog renders and accepts input
    Tool: Playwright
    Steps:
      1. Render InputDialog open={true} title="Enviar por email" label="Email" placeholder="email@exemplo.com"
      2. Verify dialog appears with Input field focused
      3. Type "test@example.com" in the input
      4. Click "Confirmar"
      5. Verify onConfirm called with "test@example.com"
    Expected Result: Dialog shows, input accepted, callback called correctly

  Scenario: InputDialog validation rejects invalid input
    Tool: Playwright
    Steps:
      1. Render InputDialog with validate={(v) => v.includes('@') ? null : 'Email inválido'}
      2. Type "invalid" in input
      3. Click "Confirmar"
      4. Verify inline error "Email inválido" appears
      5. Verify dialog stays open (not confirmed)
      6. Type "valid@email.com"
      7. Click "Confirmar"
      8. Verify onConfirm called with "valid@email.com"
    Expected Result: Validation prevents submission, shows error, allows valid input
  ```

  **Commit**: YES (groups with T7-T9)
  - Message: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Files: `src/components/ui/input-dialog.tsx`

**Commit**: YES (groups with T7-T9)
  - Message: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Files: `src/components/ui/input-dialog.tsx`

- [x] 11. Migrar Equipamentos.tsx (Maior ofensor — ~30 alert calls)

  **What to do**:
  - Migrar TODOS os `alert()` calls em `src/pages/Equipamentos.tsx` para o novo sistema:
  - **Mensagens de sucesso** (alert com texto positivo): → `useNotification().success(context, message)`
    - Ex: `alert("Equipamento salvo com sucesso!")` → `success("Equipamentos", "Equipamento salvo com sucesso.", "Salvar")`
  - **Mensagens de erro** (alert em catch blocks): → `useNotification().error(context, action, error)`
    - Ex: `alert(err?.message || "Erro ao salvar equipamento.")` → `error("Equipamentos", "Salvar equipamento", err)`
  - **Mensagens informativas/guardas**: → `useNotification().warning()` ou `.info()`
    - Ex: `alert("Nenhuma verificação encontrada.")` → `warning("Equipamentos", "Nenhuma verificação técnica encontrada para este equipamento.")`
  - **window.confirm** (equipamentos duplicados): → `ConfirmDialog` com `variant="destructive"`
  - **window.prompt** (solicitar email): → `InputDialog` com validação de email
  - **erroCliente state**: → `ErrorAlert variant="error"` com seção de detalhes
  - **erroImagens state**: → `ErrorAlert variant="error"`
  - Adicionar `const { success, error, warning, info } = useNotification()` no topo do componente
  - Adicionar states para ConfirmDialog e InputDialog: `confirmDialogOpen`, `confirmDialogAction`, `inputDialogOpen`, `inputDialogValue`, etc.
  - Para cada alert substituído, verificar se o fluxo do usuário permanece o mesmo (blocking vs non-blocking)
    - Guardas informativas (nenhuma verificação encontrada) → non-blocking toast → pode precisar de `await` ou reestruturação se o fluxo dependia do bloqueio

  **Must NOT do**:
  - NÃO mudar a lógica de negócio (apenas substituir mecanismo de display)
  - NÃO remover funcionalidades existentes (como verificar equipamento duplicado)
  - NÃO adicionar novos erros ou validações que não existiam
  - NÃO alterar o fluxo do usuário — se o alert era blocking, o comportamento deve ser equivalente

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Arquivo de 1466 linhas, ~30 substituições cuidadosas que requerem understanding de contexto

  **Parallelization**:
  - **Can Run In Parallel**: NO (arquivo grande, conflito potencial)
  - **Parallel Group**: Wave 3 (first, blocks nothing else in this file)
  - **Blocks**: T20 (build check needs clean compile)
  - **Blocked By**: T5 (useNotification), T7 (ErrorAlert), T9 (ConfirmDialog), T10 (InputDialog)

  **References**:
  - `src/pages/Equipamentos.tsx` — O arquivo principal a migrar (1466 linhas)
  - `src/pages/equipamentos/equipamentos-page-utils.ts:66` — `whatsappNaoConfigurado()` — função existente a manter
  - `src/pages/equipamentos/equipamentos-page-utils.ts:70` — `traduzirErroSalvarEquipamento()` — função existente a manter
  - `src/hooks/useNotification.ts` — Hook `useNotification()` para usar no lugar de `alert()`
  - `src/components/ui/error-alert.tsx` — ErrorAlert para estados erroCliente, erroImagens
  - `src/components/ui/confirm-dialog.tsx` — ConfirmDialog para window.confirm
  - `src/components/ui/input-dialog.tsx` — InputDialog para window.prompt
  - `src/components/ProfileSessionDialog.tsx` — Referência de como dialogs são gerenciados com state (open/onOpenChange)

  **WHY**: Equipamentos.tsx é o maior ofensor com ~30 alert() calls. A migração requer cuidado porque alguns alerts são guardas blocking e outros são mensagens non-blocking. Cada caso deve ser analisado individualmente.

  **Acceptance Criteria**:
  - [ ] Zero `alert()` calls em Equipamentos.tsx (grep confirma)
  - [ ] Zero `window.prompt` calls em Equipamentos.tsx
  - [ ] Zero `window.confirm` calls em Equipamentos.tsx
  - [ ] `useNotification()` importado e usado
  - [ ] ConfirmDialog e InputDialog usados para confirmações
  - [ ] ErrorAlert usado para erroCliente e erroImagens
  - [ ] Fluxo do usuário preservado (ações destrutivas ainda requerem confirmação)
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: No alert() calls remain in Equipamentos
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run: grep -n "alert(" src/pages/Equipamentos.tsx | grep -v "AlertDialog" | grep -v "// "
      2. Verify 0 results
    Expected Result: Zero browser alert() calls found
    Evidence: .sisyphus/evidence/task-11-no-alerts.txt

  Scenario: Success toast displays after saving equipment
    Tool: Playwright
    Steps:
      1. Navigate to Equipamentos page
      2. Fill in equipment form with valid data
      3. Click "Salvar"
      4. Verify toast.success appears with equipment context
      5. Verify toast auto-dismisses after 3 seconds
    Expected Result: Green success toast appears and auto-dismisses

  Scenario: Error toast displays with copy button on save failure
    Tool: Playwright
    Steps:
      1. Simulate a save error (e.g., duplicate serial number)
      2. Verify toast.error appears with error context
      3. Verify "Copiar detalhes" button visible
      4. Click "Copiar detalhes"
      5. Verify clipboard contains formatted error with context
    Expected Result: Red error toast with copy button, clipboard populated

  Scenario: ConfirmDialog replaces window.confirm for duplicate check
    Tool: Playwright
    Steps:
      1. Enter equipment with same serial number as existing
      2. Click "Salvar"
      3. Verify ConfirmDialog appears instead of native confirm
      4. Click "Confirmar" — verify duplicate is allowed
      5. Repeat and click "Cancelar" — verify action cancelled
    Expected Result: Styled dialog replaces native browser confirm

  Scenario: InputDialog replaces window.prompt for email input
    Tool: Playwright
    Steps:
      1. Trigger email sending flow
      2. Verify InputDialog appears instead of native prompt
      3. Type email, click Confirmar
      4. Verify email is passed correctly
    Expected Result: Styled dialog with email validation replaces native prompt
  ```

  **Commit**: YES
  - Message: `refactor(equipamentos): replace all alert/prompt/confirm with notification system`
  - Files: `src/pages/Equipamentos.tsx`
  - Pre-commit: `npx tsc --noEmit`

- [x] 12. Migrar Clientes Page + Surfacing de Hook Errors

  **What to do**:
  - Migrar `alert()` em `src/pages/Clientes.tsx` (1 call) para `useNotification().error()`
  - Migrar `alert()` em `src/pages/clientes/ClientesDialogs.tsx` (se houver) para toast
  - **Surfacing de hook error**: Adicionar display do `error` state de `useClientes` na página:
    - Atualmente: `const { clientes, loading, criar, atualizar, deletar, recarregar } = useClientes()` (error NÃO é desestruturado)
    - Novo: `const { clientes, loading, error, criar, atualizar, deletar, recarregar } = useClientes()`
    - Se `error` é truthy, renderizar `<ErrorAlert variant="error" message={error} context="Clientes" />`
  - Verificar ClientesDialogs.tsx para alerts e substituir

  **Must NOT do**:
  - NÃO modificar lógica interna do useClientes hook
  - NÃO adicionar novos estados de erro
  - NÃO mudar o fluxo de navegação da página

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different file from T11)
  - **Parallel Group**: Wave 3 (with T11, T13-T17)
  - **Blocks**: T20
  - **Blocked By**: T5 (useNotification), T7 (ErrorAlert)

  **References**:
  - `src/pages/Clientes.tsx:279` — `alert(err?.message || "Erro ao salvar cliente.")`
  - `src/pages/Clientes.tsx:97-98` — Destruturação de useClientes sem `error`
  - `src/hooks/useClientes.ts` — Hook com `error` state que não é consumido
  - `src/pages/clientes/ClientesDialogs.tsx` — Dialogs de cliente (verificar alerts)
  - `src/components/ui/error-alert.tsx` — ErrorAlert para surfacing

  **WHY**: Clientes.tsx tem apenas 1 alert() mas o hook error state não é renderizado. Surfacing do error state é tão importante quanto remover o alert().

  **Acceptance Criteria**:
  - [ ] Zero `alert()` calls em Clientes.tsx e ClientesDialogs.tsx
  - [ ] `error` state de useClientes é desestruturado e renderizado com ErrorAlert
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Client save error shows toast instead of alert
    Tool: Playwright
    Steps:
      1. Navigate to Clientes page
      2. Try to save invalid client data
      3. Verify toast.error appears (not browser alert)
    Expected Result: Toast notification shows error, no browser alert

  Scenario: Hook error state is displayed when load fails
    Tool: Playwright
    Steps:
      1. Simulate API error during client load (e.g., disconnect database)
      2. Verify ErrorAlert appears on page with error context
      3. Verify error message is descriptive
    Expected Result: ErrorAlert visible with "Clientes" context and error message
  ```

  **Commit**: YES (groups with T13-T14)
  - Message: `refactor(pages): migrate client/insumo/servico pages to notification system + surface hook errors`
  - Files: `src/pages/Clientes.tsx, src/pages/clientes/ClientesDialogs.tsx`

- [x] 13. Migrar Insumos Page + Surfacing de Hook Errors

  **What to do**:
  - Migrar 2 `alert()` calls em `src/pages/Insumos.tsx` para `useNotification()`
  - Migrar alerts em `src/pages/insumos/InsumosDialogs.tsx` (se houver)
  - **Surfacing de hook error**: Desestruturar `error` de `useInsumos` e renderizar com ErrorAlert
  - Verificar se InsumosDialogs já usa Dialog shadcn — se sim, adicionar ErrorAlert dentro dos dialogs

  **Must NOT do**:
  - NÃO modificar lógica interna do useInsumos hook
  - NÃO mudar fluxo de validação dos forms

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different file from T11, T12)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T5 (useNotification), T7 (ErrorAlert)

  **References**:
  - `src/pages/Insumos.tsx:213,236` — 2 alert() calls
  - `src/pages/Insumos.tsx` — Destruturação de useInsumos sem `error`
  - `src/hooks/useInsumos.ts` — Hook com `error` state não consumido
  - `src/pages/insumos/InsumosDialogs.tsx` — Dialogs de produto/movimentação/exclusão

  **Acceptance Criteria**:
  - [ ] Zero `alert()` calls em Insumos.tsx e InsumosDialogs.tsx
  - [ ] `error` state de useInsumos renderizado com ErrorAlert
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Insumo save error shows toast with context
    Tool: Playwright
    Steps:
      1. Navigate to Insumos page
      2. Try to save invalid product data
      3. Verify toast.error with "Insumos" context appears
    Expected Result: Toast notification with proper context

  Scenario: Hook error displayed when load fails
    Tool: Playwright
    Steps:
      1. Simulate load error
      2. Verify ErrorAlert appears on Insumos page
    Expected Result: ErrorAlert with "Insumos" context
  ```

  **Commit**: YES (groups with T12, T14)
  - Message: `refactor(pages): migrate client/insumo/servico pages to notification system + surface hook errors`
  - Files: `src/pages/Insumos.tsx, src/pages/insumos/InsumosDialogs.tsx`

- [x] 14. Migrar Servicos Page + Surfacing de Hook Errors

  **What to do**:
  - Migrar 2 `alert()` calls em `src/pages/Servicos.tsx` para `useNotification()`
  - **Surfacing de hook error**: Desestruturar `error` de `useServicos` e renderizar com ErrorAlert

  **Must NOT do**:
  - NÃO modificar lógica interna do useServicos hook
  - NÃO mudar validação dos forms

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different file)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T5 (useNotification)

  **References**:
  - `src/pages/Servicos.tsx:105,135` — 2 alert() calls
  - `src/hooks/useServicos.ts` — Hook com `error` state não consumido

  **Acceptance Criteria**:
  - [ ] Zero `alert()` calls em Servicos.tsx
  - [ ] `error` state de useServicos renderizado com ErrorAlert
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Servico save/delete error shows toast
    Tool: Bash (grep)
    Steps:
      1. grep -n "alert(" src/pages/Servicos.tsx
      2. Verify 0 results (excluding AlertDialog imports)
    Expected Result: No browser alert() calls found

  Scenario: Hook error displayed on Servicos page
    Tool: Playwright
    Steps:
      1. Navigate to Servicos page
      2. Trigger error state
      3. Verify ErrorAlert appears with "Servicos" context
    Expected Result: ErrorAlert visible on page
  ```

  **Commit**: YES (groups with T12, T13)
  - Message: `refactor(pages): migrate client/insumo/servico pages to notification system + surface hook errors`
  - Files: `src/pages/Servicos.tsx`

- [x] 15. Migrar VerificacaoTecnica + ClienteSelector

  **What to do**:
  - Migrar 1 `alert()` em `src/components/equipamentos/VerificacaoTecnica.tsx:158` para `useNotification().warning()`
    - Contexto: "Cada serviço precisa ter pelo menos um item selecionado"
  - Migrar 2 `alert()` em `src/components/equipamentos/ClienteSelector.tsx:246,249`:
    - CPF/CNPJ duplicado → `warning()`
    - Erro ao criar cliente → `error()`
  - Verificar se estes componentes precisam de ErrorAlert para estados de erro em JSX

  **Must NOT do**:
  - NÃO mudar a lógica de validação
  - NÃO modificar estrutura dos componentes além da substituição de alert

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different files)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T5 (useNotification)

  **References**:
  - `src/components/equipamentos/VerificacaoTecnica.tsx:158` — `alert("Cada serviço precisa ter pelo menos um item selecionado.")`
  - `src/components/equipamentos/ClienteSelector.tsx:246,249` — 2 alert() calls
  - `src/hooks/useNotification.ts` — Hook para usar

  **Acceptance Criteria**:
  - [ ] Zero `alert()` calls em VerificacaoTecnica.tsx
  - [ ] Zero `alert()` calls em ClienteSelector.tsx
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Verification validation shows warning toast
    Tool: Bash (grep)
    Steps:
      1. grep -n "alert(" src/components/equipamentos/VerificacaoTecnica.tsx
      2. Verify 0 results
    Expected Result: Zero alert() calls

  Scenario: Cliente selector errors show toast
    Tool: Bash (grep)
    Steps:
      1. grep -n "alert(" src/components/equipamentos/ClienteSelector.tsx
      2. Verify 0 results
    Expected Result: Zero alert() calls
  ```

  **Commit**: YES (with T11-T14, T16-T17)
  - Message: `refactor(components): migrate verification, config, and form validation to unified error system`
  - Files: `src/components/equipamentos/VerificacaoTecnica.tsx, src/components/equipamentos/ClienteSelector.tsx`

- [x] 16. Migrar Configuracoes Error Displays (4 seções)

  **What to do**:
  - Substituir padrões de erro inline inconsistentes nas tabs de Configuracoes:
    1. `ConfiguracoesTabInfra.tsx`: Substituir `border-amber-200 bg-amber-50 text-amber-900` → `<ErrorAlert variant="warning" />`
    2. `ConfiguracoesTabInfra.tsx` (backup/restore errors): Mesmo padrão → `<ErrorAlert variant="error" />`
    3. `ConfiguracoesTabSeguranca.tsx`: Substituir `text-sm text-muted-foreground` → `<ErrorAlert variant="info" />` (para security messages)
    4. `ConfiguracoesTabObservabilidade.tsx`: Substituir `border-amber-200 bg-amber-50 text-amber-900` → `<ErrorAlert variant="error" />`
  - Também substituir padrões de sucesso inline (`border-emerald-200 bg-emerald-50 text-emerald-700/900`) → `<ErrorAlert variant="success" />`
  - Manter a semântica do tipo de mensagem (warning, error, info, success)

  **Must NOT do**:
  - NÃO mudar a lógica dos tabs — apenas substituir visual
  - NÃO remover funcionalidades de backup/restore
  - NÃO adicionar novos estados de erro

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different files from T11-T15)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T7 (ErrorAlert)

  **References**:
  - `src/pages/configuracoes/ConfiguracoesTabInfra.tsx:73-75` — `border border-amber-200 bg-amber-50 text-amber-900 rounded-lg` com `schemaError`
  - `src/pages/configuracoes/ConfiguracoesTabInfra.tsx:180-182` — mesmo padrão com `backupError`
  - `src/pages/configuracoes/ConfiguracoesTabInfra.tsx:253-255` — mesmo padrão com `restoreError`
  - `src/pages/configuracoes/ConfiguracoesTabSeguranca.tsx:388` — `text-sm text-muted-foreground` com `securityMessage`
  - `src/pages/configuracoes/ConfiguracoesTabObservabilidade.tsx:136-138` — `border-amber-200 bg-amber-50 text-amber-900` com `supportError`
  - `src/components/ui/error-alert.tsx` — ErrorAlert com variantes error/warning/info/success

  **WHY**: Configuracoes tem o padrão mais consistente (amber-warning) mas ainda inconsistente com o resto do app. Unificar para ErrorAlert com variantes semânticas.

  **Acceptance Criteria**:
  - [ ] Todos os erros inline em ConfiguracoesTabInfra usam ErrorAlert
  - [ ] SecurityMessage em ConfiguracoesTabSeguranca usa ErrorAlert variant="info"
  - [ ] Erros em ConfiguracoesTabObservabilidade usam ErrorAlert
  - [ ] Mensagens de sucesso usam ErrorAlert variant="success"
  - [ ] Zero instâncias de `border-amber-200 bg-amber-50 text-amber-900` em Configuracoes tabs
  - [ ] `npx tsc --noEmit` sem erros

  **QA Scenarios**:
  ```
  Scenario: Schema error displays with ErrorAlert warning variant
    Tool: Playwright
    Steps:
      1. Navigate to Configuracoes → Infra tab
      2. Trigger schema error (e.g., inconsistent schema)
      3. Verify ErrorAlert with warning variant appears (amber colors)
    Expected Result: ErrorAlert warning with amber styling

  Scenario: Backup success displays with success variant
    Tool: Playwright
    Steps:
      1. Navigate to Configuracoes → Infra tab
      2. Trigger successful backup
      3. Verify success toast appears and/or ErrorAlert success inline
    Expected Result: Success notification with green styling
  ```

  **Commit**: YES (groups with T15, T17)
  - Message: `refactor(components): migrate verification, config, and form validation to unified error system`
  - Files: `src/pages/configuracoes/ConfiguracoesTabInfra.tsx, src/pages/configuracoes/ConfiguracoesTabSeguranca.tsx, src/pages/configuracoes/ConfiguracoesTabObservabilidade.tsx`

- [x] 17. Migrar Form Validation Patterns (5 forms → FormValidationError)

  **What to do**:
  - Substituir erros de validação inline em todos os formulários:
    1. `src/components/clientes/ClienteFormularioCampos.tsx` — ~5 campos com `{errors.field && <p className="text-xs text-red-500">{errors.field.message}</p>}`
    2. `src/pages/insumos/InsumosDialogs.tsx` — ~5 campos com mesmo padrão
    3. `src/pages/Equipamentos.tsx` — ~6 campos com mesmo padrão (pode já estar migrado em T11)
    4. `src/pages/Servicos.tsx` — ~2 campos
    5. Qualquer outro form com `text-xs text-red-500`
  - Padrão antigo: `{form.formState.errors.<field> && <p className="text-xs text-red-500">{form.formState.errors.<field>.message}</p>}`
  - Padrão novo: `<FormValidationError message={form.formState.errors.<field>?.message} />`
  - Buscar com `grep -rn "text-red-500" src/ --include="*.tsx" | grep "errors"` para encontrar todos

  **Must NOT do**:
  - NÃO mudar as regras de validação (Zod schemas)
  - NÃO mudar a estrutura dos forms
  - NÃO remover campos de validação
  - NÃO adicionar validações adicionais

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (different files)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T8 (FormValidationError)

  **References**:
  - `src/components/ui/form-validation-error.tsx` — Novo componente FormValidationError
  - `src/components/clientes/ClienteFormularioCampos.tsx:48-139` — 5 campos de validação
  - `src/pages/insumos/InsumosDialogs.tsx:60-264` — 5 campos
  - `src/pages/Equipamentos.tsx:1414-1448` — 6 campos (pode já estar migrado em T11)
  - `src/pages/Servicos.tsx:250-258` — 2 campos
  - Search pattern: `grep -rn "text-red-500" src/ --include="*.tsx" | grep "errors"`

  **WHY**: Padronizar os ~20 campos de validação para usar um componente consistente em vez de `text-xs text-red-500` hardcoded em cada lugar.

  **Acceptance Criteria**:
  - [ ] Todos os erros de validação inline usam `<FormValidationError />`
  - [ ] `grep -rn "text-xs text-red-500" src/ --include="*.tsx"` retorna 0 em contextos de form error (pode haver outros usos legítimos)
  - [ ] `npx tsc --noEmit` sem erros
  - [ ] Formulários ainda funcionam: validação mostra erros nos campos

  **QA Scenarios**:
  ```
  Scenario: Client form validation uses FormValidationError
    Tool: Playwright
    Steps:
      1. Navigate to Clientes → New client form
      2. Click "Salvar" without filling required fields
      3. Verify validation errors appear using FormValidationError component
      4. Verify errors show with AlertCircle icon
    Expected Result: Validation errors display with consistent styling and icon

  Scenario: All form validation patterns migrated
    Tool: Bash
    Steps:
      1. grep -rn "text-xs text-red-500" src/ --include="*.tsx" | grep "errors\|formState"
      2. Verify 0 results (all migrated)
    Expected Result: Zero hardcoded validation error patterns remaining
  ```

  **Commit**: YES (groups with T15, T16)
  - Message: `refactor(components): migrate verification, config, and form validation to unified error system`
  - Files: `src/components/clientes/ClienteFormularioCampos.tsx, src/pages/insumos/InsumosDialogs.tsx, src/pages/Servicos.tsx`

- [x] 18. Vitest — Testes Unitários para error-utils + useNotification

  **What to do**:
  - Criar `src/lib/__tests__/error-utils.test.ts`
  - Criar `src/hooks/__tests__/useNotification.test.ts`
  - Testes para error-utils:
    - `formatAppError` com Error instance → AppError com context, action, message, technicalDetails
    - `formatAppError` com string → AppError com message mapeada
    - `formatAppError` com unknown → AppError com mensagem fallback
    - `createNotificationMessage` → NotificationMessage com todos os campos
    - `formatErrorForCopy` → string formatada com Contexto, Ação, Mensagem, Data/Hora
    - `copyErrorDetails` → retorna true quando clipboard funciona, false quando falha
    - `formatToastMessage` com action → "[Contexto] — Ação"
    - `formatToastMessage` sem action → message
    - Re-exports de `traduzirErroSalvarEquipamento` e `whatsappNaoConfigurado` funcionam
  - Testes para useNotification:
    - `success` chama `toast.success` com formato correto e duration 3000
    - `error` chama `toast.error` com Infinity duration e botão "Copiar detalhes"
    - `warning` chama `toast.warning` com duration 5000
    - `info` chama `toast.info` com duration 4000

  **Must NOT do**:
  - NÃO criar testes de integração com banco de dados
  - NÃO testar Sonner internals (apenas que nosso wrapper chama Sonner corretamente)
  - NÃO mockar mais que o necessário

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T19, T20)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T3 (error-utils), T5 (useNotification)

  **References**:
  - `src/lib/error-utils.ts` — Funções a testar
  - `src/hooks/useNotification.ts` — Hook a testar
  - `src/types/notification.ts` — Tipos usados
  - `vitest.config.ts` ou `vite.config.ts` — Config do Vitest
  - `npm run test:run` — Comando de testes

  **Acceptance Criteria**:
  - [ ] Arquivos de teste criados
  - [ ] `npm run test:run` passa com todos os testes novos
  - [ ] Coverage mínimo de 90% para error-utils.ts
  - [ ] Coverage mínimo de 80% para useNotification.ts

  **QA Scenarios**:
  ```
  Scenario: All unit tests pass
    Tool: Bash
    Steps:
      1. Run: npm run test:run -- --reporter=verbose
      2. Verify all tests pass
      3. Verify no skipped tests
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-18-test-results.txt

  Scenario: Edge cases handled correctly
    Tool: Bash
    Steps:
      1. Run formatAppError with null error
      2. Run formatAppError with Error with empty message
      3. Run copyErrorDetails with no clipboard API
      4. Verify all return valid results (not exceptions)
    Expected Result: All edge cases return valid AppError/boolean
  ```

  **Commit**: YES
  - Message: `test(notifications): add unit tests for error system`
  - Files: `src/lib/__tests__/error-utils.test.ts, src/hooks/__tests__/useNotification.test.ts`
  - Pre-commit: `npm run test:run`

- [x] 19. Vitest — Testes Unitários para UI Components

  **What to do**:
  - Criar testes para cada componente:
    - `src/components/ui/__tests__/error-alert.test.tsx`
    - `src/components/ui/__tests__/form-validation-error.test.tsx`
    - `src/components/ui/__tests__/confirm-dialog.test.tsx`
    - `src/components/ui/__tests__/input-dialog.test.tsx`
    - `src/components/__tests__/ErrorBoundary.test.tsx`
  - Testes para ErrorAlert:
    - Renderiza com cada variante (error, warning, info, success)
    - Não renderiza quando message é undefined
    - Seção de detalhes técnicos expande/colapsa
    - Botão "Copiar" funciona (mock clipboard)
  - Testes para FormValidationError:
    - Renderiza com message
    - Retorna null quando message é undefined/empty
    - Tem ícone AlertCircle
  - Testes para ConfirmDialog:
    - Renderiza aberto quando open=true
    - Botão confirmar chama onConfirm e fecha
    - Botão cancelar chama onOpenChange(false) e fecha
    - Variante destructive aplica estilo vermelho
  - Testes para InputDialog:
    - Renderiza com input e label
    - onConfirm chamado com valor digitado
    - Validação inline funciona
    - ESC cancela
  - Testes para ErrorBoundary:
    - Captura error de render e mostra fallback
    - Botão "Recarregar página" funciona
    - Detalhes expandíveis funcionam

  **Must NOT do**:
  - NÃO testar Sonner internals
  - NÃO criar testes de integração com browser real
  - NÃO mockar mais que o necessário

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T20)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T4 (ErrorBoundary), T7-T10 (all UI components)

  **References**:
  - `src/components/ui/error-alert.tsx` — ErrorAlert component
  - `src/components/ui/form-validation-error.tsx` — FormValidationError component
  - `src/components/ui/confirm-dialog.tsx` — ConfirmDialog component
  - `src/components/ui/input-dialog.tsx` — InputDialog component
  - `src/components/ErrorBoundary.tsx` — ErrorBoundary component
  - `vitest.config.ts` — Config do Vitest
  - Testing library: `@testing-library/react`, `@testing-library/user-event`

  **Acceptance Criteria**:
  - [ ] Arquivos de teste criados para todos os 5 components
  - [ ] `npm run test:run` passa com todos os testes
  - [ ] Coverage mínimo de 80% por componente

  **QA Scenarios**:
  ```
  Scenario: All component tests pass
    Tool: Bash
    Steps:
      1. Run: npm run test:run -- --reporter=verbose
      2. Verify all component tests pass
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-19-component-tests.txt
  ```

  **Commit**: YES (groups with T18, T20)
  - Message: `test(notifications): add unit tests for error system and verify build`
  - Files: `src/components/ui/__tests__/*.test.tsx, src/components/__tests__/ErrorBoundary.test.tsx`
  - Pre-commit: `npm run test:run`

- [x] 20. Build + Type-Check Final

  **What to do**:
  - Executar build completo e type-check para verificar que nada quebrou:
    - `npx tsc --noEmit` — TypeScript sem erros
    - `cd src-tauri && cargo check` — Rust sem erros
    - `npm run test:run` — Todos testes passando
    - Verificar que `grep -r "alert(" src/ --include="*.tsx" --include="*.ts"` retorna 0 (exceto AlertDialog imports e comentários)
    - Verificar que `grep -r "window.prompt" src/` retorna 0
    - Verificar que `grep -r "window.confirm" src/` retorna 0
    - Verificar que todos os hooks error states são desestruturados nas páginas

  **Must NOT do**:
  - NÃO corrigir bugs aqui (criar tarefa separada se encontrado)
  - NÃO adicionar novos testes (já criados em T18-T19)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T11-T17)
  - **Parallel Group**: Wave 4 (after all migrations)
  - **Blocks**: F1-F4
  - **Blocked By**: T11-T17 (all migration tasks), T18-T19 (tests)

  **References**:
  - All modified files from T1-T19

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` sem erros
  - [ ] `cd src-tauri && cargo check` sem erros
  - [ ] `npm run test:run` todos testes passando
  - [ ] Zero browser alert() calls
  - [ ] Zero window.prompt calls
  - [ ] Zero window.confirm calls
  - [ ] Todos os hooks com error state são consumidos pelas páginas

  **QA Scenarios**:
  ```
  Scenario: Full build and type-check passes
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. cd src-tauri && cargo check
      3. npm run test:run
      4. grep -r "alert(" src/ --include="*.tsx" --include="*.ts" | grep -v "AlertDialog" | grep -v "// " | grep -v "toast" | grep -v "notification"
      5. grep -r "window.prompt" src/
      6. grep -r "window.confirm" src/
    Expected Result: All commands pass, zero alert/prompt/confirm calls
    Evidence: .sisyphus/evidence/task-20-build-check.txt

  Scenario: All hooks surface error state
    Tool: Bash
    Steps:
      1. grep -n "useClientes\|useEquipamentos\|useInsumos\|useServicos" src/pages/*.tsx
      2. For each, verify `error` is destructured
    Expected Result: error destructured in all 4 pages
    Evidence: .sisyphus/evidence/task-20-hook-errors.txt
  ```

  **Commit**: YES (groups with T18, T19)
  - Message: `test(notifications): add unit tests for error system and verify build`
  - Files: None (verification only, no new files)
  - Pre-commit: `npx tsc --noEmit && cd src-tauri && cargo check && npm run test:run`

---

## Final Verification Wave (MANDATÓRIA — após TODAS as tarefas de implementação)

> 4 agentes de review rodam EM PARALELO. TODOS devem APPROVAR. Apresentar resultados consolidados ao usuário e obter "ok" explícito antes de completar.
>
> NÃO prosseguir automaticamente após verificação. Esperar aprovação explícita do usuário.
> NUNCA marcar F1-F4 como concluídos antes do OK do usuário. Rejeição ou feedback → corrigir → re-executar → apresentar novamente → esperar OK.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Ler o plano end-to-end. Para cada "Must Have": verificar que implementação existe (ler arquivo, curl endpoint, rodar comando). Para cada "Must NOT Have": buscar no codebase por padrões proibidos — rejeitar com file:line se encontrado. Verificar que arquivos de evidência existem em .sisyphus/evidence/. Comparar entregáveis contra plano.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Rodar `npx tsc --noEmit` + linter + `npm run test:run`. Revisar todos os arquivos alterados por: `as any`/`@ts-ignore`, empty catches, console.log em prod, código comentado, imports não usados. Verificar AI slop: comentários excessivos, over-abstração, nomes genéricos (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Partir de estado limpo. Executar CADA cenário de QA de CADA tarefa — seguir passos exatos, capturar evidência. Testar integração cross-task (features trabalhando juntas, não isoladamente). Testar edge cases: estado vazio, input inválido, ações rápidas. Salvar em `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Para cada tarefa: ler "What to do", ler diff real (git log/diff). Verificar 1:1 — tudo no spec foi construído (nada faltando), nada além do spec foi construído (sem creep). Checar compliance de "Must NOT do". Detectar cross-task contamination: Task N tocando arquivos da Task M. Flagar mudanças não-contabilizadas.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1-T6**: `feat(notifications): add notification foundation (sonner, types, error utils, error boundary)`
  - Arquivos: sonner.tsx, alert-dialog.tsx, notification.ts, error-utils.ts, ErrorBoundary.tsx, useNotification.ts, index.css
  - Pre-commit: `npx tsc --noEmit`

- **T7-T10**: `feat(ui): add error feedback components (ErrorAlert, FormValidationError, ConfirmDialog, InputDialog)`
  - Arquivos: error-alert.tsx, form-validation-error.tsx, confirm-dialog.tsx, input-dialog.tsx
  - Pre-commit: `npx tsc --noEmit`

- **T11**: `refactor(equipamentos): replace all alert/prompt/confirm with notification system`
  - Arquivos: Equipamentos.tsx
  - Pre-commit: `npx tsc --noEmit`

- **T12-T14**: `refactor(pages): migrate client/insumo/servico pages to notification system + surface hook errors`
  - Arquivos: Clientes.tsx, Insumos.tsx, Servicos.tsx, ClientesDialogs.tsx, InsumosDialogs.tsx (se necessário)
  - Pre-commit: `npx tsc --noEmit`

- **T15-T17**: `refactor(components): migrate verification, config, and form validation to unified error system`
  - Arquivos: VerificacaoTecnica.tsx, ClienteSelector.tsx, ConfiguracoesTabInfra.tsx, ConfiguracoesTabSeguranca.tsx, ConfiguracoesTabObservabilidade.tsx, ProfileSessionDialog.tsx, HistoricoComunicacoes.tsx, all form components
  - Pre-commit: `npx tsc --noEmit`

- **T18-T20**: `test(notifications): add unit tests for error system and verify build`
  - Arquivos: test files
  - Pre-commit: `npm run test:run`

---

## Success Criteria

### Verification Commands
```bash
grep -r "alert(" src/ --include="*.tsx" --include="*.ts" | grep -v "alert(" | grep -v "AlertDialog" | grep -v "// alert"   # Expected: 0 matches (no browser alerts)
grep -r "window.prompt" src/  # Expected: 0 matches
grep -r "window.confirm" src/  # Expected: 0 matches
npx tsc --noEmit  # Expected: no errors
cd src-tauri && cargo check  # Expected: no errors
npm run test:run  # Expected: all tests pass
```

### Final Checklist
- [ ] Zero `alert()` calls no browser
- [ ] Zero `window.prompt` calls
- [ ] Zero `window.confirm` calls
- [ ] Todos os toasts seguem formato padronizado
- [ ] ErrorBoundary exibe mensagem amigável
- [ ] Hook errors visíveis na UI
- [ ] Form validation usa componente padronizado
- [ ] Todos testes passam