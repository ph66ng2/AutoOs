# PowerSync no staging SaaS

O plano Offline usa uma instância PowerSync Cloud exclusiva conectada somente
ao Supabase staging. O plano Online não usa PowerSync. A linha interna da
BMITAG e a produção ficam fora desta configuração.

## Limites de segurança

- Nunca conecte PowerSync ao banco interno ou à produção. Não reutilize senhas,
  chaves, dumps, backups, imagens ou cadastros reais.
- Mantenha senha PostgreSQL, chave privada JWT, `service_role` e credenciais
  administrativas somente nos cofres dos serviços. Não as versione nem as
  distribua no desktop.
- A configuração versionada fica em
  `supabase/powersync-sync-rules.yaml`. O nome histórico do arquivo contém
  “sync-rules”, mas seu conteúdo usa Sync Streams, edition 3.
- Cada consulta lista explicitamente suas colunas e exige `empresa_id` igual ao
  claim assinado `company_id`, além do claim booleano `offline_sync = true`.
  Se qualquer claim estiver ausente ou falso, a consulta não entrega linhas.
- O token aceito pela instância deve ser o token PowerSync curto emitido pelo
  backend depois de validar o entitlement. Ele deve ter `company_id`,
  `offline_sync`, `sub`, `iss`, `aud`, `exp` e `jti`, conforme
  `docs/SAAS_AUTH_RLS_CONTRACT.md`. Não habilite o JWT comum do Supabase como
  credencial direta para essas streams: ele não prova a capacidade Offline.
- Conceda ao usuário de replicação leitura somente nas tabelas sincronizadas e
  publique somente essas tabelas. Não use `FOR ALL TABLES` como atalho.
- `security_audit_log` não é baixado: o schema PowerSync o trata como tabela
  somente para inserção/upload.

## Provisionamento da instância

O provisionamento é manual no ambiente de staging e exige um operador com
acesso aos dashboards. Nenhum segredo ou alteração remota é necessário para
revisar os arquivos deste repositório.

1. Confirme que o projeto é o Supabase staging descartável, distinto da conta
   interna e da produção. Use apenas o schema SaaS com IDs UUID definido em
   `supabase/schema.sql` e nas migrations de `supabase/migrations/`.
2. Crie uma instância PowerSync Cloud identificada como staging e conecte-a
   apenas ao Postgres desse projeto. Use usuário dedicado de replicação,
   publicação restrita às tabelas sincronizadas e validação TLS completa.
3. Configure Client Auth para validar a chave pública/JWKS do emissor server-side
   definido em `AO-SUB-003`, com a audiência específica dessa instância. O
   token para teste deve ser gerado pelo backend de staging e conter somente
   identidade sintética autorizada e capacidade `offline_sync` vigente.
4. Carregue `supabase/powersync-sync-rules.yaml` no editor Sync Streams do
   dashboard e execute Validate. Revise os filtros e confirme que nenhuma
   consulta usa seleção global.
5. **Antes de Deploy**, confira a configuração atual e confirme explicitamente
   a publicação das streams persistentes da instância staging. Não substitua
   streams já existentes sem essa confirmação.

O emissor e a emissão de token pertencem a `AO-SUB-003`. Até esse fluxo existir,
a validação de isolamento A/B e o aceite final em Cloud continuam pendentes; não
substitua o token por JWT comum, claim editável no cliente ou segredo de teste
persistente.

## Verificação A/B em staging

Depois de provisionar uma instância exclusiva e obter tokens sintéticos pelo
emissor autorizado:

1. Valide a configuração no dashboard antes de qualquer publicação.
2. Com o token Offline do tenant A, insira um registro sintético
   `TESTE-POWERSYNC-A` e confirme no diagnóstico/cliente PowerSync que A recebe
   somente linhas com o `empresa_id` de A.
3. Repita com tenant B e `TESTE-POWERSYNC-B`; confirme que B recebe somente as
   linhas de B e que nenhuma consulta retorna dados de A.
4. Tente assinar uma conexão de teste de A com a identidade do tenant B e
   confirme que o emissor a rejeita ou que não há linhas disponíveis.
5. Confirme que um token válido sem `offline_sync = true` recebe zero linhas.
6. Registre a validação, IDs sintéticos e logs sanitizados, sem guardar tokens,
   URLs privadas ou credenciais.
7. Remova os registros sintéticos e as assinaturas locais de teste ao concluir.

Impacto de dados: esses passos criam somente linhas sintéticas temporárias no
Supabase staging e uma publicação persistente de Sync Streams no PowerSync
staging. Use rollback/limpeza para as linhas e obtenha confirmação antes de
publicar ou substituir a configuração persistente.
