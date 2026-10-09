# Migrations SQLx em produção

O workflow `.github/workflows/production-sqlx-migrations.yml` é o caminho controlado para aplicar migrations do desktop AutoOS no banco PostgreSQL de produção. Ele só pode ser iniciado manualmente em `master`; promover código ou migrations para `master` não inicia uma aplicação.

O workflow não usa `AUTOOS_DATABASE_URL` do build e não usa `supabase db push`: esse fluxo aplica as migrations SQLx de `src-tauri/migrations/`. O job espera aprovação pelo ambiente GitHub `production-migrations` antes de receber a credencial de produção.

## Configuração única no GitHub

Em **Settings → Environments**, crie `production-migrations` e configure:

1. Um ou mais **Required reviewers** responsáveis pela aprovação da implantação.
2. Uma regra de branch que permita somente `master`.
3. A secret `AUTOOS_PRODUCTION_MIGRATION_DATABASE_URL`, com uma URL de conexão PostgreSQL do **Supavisor Session**, porta `5432`, banco `/postgres` e `sslmode=require`. Use uma credencial dedicada com permissões SQL necessárias às migrations; não use chave `service_role` da API.
4. A variável `AUTOOS_PRODUCTION_DATABASE_HOST` com o hostname exato do pooler usado pela URL.
5. A variável `AUTOOS_PRODUCTION_DATABASE_USER` com o usuário exato usado pela URL.
6. A variável `AUTOOS_PRODUCTION_MIGRATIONS_ENABLED=true`. Só habilite depois de revisar a proteção do ambiente e confirmar a política de backup do projeto Supabase.

As variáveis e a secret são específicas do ambiente, não ficam no repositório e não são impressas nos logs. A URL é validada contra o host e usuário configurados, porta, banco e TLS antes da conexão. Na execução manual, o operador também precisa digitar o host e o usuário esperados; os dois valores são comparados com as variáveis do ambiente antes de abrir a conexão.

## O que o workflow faz

1. Confere a sequência versionada das migrations.
2. Consulta o histórico e os dados de produção sem escrita. Antes de qualquer reconciliação, procura códigos duplicados em produtos ativos sem empresa e nomes de perfil duplicados após `trim` e conversão para minúsculas. A consulta inclui perfis inativos. Se houver conflito, o fluxo para e lista os códigos de produto e nomes normalizados dos perfis conflitantes, além da quantidade de linhas em cada grupo.
3. Executa o reconciliador da migration 0023, que só altera o checksum quando reconhece a variante conhecida e confirma que o schema já corresponde aos índices esperados; qualquer outra divergência interrompe o fluxo.
4. Confere o histórico SQLx e bloqueia versões ausentes, falhas ou checksums desconhecidos.
5. Aplica as migrations pendentes com o migrator SQLx embutido no código.
6. Confirma que 0027–0029 estão registradas como aplicadas, que os índices da 0027 existem, que `equipamentos.atualizado_em` é `NOT NULL`, que as tabelas do portal existem e que o histórico completo corresponde ao build. A saída distingue `already_applied` de `applied_and_verified`.

O workflow serializa execuções e não cancela uma migration em andamento. Para aplicar, abra **Actions → Aplicar migrations SQLx na produção → Run workflow**, selecione `master`, digite `APLICAR EM PROD`, o host e o usuário configurados, e confirme a execução. O ambiente GitHub ainda exige a aprovação dos revisores configurados. Confira o backup recente e o resumo do commit antes de aprovar; conflitos detectados na 0027 exigem correção dos dados antes de tentar novamente.

### Histórico incompleto

O reconciliador da 0023 só funciona quando a versão 23 já consta no histórico SQLx. Para aplicar a 0029, o executor exige 0001–0028 registradas com sucesso; o verificador de histórico também recusa uma base anterior à 0028. Um banco cujo schema avançou por aplicações manuais, mas cujo `_sqlx_migrations` registra apenas a versão 1, será bloqueado antes de qualquer migration; **não preencha o histórico automaticamente**. Audite o schema e os checksums em uma cópia desse banco e estabeleça um procedimento de reconciliação específico antes de liberar o workflow. A reconciliação da 0023 não substitui essa auditoria.

Para investigar conflitos antes de reexecutar, use consultas somente de leitura:

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

Este workflow não aplica migrations em Staging, não altera os arquivos de migrations já existentes e não promove branches. O aplicativo continua sem executar migrations na inicialização. A implantação real depende da configuração da secret e das proteções do ambiente no GitHub.
