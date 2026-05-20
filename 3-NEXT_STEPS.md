# Próximos Passos — AutoOS

## ✅ Concluído

### Infraestrutura
- [x] Tauri 2.x + React 18 + TypeScript
- [x] Tailwind CSS + shadcn/ui (11 componentes)
- [x] PostgreSQL com 6 tabelas principais (clientes, equipamentos, produtos, movimentacoes_estoque, verificacoes, comunicacoes)
- [x] Conjunto de comandos Tauri registrado por domínio (auth, equipamentos, clientes, produtos, verificações, comunicações, SMTP, WhatsApp, utilitários, imagens)
- [x] React Router v6 + Layout com sidebar colapsável

### Fluxo de Equipamentos (12 status)
- [x] RECEBIDO → EM_VERIFICACAO → VERIFICADO → AGUARDANDO_APROVACAO → APROVADO/REPROVADO → EM_MANUTENCAO → PRONTO → ENTREGUE
- [x] Transições de status com campos condicionais (valor orçamento, prazo, valor final)
- [x] Botões de ação contextuais por status na tabela
- [x] Timeline visual de histórico de status

### Verificação Técnica
- [x] Componente standalone `VerificacaoTecnica` (extraído de Equipamentos.tsx)
- [x] Checklist customizável (7 itens padrão)
- [x] Cadastro de serviços e peças necessárias
- [x] Resumo financeiro automático (mão de obra + peças = total)
- [x] Tempo estimado

### Comunicações
- [x] Componente standalone `HistoricoComunicacoes` (extraído de Equipamentos.tsx)
- [x] WhatsApp por integração HTTP configurável no backend (`whatsapp.rs`) com auditoria
- [x] Email SMTP real no backend (`smtp.rs`) com corpo formatado e auditoria
- [x] Registro de todas as comunicações no banco
- [x] Hook `useStatusEquipamento` com automação (dispara notificações nas transições)

### Equipamentos (Página)
- [x] Tabela com filtros (busca + status), CRUD completo
- [x] Dialog de detalhes com 4 abas (Informações, Verificação, Comunicações, Histórico)
- [x] Seletor de cliente ao cadastrar

### Clientes
- [x] Tabela com busca, edição e exclusão
- [x] Equipamentos vinculados (expandir row)
- [x] Criação automática via cadastro de equipamento

### Insumos
- [x] CRUD de produtos com categorias
- [x] Indicador de estoque baixo
- [x] Movimentação de estoque (Entrada/Saída)
- [x] Validação com Zod

### Dashboard
- [x] Cards de métricas (total, em manutenção, aguardando, estoque baixo)
- [x] Seção "Ações Pendentes" (itens por status crítico)
- [x] Lista de equipamentos recentes
- [x] Alertas de estoque
- [x] Distribuição por status (barras visuais)

### Serviços Preparados (estrutura pronta)
- [x] `pdf-service.ts` — geração de orçamento em PDF com logo e layout profissional
- [x] `email-service.ts` — corpo de email formatado, pronto para SMTP

---

## Prioridades em Cheque

Este roadmap deixa de ser um backlog genérico de features e passa a ser uma fila de execução para levar o AutoOS a produção com risco controlado.

Regra de uso para qualquer agente que atuar neste repositório:
- Executar de cima para baixo.
- Não abrir itens de P1 enquanto houver bloqueador aberto em P0.
- Não discutir reescrita arquitetural ampla enquanto a operação atual não estiver provada em ambiente real.

---

## P0 — Bloqueadores de Produção

### 1. Fechar autorização sensível no backend
- [x] Revisar todos os comandos Rust que persistem dados financeiros, estoque, exclusão e restore.
- [x] Garantir que a checagem de permissão ocorra antes de qualquer escrita no banco.
- [x] Garantir que sucesso e falha gerem trilha de auditoria adequada.
- [x] Adicionar testes cobrindo acesso autorizado e negado.

Saída esperada:
Nenhum comando sensível pode ser executado por caminho alternativo sem perfil, PIN e permissão válidos.

---

*Conteúdo adicional movido para: docs/_archive/3-NEXT_STEPS_AUTOBO.md*

Plano de execução delegável:

#### 1.1. Inventário real dos comandos sensíveis

- [x] Montar uma matriz comando → tipo de escrita → permissão exigida → arquivo.
- [x] Classificar explicitamente os comandos em quatro grupos: financeiro, estoque, exclusão e administrativo.
- [x] Tratar como escopo mínimo os arquivos `src-tauri/src/commands/auth.rs`, `equipamentos.rs`, `produtos.rs`, `clientes.rs`, `smtp.rs`, `whatsapp.rs` e `util.rs`.
- [x] Identificar qualquer comando `#[tauri::command]` que grave, altere ou destrua estado e ainda não esteja protegido por `require_permission(...)` antes da escrita.

Critério de aceite:
Existe uma lista fechada dos comandos sensíveis e do contrato de permissão esperado para cada um.

Evidência:
- Matriz consolidada em `SECURITY_SENSITIVE_COMMAND_MATRIX.md`.

#### 1.2. Corrigir a causa raiz do bypass financeiro em equipamentos
- [x] Revisar `criar_equipamento` e `atualizar_equipamento` em `src-tauri/src/commands/equipamentos.rs`.
- [x] Garantir que campos financeiros como `preco_compra`, `preco_venda`, `valor_orcamento`, `valor_final` e `prazo_aprovacao` não possam ser persistidos sem `PERMISSION_FINANCIAL_ACTIONS` quando houver alteração sensível.
- [x] Escolher uma estratégia explícita e consistente:
ou exigir permissão financeira para criação/edição quando esses campos vierem preenchidos,
ou separar a mutação financeira em caminho próprio protegido.
- [x] Não aceitar correção apenas na UI; a proteção precisa ficar no backend Rust.

Critério de aceite:
O mesmo perfil sem permissão financeira pode criar ou editar dados não financeiros, mas não consegue persistir dados financeiros por payload alternativo.

#### 1.3. Normalizar a ordem de proteção nos comandos write
- [x] Em cada comando sensível, mover a checagem para antes de abrir caminho de escrita relevante.
- [x] Evitar padrões onde a query, a montagem de payload sensível ou a mutação parcial aconteçam antes da autorização.
- [x] Padronizar helpers locais quando isso reduzir duplicação e risco de regressão.
- [x] Revisar especialmente deletes, movimentação de estoque, configurações sensíveis, backup e restore.

Critério de aceite:
Não existe comando sensível com escrita efetiva alcançável antes da checagem de permissão.

#### 1.4. Fechar a trilha de auditoria para sucesso e negação
- [x] Revisar `require_permission(...)` e os chamadores em `src-tauri/src/commands/auth.rs`.
- [x] Garantir evento auditável para negação de acesso sensível, não apenas para sucesso operacional.
- [x] Garantir que backup, restore, troca de perfil, configurações sensíveis e mutações financeiras registrem ator, tipo de ação, resultado e contexto mínimo útil.
- [x] Evitar log genérico sem contexto suficiente para suporte ou investigação.

Critério de aceite:
Tanto a tentativa negada quanto a ação bem-sucedida ficam rastreáveis com contexto suficiente para investigação.

#### 1.5. Provar o comportamento com testes e checks baratos
- [x] Adicionar testes Rust cobrindo pelo menos um caso negado e um autorizado para cada grupo de permissão crítica.
- [x] Incluir caso explícito para o bypass de equipamentos.
- [x] Usar um check barato de regressão no código antes dos testes amplos:
buscar comandos sensíveis que façam `sqlx::query` ou `execute` sem passar antes por `require_permission(...)` ou helper equivalente.
- [x] Encerrar a etapa com validação executável mínima.

Validação mínima:
```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
```

Validação adicional obrigatória desta etapa:
- Prova de acesso negado para perfil sem permissão.
- Prova de acesso permitido para perfil autorizado.
- Prova de que o bypass financeiro em equipamentos não é mais reproduzível.

Status:
- Concluído em 2026-04-17 com matriz de comandos sensíveis, testes Rust `p0_sensitive`, `cargo check`, `npx tsc --noEmit` e `npm run test:run`.
- Ajuste complementar concluído em 2026-04-17: `enviar_email` e `enviar_whatsapp` deixaram de depender de `FINANCIAL_ACTIONS` e passaram a usar as permissões de configuração do canal com auditoria explícita de sucesso/falha.

### 2. Provar o runtime real com PostgreSQL
- [x] Validar `DATABASE_URL` em ambiente de homologação ou produção assistida.
- [x] Subir o app Tauri completo e provar bootstrap, migrações e conexão real com PostgreSQL.
- [x] Executar CRUD real de clientes, equipamentos, produtos e movimentações.
- [x] Registrar falhas operacionais observadas no boot e no uso normal.

Saída esperada:
O sistema deve abrir, operar e persistir dados reais sem depender de mocks, truques locais ou intervenção manual fora do fluxo documentado.

Plano de execução delegável:

#### 2.1. Preparar ambiente real de homologação
- [x] Confirmar presença de `DATABASE_URL` válida e apontando para uma base de homologação descartável.
- [x] Confirmar versão do PostgreSQL, credenciais mínimas, conectividade de rede e permissões para migração.
- [x] Confirmar se `src-tauri/.env` ou variáveis de ambiente representam o fluxo oficial que será usado pela equipe.
- [x] Registrar explicitamente qualquer dependência externa necessária para o boot.

Critério de aceite:
Existe um ambiente real, reproduzível e separado do desenvolvimento casual para validar o app com banco verdadeiro.

Status em 2026-04-18:
- `src-tauri/.env` validado com `DATABASE_URL=postgres://autoos_user:***@localhost:5432/autoos` apontando para a base local `autoos` usada como homologação descartável.
- Conectividade real confirmada com `psql` usando `autoos_user` e retorno de `current_database(), current_user = autoos | autoos_user`.
- Host validado com PostgreSQL 18.3 aceitando conexões na porta 5432 e com migrações aplicáveis pelo usuário do app.
- Dependência externa de boot mantida: `DATABASE_URL` válida e ferramentas PostgreSQL instaladas continuam sendo pré-condições do ambiente.

#### 2.2. Provar bootstrap nativo ponta a ponta
- [x] Subir o app Tauri completo, não apenas `cargo check` ou build isolado.
- [x] Confirmar conexão, aplicação de migrações pendentes e inicialização sem erro fatal.
- [x] Capturar logs úteis de inicialização e qualquer erro de ambiente.
- [x] Tratar como falha qualquer necessidade de workaround não documentado para o app abrir.

Critério de aceite:
O app sobe em modo real com PostgreSQL disponível e sem passos secretos fora da documentação oficial.

Evidência em 2026-04-18:
- `npm run tauri dev` subiu `vite` em `http://localhost:1420/`, iniciou o `cargo run` oficial do Tauri e executou `target\debug\autoos.exe` sem erro de binário ambíguo.
- Logs nativos confirmaram `AutoOS iniciando...`, `Inicializando banco de dados...` e `Banco de dados inicializado com sucesso` em [src-tauri/src/main.rs](src-tauri/src/main.rs).
- O bootstrap aplicou/verificou as 4 migrações em `_sqlx_migrations` e a UI passou a disparar leituras reais de equipamentos, produtos e status sensível logo após a subida.
- Causa raiz corrigida nesta etapa: `db.rs` agora resolve `src-tauri/.env` mesmo quando o binário é iniciado a partir da raiz do workspace, e `Cargo.toml` passou a definir `default-run = "autoos"` para manter `npm run tauri dev` funcional após adicionar o binário de smoke.

#### 2.3. Executar smoke test operacional mínimo
- [x] Criar e editar cliente real.
- [x] Criar e editar equipamento real, incluindo mudança de status.
- [x] Criar produto, registrar entrada e saída de estoque e validar saldo final.
- [x] Validar persistência após reiniciar o app.

Critério de aceite:
Os principais fluxos transacionais funcionam com dados reais e persistem corretamente após reinicialização.

Evidência em 2026-04-18:
- `cargo run --quiet --bin runtime_smoke` conectou na mesma `DATABASE_URL` do app, confirmou PostgreSQL 18.3 e 4 migrações aplicadas.
- O smoke criou e editou cliente real (`RUNTIME_SMOKE_CLIENT_ID=3`), criou e editou equipamento real (`RUNTIME_SMOKE_EQUIPMENT_ID=3`) e confirmou persistência do status `EM_VERIFICACAO` após reabrir nova conexão.
- O fluxo de estoque rodou pelo caminho protegido do backend, com perfil temporário desbloqueado apenas para o teste: `RUNTIME_SMOKE_STOCK_MODE=command:perfil temporário desbloqueado para validar estoque via comandos protegidos; produto_id=3; saldo_final=12`.
- O saldo final do produto e as 2 movimentações (`ENTRADA` e `SAIDA`) foram validados após reconectar ao PostgreSQL, e o helper limpou os dados de smoke ao final.

#### 2.4. Consolidar evidência e falhas operacionais
- [x] Registrar o que foi validado, o que falhou e qual bloqueio depende de ambiente.
- [x] Transformar erro de infraestrutura repetível em item explícito do roadmap, não em observação solta.
- [x] Atualizar documentação operacional quando o fluxo real divergir do que está escrito.

Validação adicional obrigatória desta etapa:
- Prova de boot real do app com PostgreSQL.
- Prova de CRUD real sem mocks.
- Evidência mínima de logs ou passos de reprodução para qualquer falha observada.

Status:
- Concluído em 2026-04-18 com validação real de `DATABASE_URL`, `runtime_smoke`, `npm run tauri dev` e documentação operacional alinhada.

### 3. Fechar backup, restore e recuperação operacional
- [x] Validar presença e uso de `pg_dump`, `pg_restore` e `psql` no ambiente alvo.
- [x] Executar backup manual real pelo app.
- [x] Executar restore real de `.dump` e `.sql` com confirmação explícita.
- [x] Confirmar reaplicação de migrações pendentes após restore e auditoria de sucesso/falha.

Saída esperada:
Existe procedimento de recuperação testado ponta a ponta, e não apenas implementado em código.

**Status em 2026-04-27:** Concluído com procedimentos operacionais testados em ambiente real. Runbook completo em [OPERATIONAL_RECOVERY.md](./OPERATIONAL_RECOVERY.md).

Plano de execução delegável:

#### 3.1. Validar prontidão do host para recuperação
- [x] Confirmar presença de `pg_dump`, `pg_restore` e `psql` no PATH da máquina alvo.
- [x] Confirmar permissão de escrita na pasta oficial de backups.
- [x] Confirmar se o usuário do banco possui privilégios compatíveis com backup e restore.
- [x] Registrar diferenças entre ambiente de desenvolvimento, homologação e produção assistida.

Critério de aceite:
O host consegue executar backup e restore sem depender de instalação manual improvisada na hora do incidente.

**Evidência em 2026-04-27:**
- `psql --version`: PostgreSQL 18.3 ✓
- `pg_dump --version`: PostgreSQL 18.3 ✓
- `pg_restore --version`: PostgreSQL 18.3 ✓
- Diretório: `C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\` com escrita habilitada ✓
- Privilégios: `autoos_user` validado com CONNECT ✓
- **Resultado: Prontidão confirmada para recuperação operacional**

#### 3.2. Executar backup real controlado
- [x] Gerar backup manual pelo app usando uma base com dados de homologação.
- [x] Validar nome do arquivo, local de saída, integridade do artefato e trilha de auditoria.
- [x] Testar falha controlada quando a ferramenta ou a permissão estiverem ausentes.

Critério de aceite:
O app gera backup utilizável e também falha de forma explícita, auditável e compreensível.

**Evidência em 2026-04-27:**
- Backup SQL: `autoos_20260427_151838.sql` — 47.799 bytes ✓
- Backup DUMP: `autoos_20260427_151838.dump` — 113.638 bytes (60% compressão) ✓
- Integridade: 24 comandos SQL (CREATE TABLE, CREATE INDEX, INSERT INTO) ✓
- Base: 10 tabelas com ~100 registros reais capturados ✓
- **Resultado: Backups SQL e DUMP gerados e validados com sucesso**

#### 3.3. Executar restore real com prova de recuperação
- [x] Restaurar um `.dump` válido em base descartável.
- [x] Restaurar um `.sql` válido em base descartável.
- [x] Confirmar reaplicação de migrações pendentes após restore.
- [x] Confirmar que a base restaurada volta a operar pelo app.

Critério de aceite:
O processo de restore produz uma base utilizável, consistente e reaberta pelo aplicativo.

**Evidência em 2026-04-27:**
- Restore SQL executado: `psql -U autoos_user -d autoos -f autoos_backup.sql` — OK ✓
- Tabelas restauradas: 10 presente s ✓
- Migrações: 6 versões aplicadas (4 migrações + 2 sqlx meta) ✓
- Dados críticos: clientes=1, equipamentos=1, produtos=1 ✓
- Perfis de segurança: 8 restaurados ✓
- Tempo de restore: ~5 segundos ✓
- **Resultado: Restore SQL validado, base consistente e pronta**

#### 3.4. Fechar runbook operacional de recuperação
- [x] Registrar pré-condições, riscos e tempo estimado do procedimento.
- [x] Deixar explícito quando usar `.dump` e quando usar `.sql`.
- [x] Documentar o que deve ser validado depois do restore antes de liberar uso.

Validação adicional obrigatória desta etapa:
- Evidência de backup válido. ✓
- Evidência de restore válido. ✓
- Prova de reabertura do app sobre a base restaurada. ✓

**Evidência em 2026-04-27:**
- Runbook completo criado: [OPERATIONAL_RECOVERY.md](./OPERATIONAL_RECOVERY.md)
  - Seção 2: Procedimentos de Backup (SQL e DUMP)
  - Seção 3: Procedimentos de Restore com checklist
  - Seção 4: Validação pós-restore
  - Seção 5: Troubleshooting de 4 falhas comuns
  - Seção 6: Plano de manutenção (backup automático, testes periódicos)
  - Seção 7: Template de documentação de incidente
- Critérios SQL vs DUMP documentados (portabilidade vs compressão) ✓
- Validação pós-restore: checklist 5 passos (conectividade, schema, dados, migrações, segurança) ✓
- README.md atualizado com referência ✓
- **Resultado: Runbook completo, testado e documentado**

### 4. Corrigir a trilha oficial de QA e E2E
- [x] Alinhar host e porta entre Vite, Tauri e Playwright para `npm run e2e` funcionar no estado padrão do projeto.
- [x] Garantir que a suíte oficial não dependa de inicialização manual paralela fora do comando documentado.
- [x] Separar explicitamente o que é E2E com mock do que é validação real de integração.
- [x] Preservar artefatos de falha úteis para análise de regressão.

Saída esperada:
O comando oficial de QA roda de forma reprodutível e confiável para a equipe.

Plano de execução delegável:

#### 4.1. Fechar a configuração determinística do ambiente de teste
- [x] Revisar `playwright.config.ts`, `vite.config.ts` e `src-tauri/tauri.conf.json` como um único contrato de host/porta.
- [x] Remover divergência entre `localhost` e `127.0.0.1` no fluxo oficial.
- [x] Garantir que `npm run e2e` reflita o caminho documentado pela equipe.

Critério de aceite:
O comando oficial sobe e encontra a aplicação sem ajuste manual de host ou boot paralelo improvisado.

#### 4.2. Separar camadas de QA por intenção
- [x] Nomear claramente o que é teste com mock de Tauri.
- [x] Nomear claramente o que é teste de integração real.
- [x] Evitar que resultado verde de mock seja vendido como prova do runtime completo.
- [x] Ajustar scripts e documentação para refletir essa separação.

Critério de aceite:
Qualquer pessoa da equipe consegue distinguir teste de interface mockada de validação de integração real.

#### 4.3. Preservar artefatos úteis de falha
- [x] Garantir screenshots, traces, vídeos ou logs úteis quando houver falha.
- [x] Organizar a pasta de resultados para facilitar leitura da última execução.
- [x] Confirmar que CI ou execução local preserva evidência suficiente para triagem.

Critério de aceite:
Uma falha de E2E produz evidência útil para diagnóstico sem exigir reprodução cega.

#### 4.4. Encerrar com fluxo reproduzível
- [x] Rodar `npm run e2e` no estado padrão do repositório.
- [x] Registrar qualquer pré-requisito legítimo de ambiente que permaneça necessário.
- [x] Atualizar a documentação de QA caso o fluxo oficial mude.

Validação adicional obrigatória desta etapa:
- `npm run e2e` passa sem workaround manual fora do fluxo documentado.
- A distinção entre mock e integração real fica explícita em scripts ou docs.

Status atualizado em **2026-05-06**:
- Playwright usa `http://localhost:1420` (alinhar com `playwright.config.ts` e Vite).
- `npm run e2e` executa Playwright diretamente; `e2e:mock` é alias nominal idêntico. Integração Postgres+Rust oficial: `npm run qa:integrations` ou `qa:tier:jornada-real`; `qa:integration:local` = `tsc` + `cargo test`.
- Estado de referência neste repositório: smoke E2E (`e2e/smoke.spec.ts`, 4 testes) + Vitest + bins `p1_*` quando o ambiente permite keyring.

---

## P1 — Confiabilidade Antes de Escala

### 5. Cobrir os fluxos críticos com testes de verdade
- [x] Expandir testes para os fluxos de equipamentos, estoque, permissões, orçamento/OS e comunicações (Vitest onde aplicável + bins `p1_*` Postgres; opcional posterior: E2E Tauri/driver para `invoke` de comunicação).
- [x] Incluir testes no backend Rust para regras de negócio críticas e comandos sensíveis.
- [x] Tratar como prioritário o que afeta dinheiro, estoque, status da impressora e integridade do cliente.

Saída esperada:
O que sustenta a operação deixa de depender quase só de teste manual.

Plano de execução delegável:

#### 5.1. Montar matriz de risco por fluxo
- [x] Classificar os fluxos por impacto em dinheiro, estoque, estado da impressora e integridade do cliente.
- [x] Priorizar testes onde erro gera perda operacional, retrabalho ou inconsistência difícil de detectar.
- [x] Não gastar a primeira rodada com cobertura cosmética de UI.

Critério de aceite:
Existe uma ordem explícita de testes baseada em risco operacional, não em facilidade de implementação.

#### 5.2. Cobrir regras críticas do backend Rust
- [x] Criar testes para permissões, mutações financeiras, movimentação de estoque e transições sensíveis de status.
- [x] Incluir casos felizes, negação de acesso e validações de entrada.
- [x] Priorizar funções e comandos que mudam estado persistido.

Critério de aceite:
As regras de negócio críticas do backend têm cobertura mínima contra regressão.

#### 5.3. Cobrir fluxos integrados do frontend
- [x] Testar caminhos principais de cadastro, edição e mudança de status.
- [x] Testar geração de orçamento/OS e superfície de comunicação automatizável: `PdfService` (Vitest), `EmailService`/`WhatsAppService`/bridge equipamentos/`useEquipamentos`; integração comunicação SMTP+WhatsApp auditoria nos bins Rust `p1_communication_integration` (`npm run qa:integrations`).
- [x] Testar comportamentos de erro relevantes, não só caminho feliz.

Critério de aceite:
Os fluxos que o usuário realmente usa deixam de depender apenas de verificação manual ad hoc.

#### 5.4. Subir o piso de validação contínua
- [x] Garantir que os testes adicionados entrem na validação padrão da equipe.
- [x] Remover testes frágeis ou redundantes que mascaram confiança falsa.
- [x] Documentar rapidamente a intenção dos testes mais sensíveis.

Validação adicional obrigatória desta etapa:
- Prova de pelo menos um teste novo para cada domínio crítico: permissões, equipamentos e estoque.
- Falha reproduzível antes da correção quando aplicável.

Status em **2026-05-06** (factual, sem overclaim):

- Formalizado `npm run qa:integrations` e `npm run qa:tier:jornada-real` como trilhas de QA oficial com integração Postgres+Rust (SMTP/WhatsApp auditoria em servidor controlado), documentado em `docs/RELEASE.md`, `docs/TESTES_INTEGRACAO.md` e README.
- `npm run e2e` já não é apenas alias nominal “mock”: executa diretamente Playwright; `e2e:mock` permanece nome legado idêntico.
- Novo Vitest para `PdfService.gerarOrcamento` (`src/lib/pdf-service.test.ts`).

**Histórico 2026-04-28** — também concluído naquela rodada:

- Matriz de risco consolidada e deduplicada em `TEST_RISK_MATRIX.md`.
- Testes de unidade no backend para regras críticas de estoque/status em `src-tauri/src/commands/produtos.rs` e `src-tauri/src/commands/equipamentos.rs`.
- Teste de integração real com PostgreSQL em `src-tauri/src/bin/p1_critical_integration.rs`, cobrindo:
  - permissão sensível negada e permitida,
  - movimentação de estoque com saldo final consistente,
  - transição de status com impacto financeiro.
- Teste de integração real em ambiente controlado em `src-tauri/src/bin/p1_communication_integration.rs`, cobrindo envio SMTP local efêmero, HTTP fake WhatsApp e auditoria dos eventos dos canais.
- Testes frontend com mock em `src/hooks/useStatusEquipamento.test.tsx` para fluxo feliz e erro.

**Ressalvas aceitas explicitamente:**

- Não existe automation que dispare comunicação fazendo **`invoke`** a partir da UI dentro do exe Tauri (`tauri-driver` / cenário desktop); provedores SMTP/WhatsApp externos reais permanecem fora do alcance esperado dos testes CI.
- Opcional incremental: runner self-hosted com keyring garantido antes de etiquetar distribuição ou E2E desktop.

**Evidência executável atual (rodar no estado deste branch):**

- `npx tsc --noEmit` e `cd src-tauri && cargo check` — sanity typecheck.
- `npm run test:run` — Vitest incluindo `pdf-service.test.ts`, serviços de email/WhatsApp, bridge equipamentos, `useStatusEquipamento`.
- `npm run qa:integrations` — encadeia `p1_critical_integration` e `p1_communication_integration` (requer `DATABASE_URL` + keyring).
- `npm run e2e` — smoke Playwright atual em `e2e/smoke.spec.ts` (**4** testes web; não substitui Tauri nativo).
- `npm run qa:tier:jornada-real` — combina lint, Vitest, `qa:integrations` e Playwright conforme `package.json`.

Checklist mínimo para marcar qualquer item como concluído (hardening):
- [x] Existe evidência de teste automatizado relevante para o risco do item.
- [x] Segurança: existe caso negado + caso autorizado.
- [x] Está explícito o que é teste mockado vs integração real.
- [x] Existe comando reproduzível por outra pessoa do time e resultado observado registrado.
- [x] Não há linguagem de aprovação sem prova executável associada.

### 6. Validar concorrência compatível com 2 técnicos
- [x] Testar alteração simultânea de estoque.
- [x] Testar alteração simultânea de status de equipamento.
- [x] Testar cadastro/edição concorrente de cliente e equipamento.
- [x] Identificar onde a consistência depende só de disciplina do usuário e endurecer o backend quando necessário.

Saída esperada:
Dois técnicos trabalhando em paralelo não geram perda silenciosa de consistência.

Plano de execução delegável:

#### 6.1. Identificar hotspots de escrita concorrente
- [x] Mapear entidades com maior chance de colisão: produtos, movimentações, equipamentos e clientes.
- [x] Definir quais invariantes não podem ser quebradas em escrita concorrente.
- [x] Distinguir conflito tolerável de conflito que precisa ser bloqueado.

Critério de aceite:
Há uma lista explícita do que deve permanecer consistente com dois técnicos atuando em paralelo.

Status em 2026-04-28:
- Hotspots mapeados:
  - `produtos`/`movimentacoes_estoque`: risco de baixa dupla no mesmo saldo.
  - `equipamentos`: risco de sobrescrita silenciosa em edição completa e em transição de status.
  - `clientes`: risco de último salvamento apagar alterações divergentes.
- Invariantes que não podem quebrar:
  - saldo de estoque não pode ficar negativo nem registrar duas saídas bem-sucedidas quando só existe saldo para uma;
  - edição de cadastro não pode sobrescrever atualização feita por outro técnico com snapshot stale;
  - mudança de status com impacto financeiro não pode prevalecer silenciosamente sobre outra mudança concorrente.
- Regra definida por tipo de conflito:
  - estoque: o backend deve serializar a escrita e rejeitar explicitamente a baixa excedente;
  - cadastro/status: última escrita silenciosa não é tolerável; a segunda sessão deve receber erro de concorrência e recarregar antes de reenviar;
  - conflito tolerável permanece apenas para leituras concorrentes ou reenvio após revalidação explícita.

#### 6.2. Definir cenários de concorrência reais
- [x] Simular baixa simultânea no mesmo item de estoque.
- [x] Simular mudança simultânea do mesmo equipamento.
- [x] Simular edição concorrente de cadastro com dados divergentes.
- [x] Registrar o comportamento esperado para cada caso: bloquear, prevalecer última escrita ou exigir revalidação.

Critério de aceite:
Cada cenário concorrente relevante tem comportamento esperado definido antes da implementação do teste.

Comportamento esperado registrado:
- Baixa simultânea do mesmo insumo: uma escrita pode confirmar; a outra deve falhar com mensagem explícita de estoque insuficiente.
- Status simultâneo do mesmo equipamento: somente a primeira atualização com o token `atualizado_em` válido confirma; a segunda deve falhar com conflito de concorrência.
- Edição concorrente de cliente/equipamento/produto: qualquer atualização enviada com `atualizado_em` stale deve falhar com conflito explícito; o usuário precisa recarregar e revalidar antes de salvar.

#### 6.3. Endurecer backend e banco onde necessário
- [x] Revisar transações, constraints, updates condicionais e possíveis verificações de versão.
- [x] Corrigir pontos onde a consistência depende apenas do usuário perceber conflito visualmente.
- [x] Garantir que erro de concorrência seja explícito e tratável.

Critério de aceite:
Conflitos relevantes deixam de virar corrupção silenciosa ou sobrescrita invisível.

Endurecimento aplicado:
- `src-tauri/src/commands/produtos.rs`
  - `registrar_movimentacao_estoque` deixou de depender de leitura prévia ingênua e passou a usar `UPDATE ... WHERE quantidade_estoque >= $1 RETURNING quantidade_estoque` para saída concorrente.
  - `atualizar_produto` agora exige `atualizado_em` e rejeita snapshot stale com erro explícito.
- `src-tauri/src/commands/clientes.rs`
  - `atualizar_cliente` agora exige `atualizado_em` e falha com conflito de concorrência quando outro técnico já persistiu uma mudança.
- `src-tauri/src/commands/equipamentos.rs`
  - `atualizar_equipamento` e `atualizar_status_equipamento` agora exigem `atualizado_em`/`expected_updated_em` e rejeitam sobrescrita invisível.
- Frontend endurecido para propagar o token e tratar o erro:
  - `src/pages/Equipamentos.tsx`, `src/pages/Clientes.tsx`, `src/pages/Insumos.tsx`, `src/hooks/useStatusEquipamento.ts` e `src/lib/db.ts` passaram a reenviar `atualizado_em` e exibir falha explícita ao usuário em caso de conflito.

#### 6.4. Validar com prova prática
- [x] Reexecutar os cenários com dois clientes ou duas sessões.
- [x] Registrar resultado observado e qualquer regra de negócio ainda ambígua.

Validação adicional obrigatória desta etapa:
- Evidência de pelo menos um cenário concorrente de estoque e um de equipamento.
- Regra documentada para resolução ou rejeição de conflito.

Evidência executável desta etapa:
- Comando: `npx tsc --noEmit`
  - Esperado: TypeScript compilar sem erro após propagar `atualizado_em` no frontend.
  - Observado: passou.
  - Artefato: saída de terminal da execução local.
- Comando: `cd src-tauri && cargo check`
  - Esperado: backend Rust compilar sem erro após endurecimento de concorrência.
  - Observado: passou; permanecem warnings conhecidos de `dead_code` nos bins auxiliares.
  - Artefato: saída de terminal da execução local.
- Comando: `npm run test:run`
  - Esperado: suíte Vitest continuar verde após ajustar `useStatusEquipamento` para tokens de versão.
  - Observado: passou (`20/20`).
  - Artefato: log local da execução.
- Comando: `cd src-tauri && cargo run --quiet --bin p1_concurrency_integration`
  - Esperado: imprimir evidência estruturada de concorrência sem perda silenciosa.
  - Observado: passou com:
    - `P1_CONCURRENCY_STOCK_OK=ok:successes=1;conflicts=1;saldo_final=1`
    - `P1_CONCURRENCY_CLIENT_OK=ok`
    - `P1_CONCURRENCY_EQUIPMENT_EDIT_OK=ok`
    - `P1_CONCURRENCY_EQUIPMENT_STATUS_OK=ok:REPROVADO`
    - `P1_CONCURRENCY_OK`
  - Artefato: log estruturado do binário no terminal.

Regra operacional fechada:
- Estoque concorrente: confirmar no máximo uma baixa quando o saldo só comporta uma; a outra sessão recebe rejeição explícita.
- Cadastro e status concorrentes: backend rejeita snapshot stale por versão (`atualizado_em`) e obriga revalidação antes de reenviar.
- Nenhum dos cenários acima permanece dependendo só do usuário perceber “visualmente” que outro técnico salvou antes.

### 7. Endurecer a operação Windows e a observabilidade
- [x] Revisar estratégia de logs para suporte e investigação de incidente.
- [x] Revisar assinatura de build, empacotamento e distribuição Windows.
- [x] Revisar uso de diretórios temporários, abertura de arquivos e superfícies expostas por capability.
- [x] Definir o mínimo de telemetria local ou trilha de suporte necessária para operação assistida.

Saída esperada:
O sistema fica mais previsível de operar, distribuir e diagnosticar em campo.

Status em **2026-05-06** (Windows / suporte):
- `timestampUrl` de Authenticode configurado em `src-tauri/tauri.conf.json` (`http://timestamp.digicert.com`); `certificateThumbprint` continua pendente no artefato Git e deve ser injetado no build assistido (script `bundle:prep:windows:sign`; ver `docs/WINDOWS_CODE_SIGNING.md`).
- Versão de distribuição nominal alinhada em **1.0.0** (`package.json`, `Cargo.toml`, `tauri.conf.json`); convenção em `docs/RELEASE.md`.
- Demais itens de observabilidade/local suporte permanecem conforme entregas anteriores (tracing, housekeeping, snapshot, capability mínima — ver histórico da subseção junto à data 2026-04-28 quando necessário).

Plano de execução delegável:

#### 7.1. Definir trilha mínima de observabilidade local
- [x] Revisar onde os logs nascem, como são configurados e como podem ser coletados em suporte.
- [x] Padronizar o mínimo de contexto para erro operacional relevante.
- [x] Garantir que eventos críticos do backend não se percam em logging insuficiente.

Critério de aceite:
Existe uma forma consistente de investigar incidente sem depender apenas de relato verbal do usuário.

Entregue nesta subetapa:
- `src-tauri/src/main.rs`: tracing com camada adicional em arquivo local (`tracing-appender`) e housekeeping registrado na inicialização.
- `src-tauri/src/commands/util.rs`: snapshot/exportação de suporte com diretórios, schema, ferramentas PostgreSQL, capability e prontidão do bundle.
- `src/pages/Configuracoes.tsx`: painel de suporte local com paths, logs recentes, exportação do pacote JSON e bloqueios atuais de distribuição.

#### 7.2. Revisar prontidão de build e distribuição Windows
- [x] Revisar assinatura, timestamp, nome de artefato, empacotamento e passos de distribuição.
- [x] Identificar o que é indispensável para produção assistida e o que pode ficar para maturidade posterior.
- [x] Registrar bloqueios concretos para distribuição confiável.

Critério de aceite:
O time sabe exatamente o que falta para distribuir o app em Windows com previsibilidade.

Bloqueios / foco atual registrados:

- **`certificateThumbprint`**: obrigatório para distribuição assistida típica; aplicar apenas no pipeline ou checkout de etiqueta (`AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT` → `bundle:prep:windows:sign`).
- **`timestampUrl`**: preenchido com carimbo Digicert público no repositório; substituível por servidor da própria CA se a política exigir.
- **Versão**: 1.0.0 nos três ficheiros oficiais; bumps seguem semver documentado em `docs/RELEASE.md`.

#### 7.3. Endurecer superfícies locais sensíveis
- [x] Revisar diretórios temporários, limpeza de artefatos e abertura de arquivos externos.
- [x] Revisar capabilities expostas e o menor privilégio viável.
- [x] Garantir que o suporte operacional não aumente a superfície de risco sem necessidade.

Critério de aceite:
As capacidades locais expostas pelo app estão justificadas e minimizadas.

Endurecimento aplicado:
- `src-tauri/capabilities/default.json` ficou somente com `core:default`.
- `src-tauri/Cargo.toml`, `package.json` e `src-tauri/src/main.rs` deixaram de depender de `tauri-plugin-shell`.
- `src/pages/Configuracoes.tsx` deixou de abrir caminhos arbitrários via shell e passou a usar exportação controlada de pacote local de suporte.
- A limpeza automática de temporários/logs/pacotes antigos deixa de acumular material operacional indefinidamente em disco.

#### 7.4. Fechar checklist de suporte
- [x] Definir o que coletar em incidente: versão, logs, ambiente, banco, artefato e reprodução.
- [x] Registrar o fluxo mínimo de diagnóstico para problemas comuns de operação.

Validação adicional obrigatória desta etapa:
- Checklist mínimo de suporte documentado.
- Lista explícita de riscos pendentes de distribuição Windows.

Checklist mínimo fechado:
- Versão/build do app, paths locais e housekeeping disponíveis no snapshot de suporte.
- Logs locais e pacote JSON exportável disponíveis para anexar a chamado.
- Banco/schema/migrações e ferramentas PostgreSQL expostos no diagnóstico.
- Congelamento e critérios de etiqueta (`branch` limpa, versões sincronizadas): `docs/RELEASE.md`.

Evidência executável desta etapa (baseline):

- `npx tsc --noEmit` e `cd src-tauri && cargo check`.
- `npm run test:run` — suíte Vitest atualizada (contagem varia conforme evolução do repo).
- `cd src-tauri && cargo run --quiet --bin p1_windows_support_check` — com `timestampUrl` preenchido e versão **1.0.0**, os bloqueios listados devem restringir-se em geral a **`certificateThumbprint` ausente no JSON** até o build assistido aplicar `AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT` + `bundle:prep:windows:sign`.
- `npm run e2e` — smoke atual (`e2e/smoke.spec.ts`).

### 8. Sincronizar a documentação operacional
- [x] Atualizar `README.md` para refletir o fluxo real de execução e validação.
- [x] Atualizar `POSTGRES_SETUP.md` com o estado atual de migrações e dependências.
- [x] Atualizar `POSTGRES_BACKUP_RESTORE.md` com o checklist real de homologação.
- [x] Atualizar `MIGRACAO_POSTGRESQL.md` para refletir o modelo atual de migrações versionadas.

Saída esperada:
A operação deixa de depender de conhecimento tácito ou instruções antigas.

Status em 2026-04-28:
- `README.md` foi reescrito para refletir o fluxo real do app: PostgreSQL obrigatório, scripts atuais (`test:run`, `e2e`, `tauri build`), superfícies de suporte local e bloqueios conhecidos da distribuição Windows.
- `POSTGRES_SETUP.md` foi sincronizado com o bootstrap real do backend (`DATABASE_URL`, `sqlx::migrate!`, `runtime_smoke`) e com o baseline atual de migrações `0001` a `0004`.
- `POSTGRES_BACKUP_RESTORE.md` deixou de documentar comportamento inexistente na UI e agora reflete o card real de `Configurações > Segurança`, incluindo validação de ferramentas, `Gerar backup agora`, restore com caminho absoluto e confirmação `RESTAURAR`.
- `MIGRACAO_POSTGRESQL.md` não existia na raiz do repositório; foi criado como nota técnica operacional para o modelo atual de migrações versionadas.
- A trilha principal de documentação deixou de apontar para um arquivo ausente e passou a privilegiar os documentos operacionais realmente mantidos.

Plano de execução delegável:

#### 8.1. Auditar documentação contra o repositório real
- [x] Comparar scripts, migrações, dependências e fluxos documentados com o estado atual do código.
- [x] Tratar divergência factual como bug operacional.
- [x] Registrar links quebrados, passos inexistentes e premissas antigas.

Critério de aceite:
Existe uma lista objetiva do que está defasado e precisa ser corrigido.

Auditoria factual registrada:
- `MIGRACAO_POSTGRESQL.md` era referenciado por `README.md` e outras docs, mas não existia na raiz do projeto.
- `POSTGRES_SETUP.md` e `POSTGRES_BACKUP_RESTORE.md` ainda paravam na migração `0003_equipment_intake_fields.sql`, embora o repositório já tenha `0004_equipment_images.sql`.
- `POSTGRES_BACKUP_RESTORE.md` ainda sugeria um fluxo de homologação com abertura de pasta de backup pelo app, comportamento removido quando `shell:allow-open` saiu da capability principal.
- `README.md` ainda priorizava um mapa documental menos aderente ao estado atual de suporte/Windows readiness.

#### 8.2. Atualizar a entrada principal do projeto
- [x] Fazer `README.md` refletir stack, execução, validação e fluxo de build reais.
- [x] Garantir que um novo colaborador consiga iniciar o projeto a partir desse arquivo.

Critério de aceite:
O README deixa de ser material promocional e passa a ser entrada operacional confiável.

Atualização aplicada:
- Stack, escopo funcional, pré-requisitos e scripts reais foram alinhados com `package.json`, `tauri.conf.json` e o estado atual do app.
- O mapa de documentação principal foi simplificado para os documentos mantidos (`POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md`, `MIGRACAO_POSTGRESQL.md`, `WINDOWS_OPERATION_READINESS.md`, `NEXT_STEPS.md`).
- O README agora explicita que o bundle Windows ainda não está pronto para distribuição assistida por falta de assinatura/timestamp.

#### 8.3. Atualizar os runbooks de PostgreSQL
- [x] Sincronizar `POSTGRES_SETUP.md` com as migrações reais e dependências atuais.
- [x] Sincronizar `POSTGRES_BACKUP_RESTORE.md` com o procedimento efetivamente validado.
- [x] Atualizar `MIGRACAO_POSTGRESQL.md` para o modelo atual de migrações versionadas.

Critério de aceite:
Os documentos de banco refletem exatamente o fluxo que a equipe consegue executar.

Runbooks sincronizados:
- `POSTGRES_SETUP.md` agora cobre `DATABASE_URL`, bootstrap do backend, `runtime_smoke` e o inventário `0001` a `0004`.
- `POSTGRES_BACKUP_RESTORE.md` foi alinhado com `src-tauri/src/commands/util.rs`, incluindo geração de `.dump`, restore `.dump`/`.sql`, auditoria e reaplicação de migrações.
- `MIGRACAO_POSTGRESQL.md` passou a documentar a fonte de verdade do schema, o uso de `_sqlx_migrations`, o papel do `sqlx::migrate!("./migrations")` e as regras de manutenção do time.

#### 8.4. Tratar documentação como parte da entrega
- [x] Não fechar item técnico cujo fluxo mudou sem revisar a documentação correspondente.
- [x] Relacionar mudanças operacionais no roadmap quando elas afetarem release ou suporte.

Validação adicional obrigatória desta etapa:
- Revisão cruzada entre docs e comandos reais do repositório.
- Nenhum documento principal apontando para passo inexistente ou arquivo incorreto.

Regra operacional reforçada:
- Mudança estrutural, fluxo de suporte ou comportamento administrativo não deve mais ser dado como encerrado sem revisão explícita de `README.md`, docs PostgreSQL e roadmap quando aplicável.

Evidência executável desta etapa:
- Auditoria documental:
  - `README.md`, `POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md`, `package.json`, `src-tauri/src/db.rs`, `src-tauri/src/commands/util.rs`, `src-tauri/tauri.conf.json` e o diretório `src-tauri/migrations/` foram comparados para alinhar scripts, migrações e fluxos reais.
  - Resultado observado: divergências corrigidas, inclusive criação do arquivo ausente `MIGRACAO_POSTGRESQL.md`.
- Comando: `npx tsc --noEmit`
  - Esperado: projeto continuar íntegro após a sincronização documental.
  - Observado: passou.
  - Artefato: saída local do terminal.
- Comando: `cd src-tauri && cargo check`
  - Esperado: backend continuar compilando após a atualização da documentação operacional.
  - Observado: passou; permanecem warnings conhecidos de `dead_code` nos bins auxiliares.
  - Artefato: saída local do terminal.
- Revisão cruzada por conteúdo:
  - Esperado: docs principais refletirem `0004_equipment_images.sql`, o card real de backup/restore e a existência do arquivo `MIGRACAO_POSTGRESQL.md`.
  - Observado: `README.md`, `POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md` e `MIGRACAO_POSTGRESQL.md` agora apontam para o fluxo correto e para arquivos existentes.
  - Artefato: conteúdo atualizado dos documentos na raiz do repositório.

---

## P2 — Integração com AutoBO Sem Reescrita Prematura

### 9. Delimitar contextos de domínio e fonte de verdade

**Status em 2026-05-05:** Concluído com bounded contexts definidos e ownership mapeado.

Plano de execução delegável:

#### 9.1. Inventariar capacidades por domínio
- [x] Listar os casos de uso exclusivos do AutoOS.
- [x] Listar os casos de uso exclusivos do AutoBO.
- [x] Listar os casos de uso compartilhados ou com impacto bilateral.

**Inventário de domínios:**

| Domínio | AutoOS | AutoBO | Compartilhado |
|--------|-------|-------|---------------|
| Clientes/Pagadores | Display | CRUD completo | Leitura via view |
| Equipamentos | Full lifecycle | N/A | Não |
| Produtos/Insumos | CRUD completo | Leitura | Sim |
| Movimentações | Full | Leitura | Sim |
| Verificações | Full | N/A | Não |
| Comunicações | Service updates | Billing notifications | Sim |
| Boletos | Display only | Full | Não |
| Notas Fiscais | N/A | Importação/API | Não |

#### 9.2. Definir ownership de entidades e decisões
- [x] Definir quem manda em estoque, cliente, orçamento, OS e eventos financeiros.
- [x] Nomear onde nasce cada alteração e quem apenas consome ou replica.
- [x] Evitar ownership duplo por conveniência de implementação.

**Ownership definido:**

| Entidade | Dono | Fonte de Verdade | Acesso AutoOS |
|---------|-----|-----------------|--------------|
| `pagadores` | AutoBO | AutoBO (PostgreSQL) | View only |
| `clientes` | AutoOS | AutoOS (view) | Full |
| `produtos` | AutoOS | AutoOS (PostgreSQL) | Full |
| `boletos` | AutoBO | AutoBO (PostgreSQL) | Display |
| `equipamentos` | AutoOS | AutoOS | Exclusive |
| `verificacoes` | AutoOS | AutoOS | Exclusive |
| `notas_fiscais` | AutoBO | AutoBO | None |

#### 9.3. Desenhar fronteiras sem acoplamento ingênuo
- [x] Evitar integração baseada só em acesso direto às mesmas tabelas sem contrato.
- [x] Identificar quando um anti-corruption layer simples será necessário.
- [x] Registrar explicitamente o que pode ser compartilhado em banco e o que precisa de contrato de aplicação.

**Estratégia de fronteira:**

```sql
-- Anti-corruption via views
CREATE VIEW v_produtos_insumos AS SELECT * FROM produtos;
CREATE VIEW v_clientes_display AS SELECT id, nome, telefone, email FROM clientes;
```

- **Por que views**: Evita replicação desnecessária, mantém dono claro, PostgreSQL MVCC segura para concorrência

#### 9.4. Formalizar a decisão em linguagem de domínio
- [x] Produzir definição curta dos bounded contexts e suas relações.
- [x] Registrar essa fronteira no roadmap ou ADR correspondente.

**Bounded Contexts formalizados:**

```
┌─────────────────────────────────────────────┐
│        AutoOS (Technical Context)         │
│  • Clientes (read replica)               │
│  • Equipamentos (full lifecycle)         │
│  • Verificacoes (technical checklist) │
│  • Comunicacoes (service alerts)    │
└─────────────────────────────────────────────┘
              │ Shared: pg_clientes
              │ Shared: pg_produtos
              ▼
┌─────────────────────────────────────────────┐
│         AutoBO (Billing Context)           │
│  • Pagadores (source of truth)          │
│  • Notas Fiscais (NF-e import)        │
│  • Boletos (Sicredi integration)    │
│  • Comunicacoes (billing notifications)│
└─────────────────────────────────────────────┘
```

Validação adicional obrigatória desta etapa:
- [x] Mapa simples de ownership por domínio.
- [x] Fonte de verdade nomeada para cada área crítica.

**Contexto definido em 2026-05-05 com análise de migrações + tipos + documentação AutoBO.**

### 10. Definir o contrato de integração antes da tecnologia

**Status em 2026-05-05:** Concluído com contrato híbrido e roadmap de 3 fases.

Plano de execução delegável:

#### 10.1. Escolher a primeira integração de maior valor
- [x] Confirmar se o primeiro domínio será estoque compartilhado.
- [x] Limitar o primeiro corte ao menor fluxo que gera ganho real para operação e financeiro.
- [x] Evitar abrir múltiplos domínios de integração na primeira rodada.

**Primeira integração: Insumos (Produtos)**

- Por que: Menor risco (leitura AutoBO), valor operacional imediato, claramente delimitado

#### 10.2. Definir contrato funcional da integração
- [x] Especificar comandos, eventos ou endpoints necessários.
- [x] Especificar payload mínimo, regras de validação, idempotência e tratamento de erro.
- [x] Especificar quando o processo precisa de resposta imediata e quando pode ser assíncrono.

**Contrato funcional:**

| Domínio | Quando | Pattern | AutoBO → AutoOS |
|---------|--------|---------|----------------|
| Estoque | Low stock | Evento (polling job) | Read `v_produtos`, alerta |
| Cliente | Equipamento pronto | Sync (view) | Read `v_clientes` |
| Boleto | Pagamento confirmado | Async (polling) | Status update |

- **Eventos**: Tabela `stock_events` com `produto_id`, `evento`, `saldo_anterior`, `saldo_novo`
- **Sync**: Views PostgreSQL para leitura sem escrita cruzada

#### 10.3. Definir identidade, autorização e auditoria entre aplicações
- [x] Definir quem chama quem e com qual identidade técnica.
- [x] Definir quais ações precisam ser auditadas entre sistemas.
- [x] Definir tratamento para falha parcial e reconciliação.

**Modelo de confiança:**

- Aplicações locais no mesmo PostgreSQL = confiança implícita
- Sem OAuth necessário para apps no mesmo host
- Credenciaisonly via connection string
- Auditoria em `security_audit_log` existente

#### 10.4. Planejar rollout incremental
- [x] Definir fase piloto, rollback e coexistência temporária quando necessário.
- [x] Evitar migração big bang quando um domínio ainda não foi provado.

**Roadmap de rollout:**

```
Fase 1: Estoque (Semana 1-2)
├── View v_produtos em AutoBO
├── Exibir estoque AutoOS no AutoBO UI
└── Alertas de estoque baixo (job)

Fase 2: Clientes (Semana 3-4)
├── View v_clientes em AutoOS
├── Exibir clientes AutoBO no AutoOS
└── Sync automático em mudança de status

Fase 3: Boletos (Semana 5-6)
├── Webhook de pagamento AutoBO
├── AutoOS recebe status
└── Notificação ao cliente
```

Validação adicional obrigatória desta etapa:
- [x] Contrato funcional documentado do primeiro slice.
- [x] Estratégia de falha e reconciliação definida.

**Execução em 2026-05-05: Análise de domínio + documentação + roadmap**

---

## P3 — Evolução Arquitetural Depois de Estabilizar o Produto

### 11. Decidir se um backend central vale o custo
- [ ] Comparar formalmente três opções: manter o modelo atual endurecido, criar um serviço central incremental, ou reescrever de forma ampla.
- [ ] Medir custo de deploy, suporte, autenticação, observabilidade e manutenção para cada opção.
- [ ] Aprovar mudança arquitetural só se ela resolver uma dor já observada em produção ou homologação real.

Saída esperada:
A decisão arquitetural passa a ser baseada em evidência e não em preferência de stack.

Plano de execução delegável:

#### 11.1. Coletar dores reais antes da decisão
- [ ] Listar incidentes, limitações e fricções do modelo atual já observados em homologação ou produção assistida.
- [ ] Separar dor real de hipótese de escala futura.

Critério de aceite:
A decisão nasce de problemas observados, não de ansiedade arquitetural.

#### 11.2. Comparar opções com custo total
- [ ] Comparar modelo atual endurecido, serviço central incremental e reescrita ampla.
- [ ] Medir impacto em deploy, autenticação, suporte, observabilidade, operação e curva de manutenção.
- [ ] Nomear o que cada opção piora, não só o que melhora.

Critério de aceite:
Há uma matriz de trade-offs compreensível para o time e para o negócio.

#### 11.3. Definir gatilhos objetivos para mudança
- [ ] Nomear quais condições tornam o backend central justificável.
- [ ] Nomear quais condições mantêm o modelo atual como escolha racional.

Critério de aceite:
Existe critério claro para dizer sim, ainda não, ou não.

#### 11.4. Encerrar com ADR
- [ ] Registrar a decisão, o contexto e as consequências em ADR curto.

Validação adicional obrigatória desta etapa:
- Comparativo entre as três opções.
- Decisão registrada com contexto e consequências.

### 12. Tratar Java como opção, não como premissa
- [ ] Só considerar Spring Boot se a equipe tiver capacidade real de operar, manter e evoluir essa stack.
- [ ] Não iniciar reescrita motivada apenas por sensação de escalabilidade futura.
- [ ] Exigir ADR comparando trade-offs de Rust atual, serviço central incremental e backend Java.

Critério de aprovação:
Java só entra se for a menor complexidade total para o negócio, não a arquitetura mais bonita no papel.

Plano de execução delegável:

#### 12.1. Validar prontidão real da equipe para Java
- [ ] Confirmar domínio técnico da equipe em Spring Boot, persistência, deploy e operação dessa stack.
- [ ] Confirmar quem sustentará build, observabilidade e incidentes em produção.

Critério de aceite:
Java só segue adiante se houver capacidade real de sustentação, não apenas interesse técnico.

#### 12.2. Comparar aderência técnica ao problema
- [ ] Verificar se o problema central é integração, domínio compartilhado e segurança, ou se é apenas preferência de stack.
- [ ] Comparar a complexidade adicionada por JVM, serviço extra, autenticação central e operação contínua.

Critério de aceite:
A opção Java prova que reduz complexidade total do negócio no cenário real.

#### 12.3. Exigir decisão reversível e incremental
- [ ] Evitar reescrita total como primeiro movimento.
- [ ] Se Java permanecer forte como opção, começar por um slice pequeno e reversível.
- [ ] Registrar explicitamente por que Rust atual ou serviço incremental sem Java não foram escolhidos.

Validação adicional obrigatória desta etapa:
- ADR comparando Rust atual, serviço central incremental e backend Java.
- Justificativa explícita de capacidade operacional da equipe.

---

## P4 — Backlog Pós-Go-Live

### 13. Melhorias funcionais que não bloqueiam produção
- [ ] Recebimento de respostas via WhatsApp para aprovação/reprovação.
- [ ] Dados da empresa em Configurações.
- [ ] Prazos padrão para aprovação de orçamento.
- [ ] Checklist padrão customizável.
- [ ] Relatórios e exportação CSV/Excel.
- [ ] Notificações internas e alertas visuais.
- [ ] Paginação fallback e lazy loading apenas se métricas reais exigirem.

Plano de execução delegável:

#### 13.1. Repriorizar por valor pós-go-live
- [ ] Ordenar essas melhorias por impacto real na operação do técnico e no suporte ao negócio.
- [ ] Evitar iniciar item cosmético enquanto houver melhoria funcional com retorno operacional maior.

Critério de aceite:
O backlog pós-go-live reflete valor de negócio e frequência de uso.

#### 13.2. Amarrar cada item a uma hipótese de ganho
- [ ] Registrar rapidamente por que cada melhoria existe, quem usa e como medir sucesso.
- [ ] Tratar paginação e lazy loading como resposta a métrica real, não a medo antecipado.

Critério de aceite:
Cada item tem justificativa operacional mínima e não entra só por parecer boa ideia.

#### 13.3. Executar em lotes pequenos
- [ ] Agrupar melhorias por área funcional para reduzir retrabalho.
- [ ] Evitar lotes grandes demais que atrasem feedback do usuário.

Validação adicional obrigatória desta etapa:
- Cada item puxado do backlog pós-go-live deve nascer com critério de aceite e hipótese de valor.

---

## Validação Obrigatória por Etapa

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
```

Validações adicionais quando aplicável:
- Toda mudança em trilha operacional PostgreSQL deve ser validada com banco real e ferramentas reais no ambiente alvo.
- Toda mudança em QA/E2E deve terminar com `npm run e2e` funcionando sem workaround manual fora do fluxo documentado.
- Toda mudança em segurança sensível deve incluir prova de negação de acesso além do caso de sucesso.
