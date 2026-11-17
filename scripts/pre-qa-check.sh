#!/usr/bin/env bash
# Filtro de lixo antes do QA: checagens mecânicas sobre o diff.
# Uso: scripts/pre-qa-check.sh [base-ref]   (padrão: merge-base com origin/master ou origin/main)
set -u
cd "$(git rev-parse --show-toplevel)"

BASE="${1:-$(git merge-base HEAD origin/master 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || echo HEAD)}"
CODE='^(src|src-tauri/src|e2e)/'
fail=0

report() { echo "REJEITA: $1"; fail=1; }

# Linhas adicionadas em código (sem os cabeçalhos +++)
added=$(git diff "$BASE" -U0 -- src src-tauri/src e2e | grep -E '^\+[^+]|^\+$' || true)

check() { # padrão, motivo
  local hits
  hits=$(printf '%s\n' "$added" | grep -nE "$1" || true)
  [ -n "$hits" ] && { report "$2"; printf '%s\n' "$hits" | head -5; }
}

check 'console\.log\(|dbg!\(|println!\(' 'debug esquecido (console.log / dbg! / println!)'
check 'sqlx::query(_as)?!' 'macro query!/query_as! do sqlx (proibida no projeto)'
check '(it|test|describe)\.(skip|only)\(|#\[ignore\]' 'teste desativado ou isolado (skip/only/ignore)'
check 'postgres(ql)?://[^[:space:]"'"'"']+:[^[:space:]"'"'"']+@' 'URL de banco com credencial'
check '(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' 'possível segredo/token'
check '[Ss][Qq][Ll]ite' 'referência a SQLite (proibida no projeto)'
check '(TODO|FIXME|HACK)' 'TODO/FIXME novo (confirme se foi pedido)'

# invoke() fora de lib/db.ts
inv=$(git diff "$BASE" -U0 -- src ':!src/lib/db.ts' ':!e2e' | grep -E '^\+[^+].*\binvoke\(' || true)
[ -n "$inv" ] && { report 'invoke() fora de src/lib/db.ts'; printf '%s\n' "$inv" | head -5; }

# Cor fora dos tokens (redesign): hex e paleta fixa do Tailwind em linha nova de src/.
# Ficam de fora os arquivos que definem tokens e os que precisam de cor literal (PDF, e-mail, avatar).
COR_FORA=(':!src/index.css' ':!src/public-status/public-status.css' ':!src/opening-demo/*'
  ':!src/lib/pdf-service.ts' ':!src/lib/email-service.ts' ':!src/lib/profile-appearance.ts'
  ':!src/components/perfil/GeometricAvatar.tsx' ':!src/components/perfil/AppearancePicker.tsx'
  ':!*.test.ts' ':!*.test.tsx')
cor=$(git diff "$BASE" -U0 -- 'src/*.ts' 'src/*.tsx' 'src/*.css' "${COR_FORA[@]}" | grep -E '^\+[^+]' || true)
hex=$(printf '%s\n' "$cor" | grep -E '(^|[^0-9A-Za-z&])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b' || true)
[ -n "$hex" ] && { report 'cor hex fora dos tokens (use var(--token); se for cor literal legítima, inclua o arquivo em COR_FORA)'; printf '%s\n' "$hex" | head -5; }
tw=$(printf '%s\n' "$cor" | grep -E '\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow)-(red|green|blue|yellow|amber|emerald|orange|slate|gray|zinc|sky|rose|lime|teal|cyan|indigo|violet|purple|pink|fuchsia|neutral|stone)-[0-9]{2,3}\b' || true)
[ -n "$tw" ] && { report 'cor fixa do Tailwind (ex.: bg-red-500): use os tokens do Design System'; printf '%s\n' "$tw" | head -5; }

# Migration já existente editada
mig=$(git diff "$BASE" --name-only --diff-filter=MD -- src-tauri/migrations || true)
[ -n "$mig" ] && { report 'migration existente alterada ou removida'; echo "$mig"; }

# Arquivos fora do escopo: o orquestrador compara esta lista com o plano
echo "--- arquivos alterados (compare com o plano) ---"
git diff "$BASE" --stat | tail -n 50

[ "$fail" -eq 0 ] && echo "PASSA (checagens mecânicas). Rode também: npm run lint && npm run test:run"
exit "$fail"
