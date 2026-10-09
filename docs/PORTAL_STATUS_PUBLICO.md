# Portal público de acompanhamento de equipamentos

O portal permite que o cliente consulte a etapa atual de um ciclo de atendimento por um link individual. A página é somente para leitura: não altera status nem aprova orçamento.

## Dados e segurança

- O AutoOS gera um token aleatório de 32 bytes e salva somente seu hash SHA-256 em `links_status_publico`.
- O link usa `https://status.bmitag.com.br/#/c/<token>`. A página envia o token à Edge Function em uma requisição `POST`; ele não vai na requisição inicial do HTML.
- A Edge Function valida validade e revogação, consulta apenas `tipo`, `marca`, `modelo`, `status` e `status_alterado_em`, e devolve um texto público. Número de série, contatos, orçamento, observações e dados da empresa não são enviados.
- O link tem validade máxima de 180 dias e termina 30 dias após a entrega. A data de mudança de status só aparece quando existe registro confiável; a migration não preenche datas para atendimentos antigos.
- Links ausentes, expirados ou revogados recebem a mesma resposta pública. Cada abertura atualiza somente `ultimo_acesso_em`.
- O portal nasce pausado (`status_portal_config.public_enabled = false`). A função pública e a emissão no AutoOS respeitam essa chave global.
- O banco limita o portal a 300 consultas por minuto e cada token a 30 consultas por minuto. A tabela registra apenas HMACs dos identificadores de limite; cabeçalhos de IP enviados pelo cliente não participam da decisão. A Edge Function registra eventos de bloqueio sem token ou IP.
- O portal não carrega analítica, gerenciador de tags nem scripts de terceiros. A política de segurança, `no-store`, `no-referrer` e `noindex` estão em `public/.htaccess` e `public-status.html`.
- O app exige a permissão `MANAGE_STATUS_LINKS` para criar e revogar links. Email e WhatsApp usam as integrações existentes; o histórico guarda canal, destinatário e resultado, mas substitui o token por um texto de redação.

## Banco

A migration é `src-tauri/migrations/0029_portal_status_publico.sql`, a fonte de schema usada pelo aplicativo. Ela cria a data confiável de mudança de status, os links com vínculo composto por empresa e equipamento, e o limite de consultas. As versões 0024–0028 estão reservadas para a branch `feature`; integre essas migrations antes de aplicar a 0029 em um banco real.

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

Envie o conteúdo de `dist-public-status/` para a raiz HTTPS do subdomínio `status.bmitag.com.br`, preservando o arquivo `.htaccess`. O endereço de API padrão está no projeto Supabase `autoos`; para usar outro, defina `VITE_PUBLIC_STATUS_API_URL` antes do build e ajuste a allowlist CORS da Edge Function.

O controle do DNS e da hospedagem HostGator ainda precisa ser confirmado antes da publicação. O código e o artefato de build podem ser preparados sem esse acesso.

## Fluxo no AutoOS

Em Equipamentos → Detalhes, usuários autorizados podem criar um link, copiar, mostrar QR, enviar por email ou WhatsApp e revogar. O app não consegue recuperar o token de um link já criado porque o banco guarda apenas o hash; para reenviar, é preciso gerar outro, revogando o anterior.

O portal mostra a etapa atual e uma linha do tempo derivada do título público, sem expor histórico de mudanças. Correções podem mover o atendimento para uma etapa anterior. O horário da consulta é separado do horário confiável da última mudança de etapa.
