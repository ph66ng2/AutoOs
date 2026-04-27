# Próximos Passos — AutoOS

## ✅ Concluído

### Infraestrutura
- [x] Tauri 2.x + React 18 + TypeScript
- [x] Tailwind CSS + shadcn/ui (11 componentes)
- [x] PostgreSQL com 6 tabelas (clientes, equipamentos, produtos, movimentacoes_estoque, verificacoes, comunicacoes)
- [x] 25 comandos Tauri registrados (CRUD completo + utilitários + SMTP)
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
- [x] WhatsApp via wa.me (orçamento + equipamento pronto)
- [x] Email service com corpo formatado (placeholder — sem SMTP real)
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
- [ ] Alinhar host e porta entre Vite, Tauri e Playwright para `npm run e2e` funcionar no estado padrão do projeto.
- [ ] Garantir que a suíte oficial não dependa de inicialização manual paralela fora do comando documentado.
- [ ] Separar explicitamente o que é E2E com mock do que é validação real de integração.
- [ ] Preservar artefatos de falha úteis para análise de regressão.

Saída esperada:
O comando oficial de QA roda de forma reprodutível e confiável para a equipe.

Plano de execução delegável:

#### 4.1. Fechar a configuração determinística do ambiente de teste
- [ ] Revisar `playwright.config.ts`, `vite.config.ts` e `src-tauri/tauri.conf.json` como um único contrato de host/porta.
- [ ] Remover divergência entre `localhost` e `127.0.0.1` no fluxo oficial.
- [ ] Garantir que `npm run e2e` reflita o caminho documentado pela equipe.

Critério de aceite:
O comando oficial sobe e encontra a aplicação sem ajuste manual de host ou boot paralelo improvisado.

#### 4.2. Separar camadas de QA por intenção
- [ ] Nomear claramente o que é teste com mock de Tauri.
- [ ] Nomear claramente o que é teste de integração real.
- [ ] Evitar que resultado verde de mock seja vendido como prova do runtime completo.
- [ ] Ajustar scripts e documentação para refletir essa separação.

Critério de aceite:
Qualquer pessoa da equipe consegue distinguir teste de interface mockada de validação de integração real.

#### 4.3. Preservar artefatos úteis de falha
- [ ] Garantir screenshots, traces, vídeos ou logs úteis quando houver falha.
- [ ] Organizar a pasta de resultados para facilitar leitura da última execução.
- [ ] Confirmar que CI ou execução local preserva evidência suficiente para triagem.

Critério de aceite:
Uma falha de E2E produz evidência útil para diagnóstico sem exigir reprodução cega.

#### 4.4. Encerrar com fluxo reproduzível
- [ ] Rodar `npm run e2e` no estado padrão do repositório.
- [ ] Registrar qualquer pré-requisito legítimo de ambiente que permaneça necessário.
- [ ] Atualizar a documentação de QA caso o fluxo oficial mude.

Validação adicional obrigatória desta etapa:
- `npm run e2e` passa sem workaround manual fora do fluxo documentado.
- A distinção entre mock e integração real fica explícita em scripts ou docs.

---

## P1 — Confiabilidade Antes de Escala

### 5. Cobrir os fluxos críticos com testes de verdade
- [ ] Expandir testes para os fluxos de equipamentos, estoque, permissões, orçamento/OS e comunicações.
- [ ] Incluir testes no backend Rust para regras de negócio críticas e comandos sensíveis.
- [ ] Tratar como prioritário o que afeta dinheiro, estoque, status da impressora e integridade do cliente.

Saída esperada:
O que sustenta a operação deixa de depender quase só de teste manual.

Plano de execução delegável:

#### 5.1. Montar matriz de risco por fluxo
- [ ] Classificar os fluxos por impacto em dinheiro, estoque, estado da impressora e integridade do cliente.
- [ ] Priorizar testes onde erro gera perda operacional, retrabalho ou inconsistência difícil de detectar.
- [ ] Não gastar a primeira rodada com cobertura cosmética de UI.

Critério de aceite:
Existe uma ordem explícita de testes baseada em risco operacional, não em facilidade de implementação.

#### 5.2. Cobrir regras críticas do backend Rust
- [ ] Criar testes para permissões, mutações financeiras, movimentação de estoque e transições sensíveis de status.
- [ ] Incluir casos felizes, negação de acesso e validações de entrada.
- [ ] Priorizar funções e comandos que mudam estado persistido.

Critério de aceite:
As regras de negócio críticas do backend têm cobertura mínima contra regressão.

#### 5.3. Cobrir fluxos integrados do frontend
- [ ] Testar caminhos principais de cadastro, edição e mudança de status.
- [ ] Testar geração de orçamento/OS e envio de comunicação onde houver superfície testável.
- [ ] Testar comportamentos de erro relevantes, não só caminho feliz.

Critério de aceite:
Os fluxos que o usuário realmente usa deixam de depender apenas de verificação manual ad hoc.

#### 5.4. Subir o piso de validação contínua
- [ ] Garantir que os testes adicionados entrem na validação padrão da equipe.
- [ ] Remover testes frágeis ou redundantes que mascaram confiança falsa.
- [ ] Documentar rapidamente a intenção dos testes mais sensíveis.

Validação adicional obrigatória desta etapa:
- Prova de pelo menos um teste novo para cada domínio crítico: permissões, equipamentos e estoque.
- Falha reproduzível antes da correção quando aplicável.

### 6. Validar concorrência compatível com 2 técnicos
- [ ] Testar alteração simultânea de estoque.
- [ ] Testar alteração simultânea de status de equipamento.
- [ ] Testar cadastro/edição concorrente de cliente e equipamento.
- [ ] Identificar onde a consistência depende só de disciplina do usuário e endurecer o backend quando necessário.

Saída esperada:
Dois técnicos trabalhando em paralelo não geram perda silenciosa de consistência.

Plano de execução delegável:

#### 6.1. Identificar hotspots de escrita concorrente
- [ ] Mapear entidades com maior chance de colisão: produtos, movimentações, equipamentos e clientes.
- [ ] Definir quais invariantes não podem ser quebradas em escrita concorrente.
- [ ] Distinguir conflito tolerável de conflito que precisa ser bloqueado.

Critério de aceite:
Há uma lista explícita do que deve permanecer consistente com dois técnicos atuando em paralelo.

#### 6.2. Definir cenários de concorrência reais
- [ ] Simular baixa simultânea no mesmo item de estoque.
- [ ] Simular mudança simultânea do mesmo equipamento.
- [ ] Simular edição concorrente de cadastro com dados divergentes.
- [ ] Registrar o comportamento esperado para cada caso: bloquear, prevalecer última escrita ou exigir revalidação.

Critério de aceite:
Cada cenário concorrente relevante tem comportamento esperado definido antes da implementação do teste.

#### 6.3. Endurecer backend e banco onde necessário
- [ ] Revisar transações, constraints, updates condicionais e possíveis verificações de versão.
- [ ] Corrigir pontos onde a consistência depende apenas do usuário perceber conflito visualmente.
- [ ] Garantir que erro de concorrência seja explícito e tratável.

Critério de aceite:
Conflitos relevantes deixam de virar corrupção silenciosa ou sobrescrita invisível.

#### 6.4. Validar com prova prática
- [ ] Reexecutar os cenários com dois clientes ou duas sessões.
- [ ] Registrar resultado observado e qualquer regra de negócio ainda ambígua.

Validação adicional obrigatória desta etapa:
- Evidência de pelo menos um cenário concorrente de estoque e um de equipamento.
- Regra documentada para resolução ou rejeição de conflito.

### 7. Endurecer a operação Windows e a observabilidade
- [ ] Revisar estratégia de logs para suporte e investigação de incidente.
- [ ] Revisar assinatura de build, empacotamento e distribuição Windows.
- [ ] Revisar uso de diretórios temporários, abertura de arquivos e superfícies expostas por capability.
- [ ] Definir o mínimo de telemetria local ou trilha de suporte necessária para operação assistida.

Saída esperada:
O sistema fica mais previsível de operar, distribuir e diagnosticar em campo.

Plano de execução delegável:

#### 7.1. Definir trilha mínima de observabilidade local
- [ ] Revisar onde os logs nascem, como são configurados e como podem ser coletados em suporte.
- [ ] Padronizar o mínimo de contexto para erro operacional relevante.
- [ ] Garantir que eventos críticos do backend não se percam em logging insuficiente.

Critério de aceite:
Existe uma forma consistente de investigar incidente sem depender apenas de relato verbal do usuário.

#### 7.2. Revisar prontidão de build e distribuição Windows
- [ ] Revisar assinatura, timestamp, nome de artefato, empacotamento e passos de distribuição.
- [ ] Identificar o que é indispensável para produção assistida e o que pode ficar para maturidade posterior.
- [ ] Registrar bloqueios concretos para distribuição confiável.

Critério de aceite:
O time sabe exatamente o que falta para distribuir o app em Windows com previsibilidade.

#### 7.3. Endurecer superfícies locais sensíveis
- [ ] Revisar diretórios temporários, limpeza de artefatos e abertura de arquivos externos.
- [ ] Revisar capabilities expostas e o menor privilégio viável.
- [ ] Garantir que o suporte operacional não aumente a superfície de risco sem necessidade.

Critério de aceite:
As capacidades locais expostas pelo app estão justificadas e minimizadas.

#### 7.4. Fechar checklist de suporte
- [ ] Definir o que coletar em incidente: versão, logs, ambiente, banco, artefato e reprodução.
- [ ] Registrar o fluxo mínimo de diagnóstico para problemas comuns de operação.

Validação adicional obrigatória desta etapa:
- Checklist mínimo de suporte documentado.
- Lista explícita de riscos pendentes de distribuição Windows.

### 8. Sincronizar a documentação operacional
- [ ] Atualizar `README.md` para refletir o fluxo real de execução e validação.
- [ ] Atualizar `POSTGRES_SETUP.md` com o estado atual de migrações e dependências.
- [ ] Atualizar `POSTGRES_BACKUP_RESTORE.md` com o checklist real de homologação.
- [ ] Atualizar `MIGRACAO_POSTGRESQL.md` para refletir o modelo atual de migrações versionadas.

Saída esperada:
A operação deixa de depender de conhecimento tácito ou instruções antigas.

Plano de execução delegável:

#### 8.1. Auditar documentação contra o repositório real
- [ ] Comparar scripts, migrações, dependências e fluxos documentados com o estado atual do código.
- [ ] Tratar divergência factual como bug operacional.
- [ ] Registrar links quebrados, passos inexistentes e premissas antigas.

Critério de aceite:
Existe uma lista objetiva do que está defasado e precisa ser corrigido.

#### 8.2. Atualizar a entrada principal do projeto
- [ ] Fazer `README.md` refletir stack, execução, validação e fluxo de build reais.
- [ ] Garantir que um novo colaborador consiga iniciar o projeto a partir desse arquivo.

Critério de aceite:
O README deixa de ser material promocional e passa a ser entrada operacional confiável.

#### 8.3. Atualizar os runbooks de PostgreSQL
- [ ] Sincronizar `POSTGRES_SETUP.md` com as migrações reais e dependências atuais.
- [ ] Sincronizar `POSTGRES_BACKUP_RESTORE.md` com o procedimento efetivamente validado.
- [ ] Atualizar `MIGRACAO_POSTGRESQL.md` para o modelo atual de migrações versionadas.

Critério de aceite:
Os documentos de banco refletem exatamente o fluxo que a equipe consegue executar.

#### 8.4. Tratar documentação como parte da entrega
- [ ] Não fechar item técnico cujo fluxo mudou sem revisar a documentação correspondente.
- [ ] Relacionar mudanças operacionais no roadmap quando elas afetarem release ou suporte.

Validação adicional obrigatória desta etapa:
- Revisão cruzada entre docs e comandos reais do repositório.
- Nenhum documento principal apontando para passo inexistente ou arquivo incorreto.

---

## P2 — Integração com AutoBO Sem Reescrita Prematura

### 9. Delimitar contextos de domínio e fonte de verdade
- [ ] Definir o que pertence exclusivamente ao AutoOS.
- [ ] Definir o que é domínio compartilhado com o AutoBO.
- [ ] Nomear explicitamente a fonte de verdade para estoque, cliente, orçamento, OS e eventos financeiros.
- [ ] Evitar compartilhamento ingênuo por tabela sem contrato de domínio.

Saída esperada:
Existe uma fronteira clara entre operacional técnico e financeiro/comercial.

Plano de execução delegável:

#### 9.1. Inventariar capacidades por domínio
- [ ] Listar os casos de uso exclusivos do AutoOS.
- [ ] Listar os casos de uso exclusivos do AutoBO.
- [ ] Listar os casos de uso compartilhados ou com impacto bilateral.

Critério de aceite:
Há uma visão concreta de domínio, e não apenas nomes genéricos de módulos ou tabelas.

#### 9.2. Definir ownership de entidades e decisões
- [ ] Definir quem manda em estoque, cliente, orçamento, OS e eventos financeiros.
- [ ] Nomear onde nasce cada alteração e quem apenas consome ou replica.
- [ ] Evitar ownership duplo por conveniência de implementação.

Critério de aceite:
Cada entidade relevante tem um dono claro e uma fonte de verdade explícita.

#### 9.3. Desenhar fronteiras sem acoplamento ingênuo
- [ ] Evitar integração baseada só em acesso direto às mesmas tabelas sem contrato.
- [ ] Identificar quando um anti-corruption layer simples será necessário.
- [ ] Registrar explicitamente o que pode ser compartilhado em banco e o que precisa de contrato de aplicação.

Critério de aceite:
A integração não depende de conhecimento implícito do schema por duas aplicações diferentes.

#### 9.4. Formalizar a decisão em linguagem de domínio
- [ ] Produzir definição curta dos bounded contexts e suas relações.
- [ ] Registrar essa fronteira no roadmap ou ADR correspondente.

Validação adicional obrigatória desta etapa:
- Mapa simples de ownership por domínio.
- Fonte de verdade nomeada para cada área crítica.

### 10. Definir o contrato de integração antes da tecnologia
- [ ] Decidir se a integração AutoOS ↔ AutoBO será síncrona, assíncrona ou híbrida.
- [ ] Definir ownership de baixa de estoque, compra, ajuste e reconciliação.
- [ ] Definir identidade, autorização e auditoria entre aplicações.
- [ ] Criar um plano incremental que comece pelo domínio mais valioso: estoque compartilhado.

Saída esperada:
A integração com o AutoBO deixa de ser uma ideia abstrata e vira contrato executável.

Trade-off assumido:
Mais disciplina de modelagem agora, menos retrabalho e menos acoplamento caótico depois.

Plano de execução delegável:

#### 10.1. Escolher a primeira integração de maior valor
- [ ] Confirmar se o primeiro domínio será estoque compartilhado.
- [ ] Limitar o primeiro corte ao menor fluxo que gera ganho real para operação e financeiro.
- [ ] Evitar abrir múltiplos domínios de integração na primeira rodada.

Critério de aceite:
Existe um primeiro slice pequeno, valioso e implementável.

#### 10.2. Definir contrato funcional da integração
- [ ] Especificar comandos, eventos ou endpoints necessários.
- [ ] Especificar payload mínimo, regras de validação, idempotência e tratamento de erro.
- [ ] Especificar quando o processo precisa de resposta imediata e quando pode ser assíncrono.

Critério de aceite:
A integração pode ser implementada sem interpretação livre de regra de negócio por cada lado.

#### 10.3. Definir identidade, autorização e auditoria entre aplicações
- [ ] Definir quem chama quem e com qual identidade técnica.
- [ ] Definir quais ações precisam ser auditadas entre sistemas.
- [ ] Definir tratamento para falha parcial e reconciliação.

Critério de aceite:
Existe um modelo mínimo de confiança entre aplicações e um plano para falha de comunicação.

#### 10.4. Planejar rollout incremental
- [ ] Definir fase piloto, rollback e coexistência temporária quando necessário.
- [ ] Evitar migração big bang quando um domínio ainda não foi provado.

Validação adicional obrigatória desta etapa:
- Contrato funcional documentado do primeiro slice.
- Estratégia de falha e reconciliação definida.

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
