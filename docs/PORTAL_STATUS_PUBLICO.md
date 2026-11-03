# Portal público de acompanhamento de equipamentos

O portal permite que o cliente consulte a etapa atual de um ciclo de atendimento por um link individual. A página é somente para leitura: não altera status nem aprova orçamento.

> O mesmo endereço agora abre o **Portal das Impressoras do Cliente** (login por CPF/CNPJ + senha, lista de atendimentos e resposta ao orçamento) quando não há `#/c/<token>` na URL. Os links individuais já enviados continuam funcionando sem mudança. Veja `docs/PORTAL_CLIENTE.md`.

> A resposta ao orçamento é feita no Portal do Cliente, com login. O antigo link de decisão `#/o/<token>` foi removido (0037); quem abrir um endereço assim cai no login do portal.

## Dados e segurança

- O AutoOS gera um token aleatório de 32 bytes e salva somente seu hash SHA-256 em `links_status_publico`.
- O link usa `https://status.bmitag.com.br/#/c/<token>`. A página envia o token à Edge Function em uma requisição `POST`; ele não vai na requisição inicial do HTML.
- A Edge Function valida validade e revogação, consulta apenas `tipo`, `marca`, `modelo`, `status` e `status_alterado_em`, e devolve um texto público. Número de série, contatos, orçamento, observações e dados da empresa não são enviados, exceto o nome de exibição e o endereço de retirada descritos abaixo.
- Em `PRONTO`, a resposta traz `retirada`: `{ nome, endereco, mapsUrl }`. `nome` é o nome de exibição do contato da empresa, `endereco` vem limitado a 300 caracteres e `mapsUrl` só passa se começar com `https://` (senão vai `null`). O horário, o WhatsApp e o e-mail do contato não entram. Fora de `PRONTO` a chave não aparece. Se a consulta ao endereço falhar, a Edge Function registra `public_status_retirada_unavailable` e segue sem o campo: a página de status não cai por causa do endereço.
- O link tem validade máxima de 180 dias e termina 30 dias após a entrega. A data de mudança de status só aparece quando existe registro confiável; a migration não preenche datas para atendimentos antigos.
- Links ausentes, expirados ou revogados recebem a mesma resposta pública. Cada abertura atualiza somente `ultimo_acesso_em`.
- O portal nasce pausado (`status_portal_config.public_enabled = false`). A função pública e a emissão no AutoOS respeitam essa chave global.
- O banco limita o portal a 300 consultas por minuto e cada token a 30 consultas por minuto. A tabela registra apenas HMACs dos identificadores de limite; cabeçalhos de IP enviados pelo cliente não participam da decisão. A Edge Function registra eventos de bloqueio sem token ou IP.
- O portal não carrega analítica, gerenciador de tags nem scripts de terceiros. A política de segurança, `no-store`, `no-referrer` e `noindex` estão em `public/.htaccess` e `public-status.html`.
- O app exige a permissão `MANAGE_STATUS_LINKS` para criar e revogar links. Email e WhatsApp usam as integrações existentes; o histórico guarda canal, destinatário e resultado, mas substitui o token por um texto de redação.

## Banco

A migration é `src-tauri/migrations/0029_portal_status_publico.sql`, a fonte de schema usada pelo aplicativo. Ela cria a data confiável de mudança de status, os links com vínculo composto por empresa e equipamento, e o limite de consultas. As versões 0024–0028 são promovidas pelo PR #123 e precisam estar aplicadas antes da 0029 em um banco real.

A migration `src-tauri/migrations/0044_status_publico_endereco_retirada.sql` cria só a função `public.status_publico_retirada(p_token_hash TEXT)`, sem tabela nova. Ela é `SECURITY DEFINER`, só `service_role` tem `EXECUTE`, e valida o próprio link: devolve NULL se o token não existe, está revogado ou expirado, se o atendimento não está em `PRONTO` ou se o contato não tem endereço. Lê `portal_contato_empresa` (`nome_exibicao`, `endereco`, `maps_url`). A Edge Function chama a função por RPC; se ela ainda não existir, a página segue sem `retirada`, então a ordem entre publicar a 0044 e a função não importa.

Na auditoria de produção de 2026-10-08, `autoos` usava IDs inteiros para `empresas` e `equipamentos`, não possuía `os_status_publico` nem Edge Functions. `supabase/schema.sql` ainda descreve um modelo com UUID e não corresponde a esse banco; **não aplique esse snapshot em produção para instalar o portal**. Use o processo administrativo já adotado para aplicar a migration SQLx e confirme o schema antes de publicar a função.

## Edge Function

O código está em `supabase/functions/public-status/index.ts`. `supabase/config.toml` desliga a validação JWT padrão somente para essa função porque o endpoint público faz sua própria autenticação pelo token de capacidade.

Antes de publicar a função no projeto Supabase `autoos`:

1. Após integrar as versões 0024–0028, aplique e confira a migration `0029_portal_status_publico.sql` no banco de produção.
2. Confirme que a Edge Function recebe `SUPABASE_URL` e uma chave secreta de servidor em `SUPABASE_SECRET_KEYS` (a chave `default`) ou `SUPABASE_SERVICE_ROLE_KEY`. Nunca coloque essa chave no navegador ou no pacote desktop.
3. Configure `PUBLIC_STATUS_RATE_LIMIT_SECRET` com pelo menos 32 caracteres aleatórios. Sem ele, a função responde `503`.
4. Configure `PUBLIC_STATUS_ORIGIN=https://status.bmitag.com.br` e publique `public-status` com `verify_jwt = false`. `PUBLIC_STATUS_ALLOW_LOCAL_ORIGINS=true` é só para desenvolvimento local.
5. Confira os advisors de segurança do Supabase após instalar a função e a migration.
6. Ative o piloto só depois da validação interna, alterando `public_enabled` para `true` na linha `singleton = true`.

Para pausar rapidamente e invalidar os links emitidos, rode no SQL Editor do projeto:

```sql
BEGIN;
UPDATE public.status_portal_config
SET public_enabled = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE singleton = TRUE;
UPDATE public.links_status_publico
SET revogado_em = CURRENT_TIMESTAMP
WHERE revogado_em IS NULL;
COMMIT;
```

Essa ação é reversível quanto à emissão (o flag pode voltar a `true`), mas os links já revogados não voltam a funcionar. Não habilite o flag antes de aprovar a implantação.

O navegador envia apenas JSON com o token e não usa API key do Supabase. As chamadas ao PostgREST e aos limites de consulta são feitas no servidor com a chave secreta.

## Publicar a página

Rode:

```bash
npm run build:public-status
```

Envie o conteúdo de `dist-public-status/` para a raiz do subdomínio `status.bmitag.com.br`, preservando o arquivo `.htaccess`. Ele redireciona HTTP para HTTPS e aplica os cabeçalhos de segurança. O endereço de API padrão está no projeto Supabase `autoos`; para usar outro, defina `VITE_PUBLIC_STATUS_API_URL` antes do build e ajuste a allowlist CORS da Edge Function.

O DNS e a hospedagem HostGator de `status.bmitag.com.br` foram configurados em 2026-10-13. Antes de ativar o portal em outro ambiente, confirme o certificado HTTPS e o acesso ao site no domínio definitivo.

## Fluxo no AutoOS

Em Equipamentos → Detalhes, usuários autorizados podem criar um link, copiar, mostrar QR, enviar por email ou WhatsApp e revogar. O app não consegue recuperar o token de um link já criado porque o banco guarda apenas o hash; para reenviar, é preciso gerar outro, revogando o anterior.

O portal mostra a etapa atual e uma linha do tempo derivada do título público, sem expor histórico de mudanças. Correções podem mover o atendimento para uma etapa anterior. O horário da consulta é separado do horário confiável da última mudança de etapa.
