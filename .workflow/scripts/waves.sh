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
  (.targetBranch == "origin/feature") and
  (.internalBaseBranch == "origin/master") and
  (has("promotionTarget") | not) and
  (.tickets | type == "array") and
  (([.tickets[].id] | length) == ([.tickets[].id] | unique | length)) and
  all(.tickets[];
    (.id | nonempty_string) and
    (.title | nonempty_string) and
    (.status | IN("ready", "in_progress", "review", "merged", "blocked")) and
    ((.baseBranch // "origin/feature") | IN("origin/feature", "origin/master")) and
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
  printf 'workflow.json inválido: use baseBranch/targetBranch origin/feature, internalBaseBranch origin/master, baseBranch de ticket origin/feature ou origin/master, e complete todos os campos obrigatórios, incluindo testInstructions.\n' >&2
  exit 65
}

jq -e '
  .tickets as $tickets |
  all($tickets[]; all(.blockedBy[]?; . as $dependency | any($tickets[]; .id == $dependency)))
' "$workflow" >/dev/null || {
  printf 'workflow.json inválido: existe blockedBy apontando para ticket ausente.\n' >&2
  exit 65
}

jq -e '
  . as $workflow |
  [.roadmap.focusIds[], .roadmap.deferredIds[], .roadmap.supersededIds[]] as $classified |
  ($classified | length) == ($classified | unique | length) and
  all($classified[]; . as $id | any($workflow.tickets[]; .id == $id))
' "$workflow" >/dev/null || {
  printf 'workflow.json inválido: roadmap repete IDs ou aponta para ticket ausente.\n' >&2
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
      if .id as $id | ($roadmap.supersededIds // [] | index($id)) != null then
        "SUBSTITUIDA\t\(.id)\t\(.title)"
      elif .id as $id | ($roadmap.deferredIds // [] | index($id)) != null then
        "ADIADA\t\(.id)\t\(.title)"
      elif .status != "ready" then
        "EM_\(.status | ascii_upcase)\t\(.id)\t\(.title)"
      elif ($states | length == 0 or all($states[]; . == "merged")) then
        "PRONTA\t\(.id)\t\(.title)\tbase: \(.baseBranch // "origin/feature")"
      else
        "BLOQUEADA\t\(.id)\t\(.title)\tpor: \(.blockedBy | join(", "))"
      end
    ' --argjson roadmap "$(jq '.roadmap' "$workflow")" "$workflow" | sort
    ;;
  spawn)
    [[ $# -eq 3 ]] || usage
    ticket_id="$3"
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf 'Execute dentro de um repositório Git.\n' >&2; exit 69; }
    ticket_json=$(jq -ce --arg id "$ticket_id" '.tickets[] | select(.id == $id)' "$workflow") || { printf 'Ticket não encontrado: %s\n' "$ticket_id" >&2; exit 65; }
    priority=$(jq -r --arg id "$ticket_id" 'if (.roadmap.supersededIds // [] | index($id)) != null then "substituída" elif (.roadmap.deferredIds // [] | index($id)) != null then "adiada" else "ativa" end' "$workflow")
    [[ "$priority" == "ativa" ]] || { printf 'Ticket %s tem prioridade %s no roadmap; revise o plano antes de spawnar.\n' "$ticket_id" "$priority" >&2; exit 65; }
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
    base_branch=$(jq -r --arg default "$(jq -r '.baseBranch' "$workflow")" '.baseBranch // $default' <<<"$ticket_json")
    case "$base_branch" in
      origin/feature|origin/master) ;;
      *) printf 'Ticket %s: baseBranch deve ser origin/feature ou origin/master.\n' "$ticket_id" >&2; exit 65 ;;
    esac
    remote_name="origin"
    remote_branch="${base_branch#origin/}"
    git fetch "$remote_name" "$remote_branch"
    git worktree add -b "$branch" "$target" "$base_branch"
    printf 'Worktree criada: %s\nBranch: %s\nBase: %s (abra o PR para %s)\n' "$target" "$branch" "$base_branch" "$remote_branch"
    printf 'Abra essa worktree, implemente somente %s e deixe o resultado pronto para revisão.\n' "$ticket_id"
    if [[ "$remote_branch" == "master" ]]; then
      workflow_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
      printf 'A master não tem o registro de progresso; rode-o a partir do checkout da feature, de dentro desta worktree:\n  node %s/scripts/workflow-report.mjs start %s "resumo"\n' "$workflow_root" "$ticket_id"
    fi
    ;;
  *) usage ;;
esac
