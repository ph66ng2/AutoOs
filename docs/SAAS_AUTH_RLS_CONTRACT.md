# Contrato de autenticação, RLS e PowerSync

## Claims autoritativas

O servidor de autenticação é o único componente que associa um usuário a uma
empresa. Depois de autenticar, ele atualiza `auth.users.raw_app_meta_data` e
emite um JWT com:

```json
{
  "sub": "<user-uuid>",
  "app_metadata": {
    "company_id": "<empresa-uuid>"
  }
}
```

`user_metadata` é editável pelo usuário e nunca participa de autorização. O
helper `public.current_company_id()` aceita apenas um UUID válido em
`app_metadata.company_id`; claim ausente ou inválido resulta em nenhum tenant.

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

Aplicação no staging:

```bash
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on --file supabase/rls.sql
psql "$SUPABASE_STAGING_DATABASE_URL" --set ON_ERROR_STOP=on \
  --file supabase/tests/rls-tenant-isolation.sql
```

O teste cria dois tenants sintéticos, simula um JWT de tenant A, verifica que
tenant B não é visível nem gravável e termina com `ROLLBACK`.

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
