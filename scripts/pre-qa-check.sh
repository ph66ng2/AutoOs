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
check '\b(TODO|FIXME|HACK)\b' 'TODO/FIXME novo (confirme se foi pedido)'

# Cor só por token (plano do redesign, regra 10): hex e cor fixa do Tailwind em linha nova de src/.
# COR_FORA: arquivos onde cor literal é legítima. Arquivo novo aqui precisa de justificativa no PR.
COR_FORA=(
  src/index.css                                 # definição dos tokens
  src/lib/pdf-service.ts                        # PDF impresso, sem tema
  src/lib/email-service.ts                      # HTML de e-mail, sem tema
  src/lib/email-orcamento-portal.ts             # HTML de e-mail, sem tema
  src/lib/orcamento-insumos.ts                  # texto/HTML de envio do orçamento
  src/lib/profile-appearance.ts                 # cores escolhidas para o avatar do perfil
  src/components/perfil/AppearancePicker.tsx    # amostras das cores do avatar
  src/lib/equipamento-imagem-utils.ts           # desenho em canvas da foto
  src/components/equipamentos/PdfPreviewDialog.tsx  # papel branco da prévia do PDF
  src/components/ui/dialog.tsx                  # véu do modal, igual nos dois temas
  src/components/ui/alert-dialog.tsx            # véu do modal, igual nos dois temas
)
excluir_cor=()
for arquivo in "${COR_FORA[@]}"; do excluir_cor+=(":!$arquivo"); done
cor=$(git diff "$BASE" -U0 -- src "${excluir_cor[@]}" ':!*.test.ts' ':!*.test.tsx' \
  | grep -E '^\+[^+]' \
  | grep -E '(^|[^&[:alnum:]_/-])#([0-9a-fA-F]{6}([0-9a-fA-F]{2})?|[0-9a-fA-F]{0,2}[a-fA-F][0-9a-fA-F]{0,2})\b|\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|shadow|decoration|accent|caret)-(red|blue|green|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\b|\b(bg|text|border)-(white|black)\b' || true)
[ -n "$cor" ] && { report 'cor fixa (hex ou cor do Tailwind) fora dos tokens'; printf '%s\n' "$cor" | head -5; }

# invoke() fora de lib/db.ts
inv=$(git diff "$BASE" -U0 -- src ':!src/lib/db.ts' ':!e2e' | grep -E '^\+[^+].*\binvoke\(' || true)
[ -n "$inv" ] && { report 'invoke() fora de src/lib/db.ts'; printf '%s\n' "$inv" | head -5; }

# Migration já existente editada
mig=$(git diff "$BASE" --name-only --diff-filter=MD -- src-tauri/migrations || true)
[ -n "$mig" ] && { report 'migration existente alterada ou removida'; echo "$mig"; }

# Arquivos fora do escopo: o orquestrador compara esta lista com o plano
echo "--- arquivos alterados (compare com o plano) ---"
git diff "$BASE" --stat | tail -n 50

[ "$fail" -eq 0 ] && echo "PASSA (checagens mecânicas). Rode também: npm run lint && npm run test:run"
exit "$fail"
