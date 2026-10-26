# Migrations SQLx em produção

O workflow `.github/workflows/production-sqlx-migrations.yml` é o caminho controlado para aplicar migrations do desktop AutoOS no banco PostgreSQL de produção. Ele só pode ser iniciado manualmente em `master`; promover código ou migrations para `master` não inicia uma aplicação.

O workflow usa somente o secret de ambiente `AUTOOS_PRODUCTION_MIGRATION_DATABASE_URL`; não aceita `AUTOOS_DATABASE_URL` do build e não usa `supabase db push`. Ele aplica as migrations SQLx de `src-tauri/migrations/`. Configure um revisor obrigatório no ambiente GitHub `production-migrations` antes de habilitar novas execuções.

Em 2026-10-09, a execução que aplicou 0024–0028 usou temporariamente `AUTOOS_DATABASE_URL` como fallback. Esse fallback foi removido. A URL do desktop é embutida no instalador por `src-tauri/build.rs`, portanto deve ser tratada como credencial distribuída e não pode receber permissões de DDL. Antes de cada execução, confirme que o ambiente `production-migrations` mantém o secret dedicado, a variável habilitada e a aprovação obrigatória.

## Configuração única no GitHub

Em **Settings → Environments**, crie `production-migrations` e configure:

1. Um ou mais **Required reviewers** responsáveis pela aprovação da implantação.
2. Uma regra de branch que permita somente `master`.
3. A secret `AUTOOS_PRODUCTION_MIGRATION_DATABASE_URL`, com uma URL de conexão PostgreSQL do **Supavisor Session**, porta `5432`, banco `/postgres` e `sslmode=require`. Use uma credencial dedicada com permissões SQL necessárias às migrations; não use chave `service_role` da API.
4. O secret de ambiente `AUTOOS_PRODUCTION_DATABASE_HOST` com o hostname exato do pooler usado pela URL.
5. O secret de ambiente `AUTOOS_PRODUCTION_DATABASE_USER` com o usuário exato usado pela URL.
6. A variável `AUTOOS_PRODUCTION_MIGRATIONS_ENABLED=true`. Só habilite depois de revisar a proteção do ambiente e confirmar a política de backup do projeto Supabase.

Configure também o secret de repositório `AUTOOS_BACKUP_EXPECTED_DB_USER` com o mesmo usuário PostgreSQL, para a validação do workflow de backup. Host e usuário ficam em secrets, disponíveis somente nos steps que precisam deles; o build não recebe essas informações. A URL é validada contra host, usuário, porta, banco e TLS antes da conexão. Na execução manual, o operador informa o SHA-256 de `<host>|<usuário>` (`printf '%s|%s' HOST USER | sha256sum`, hex minúsculo, sem newline). Esse hash só confirma o destino: não é segredo, não substitui a senha e quem já conhece host e usuário chega ao mesmo valor. O workflow não copia o hash para o `env` do job, para o bloco de ambiente do log não exibi-lo, e mascara o valor antes dos passos seguintes. A comparação continua exigindo 64 hex minúsculos na ordem `host|usuário`.

## O que o workflow faz

1. Confere que o build contém exatamente 42 migrations consecutivas (0001–0042). A 0042 é só de dados (adiciona a permissão `PREPARE_QUOTES` ao perfil Administrador existente; Técnico e Financeiro ficam para uma migration posterior, depois que todos os PCs estiverem na 0.6.0), sem alteração de schema.
2. Valida que produção já registra 0001–0028 com sucesso, sem migrations com falha. A pré-checagem de códigos duplicados em produtos ativos sem empresa e nomes de perfil duplicados após `trim` e conversão para minúsculas só roda se a 0027 estiver pendente; como esta versão exige 0001–0028 aplicadas, essa checagem não é acionada no fluxo atual.
3. Executa o reconciliador da migration 0023, que só altera o checksum quando reconhece a variante conhecida e confirma que o schema já corresponde aos índices esperados; qualquer outra divergência interrompe o fluxo.
4. Confere o histórico SQLx e bloqueia versões ausentes, falhas ou checksums desconhecidos.
5. Aplica as migrations pendentes com o migrator SQLx embutido no código.
6. Confirma individualmente no histórico que 0027–0041 foram aplicadas com sucesso e verifica as estruturas esperadas: índices da 0027, `equipamentos.atualizado_em` como `NOT NULL`, portal público, política de PIN, Portal do Cliente até 0039, orçamento de insumos da 0040 e perfil/primeiro acesso da 0041. Confirma que a quantidade de migrations com sucesso é igual às 42 do build. A saída distingue `already_applied` de `applied_and_verified` para o conjunto 0027–0041; não imprime esse status por versão. A 0042 é só de dados e entra apenas na contagem e na conferência de histórico. O último step confere novamente versões e checksums e emite `SQLX_DATABASE_HISTORY_OK applied=42` quando o histórico corresponde ao build.

O workflow serializa execuções e não cancela uma migration em andamento. Para aplicar, abra **Actions → Aplicar migrations SQLx na produção → Run workflow**, selecione `master`, digite `APLICAR EM PROD` e o hash SHA-256 de `<host>|<usuário>` (confirmação do destino, não é segredo) calculado localmente, e confirme a execução. Confira o backup recente e o resumo do commit antes de aprovar no ambiente `production-migrations`. Se o fluxo parar por conflito, checksum ou histórico, investigue a causa antes de tentar novamente; não force uma aplicação nem preencha o histórico à mão.

### Histórico incompleto

O reconciliador da 0023 só funciona quando a versão 23 já consta no histórico SQLx. O executor exige 0001–0028 registradas com sucesso antes de aplicar as pendentes até 0042; o verificador de histórico também recusa uma base anterior à 0028. Um banco cujo schema avançou por aplicações manuais, mas cujo `_sqlx_migrations` registra apenas a versão 1, será bloqueado antes de qualquer migration; **não preencha o histórico automaticamente**. Audite o schema e os checksums em uma cópia desse banco e estabeleça um procedimento de reconciliação específico antes de liberar o workflow. A reconciliação da 0023 não substitui essa auditoria.

Para investigar conflitos de dados relacionados à 0027 em uma base anterior, use consultas somente de leitura:

```sql
select codigo, array_agg(id order by id) as produto_ids,
       array_agg(nome order by id) as produtos
from public.produtos
where ativo = true and empresa_id is null and codigo is not null
group by codigo
having count(*) > 1;

select lower(btrim(nome)) as nome_normalizado,
       array_agg(id order by id) as perfil_ids,
       array_agg(nome order by id) as nomes
from public.security_profiles
group by lower(btrim(nome))
having count(*) > 1;
```

## Escopo

Este workflow não aplica migrations em Staging, não altera os arquivos de migrations já existentes e não promove branches. O aplicativo continua sem executar migrations na inicialização. A implantação depende da configuração da secret e das proteções do ambiente no GitHub.

## Registro da v0.6.0 (2026-10-21)

No commit `7a59234` de `master`, o [backup criptografado](https://github.com/ph66ng2/AutoOs/actions/runs/39619657957) terminou com `success` e gerou um artefato criptografado. Depois da aprovação do ambiente, uma única [execução de migrations](https://github.com/ph66ng2/AutoOs/actions/runs/39620188267) terminou com `success`. O log registrou `PRODUCTION_MIGRATIONS_OK status=applied_and_verified` e `SQLX_DATABASE_HISTORY_OK applied=41`. O primeiro status é agregado: o log não traz `applied_and_verified` separado para 0039, 0040 e 0041. A verificação dessas versões e das respectivas estruturas ocorre no executor antes de emitir o status agregado.
