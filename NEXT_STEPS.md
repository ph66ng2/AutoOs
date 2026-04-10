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

## � Próximas Implementações

### Prioridade Alta

#### 1. ~~Email Real (SMTP)~~ ✅ CONCLUÍDO
- [x] Adicionado crate `lettre` ao Cargo.toml com features SMTP
- [x] Criado comando Rust `enviar_email` com suporte a SMTP/TLS + anexos
- [x] Criados comandos `salvar_config_smtp` e `buscar_config_smtp` com armazenamento seguro via keyring
- [x] Tela de configurações SMTP (`/configuracoes`) criada
- [x] `email-service.ts` atualizado para usar backend real
- [x] Suporte a anexo PDF no envio de orçamento

#### 2. ~~Geração de Orçamento (PDF)~~ ✅ CONCLUÍDO
- [x] PDF gerado via jsPDF + jspdf-autotable no frontend
- [x] Layout profissional com logo, tabelas e condições
- [x] Botão "Gerar Orçamento PDF" nos status VERIFICADO e AGUARDANDO_APROVACAO
- [x] PDF anexado automaticamente ao email de orçamento

#### 3. ~~Gráficos no Dashboard~~ ✅ CONCLUÍDO
- [x] Recharts instalado (`recharts@2.12.7`)
- [x] Gráfico de pizza: distribuição de equipamentos por status
- [x] Gráfico de barras: equipamentos recebidos por mês
- [x] Gráfico de linha: receita (orçamentos aprovados) por mês

### Prioridade Média

#### 4. WhatsApp via API (substituir wa.me)
- [x] Escolhido Evolution API self-hosted como provider padrão
- [x] Criado comando Rust `enviar_whatsapp` com HTTP request
- [x] Envio automático sem interação do usuário (sem abrir navegador)
- [ ] Recebimento de respostas (APROVADO/REPROVADO) — se usar Evolution API

#### 5. ~~Banco de Insumos Compartilhado~~ ✅ CONCLUÍDO (via PostgreSQL)
O banco PostgreSQL centralizado resolve o compartilhamento de dados entre aplicativos.

**Arquitetura Atual:**
```
PostgreSQL (autoos database)
├── clientes
├── equipamentos
├── produtos              ← Acessível por qualquer app via SQL
├── movimentacoes_estoque ← Acessível por qualquer app via SQL
├── verificacoes
└── comunicacoes
```

**Vantagens do PostgreSQL para compartilhamento:**
- Acesso concorrente nativo (múltiplos apps simultâneos)
- Controle de acesso por schema/roles do PostgreSQL
- Sem problemas de file locking (diferente de SQLite)
- Transações ACID completas entre apps

**Próximos passos opcionais:**
- [ ] Criar schemas separados (`autoos` e `insumos`) para isolamento lógico
- [ ] Criar roles PostgreSQL específicas por aplicativo
- [ ] Implementar sistema de migrations versionado (sqlx migrate)

#### 6. ~~Paginação e Performance~~ ✅ CONCLUÍDO
- [x] Implementado paginação no backend (LIMIT 50 OFFSET nas queries)
- [x] Comandos listar_* aceitam parâmetro `page` opcional
- [ ] TanStack Table com paginação client-side como fallback (opcional)
- [ ] Lazy loading para listas grandes (>100 itens) (opcional)

#### 7. ~~Estrutura e Qualidade de Código~~ ✅ CONCLUÍDO
- [x] Dividido `commands.rs` (1281 linhas) em 8 módulos organizados
- [x] Adicionado logging estruturado via `tracing` crate
- [x] Configurado Vitest + Testing Library para testes unitários
- [x] Configurado Playwright para testes E2E
- [x] Criado GitHub Actions CI/CD (Build + Lint + Tests)
- [x] Código preparado para i18n futuro (strings centralizáveis)

#### 8. Tela de Configurações
- [ ] Dados da empresa (nome, endereço, telefone, CNPJ, logo)
- [x] Configurações de SMTP (host, porta, usuário, senha) ← Implementado em `/configuracoes`
- [x] Configurações de WhatsApp (API URL, token) ← Implementado em `/configuracoes`
- [ ] Prazos padrão (dias para aprovação de orçamento)
- [ ] Checklist padrão customizável (itens de verificação)

### Prioridade Baixa

#### 9. Relatórios e Exportação
- [ ] Exportar lista de equipamentos em CSV/Excel
- [ ] Relatório mensal de manutenções realizadas
- [ ] Relatório de estoque baixo (insumos abaixo do mínimo)

#### 10. Notificações Internas
- [ ] Badge de notificação na sidebar (equipamentos pendentes)
- [ ] Toast/snackbar para ações concluídas
- [ ] Alerta visual para orçamentos vencidos

#### 11. Backup e Restauração
- [ ] Backup automático do banco (diário via `pg_dump`)
- [ ] Botão de backup manual
- [ ] Restauração a partir de dump PostgreSQL (`pg_restore`)

---

## 🏗️ Arquitetura de Referência

```
src/
├── components/
│   ├── ui/                          # shadcn/ui (11 componentes)
│   ├── equipamentos/
│   │   ├── VerificacaoTecnica.tsx   # ✅ Standalone
│   │   └── HistoricoComunicacoes.tsx # ✅ Standalone
│   └── Layout.tsx                   # ✅ Sidebar + Router
├── hooks/
│   ├── useEquipamentos.ts           # ✅ CRUD + filtros
│   ├── useClientes.ts               # ✅ CRUD + busca
│   ├── useInsumos.ts                # ✅ CRUD + movimentações
│   └── useStatusEquipamento.ts      # ✅ Automação de transições
├── lib/
│   ├── db.ts                        # ✅ Camada de acesso ao banco
│   ├── whatsapp-service.ts          # ✅ wa.me links
│   ├── email-service.ts             # ✅ Placeholder com corpo formatado
│   ├── pdf-service.ts               # ✅ Geração de orçamento PDF
│   └── validations.ts               # ✅ Schemas Zod
├── pages/
│   ├── Dashboard.tsx                # ✅ Métricas + ações pendentes
│   ├── Equipamentos.tsx             # ✅ CRUD + verificação + detalhes
│   ├── Insumos.tsx                  # ✅ CRUD + movimentações
│   └── Clientes.tsx                 # ✅ Listagem + equipamentos vinculados
├── types/
│   └── index.ts                     # ✅ Interfaces tipadas
└── App.tsx                          # ✅ Router

src-tauri/
├── src/
│   ├── main.rs                      # ✅ Entry point + 25 comandos registrados
│   ├── db.rs                        # ✅ 6 tabelas PostgreSQL + pool global
│   └── commands/                    # ✅ Módulos organizados por domínio
│       ├── mod.rs                   # ✅ Re-exporta submódulos
│       ├── types.rs                 # ✅ Structs de entrada/saída
│       ├── equipamentos.rs          # ✅ 6 comandos CRUD + status
│       ├── clientes.rs              # ✅ 5 comandos CRUD
│       ├── produtos.rs              # ✅ 5 comandos CRUD
│       ├── verificacoes.rs          # ✅ 2 comandos (upsert + busca)
│       ├── comunicacoes.rs          # ✅ 2 comandos (registrar + listar)
│       ├── smtp.rs                  # ✅ 3 comandos (config + envio)
│       └── util.rs                  # ✅ 2 comandos (greet + temp file)
└── Cargo.toml                       # ✅ Dependências (sqlx, lettre, tracing, keyring)
```

---

## 📝 Notas Técnicas

- **PostgreSQL**: Banco centralizado com suporte a acesso concorrente nativo. Configurar via `DATABASE_URL` no `.env`.
- **Credenciais**: Nunca hardcodar. Usar arquivo de config criptografado ou keyring do OS.
- **Rate limiting**: Implementar para emails (max 500/dia Gmail) e WhatsApp (respeitar limites da API).
- **Migração de dados**: Sempre preservar dados existentes. Considerar `sqlx migrate` para migrations versionadas.
- **Tipos SQL**: NUMERIC→FLOAT8 cast em queries (compatível com f64 no Rust). TIMESTAMP→TEXT cast para serialização.

---

## 🔧 Comandos

```bash
# Desenvolvimento
npm run tauri dev        # App Tauri em modo dev

# Build
npm run tauri build      # Build de produção

# Verificação
npm run lint             # TypeScript check
cd src-tauri && cargo check  # Rust check

# Testes
npm run test             # Vitest watch mode
npm run test:run         # Vitest single run
npm run test:ui          # Vitest com UI
npm run test:coverage    # Vitest com coverage

# E2E
npm run e2e              # Playwright headless
npm run e2e:ui           # Playwright com UI
npm run e2e:headed       # Playwright com browser visível
```
