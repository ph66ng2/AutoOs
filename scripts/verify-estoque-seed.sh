#!/usr/bin/env bash
# Aplica as migrations 0001-0029 num Postgres local vazio, roda o seed duas
# vezes e confere que saldo, preço e movimentações sobrevivem.
# Recusa host remoto. Ignora DATABASE_URL e qualquer credencial de produção.
# O banco autoos_seed_verify é recriado a cada execução.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="autoos_seed_verify"
HOST="${SEED_VERIFY_PGHOST:-localhost}"
PORT="${SEED_VERIFY_PGPORT:-5432}"
SEED="$ROOT/scripts/seed-estoque-ribbons-bopp.sql"
MIGRATIONS="$ROOT/src-tauri/migrations"

case "$HOST" in
  localhost|127.0.0.1|::1) ;;
  *)
    echo "verify-estoque-seed recusa host não local: $HOST" >&2
    exit 1
    ;;
esac

if [[ -n "${SEED_VERIFY_PGUSER:-}" ]]; then
  export PGPASSWORD="${SEED_VERIFY_PGPASSWORD:-}"
  psql_cmd() {
    psql -h "$HOST" -p "$PORT" -U "$SEED_VERIFY_PGUSER" -v ON_ERROR_STOP=1 "$@"
  }
  psql_cmd_for_empresa() {
    local empresa_id="$1"
    shift
    PGOPTIONS="-c seed.empresa_id=${empresa_id}" \
      psql -h "$HOST" -p "$PORT" -U "$SEED_VERIFY_PGUSER" -v ON_ERROR_STOP=1 "$@"
  }
else
  psql_cmd() {
    sudo -u postgres psql -p "$PORT" -v ON_ERROR_STOP=1 "$@"
  }
  psql_cmd_for_empresa() {
    local empresa_id="$1"
    shift
    sudo -u postgres env PGOPTIONS="-c seed.empresa_id=${empresa_id}" \
      psql -p "$PORT" -v ON_ERROR_STOP=1 "$@"
  }
fi

expect_seed_failure() {
  local needle="$1"
  shift
  local status stderr
  set +e
  stderr="$("$@" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "O seed deveria falhar ($needle)." >&2
    printf '%s\n' "$stderr" >&2
    exit 1
  fi
  if [[ "$stderr" != *"$needle"* ]]; then
    echo "Falha inesperada; procurava: $needle" >&2
    printf '%s\n' "$stderr" >&2
    exit 1
  fi
}

mapfile -t migration_files < <(find "$MIGRATIONS" -maxdepth 1 -type f -name '*.sql' | sort)
if [[ "${#migration_files[@]}" -ne 29 ]]; then
  echo "Esperadas 29 migrations (0001-0029); encontradas ${#migration_files[@]}." >&2
  exit 1
fi
first="$(basename "${migration_files[0]}")"
last="$(basename "${migration_files[28]}")"
if [[ "$first" != 0001_* || "$last" != 0029_* ]]; then
  echo "A sequência precisa ir de 0001 a 0029 (achados: $first ... $last)." >&2
  exit 1
fi

echo "Recriando $DB_NAME em $HOST:$PORT"
psql_cmd -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null
psql_cmd -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null
psql_cmd -d postgres -c "CREATE DATABASE ${DB_NAME};" >/dev/null

echo "Aplicando migrations 0001-0029"
for file in "${migration_files[@]}"; do
  psql_cmd -d "$DB_NAME" -f "$file" >/dev/null
done

expect_seed_failure "Nenhuma empresa cadastrada" \
  psql_cmd -d "$DB_NAME" -f "$SEED"

psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO empresas (nome, email, status) VALUES
    ('BMITAG', 'seed-verify-a@example.invalid', 'ativo'),
    ('Outra', 'seed-verify-b@example.invalid', 'ativo');
SQL

expect_seed_failure "Defina seed.empresa_id" \
  psql_cmd -d "$DB_NAME" -f "$SEED"

null_before="$(psql_cmd -d "$DB_NAME" -At -c "SELECT COUNT(*) FROM produtos WHERE ativo = true AND empresa_id IS NULL;")"

echo "Primeira aplicação do seed na empresa 1"
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$SEED"

psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE seed_verify_sentinel (
    produto_id integer,
    movimento_id integer,
    atualizado_em timestamp
);
DO $$
DECLARE
    produto_id integer;
    movimento_id integer;
    atualizado timestamp;
BEGIN
    SELECT id INTO produto_id
      FROM produtos
     WHERE empresa_id = 1
       AND codigo = 'ETQ-100X50-COUCHE'
       AND ativo = true;
    IF produto_id IS NULL THEN
        RAISE EXCEPTION 'SKU da empresa 1 não foi inserido.';
    END IF;

    UPDATE produtos
       SET quantidade_estoque = 999,
           preco_custo = 1.11,
           preco_venda = 2.22,
           nome = 'NOME ALTERADO PELO OPERADOR'
     WHERE id = produto_id;

    INSERT INTO movimentacoes_estoque (
        produto_id, tipo, quantidade, origem, referencia, observacoes, empresa_id
    ) VALUES (
        produto_id, 'SAIDA', 3, 'verify-seed', 'keep-me', 'nao apagar', 1
    )
    RETURNING id INTO movimento_id;

    SELECT atualizado_em INTO atualizado FROM produtos WHERE id = produto_id;
    INSERT INTO seed_verify_sentinel VALUES (produto_id, movimento_id, atualizado);
END $$;
SQL

echo "Segunda aplicação do seed na empresa 1"
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$SEED"

echo "Seed da empresa 2 não pode alterar a empresa 1"
psql_cmd_for_empresa 2 -d "$DB_NAME" -f "$SEED"
psql_cmd_for_empresa 2 -d "$DB_NAME" -f "$SEED"

psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
    alvo_produto integer;
    alvo_movimento integer;
    atualizado_antes timestamp;
    null_depois integer;
    movimentos integer;
    saldo integer;
    custo numeric;
    venda numeric;
    nome_atual text;
    atualizado_depois timestamp;
    ativos_1 integer;
    ativos_2 integer;
    duplicados integer;
BEGIN
    SELECT s.produto_id, s.movimento_id, s.atualizado_em
      INTO alvo_produto, alvo_movimento, atualizado_antes
      FROM seed_verify_sentinel AS s;

    SELECT produto.quantidade_estoque, produto.preco_custo, produto.preco_venda, produto.nome, produto.atualizado_em
      INTO saldo, custo, venda, nome_atual, atualizado_depois
      FROM produtos AS produto
     WHERE produto.id = alvo_produto;

    IF saldo <> 999 OR custo <> 1.11 OR venda <> 2.22 OR nome_atual <> 'NOME ALTERADO PELO OPERADOR' THEN
        RAISE EXCEPTION 'O seed reescreveu saldo, preço ou nome existentes (% / % / % / %).', saldo, custo, venda, nome_atual;
    END IF;
    IF atualizado_depois <> atualizado_antes THEN
        RAISE EXCEPTION 'O seed alterou atualizado_em de um produto existente.';
    END IF;

    SELECT COUNT(*)::integer INTO movimentos FROM movimentacoes_estoque;
    IF movimentos <> 1 THEN
        RAISE EXCEPTION 'Movimentações não sobreviveram: count=%', movimentos;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM movimentacoes_estoque AS movimento
         WHERE movimento.id = alvo_movimento
           AND movimento.produto_id = alvo_produto
           AND movimento.tipo = 'SAIDA'
           AND movimento.quantidade = 3
           AND movimento.origem = 'verify-seed'
           AND movimento.referencia = 'keep-me'
           AND movimento.observacoes = 'nao apagar'
           AND movimento.empresa_id = 1
    ) THEN
        RAISE EXCEPTION 'A movimentação original foi alterada ou apagada.';
    END IF;

    SELECT COUNT(*)::integer INTO null_depois
      FROM produtos
     WHERE ativo = true AND empresa_id IS NULL;
    IF null_depois <> ${null_before} THEN
        RAISE EXCEPTION 'Produtos sem empresa mudaram de % para %.', ${null_before}, null_depois;
    END IF;

    SELECT COUNT(*)::integer INTO ativos_1
      FROM produtos
     WHERE ativo = true AND empresa_id = 1;
    SELECT COUNT(*)::integer INTO ativos_2
      FROM produtos
     WHERE ativo = true AND empresa_id = 2;
    IF ativos_1 <> 42 OR ativos_2 <> 42 THEN
        RAISE EXCEPTION 'Contagem por empresa inesperada: empresa 1=%, empresa 2=%.', ativos_1, ativos_2;
    END IF;

    SELECT COUNT(*)::integer INTO duplicados
      FROM (
          SELECT empresa_id, codigo
            FROM produtos
           WHERE ativo = true AND empresa_id IN (1, 2)
           GROUP BY empresa_id, codigo
          HAVING COUNT(*) > 1
      ) AS duplicado;
    IF duplicados <> 0 THEN
        RAISE EXCEPTION 'Há códigos ativos duplicados na mesma empresa.';
    END IF;
END \$\$;
SQL

echo "SEED_VERIFY_OK migrations=0001-0029 idempotent=1 movements_preserved=1"
