# Testes de Integração - AutoOS

## §5.3 — Orçamento/OS + comunicação testável

### Backend: integração real (Postgres + canais controlados)

| Teste | Caminho | Status |
|-------|---------|--------|
| Comunicação SMTP | `src-tauri/src/bin/p1_communication_integration.rs` | ✅ Verde esperado (`DATABASE_URL` válido) |
| Integração WhatsApp (HTTP fake) | `src-tauri/src/bin/p1_communication_integration.rs` | ✅ Idem |
| CRUD crítico (cliente/equipamento/estoque + permissões) | `src-tauri/src/bin/p1_critical_integration.rs` | ✅ Idem |
| Concorrência | `src-tauri/src/bin/p1_concurrency_integration.rs` | ✅ Idem |

### Frontend: Vitest (`npm run test:run`)

Os testes below **mock** `@tauri-apps/api/core` (`invoke`): validam payloads, branching e chamadas aos serviços **sem** falar com Rust nem rede. Integração SMTP/WhatsApp ponta-a-ponta continua sendo responsabilidade dos bins `p1_*` acima.

| Área | Ficheiros | Notas |
|------|-----------|--------|
| Bridge DB equipamentos (`criar_equipamento` / `{ input }`) | `src/lib/db.equipamentos.test.ts` | Evita regressão do contrato IPC |
| Registro via hook (`criar` + reload da lista) | `src/hooks/useEquipamentos.test.tsx` | Fluxo UX-dados até `db.criarEquipamento` mockado |
| Email (orçamento / pronto, `registrarComunicacao`) | `src/lib/email-service.test.ts` | 5 testes |
| WhatsApp (normalização BR, erros, `registrarComunicacao`) | `src/lib/whatsapp-service.test.ts` | 6 testes |
| Fluxo automação pós-status (orcamento/pronto canal) | `src/hooks/useStatusEquipamento.test.tsx` | Email/WhatsApp mockados |
| Orçamento OS / PDF até `salvar_arquivo_temp` (`invoke`) | `src/lib/pdf-service.test.ts` | Gera PDF com jsPDF; mock de Image/canvas sob jsdom |

**Opcional recomendável:**

- E2E web ou **tauri-driver** exercitando `invoke("enviar_email")` / WhatsApp contra stack real (hoje não há teste assim; comunicação oficial continua garantida pelo `p1_communication_integration`).

### E2E: Playwright (`npm run e2e`)

Projeto configurado (`playwright.config.ts`, `testDir: ./e2e`). Hoje há **testes smoke** de navegação em `e2e/smoke.spec.ts` (**4 testes**: título AutoOS + rotas Equipamentos/Clientes/Insumos contra Vite/Web).  
**Limitação declarada:** estes não exercitam app Tauri nativo nem `invoke` real; cenários críticos seguem cobertos pelo backend `p1_*`.

### Trilhas npm (QA explícitas)

| Script | Finalidade |
|--------|-------------|
| `npm run qa:integrations` | Encadeia `p1_critical_integration` + `p1_communication_integration` |
| `npm run qa:tier:jornada-real` | `lint` → Vitest → ambos bins `p1_*` acima → Playwright smoke |

Pré-requisito comum aos bins: Postgres + **`DATABASE_URL`**, mais keyring disponível para PIN/canais (ver `docs/RELEASE.md`).

### Comandos

```bash
# Frontend (Vitest / mocks IPC)
npm run test:run

# Integração Postgres+Rust oficial (SMTP/WhatsApp/canais falsos onde aplicável)
npm run qa:integrations

# Ou por binário isolado:
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_communication_integration
cargo run --manifest-path src-tauri/Cargo.toml --bin p1_critical_integration

# Smoke E2E Playwright (`e2e:mock` é alias opcional nominal)
npm run e2e
```
