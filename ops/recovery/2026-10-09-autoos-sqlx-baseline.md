# Reconciliação SQLx de produção — 2026-10-09

Projeto Supabase: `autoos` (`sgaqvxubopgwysnyocjs`). O banco registrava apenas a migration SQLx 0001, embora o esquema posterior tivesse sido aplicado fora do histórico SQLx. A aplicação direta de 0002 falhava por objetos já existentes. O arquivo SQL ao lado registra a transação executada via Supabase Migration API com o nome `reconcile_autoos_sqlx_legacy_before_0024`.

## Backup e ensaio

- Backup imediatamente anterior: [workflow 37979044737](https://github.com/ph66ng2/AutoOs/actions/runs/37979044737), dump criptografado baixado e decifrado localmente em `/home/paulo/AutoOS/backups/production-2026-10-09/pre-migration-37979044737/autoos-public.dump`.
- SHA-256 do dump decifrado: `175d1bf4eac78bf1dd93cfc2d8f560e09b84e7a6b4eba637cac5df965fbc6f24`.
- Restauração ensaiada em PostgreSQL 17 descartável. O esquema foi comparado com um banco criado de 0001–0023. As diferenças faltantes eram o trigger da 0018, as constraints da 0019 e os objetos/política da 0022; os índices UNIQUE antigos de produtos e gastos já haviam sido substituídos fora do SQLx pelos índices parciais da 0024.
- A transação exata de reconciliação foi ensaiada em uma segunda cópia restaurada, chegando a 23 registros SQLx. Em outra cópia, 0024–0028 rodaram em sequência sem erro.

## Mudanças em produção

A transação verifica o checksum legado conhecido da 0001 e a presença de exatamente uma empresa. Ela aplica as seis referências inativas da 0006, o backfill da 0016, o trigger da 0018, as constraints da 0019, o vínculo de uma movimentação de estoque à empresa e a migração de serviços globais da 0022. Por fim, atualiza o checksum da 0001 para o arquivo canônico e registra os checksums SHA-384 das versões 0002–0023 em `_sqlx_migrations`. Nenhum valor atual de estoque ou preço é sobrescrito pela seed da 0020.

Depois da operação, o banco confirmou 23 versões SQLx sem divergência de checksum, zero serviços globais, 40 serviços da empresa, seis referências de gastos e zero movimentações vinculáveis sem empresa. O workflow de produção ainda precisa aplicar 0024–0028 e confirmar o histórico final antes de mesclar o PR #122.
