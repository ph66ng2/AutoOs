# Contrato de autenticação, RLS e PowerSync

## Claims autoritativas

O servidor é o único componente que associa um usuário a uma empresa/perfil.
`public.company_user_identities` mantém o vínculo individual de
`auth.users.id` com uma empresa e um `security_profiles.id` ativo. A tabela não
tem grants para `anon` ou `authenticated`. Durante a transição,
`public.company_admin_identities` continua como fallback restrito aos ADMIN
legados; nenhum cliente escolhe qual vínculo será usado.

O Custom Access Token Hook `public.autoos_custom_access_token_hook(jsonb)` lê
o vínculo individual (ou o ADMIN legado compatível) como
`supabase_auth_admin`, rejeita identidades ausentes/inativas e substitui claims
de tenant/perfil a partir do banco. O JWT emitido contém:

```json
{
  "sub": "<user-uuid>",
  "app_metadata": {
    "company_id": "<empresa-uuid>",
    "profile_id": "<security-profile-uuid>",
    "profile_role": "<role do perfil ativo>"
  }
}
```

`user_metadata` e claims de tenant/perfil nunca participam da autorização. O
helper `public.current_company_id()` resolve `auth.uid()` novamente contra o
vínculo, empresa e perfil atualmente ativos em cada chamada RLS. Claims ausentes
ou antigas continuam seguras: a identidade ADMIN legada segue usando o vínculo
persistido, e perfil/vínculo inativado ou suspenso perde acesso mesmo que o JWT
anterior ainda não tenha expirado. O Hook renova as claims para a interface, mas
RLS não confia nelas para selecionar tenant.

Este vínculo/RLS resolve identidade e isolamento por empresa; não substitui as
permissões funcionais por perfil. A autorização server-side de ações financeiras
continua no ticket AO-SAAS-AUTHZ-001.

O Online usa o JWT de usuário com a chave publicável do Supabase. O desktop não
recebe `service_role`, secret key, senha PostgreSQL ou chave privada de assinatura.
O `service_role` existe somente em funções/backend server-side.

## Limite de credenciais no desktop

O armazenamento opcional de arquivos usa `supabase_url`, uma chave
publicável e o `access_token` JWT da sessão. A chave publicável identifica o
projeto, mas não autoriza nada sozinha; o JWT é validado pelo Supabase e pelas
policies RLS. O keyring local não é um destino válido para senha PostgreSQL,
secret key ou qualquer chave administrativa.

Enrollment segue a mesma fronteira: o desktop chama somente
`AUTOOS_SAAS_API_URL/v1/enrollment-codes` com o JWT de sessão do usuário, ou o
endpoint de validação com o código único de bootstrap. O backend associa o
tenant, consome o código atomicamente e usa suas credenciais privilegiadas
apenas server-side. Não há chamada do desktop para `/rest/v1` com credencial
administrativa.

## Regras RLS

- `anon` não recebe grants nem policies nas tabelas de negócio.
- `authenticated` recebe somente as operações necessárias e sempre com
  `empresa_id = current_company_id()`.
- `INSERT` e `UPDATE` usam `WITH CHECK`; `UPDATE` também usa `USING`.
- Auditoria é somente leitura para o tenant; gravação fica no backend.
- Enrollment, sessões de foto, itens de sessão e status público ficam
  server-side até que uma Edge Function defina uma interface pública específica.
- FKs compostas do `AO-PS-003` continuam impedindo referências entre empresas.

Aplicação no staging (procedimento futuro; não executar como parte do ticket
AO-SAAS-ID-001. Exige revisão e aprovação humana específica no ticket
AO-SAAS-STAGING-001):

```bash
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on \
  --file supabase/migrations/20260827180517_provision_saas_admin_identity.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on \
  --file supabase/migrations/20260923151000_individual_saas_user_identities.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on --file supabase/rls.sql
```

Em seguida, habilite o hook em **Authentication > Hooks > Custom Access Token**
apontando para `public.autoos_custom_access_token_hook`. O arquivo
`supabase/config.toml` mantém a configuração equivalente para ambientes geridos
pela CLI e desabilita novos cadastros por email. Confirme também no Dashboard que
o cadastro público está desligado; a criação inicial é exclusivamente administrativa.

## Provisionamento e suspensão

Use somente um terminal de operações. Senha, URL PostgreSQL, secret key ou
`service_role` entram por variáveis de ambiente e não por argumentos, arquivos
versionados ou logs. A empresa e o perfil `ADMIN` precisam existir e estar ativos.

```bash
export AUTOOS_CONFIRM_STAGING='AutoOS Staging'
export SUPABASE_STAGING_URL='https://<project-ref>.supabase.co'
export SUPABASE_STAGING_ADMIN_KEY='<secret-key-ou-service-role>'
export SUPABASE_STAGING_DATABASE_URL='<postgres-connection-string>'
export AUTOOS_ADMIN_EMAIL='<email-inicial>'
export AUTOOS_ADMIN_PASSWORD='<senha-forte>'
export AUTOOS_EMPRESA_ID='<empresa-uuid>'
export AUTOOS_PROFILE_ID='<perfil-admin-uuid>'
node scripts/manage-staging-saas-admin.mjs provision
```

Se o vínculo no banco falhar, o comando tenta remover imediatamente o usuário
Auth recém-criado. Para suspender ou reativar, mantenha somente as variáveis de
staging, defina `AUTOOS_AUTH_USER_ID` e execute `suspend` ou `reactivate`. Ambos
registram um evento em `security_audit_log`.

## Validação reproduzível em staging

O teste ponta a ponta cria duas empresas, dois perfis e dois usuários estritamente
sintéticos com UUIDs/nome reservados `AO-AUTH-TEST-*`; verifica login real, claims,
isolamento A/B, spoofing, ausência de vínculo, suspensão com token antigo e
reativação. O bloco `finally` remove os usuários Auth e as empresas de teste.

Além das variáveis de staging acima, defina uma chave publicável e duas
credenciais sintéticas distintas (nunca dados da BMITAG):

```bash
export SUPABASE_STAGING_PUBLISHABLE_KEY='<publishable-ou-anon-key>'
export AUTOOS_TEST_ADMIN_A_EMAIL='<email-sintetico-a>'
export AUTOOS_TEST_ADMIN_A_PASSWORD='<senha-sintetica-a>'
export AUTOOS_TEST_ADMIN_B_EMAIL='<email-sintetico-b>'
export AUTOOS_TEST_ADMIN_B_PASSWORD='<senha-sintetica-b>'
npm run qa:staging:auth
```

Se uma interrupção externa impedir o `finally`, remova cada usuário com
`AUTOOS_AUTH_USER_ID=<uuid> node scripts/manage-staging-saas-admin.mjs cleanup`
e execute `supabase/operations/delete-auth-test-tenants.sql`. A exclusão do
usuário Auth remove o vínculo por `ON DELETE CASCADE`; tokens já emitidos deixam
de passar na revalidação RLS.

## Entitlement e token PowerSync

O entitlement JWS continua sendo emitido pelo servidor de assinatura descrito
em `docs/SAAS_PLANOS_E_ENTITLEMENTS.md`. A capacidade `offline_sync=true` não é
derivada do plano local nem do cache.

Somente depois de validar um entitlement vigente o backend pode emitir um token
PowerSync curto com, no mínimo:

```json
{
  "iss": "<autoos-auth-issuer>",
  "aud": "<powersync-instance>",
  "sub": "<user-uuid>",
  "company_id": "<empresa-uuid>",
  "offline_sync": true,
  "exp": 0,
  "jti": "<unique-token-id>"
}
```

O token PowerSync não substitui o entitlement e não contém segredo de banco.
Online nunca solicita esse token. A chave privada de assinatura, o issuer e a
validação do entitlement permanecem em backend server-side; os tickets de
runtime e PowerSync consumirão este contrato sem reimplementá-lo no desktop.
