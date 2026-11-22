# Piloto Online: clientes sem PowerSync

O AO-SUB-002 introduz o primeiro adapter de domínio SaaS em
`src/lib/data/clientes-repository.ts`. A página e o hook `useClientes` continuam
únicos: o adapter é escolhido em runtime, sem duplicar a tela Clientes.

## Credenciais aceitas

O adapter Online lê a sessão SaaS já armazenada no keyring, contendo somente:

- tokens da sessão autenticada, no cofre exclusivo da autenticação SaaS.

A URL HTTPS e a chave publicável vêm da configuração explícita do build SaaS;
não são escolhidas pelo usuário nem reutilizam o cofre legado de Storage.

Em um `INSERT`, o adapter usa o `company_id` da identidade SaaS já validada para
preencher a coluna obrigatória; a assinatura do JWT e a igualdade do tenant são
validadas pelo Supabase/RLS. O desktop nunca recebe ou aceita senha PostgreSQL,
`service_role`, secret key ou uma empresa escolhida por input.

Sem sessão SaaS configurada, o adapter interno Tauri permanece disponível para
o baseline. A seleção do adapter não concede plano, tenant ou `offline_sync`:
essas decisões continuam server-side e pertencem ao runtime comum posterior.

## Comportamento Online

- O CRUD de clientes usa `/rest/v1/clientes`, chave publicável e `Bearer` JWT.
- Exclusão é lógica (`ativo=false`), igual ao fluxo existente.
- Ausência de rede preserva o formulário e informa que a pessoa deve reconectar.
- HTTP 401 pede novo login; 403 ou retorno vazio de mutação é tratado como
  negação RLS, sem revelar dados de outro tenant.
- Este fluxo não importa, inicializa nem solicita credenciais do PowerSync.

## Teste em staging

1. Na worktree AO-SUB-002, use usuários e clientes temporários de tenants A e B.
2. Armazene no keyring somente URL staging, chave publicável e JWT sintético do
   usuário A com `app_metadata.company_id` de A.
3. Execute `npm run test:run` e `npm run lint`.
4. Crie, edite e exclua logicamente um cliente marcado para teste; confirme que
   ele aparece apenas no tenant A. Tente buscar ou alterar o UUID de B e confirme
   que não há leitura nem mutação.
5. Expire/remova o JWT e simule indisponibilidade de rede. A UI deve orientar a
   renovar a sessão ou reconectar, sem fechar ou limpar o formulário.
6. Remova clientes e usuários temporários de staging ao final. Nunca use dados,
   tokens, URLs internas ou credenciais privilegiadas.
