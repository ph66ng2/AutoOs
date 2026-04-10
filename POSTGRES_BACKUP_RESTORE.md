# Backup e Restore PostgreSQL do AutoOS

## Objetivo

Este guia deixa o processo de backup e restore pronto para a troca de máquina, sem depender do ambiente atual estar com PostgreSQL instalado agora.

O AutoOS também expõe um card em Configurações → Segurança para validar ferramentas, gerar backup e executar restore manual com confirmação explícita.

Quando a nova máquina estiver pronta, use este fluxo para:

1. gerar um backup lógico do banco do AutoOS;
2. restaurar o banco na máquina nova;
3. iniciar o app e conferir a versão do schema no painel de Configurações.

## Pré-requisitos na máquina que vai executar o banco

- PostgreSQL instalado com `pg_dump`, `pg_restore` e `psql` disponíveis.
- Banco `autoos` criado.
- Usuário com permissão de leitura para backup e permissão de escrita para restore.
- Arquivo `src-tauri/.env` configurado com `DATABASE_URL`.

## O que preservar na troca de máquina

- O repositório do projeto.
- O arquivo `src-tauri/.env` com a `DATABASE_URL` da máquina nova.
- O arquivo de backup gerado (`.dump` ou `.sql`).

## Backup recomendado

Prefira o formato customizado (`.dump`), porque ele funciona melhor com `pg_restore`.

### PowerShell

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_dump \
  --host localhost \
  --port 5432 \
  --username autoos_user \
  --dbname autoos \
  --format custom \
  --file "C:\backup\autoos-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
Remove-Item Env:PGPASSWORD
```

## Backup alternativo em SQL puro

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_dump \
  --host localhost \
  --port 5432 \
  --username autoos_user \
  --dbname autoos \
  --format plain \
  --file "C:\backup\autoos-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql"
Remove-Item Env:PGPASSWORD
```

## Restore na máquina nova

### 1. Criar banco vazio

```powershell
$env:PGPASSWORD = "SENHA_DO_POSTGRES"
psql -U postgres -h localhost -c "CREATE DATABASE autoos;"
Remove-Item Env:PGPASSWORD
```

Se o usuário do app ainda não existir, crie e conceda acesso antes do restore.

### 2. Restore de backup `.dump`

```powershell
$env:PGPASSWORD = "SUA_SENHA"
pg_restore \
  --host localhost \
  --port 5432 \
  --username autoos_user \
  --dbname autoos \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "C:\backup\autoos-20260406-153000.dump"
Remove-Item Env:PGPASSWORD
```

### 3. Restore de backup `.sql`

```powershell
$env:PGPASSWORD = "SUA_SENHA"
psql \
  --host localhost \
  --port 5432 \
  --username autoos_user \
  --dbname autoos \
  --file "C:\backup\autoos-20260406-153000.sql"
Remove-Item Env:PGPASSWORD
```

## Depois do restore

1. Ajuste `src-tauri/.env` com a `DATABASE_URL` da nova máquina.
2. Inicie o AutoOS.
3. O backend vai aplicar automaticamente as migrações pendentes do projeto.
4. Abra Configurações → Segurança → Banco e schema para confirmar a versão aplicada.

## Rotina mínima recomendada

- Backup antes de qualquer mudança estrutural maior.
- Backup antes de trocar de máquina.
- Teste de restore em ambiente controlado sempre que possível.
- Conferência da versão do schema depois do restore.

## Checklist de homologação do card Backup e restore

Use este checklist na máquina que tiver PostgreSQL instalado e DATABASE_URL válida.

### Pré-checagem

- Abrir o AutoOS com um perfil que tenha a permissão de gestão de perfis.
- Confirmar que pg_dump, pg_restore e psql aparecem como disponíveis no card.
- Conferir se a pasta de backup exibida pelo app existe e abre corretamente.

### Fluxo de backup

- Acionar Validar ferramentas e confirmar ausência de erro.
- Acionar Gerar backup agora.
- Verificar que o arquivo .dump foi criado na pasta indicada.
- Confirmar que a auditoria registrou o evento de backup com sucesso.

### Fluxo de restore

- Separar um arquivo de teste .dump ou .sql em caminho absoluto acessível pela máquina.
- Informar o caminho completo no card.
- Digitar RESTAURAR no campo de confirmação.
- Executar o restore e aguardar a mensagem de conclusão.
- Atualizar o bloco Banco e schema e confirmar que o schema continua coerente.
- Confirmar que a auditoria registrou o restore com sucesso.

### Casos negativos mínimos

- Tentar restore sem preencher o caminho e confirmar que o app bloqueia a ação.
- Tentar restore com extensão inválida e confirmar que o app rejeita o arquivo.
- Tentar restore sem digitar RESTAURAR e confirmar que o botão permanece bloqueado.
- Tentar restore com ferramenta ausente do PATH e confirmar mensagem de erro adequada.

## Relação com as migrações do projeto

O restore devolve os dados do banco como estavam no momento do backup.

Depois disso, ao iniciar o AutoOS, o backend compara o banco restaurado com as migrações conhecidas do projeto e aplica o que faltar, incluindo:

- `0001_initial_schema.sql`
- `0002_schema_hardening.sql`
- `0003_equipment_intake_fields.sql`

## Limite deste guia

Este documento prepara o processo, mas a execução real de backup e restore depende da máquina que tiver PostgreSQL instalado.