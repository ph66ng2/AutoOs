# Supabase Auth no build SaaS

O login SaaS é ativado somente pelo modo de build `saas`. O build padrão continua
sendo o produto interno e preserva o boot PostgreSQL e os comandos legados
`login_empresa`/`registrar_empresa`.

## Configuração

Defina estas variáveis no ambiente de build, nunca no repositório:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT=https://<dominio-permitido>/auth/recovery
```

A chave deve ser publicável. Chaves `sb_secret_...` e JWTs com role
`service_role` são recusados no cliente. O redirect de recuperação deve ser uma
URL HTTPS exata e também precisa estar cadastrado na allowlist de redirects do
Supabase Auth.

## Execução

```bash
npm run tauri:dev:saas
npm run tauri:build:saas
```

Esses comandos combinam os dois seletores obrigatórios:

- Vite em modo `saas`, que monta `SaasAuthProvider` e não consulta
  `DatabaseConfigService`;
- feature Cargo `saas`, que não chama `db::init_database()` durante o setup do
  Tauri.

Executar `npm run dev`, `npm run build` ou `npm run tauri dev` mantém o modo
interno. Não existe seletor de produto na interface.

## Contrato de segurança

- O login usa email/senha somente para a chamada `signInWithPassword`; a senha
  não é persistida.
- A identidade só é aceita quando o JWT validado contém `sub`, `email` e os
  claims autoritativos `company_id`, `profile_id` e `profile_role=ADMIN` emitidos
  pelo hook criado em `AO-AUTH-001`.
- Access token, refresh token, expiração e os UUIDs/email validados ficam em uma
  única entrada `saas_auth_session_v1` do keyring do sistema. Não há sessão no
  `localStorage`.
- Refresh salva o novo par de tokens numa única substituição do keyring. Falha de
  rede preserva a sessão para nova tentativa; refresh inválido remove a entrada e
  exige login.
- Bloquear elimina a sessão da árvore React e preserva o keyring. Sair usa escopo
  local do Supabase e remove o keyring mesmo quando o servidor está indisponível.

Referências oficiais: [login com senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword),
[refresh de sessão](https://supabase.com/docs/reference/javascript/auth-refreshsession),
[validação de claims](https://supabase.com/docs/reference/javascript/auth-getclaims),
[sign-out](https://supabase.com/docs/reference/javascript/auth-signout) e
[recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
