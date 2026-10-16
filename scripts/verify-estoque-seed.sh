#!/usr/bin/env bash
# Aplica as migrations 0001-0030 num Postgres local vazio, roda o seed duas
# vezes e confere que saldo, preço, SKU inativo e movimentações sobrevivem.
# Recusa host remoto. Ignora DATABASE_URL e qualquer credencial de produção.
# O banco autoos_seed_verify é recriado a cada execução.
#
# PGHOST, PGHOSTADDR, PGSERVICE e o restante de PG* são apagados antes de
# qualquer psql. A conexão é explícita: socket local, ou 127.0.0.1 quando
# SEED_VERIFY_PGUSER está definido. libpq não herda o ambiente do chamador.

set -euo pipefail

seed_host="${SEED_VERIFY_PGHOST:-}"
seed_port="${SEED_VERIFY_PGPORT:-5432}"
seed_user="${SEED_VERIFY_PGUSER:-}"
seed_password="${SEED_VERIFY_PGPASSWORD:-}"

while IFS= read -r env_name; do
  case "$env_name" in
    PG*|pg*) unset "$env_name" ;;
  esac
done < <(compgen -v)

if compgen -v | grep -Eq '^(PG|pg)'; then
  echo "verify-estoque-seed não conseguiu limpar as variáveis PG*." >&2
  compgen -v | grep -E '^(PG|pg)' >&2
  exit 1
fi

case "$seed_host" in
  ""|localhost|127.0.0.1|::1) ;;
  *)
    echo "verify-estoque-seed recusa host não local: $seed_host" >&2
    exit 1
    ;;
esac

if [[ ! "$seed_port" =~ ^[0-9]+$ ]] || [[ "$seed_port" -lt 1 || "$seed_port" -gt 65535 ]]; then
  echo "verify-estoque-seed recusa porta: $seed_port" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="autoos_seed_verify"
SEED="$ROOT/scripts/seed-estoque-ribbons-bopp.sql"
CONFIRM="$ROOT/scripts/confirm-estoque-seed-empresa.sql"
MIGRATIONS="$ROOT/src-tauri/migrations"

psql_local() {
  local pgoptions="${1:-}"
  shift
  if [[ -n "$seed_user" ]]; then
    env -i \
      PATH="$PATH" \
      HOME="${HOME:-/tmp}" \
      LANG="${LANG:-C.UTF-8}" \
      PGPASSWORD="$seed_password" \
      PGOPTIONS="$pgoptions" \
      psql --no-psqlrc -h 127.0.0.1 -p "$seed_port" -U "$seed_user" -v ON_ERROR_STOP=1 "$@"
  else
    sudo -u postgres env -i \
      PATH="$PATH" \
      LANG="${LANG:-C.UTF-8}" \
      PGOPTIONS="$pgoptions" \
      psql --no-psqlrc -h /var/run/postgresql -p "$seed_port" -v ON_ERROR_STOP=1 "$@"
  fi
}

psql_cmd() {
  psql_local "" "$@"
}

psql_cmd_for_empresa() {
  local empresa_id="$1"
  shift
  if [[ ! "$empresa_id" =~ ^[0-9]+$ ]]; then
    echo "empresa_id inválido: $empresa_id" >&2
    exit 1
  fi
  psql_local "-c seed.empresa_id=${empresa_id}" "$@"
}

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
if [[ "${#migration_files[@]}" -ne 30 ]]; then
  echo "Esperadas 30 migrations (0001-0030); encontradas ${#migration_files[@]}." >&2
  exit 1
fi
first="$(basename "${migration_files[0]}")"
last="$(basename "${migration_files[29]}")"
if [[ "$first" != 0001_* || "$last" != 0030_* ]]; then
  echo "A sequência precisa ir de 0001 a 0030 (achados: $first ... $last)." >&2
  exit 1
fi

if [[ -n "$seed_user" ]]; then
  echo "Recriando $DB_NAME em 127.0.0.1:$seed_port"
else
  echo "Recriando $DB_NAME no socket local, porta $seed_port"
fi
psql_cmd -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null
psql_cmd -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null
psql_cmd -d postgres -c "CREATE DATABASE ${DB_NAME};" >/dev/null

echo "Aplicando migrations 0001-0030"
for file in "${migration_files[@]}"; do
  psql_cmd -d "$DB_NAME" -f "$file" >/dev/null
done

expect_seed_failure "Nenhuma empresa cadastrada" \
  psql_cmd -d "$DB_NAME" -f "$SEED"
expect_seed_failure "Nenhuma empresa cadastrada" \
  psql_cmd -d "$DB_NAME" -f "$CONFIRM"

psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO empresas (nome, email, status) VALUES
    ('BMITAG', 'seed-verify-a@example.invalid', 'ativo');
SQL

echo "Sem empresa_id, o seed e a conferência usam a única empresa"
psql_cmd -d "$DB_NAME" -f "$SEED"
psql_cmd -d "$DB_NAME" -f "$CONFIRM"

echo "Código ausente na única empresa faz a conferência falhar"
psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DELETE FROM produtos WHERE codigo = 'ETQ-80X70-BOPP' AND empresa_id = (SELECT id FROM empresas);" >/dev/null
expect_seed_failure "encontrados 41" \
  psql_cmd -d "$DB_NAME" -f "$CONFIRM"
psql_cmd -d "$DB_NAME" -f "$SEED"
psql_cmd -d "$DB_NAME" -f "$CONFIRM"

psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO empresas (nome, email, status) VALUES
    ('Outra', 'seed-verify-b@example.invalid', 'ativo');
SQL

expect_seed_failure "Defina seed.empresa_id" \
  psql_cmd -d "$DB_NAME" -f "$SEED"
expect_seed_failure "Defina seed.empresa_id" \
  psql_cmd -d "$DB_NAME" -f "$CONFIRM"

null_before="$(psql_cmd -d "$DB_NAME" -At -c "SELECT COUNT(*) FROM produtos WHERE ativo = true AND empresa_id IS NULL;")"

echo "Primeira aplicação do seed na empresa 1"
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$SEED"

echo "A soma das empresas não substitui a conferência da empresa alvo"
global_codes="$(psql_cmd -d "$DB_NAME" -At -c "SELECT COUNT(DISTINCT codigo) FROM produtos WHERE empresa_id IS NOT NULL;")"
if [[ "$global_codes" != "42" ]]; then
  echo "O cenário da conferência frouxa precisa de 42 códigos somando as empresas; achou ${global_codes}." >&2
  exit 1
fi
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$CONFIRM"
expect_seed_failure "encontrados 0" \
  psql_cmd_for_empresa 2 -d "$DB_NAME" -f "$CONFIRM"

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

echo "Conferência dos 42 códigos em cada empresa, ativos ou inativos"
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$CONFIRM"
psql_cmd_for_empresa 2 -d "$DB_NAME" -f "$CONFIRM"

echo "SKU inativo da mesma empresa não recebe outra linha ativa"
psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
UPDATE produtos
   SET ativo = false,
       quantidade_estoque = 3,
       preco_custo = 9.99,
       preco_venda = 9.99,
       nome = 'RESINA INATIVA'
 WHERE empresa_id = 1
   AND codigo = 'RIB-RESINA';
SQL
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$SEED"
psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
    linhas integer;
    saldo integer;
    custo numeric;
    nome_atual text;
    ativo_atual boolean;
BEGIN
    SELECT COUNT(*)::integer INTO linhas
      FROM produtos
     WHERE empresa_id = 1
       AND codigo = 'RIB-RESINA';
    IF linhas <> 1 THEN
        RAISE EXCEPTION 'SKU inativo gerou linhas extras: count=%', linhas;
    END IF;

    SELECT produto.quantidade_estoque, produto.preco_custo, produto.nome, produto.ativo
      INTO saldo, custo, nome_atual, ativo_atual
      FROM produtos AS produto
     WHERE produto.empresa_id = 1
       AND produto.codigo = 'RIB-RESINA';
    IF saldo <> 3 OR custo <> 9.99 OR nome_atual <> 'RESINA INATIVA' OR ativo_atual THEN
        RAISE EXCEPTION 'O seed reativou ou reescreveu o SKU inativo (% / % / % / %).', saldo, custo, nome_atual, ativo_atual;
    END IF;
END $$;
SQL

echo "Código que falta numa empresa não é coberto pelo estoque da outra"
psql_cmd -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DELETE FROM produtos WHERE empresa_id = 2 AND codigo = 'RIB-RESINA';" >/dev/null
global_codes="$(psql_cmd -d "$DB_NAME" -At -c "SELECT COUNT(DISTINCT codigo) FROM produtos WHERE empresa_id IS NOT NULL;")"
if [[ "$global_codes" != "42" ]]; then
  echo "A soma das empresas ainda deveria ver os 42 códigos; achou ${global_codes}." >&2
  exit 1
fi
psql_cmd_for_empresa 1 -d "$DB_NAME" -f "$CONFIRM"
expect_seed_failure "encontrados 41" \
  psql_cmd_for_empresa 2 -d "$DB_NAME" -f "$CONFIRM"

echo "SEED_VERIFY_OK migrations=0001-0030 idempotent=1 movements_preserved=1 inactive_preserved=1 company_scoped=1"
