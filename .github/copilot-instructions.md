# AutoOS - Copilot Instructions

## Escopo Atual do Produto

**AutoOS** é um sistema desktop para gestão de impressoras, recebimento técnico, comunicações operacionais e controle de estoque de insumos.

O projeto já não está mais em fase de scaffold. As instruções daqui devem refletir o estado real do produto e evitar regressão para premissas antigas, principalmente referências a SQLite, backend monolítico ou fluxos sem controle local de acesso sensível.

## Stack Atual

- Frontend: React 18 + TypeScript + Tailwind CSS
- Desktop: Tauri 2.x com backend Rust
- UI: shadcn/ui
- Banco: PostgreSQL com sqlx e migrações versionadas
- Forms: React Hook Form + Zod
- Tabelas: TanStack Table
- Estado local: Zustand onde já existir
- Roteamento: React Router v6

## Áreas Funcionais Já Entregues

- Cadastro e gestão de clientes, equipamentos e produtos
- Controle de estoque com movimentação de entrada e saída
- Recebimento técnico com defeito relatado, patrimônio e acessórios
- Histórico de comunicações por WhatsApp e email
- Perfis locais com PIN, permissões granulares e auditoria mínima
- Painel de conferência do schema do banco em Configurações
- Backup manual PostgreSQL pelo app
- Restore manual PostgreSQL pelo app com confirmação explícita

## Estrutura Relevante do Repositório

```text
autoos/
├── src/
│   ├── components/
│   │   ├── equipamentos/
│   │   └── ui/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/
│   ├── migrations/                 # Fonte da verdade do schema PostgreSQL
│   ├── src/
│   │   ├── commands/
│   │   │   ├── auth.rs             # Perfis, PIN, permissões, auditoria
│   │   │   ├── clientes.rs
│   │   │   ├── comunicacoes.rs
│   │   │   ├── equipamentos.rs
│   │   │   ├── produtos.rs
│   │   │   ├── smtp.rs
│   │   │   ├── util.rs             # Schema status, backup, restore
│   │   │   └── verificacoes.rs
│   │   ├── db.rs                   # Pool PostgreSQL + migrator sqlx
│   │   └── main.rs
│   └── Cargo.toml
├── README.md
├── POSTGRES_SETUP.md
├── POSTGRES_BACKUP_RESTORE.md
├── MIGRACAO_POSTGRESQL.md
└── NEXT_STEPS.md
```

## Regras de Implementação

- Use `.` como diretório de trabalho.
- Não reintroduza SQLite em código, docs, comentários ou instruções de operação.
- Mudanças de schema devem entrar como nova migração sequencial em `src-tauri/migrations/`.
- Evite editar migrações já aplicadas em ambientes compartilhados, salvo correção muito controlada e justificada.
- Ao alterar dados persistidos, mantenha frontend, backend, validações e tipos alinhados.
- A tela Configurações → Segurança já concentra:
	- status do schema
	- perfis e permissões locais
	- auditoria mínima
	- backup e restore PostgreSQL
- Ações sensíveis devem continuar respeitando o modelo local de perfis, PIN e permissões.
- Se uma ação for administrativa ou destrutiva, preserve ou amplie trilha de auditoria e confirmação explícita.
- Restore de banco é ação destrutiva: não remover a exigência de confirmação textual sem substituí-la por controle equivalente.
- O app depende de `DATABASE_URL` válida em `src-tauri/.env` ou variável de ambiente equivalente.
- Backup e restore reais dependem da presença de `pg_dump`, `pg_restore` e `psql` na máquina alvo.

## Documentação que Deve Ficar Consistente

Sempre que o comportamento mudar, alinhe os documentos abaixo quando aplicável:

- `README.md`: visão geral, stack e fluxo de execução
- `POSTGRES_SETUP.md`: setup operacional do PostgreSQL
- `POSTGRES_BACKUP_RESTORE.md`: operação de backup, restore e checklist de homologação
- `MIGRACAO_POSTGRESQL.md`: nota técnica do modelo atual de migrações
- `NEXT_STEPS.md`: roadmap, se a mudança afetar priorização funcional

## Validação Esperada

Antes de encerrar mudanças relevantes, priorize estes checks:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
```

Se a mudança envolver runtime operacional de PostgreSQL, deixe explícito quando a máquina atual não tiver as ferramentas instaladas para validação ponta a ponta.

## Recuperação de PIN e Conexão PostgreSQL

- A recuperação de PIN (`redefinir_pin_via_db`) usa credenciais PostgreSQL como fator de autenticação alternativo.
- A verificação de credenciais (`verificar_credenciais_banco`) tenta **TLS primeiro** e, se falhar, faz *fallback* para `NoTls`.
  - TLS é necessário para conexões remotas (ex: Supabase).
  - `NoTls` é usado para PostgreSQL local em `localhost`.
- Quando migrar para Supabase de forma definitiva, o *fallback* para `NoTls` pode ser removido e a conexão passará a exigir TLS obrigatoriamente.

## Diretriz de Colaboração

- Mantenha comunicação concisa.
- Prefira correções na causa raiz.
- Documente mudanças operacionais e de segurança.
- Não assuma que instruções antigas ainda são válidas só porque o arquivo existe.
