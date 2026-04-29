# Backup e Restore PostgreSQL do AutoOS

## Objetivo

Descrever o fluxo operacional real de backup e restore do AutoOS hoje, tanto pelo app quanto por linha de comando.

O comportamento documentado abaixo reflete o backend atual em `src-tauri/src/commands/util.rs`.

## O que o app suporta hoje

Em `Configurações > Segurança > Backup e restore do banco`, o AutoOS permite:

- validar se `pg_dump`, `pg_restore` e `psql` estão disponíveis;
- exibir o banco atual, host/porta e a pasta padrão de backup;
- gerar backup `.dump` com `pg_dump`;
- executar restore manual de arquivo `.dump` ou `.sql`;
- exigir confirmação textual `RESTAURAR` antes do restore;
- registrar auditoria de backup e restore;
- reaplicar/conferir migrações pendentes após o restore.

O app não abre mais caminhos arbitrários via shell. A pasta padrão de backup é exibida na interface, mas a inspeção do arquivo gerado é externa ao app.

## Pré-requisitos

- PostgreSQL 15+ instalado
- `pg_dump`, `pg_restore` e `psql` disponíveis no `PATH`
- `src-tauri/.env` com `DATABASE_URL` válida
- Perfil com permissão `MANAGE_PROFILES` para usar o card do app

## Pasta padrão de backup

No Windows, o backend grava backups em:

```text
%USERPROFILE%\Documents\AutoOS\backups
```

O nome gerado pelo app segue o padrão:

```text
autoos-<database_name>-YYYYMMDD-HHMMSS.dump
```

## Fluxo recomendado pelo app

### 1. Validar ferramentas

No card `Backup e restore do banco`:

1. confirme o banco/host/porta mostrados;
2. clique em `Validar ferramentas`;
3. verifique se `pg_dump`, `pg_restore` e `psql` aparecem como disponíveis.

### 2. Gerar backup

1. clique em `Gerar backup agora`;
2. aguarde a mensagem de sucesso com o caminho completo do arquivo;
3. confirme que o arquivo `.dump` foi criado na pasta informada;
4. confira a auditoria em `Configurações > Segurança > Auditoria recente`.

### 3. Executar restore

1. separe um arquivo `.dump` ou `.sql` em caminho absoluto acessível pela máquina;
2. informe o caminho completo no campo de restore;
3. digite `RESTAURAR`;
4. execute o restore;
5. atualize `Banco e schema` para confirmar que o schema continua coerente;
6. confira a auditoria de `BACKUP_RESTORED`.

## Fluxo por linha de comando

Use esse caminho quando precisar operar fora da UI ou automatizar validações.

### Backup `.dump` recomendado

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_dump `
  --format=custom `
  --no-owner `
  --no-privileges `
  --file "C:\backup\autoos-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump" `
  --dbname "postgres://autoos_user:SUA_SENHA@localhost:5432/autoos"
Remove-Item Env:PGPASSWORD
```

### Backup `.sql` alternativo

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_dump `
  --format=plain `
  --file "C:\backup\autoos-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql" `
  --dbname "postgres://autoos_user:SUA_SENHA@localhost:5432/autoos"
Remove-Item Env:PGPASSWORD
```

### Restore `.dump`

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_restore `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  --exit-on-error `
  --dbname "postgres://autoos_user:SUA_SENHA@localhost:5432/autoos" `
  "C:\backup\autoos-20260429-000000.dump"
Remove-Item Env:PGPASSWORD
```

### Restore `.sql`

```powershell
$env:PGPASSWORD = "SUA_SENHA"
psql `
  --no-psqlrc `
  --set ON_ERROR_STOP=1 `
  --dbname "postgres://autoos_user:SUA_SENHA@localhost:5432/autoos" `
  --file "C:\backup\autoos-20260429-000000.sql"
Remove-Item Env:PGPASSWORD
```

## Depois do restore

1. confirme que a `DATABASE_URL` aponta para a base correta;
2. inicie o app com `npm run tauri dev`;
3. deixe o backend reaplicar migrações pendentes, se houver;
4. abra `Configurações > Segurança > Banco e schema`;
5. se necessário, exporte um pacote de suporte local para anexar ao incidente.

## Checklist de homologação do card

### Pré-checagem

- abrir o AutoOS com perfil que possua `MANAGE_PROFILES`;
- confirmar que `pg_dump`, `pg_restore` e `psql` aparecem no card;
- confirmar que a pasta de backup exibida pelo app existe no sistema;
- validar que `Banco e schema` responde sem erro.

### Fluxo de backup

- acionar `Validar ferramentas`;
- acionar `Gerar backup agora`;
- conferir mensagem de sucesso com caminho do arquivo;
- verificar criação real do `.dump` na pasta indicada;
- confirmar evento `BACKUP_GENERATED` na auditoria.

### Fluxo de restore

- usar arquivo `.dump` ou `.sql` em caminho absoluto;
- preencher o caminho completo;
- digitar `RESTAURAR`;
- executar o restore;
- atualizar o status do schema;
- confirmar evento `BACKUP_RESTORED` na auditoria.

### Casos negativos mínimos

- tentar restore sem caminho e confirmar bloqueio;
- tentar restore com extensão inválida e confirmar rejeição;
- tentar restore sem digitar `RESTAURAR` e confirmar bloqueio;
- tentar restore com ferramenta ausente do `PATH` e confirmar mensagem de erro clara.

## Relação com as migrações

O restore repõe o estado capturado no backup. Em seguida, o backend ainda executa a checagem de migrações pendentes com `run_pending_migrations()`.

Baseline atual:

- `0001_initial_schema.sql`
- `0002_schema_hardening.sql`
- `0003_equipment_intake_fields.sql`
- `0004_equipment_images.sql`

## Rotina mínima recomendada

- gerar backup antes de mudança estrutural relevante;
- gerar backup antes de troca de máquina;
- testar restore em ambiente controlado sempre que possível;
- conferir o schema dentro do app depois do restore;
- anexar auditoria e pacote de suporte local quando o restore fizer parte de um incidente.

## Limites deste guia

- o backup/restore real depende da máquina ter PostgreSQL e ferramentas instaladas;
- o app não resolve distribuição Windows nem assinatura de build;
- este documento não substitui a preparação inicial do banco em [POSTGRES_SETUP.md](./POSTGRES_SETUP.md).