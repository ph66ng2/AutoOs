# Provisionamento de administrador SaaS

Este guia cria uma conta administrativa que consegue entrar no AutoOS SaaS. Não
é um cadastro público: além do usuário do Supabase Auth, a conta precisa ser
vinculada à empresa e ao perfil `ADMIN` para receber os claims corretos.

## Regra principal

- Use **staging** para testes e somente e-mails, senhas, empresas e perfis
  sintéticos.
- Nunca use `service_role`, secret key, senha ou URL PostgreSQL no aplicativo,
  no Git, em `.env` versionado ou em argumentos de comando.
- Nunca crie o usuário pela tela comum de Auth e espere que ele possa entrar:
  isso cria a identidade, mas não o vínculo autoritativo de empresa/perfil.

## Staging: criar uma conta logável

Pré-requisitos: a empresa sintética e um perfil ativo com função `ADMIN` já
existem no staging. Obtenha seus UUIDs e as credenciais administrativas somente
com o responsável pelo ambiente.

Em um terminal de operações isolado, na raiz do repositório, defina os valores
sem registrá-los no histórico do shell:

```bash
export AUTOOS_CONFIRM_STAGING='AutoOS Staging'
export SUPABASE_STAGING_URL='https://<project-ref>.supabase.co'
read -rsp 'Chave administrativa do staging: ' SUPABASE_STAGING_ADMIN_KEY; echo
export SUPABASE_STAGING_ADMIN_KEY
read -rsp 'URL PostgreSQL do staging: ' SUPABASE_STAGING_DATABASE_URL; echo
export SUPABASE_STAGING_DATABASE_URL
read -rp 'E-mail sintético do administrador: ' AUTOOS_ADMIN_EMAIL
read -rsp 'Senha forte do administrador: ' AUTOOS_ADMIN_PASSWORD; echo
export AUTOOS_ADMIN_EMAIL AUTOOS_ADMIN_PASSWORD
read -rp 'UUID da empresa sintética: ' AUTOOS_EMPRESA_ID
read -rp 'UUID do perfil ADMIN: ' AUTOOS_PROFILE_ID
export AUTOOS_EMPRESA_ID AUTOOS_PROFILE_ID

node scripts/manage-staging-saas-admin.mjs provision
```

O comando cria o usuário Auth, grava os claims pelo caminho administrativo e
vincula `auth_user_id`, empresa e perfil. Se o vínculo falhar, ele tenta remover
o usuário recém-criado. Guarde apenas o `auth_user_id` retornado como evidência;
não guarde senha, chave ou URL.

Depois, abra o build SaaS, entre com esse e-mail/senha e confirme que o login
não mostra configuração PostgreSQL. Para remover uma conta sintética ao fim do
teste, exporte somente `AUTOOS_AUTH_USER_ID` e execute:

```bash
node scripts/manage-staging-saas-admin.mjs cleanup
```

Antes da limpeza, encerre a sessão no aplicativo. Tokens já emitidos podem
continuar válidos até expirarem; não os registre.

## Produção: estado atual

**Não execute o script de staging em produção.** Ele exige a confirmação fixa
`AutoOS Staging`; burlar essa trava invalidaria o controle de ambiente.

Hoje, criação de conta produtiva exige procedimento administrativo aprovado,
operação server-side dedicada e dupla checagem do vínculo empresa/perfil. O
ticket `AO-AUTH-OPS-001` define esse fluxo antes de qualquer uso produtivo. Até
ele estar mesclado e homologado, contas de produção devem ser provisionadas
somente pelo responsável do ambiente através de um runbook aprovado, sem expor
chaves administrativas ao desktop ou a pessoas não autorizadas.

## Diagnóstico seguro

- `senha inválida`: valide a senha sem registrá-la e confirme o e-mail.
- `claims ou vínculo ausentes`: não recrie pelo cliente; confira empresa,
  perfil `ADMIN` ativo e vínculo server-side.
- `conta suspensa`: reative somente pelo processo administrativo e peça novo
  login/refresh de token.
- recuperação de senha: use apenas o redirect HTTPS exato cadastrado no projeto
  correspondente; não use senha PostgreSQL.
