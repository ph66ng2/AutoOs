# Upload de fotos pelo celular — staging

O AO-PHOTO-002 fornece uma página estática e a Edge Function `photo-upload`. A página recebe `session` e `token` pelo QR, pede URLs de upload assinadas e confirma os objetos enviados. Ela não conhece a chave de serviço, nem grava fotos em Base64.

## Limites e segurança

- Até seis imagens JPEG ou PNG por sessão; 10 MB por arquivo.
- O bucket `photo-upload-staging` é privado. Não crie políticas para `anon` ou `authenticated`.
- A função valida o hash do token, estado `PENDING` e expiração antes de preparar e de confirmar imagens.
- Cada URL assinada de upload fica limitada a um único caminho aleatório. O Storage do Supabase fixa a validade delas em até duas horas; a função só as emite enquanto a sessão de QR (dez minutos) estiver válida. Objetos que não forem confirmados pelo ticket seguinte devem ser limpos no ciclo de expiração.
- O token do QR aparece na URL móvel. A Vercel envia `Referrer-Policy: no-referrer`; não use analytics que capture query strings nesta página.

## Preparação manual de staging

Nenhum comando deste ticket cria recursos externos automaticamente. Depois de aprovação humana, no projeto exclusivo de staging:

1. Execute [`supabase/storage-photo-staging.sql`](../supabase/storage-photo-staging.sql) no SQL Editor.
2. Cadastre os segredos da função, sem colocá-los na Vercel ou no repositório:

   ```text
   SUPABASE_URL=https://<STAGING_PROJECT_REF>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<STAGING_SERVICE_ROLE_KEY>
   PHOTO_UPLOAD_BUCKET=photo-upload-staging
   PHOTO_UPLOAD_ALLOWED_ORIGINS=https://<STAGING_VERCEL_DOMAIN>
   ```

3. Publique `supabase/functions/photo-upload` como Edge Function com verificação JWT desligada: o token aleatório da sessão é validado pelo hash persistido. Nunca substitua isso por uma chave no navegador.
4. Publique `mobile-photo-uploader/` como projeto estático da Vercel, definindo a variável de build `PHOTO_UPLOAD_FUNCTION_URL=https://<STAGING_PROJECT_REF>.functions.supabase.co/photo-upload`. Ela é apenas um endpoint público; `npm run build` gera `config.js` sem inserir qualquer segredo.
5. Configure `AUTOOS_MOBILE_PHOTO_UPLOADER_URL=https://<STAGING_VERCEL_DOMAIN>` no AutoOS local e gere uma sessão sintética.

## Roteiro de validação

1. Rode `npm run lint` no AutoOS e `npm run build` em `mobile-photo-uploader/`.
2. Teste uma e seis imagens em Android e iPhone com sessão sintética válida.
3. Teste token inválido, sessão expirada/cancelada, sétima imagem, arquivo acima de 10 MB e falha de rede. A página deve explicar o próximo passo.
4. Confirme que os objetos ficaram somente no bucket privado e que banco guarda caminho/metadados — nunca Base64, token puro ou URL pública.
5. Revogue a sessão e apague os objetos sintéticos após registrar evidência sanitizada.

O desktop ainda não consome estes itens, não anexa fotos ao PDF e não remove o upload LAN; isso é dos tickets AO-PHOTO-003 e AO-PHOTO-004.
