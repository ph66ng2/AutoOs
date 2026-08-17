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
jq -e '
  def nonempty_string: type == "string" and length > 0;
  def nonempty_strings: type == "array" and length > 0 and all(.[]; nonempty_string);
  (.baseBranch == "origin/feature") and
  (.promotionTarget == "origin/master") and
  (.tickets | type == "array") and
  (([.tickets[].id] | length) == ([.tickets[].id] | unique | length)) and
  all(.tickets[];
    (.id | nonempty_string) and
    (.title | nonempty_string) and
    (.status | IN("ready", "in_progress", "review", "merged", "blocked")) and
    (.blockedBy | type == "array") and
    (.context | nonempty_string) and
    (.scope | nonempty_strings) and
    (.outOfScope | nonempty_strings) and
    (.expectedBehavior | nonempty_string) and
    (.acceptanceCriteria | nonempty_strings) and
    (.tests | nonempty_strings) and
    (.likelyFiles | nonempty_strings) and
    (.risks | nonempty_strings) and
    (.testInstructions | type == "object") and
    (.testInstructions.prerequisites | nonempty_strings) and
    (.testInstructions.steps | nonempty_strings) and
    (.testInstructions.expectedResultAndEvidence | nonempty_strings) and
    (.testInstructions.dataImpact | nonempty_string) and
    (.testInstructions.cleanupAndRollback | nonempty_strings) and
    (.testInstructions.stagingRestrictions | nonempty_string)
  )
' "$workflow" >/dev/null || {
  printf 'workflow.json inválido: use origin/feature, promotionTarget origin/master e complete todos os campos obrigatórios, incluindo testInstructions.\n' >&2
  exit 65
}

jq -e '
  .tickets as $tickets |
  all($tickets[]; all(.blockedBy[]?; . as $dependency | any($tickets[]; .id == $dependency)))
' "$workflow" >/dev/null || {
  printf 'workflow.json inválido: existe blockedBy apontando para ticket ausente.\n' >&2
  exit 65
}

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
    base_branch=$(jq -r '.baseBranch' "$workflow")
    [[ "$base_branch" == "origin/feature" ]] || {
      printf 'Worktrees do AutoOS devem partir exclusivamente de origin/feature.\n' >&2
      exit 65
    }
    remote_name="origin"
    remote_branch="feature"
    git fetch "$remote_name" "$remote_branch"
    git worktree add -b "$branch" "$target" "$base_branch"
    printf 'Worktree criada: %s\nBranch: %s\n' "$target" "$branch"
    printf 'Abra essa worktree, implemente somente %s e deixe o resultado pronto para revisão.\n' "$ticket_id"
    ;;
  *) usage ;;
esac
