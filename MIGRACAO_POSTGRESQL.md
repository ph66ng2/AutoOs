# Nota técnica: PostgreSQL no AutoOS

Este projeto não usa mais SQLite. O backend depende de PostgreSQL e aplica migrações versionadas com sqlx no startup do app.

## Como o banco sobe hoje

- A conexão é lida de src-tauri/.env pela variável DATABASE_URL.
- O backend inicializa um PgPool.
- O migrator do sqlx compara o banco com os arquivos em src-tauri/migrations.
- Toda migração pendente é aplicada antes do app liberar os comandos IPC.

## Migrações atuais

- 0001_initial_schema.sql: baseline operacional e estruturas de segurança.
- 0002_schema_hardening.sql: constraints, defaults e índices principais.
- 0003_equipment_intake_fields.sql: patrimônio, defeito relatado e acessórios do recebimento técnico.

## Regra de manutenção

- Não reescreva migrações já aplicadas em ambientes compartilhados.
- Para novas mudanças estruturais, crie um novo arquivo sequencial em src-tauri/migrations.
- Use a tela Configurações → Segurança → Banco e schema para conferir o estado aplicado.

## Documentos relacionados

- Setup operacional: [POSTGRES_SETUP.md](./POSTGRES_SETUP.md)
- Backup e restore: [POSTGRES_BACKUP_RESTORE.md](./POSTGRES_BACKUP_RESTORE.md)
- Visão geral do projeto: [README.md](./README.md)
