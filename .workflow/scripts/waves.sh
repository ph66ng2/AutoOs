#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Uso: %s {plan|spawn} .workflow/workflow.json [TICKET-ID]\n' "${0##*/}" >&2
  exit 64
}

[[ $# -ge 2 ]] || usage
command="$1"
workflow="$2"
[[ -f "$workflow" ]] || { printf 'Arquivo não encontrado: %s\n' "$workflow" >&2; exit 66; }
jq -e '.tickets | type == "array"' "$workflow" >/dev/null || { printf 'workflow.json inválido: tickets deve ser um array.\n' >&2; exit 65; }

case "$command" in
  plan)
    jq -r '
      .tickets as $tickets |
      $tickets[] |
      select(.status != "merged") |
      . as $ticket |
      [ .blockedBy[]? as $blocker |
        ($tickets[] | select(.id == $blocker) | .status) // "missing"
      ] as $states |
      if .status != "ready" then
        "EM_\(.status | ascii_upcase)\t\(.id)\t\(.title)"
      elif ($states | length == 0 or all($states[]; . == "merged")) then
        "PRONTA\t\(.id)\t\(.title)"
      else
        "BLOQUEADA\t\(.id)\t\(.title)\tpor: \(.blockedBy | join(", "))"
      end
    ' "$workflow" | sort
    ;;
  spawn)
    [[ $# -eq 3 ]] || usage
    ticket_id="$3"
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf 'Execute dentro de um repositório Git.\n' >&2; exit 69; }
    ticket_json=$(jq -ce --arg id "$ticket_id" '.tickets[] | select(.id == $id)' "$workflow") || { printf 'Ticket não encontrado: %s\n' "$ticket_id" >&2; exit 65; }
    status=$(jq -r '.status' <<<"$ticket_json")
    [[ "$status" == "ready" ]] || { printf 'Ticket %s não está ready (status: %s).\n' "$ticket_id" "$status" >&2; exit 65; }
    blockers_ok=$(jq -r --arg id "$ticket_id" '
      .tickets as $all |
      ($all[] | select(.id == $id) | .blockedBy) as $deps |
      all($deps[]?; . as $dependency |
        ($all[] | select(.id == $dependency) | .status) == "merged")
    ' "$workflow")
    [[ "$blockers_ok" == "true" ]] || { printf 'Ticket %s ainda tem bloqueadores não merged.\n' "$ticket_id" >&2; exit 65; }
    repo_root=$(git rev-parse --show-toplevel)
    safe_id=$(tr '[:upper:]' '[:lower:]' <<<"$ticket_id" | tr -cs 'a-z0-9' '-')
    branch="agent/$safe_id"
    target="$repo_root/../$(basename "$repo_root")-$safe_id"
    base_branch=$(jq -r '.baseBranch // "origin/master"' "$workflow")
    remote_name=${base_branch%%/*}
    remote_branch=${base_branch#*/}
    [[ "$remote_name" != "$base_branch" && -n "$remote_branch" ]] || {
      printf 'baseBranch deve ter formato remoto/branch, por exemplo origin/master.\n' >&2
      exit 65
    }
    git fetch "$remote_name" "$remote_branch"
    git worktree add -b "$branch" "$target" "$base_branch"
    printf 'Worktree criada: %s\nBranch: %s\n' "$target" "$branch"
    printf 'Abra essa worktree, implemente somente %s e deixe o resultado pronto para revisão.\n' "$ticket_id"
    ;;
  *) usage ;;
esac
