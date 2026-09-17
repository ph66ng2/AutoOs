# workflow-rules

Regras portáveis de tickets e ondas. Extraídas de `.workflow` no branch `feature` do AutoOS, **sem tickets de produto, dashboard, CI ou código da aplicação**.

Use este kit em qualquer repositório: copie as regras, preencha o `workflow.json` do projeto e referencie a rule do Cursor.

## O que entra

- `.workflow/README.md` — regra simples, formato de ticket, testes, prompts
- `.workflow/schema.md` — contrato do JSON
- `.workflow/workflow.template.json` — JSON vazio, só protocolo e decisões de processo
- `.workflow/scripts/waves.sh` — `plan` e `spawn`
- `.cursor/rules/ticket-workflow.mdc` — rule para agentes no repo alvo
- `install.sh` — copia o kit para outro repositório

## O que não entra

- Tickets do AutoOS (nem exemplos copiados do produto)
- Painel visual, GitHub Pages, Issues de status
- Decisões de arquitetura SaaS/PowerSync/BMITAG

## Instalar em um repositório

```bash
git clone --branch cursor/workflow-rules-3575 --single-branch https://github.com/ph66ng2/AutoOs.git workflow-rules
./workflow-rules/install.sh /caminho/do/seu/repo
```

No repo alvo, edite `.workflow/workflow.json`: `project`, `baseBranch` e `promotionTarget`. Depois crie os tickets daquele projeto.

Dependência do planejador: `jq`.

## Comandos

```bash
.workflow/scripts/waves.sh plan .workflow/workflow.json
.workflow/scripts/waves.sh spawn .workflow/workflow.json PROJ-101
```

## Promover a um repositório GitHub próprio

Este conteúdo está numa branch órfã do AutoOS porque o agente não consegue criar repositórios na conta. Para ter um repo só de regras:

```bash
git clone --branch cursor/workflow-rules-3575 --single-branch https://github.com/ph66ng2/AutoOs.git workflow-rules
cd workflow-rules
gh repo create ph66ng2/workflow-rules --public --source . --remote origin --push
```

Depois, nos outros projetos:

```bash
git subtree add --prefix vendor/workflow-rules https://github.com/ph66ng2/workflow-rules.git main --squash
vendor/workflow-rules/install.sh .
```

Ou clone e rode `install.sh`.

## Testes do kit

```bash
./tests/validate.sh
```
