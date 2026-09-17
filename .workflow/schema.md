# Contrato de `workflow.json`

Arquivo de produto, não deste kit. Copie `workflow.template.json` para `.workflow/workflow.json` no repositório alvo.

## Raiz

| Campo | Regra |
| --- | --- |
| `project` | Nome do repositório ou iniciativa. |
| `baseBranch` | Ref `origin/<branch>` de onde toda worktree nasce. |
| `promotionTarget` | Ref `origin/<branch>` de produção. Distinta de `baseBranch`. Só recebe promoção humana. |
| `architectureDecisions` | Decisões do projeto. Não substituem o contrato dos tickets. |
| `ticketTestProtocol` | Protocolo de teste. Tickets novos ou alterados devem cumprir `schema`. |
| `tickets` | Lista de tickets do **projeto**. Este kit não carrega tickets de produto. |

## Ticket

Campos obrigatórios: `id`, `title`, `status`, `blockedBy`, `context`, `scope`, `outOfScope`, `expectedBehavior`, `acceptanceCriteria`, `tests`, `testInstructions`, `likelyFiles`, `risks`.

`status`: `ready` | `in_progress` | `review` | `merged` | `blocked`.

`blockedBy`: array de IDs que existem no mesmo arquivo.

`testInstructions`:

- `prerequisites`
- `steps`
- `expectedResultAndEvidence`
- `dataImpact`
- `cleanupAndRollback`
- `stagingRestrictions`

Listas de texto não podem ser vazias. O planejador recusa o arquivo se faltar qualquer campo.
