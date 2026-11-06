# Avaliação: Supavisor transaction mode (6543) no runtime do app

Data: 2026-11-04. Análise apenas; **nada foi migrado**. `production_migrate` continua exigindo 5432 (session).

## Conclusão

**Não migrar agora.** O sqlx 0.9 funciona em transaction mode só com ajustes, e o app usa recursos de sessão. O ganho
(muitos clientes sobre poucas conexões reais) é melhor obtido limitando as rajadas no cliente (esta correção).

## Pontos

| Recurso | Transaction mode | Situação no AutoOS |
|---|---|---|
| Prepared statements / statement cache do sqlx | Quebra: a conexão real muda entre transações e o statement preparado some (`prepared statement "sqlx_s_N" does not exist`). Exige `statement_cache_capacity(0)` (sqlx envia queries sem cache nomeado) e perde desempenho. Supavisor recente aceita protocolo estendido, mas não confie sem teste. | Todo o app usa `sqlx::query` com cache padrão. |
| `SET` de sessão | Vaza ou se perde entre transações. | `after_connect` faz `SET TIME ZONE 'UTC'` (db.rs). Em 6543 seria perdido. Teria de virar `ALTER ROLE ... SET timezone` ou `SET LOCAL` por transação. **Risco real**: o schema legado usa `TIMESTAMP` sem fuso. |
| `LISTEN/NOTIFY` | Não funciona. | Sem uso no runtime (`grep` em `src-tauri/src`, fora de `bin/`, não acha `LISTEN`, `PgListener` nem `NOTIFY`). |
| Advisory locks de sessão | Não confiáveis; só `pg_advisory_xact_lock` dentro de transação. | Sem `pg_advisory*` no runtime. As migrations (sqlx migrate) usam lock de sessão, por isso ficam em 5432. |
| Transações (`BEGIN..COMMIT`) | Funcionam: a conexão fica presa durante a transação. | Locking otimista e movimentação de estoque são transacionais, compatíveis. |
| Migrations (`sqlx migrate`) | Incompatível (advisory lock de sessão). | Mantém 5432. |

## Se um dia migrar

1. Migrations e `production_migrate` permanecem em 5432.
2. Runtime em 6543 com `statement_cache_capacity(0)`.
3. Substituir `SET TIME ZONE` do `after_connect` por configuração no role ou `SET LOCAL`.
4. Rodar `runtime_smoke`, `p1_concurrency_integration` e `test_auth_integration` contra um projeto de teste em 6543.
5. Manter `DATABASE_MAX_CONNECTIONS` baixo e o single-flight de `db.rs`.
