# Tickets e ondas do AutoOS

Este diretório organiza mudanças em tarefas pequenas, com dependências explícitas.

**Foco atual:** uma OS real da BMITAG chegar ao [Fiscal PROD](https://github.com/ph66ng2/AutoPlatform/blob/main/.workflow/FISCAL_PROD_ROADMAP.md). AutoOS mantém a operação, produz `FatoComercial` v2 e oferece fila, revisão, retorno, documentos e histórico. AutoPlatform implementa contrato, ingestão e emissão. AutoBO é fonte de código e regras. O campo `roadmap` identifica tickets ativos e adiados; prioridade não altera status.

**Próximo ticket AutoOS: `AO-SUITE-002`, na linha `master`.** `AO-SUITE-001` foi concluído e o [ADR 0001](../docs/adr/0001-ownership-core-autoos-fiscal.md) foi aceito em 20/10/2026. Os roadmaps iniciais foram mesclados nos PRs [AutoOS #102](https://github.com/ph66ng2/AutoOs/pull/102), [AutoPlatform #10](https://github.com/ph66ng2/AutoPlatform/pull/10) e [AutoBO #9](https://github.com/ph66ng2/AutoBO/pull/9). `AO-WF-RECONCILE-001` foi concluído pelo [PR #103](https://github.com/ph66ng2/AutoOs/pull/103), mesclado na `feature`. O [PR #101](https://github.com/ph66ng2/AutoOs/pull/101) entregou Insumos Online e agora está registrado como `AO-INS-ONLINE-001`; não é um pré-requisito para retomar a trilha Fiscal. A [reconciliação de PRs e tickets](../docs/WORKFLOW_RECONCILIATION.md) mostra os demais vínculos e lacunas.

O contrato `AP-CONTRACT-002` foi entregue no [AutoPlatform #11](https://github.com/ph66ng2/AutoPlatform/pull/11) e registrado como `merged` no [AutoPlatform #12](https://github.com/ph66ng2/AutoPlatform/pull/12). Com `AO-SUITE-001` também `merged`, a condição de entrada do `AO-SUITE-002` foi revisada e o ticket está `ready` para implementação na `master`. O ADR 0001 aceito está na `feature` e deve orientar essa implementação; ele ainda não consta na `master`. A matriz contábil `AP-FISC-ACCOUNTING-EXT-001` continua necessária para a configuração fiscal posterior, não para produzir o fato v2. `AO-FISC-GATE-001` permanece `blocked` até o gate backend externo ser confirmado. `externalPrerequisites` é informativo: o planejador local ainda não aplica bloqueadores de outros repositórios. PowerSync fica reservado ao futuro Mobile Field; desktop AutoOS segue Online.

## Regra simples

1. Primeiro, transforme uma feature em tickets no `workflow.json`.
2. Depois, implemente somente tickets que aparecem como `PRONTA`.
3. Cada ticket usa uma worktree e uma branch próprias, criadas pelo `spawn` a partir da base do ticket: `origin/master` para o produto interno BMITAG (tickets com `"baseBranch": "origin/master"`, hoje `AO-SUITE-*` e `AO-FISC-*`) e `origin/feature` para o SaaS (padrão).
4. O agente executa testes e deixa um PR pronto; o merge é sempre humano.
5. O PR vai para a mesma branch de onde o ticket partiu. `master` é integrada na `feature` toda semana; `feature` não é mesclada na `master` antes da virada para o SaaS.
6. Após o merge, mude o `status` do ticket para `merged` e rode o plano novamente.

## Comandos

```bash
# Ver quais tickets estão liberados ou bloqueados
.workflow/scripts/waves.sh plan .workflow/workflow.json

# Criar uma worktree para um ticket pronto
.workflow/scripts/waves.sh spawn .workflow/workflow.json AO-101
```

## Formato de ticket

Cada ticket deve ter `id`, `title`, `status`, `blockedBy`, `context`, `scope`, `outOfScope`, `expectedBehavior`, `acceptanceCriteria`, `tests`, `testInstructions`, `likelyFiles` e `risks`.

Não use tickets vagos. Antes de implementar, defina exatamente o que entra e o que fica fora do escopo.

### Instruções de teste obrigatórias

Todo ticket novo ou modificado precisa incluir `testInstructions`: um roteiro reproduzível de como o agente testaria a mudança. O roteiro deve informar:

1. Pré-requisitos e ambiente permitido, incluindo branch/worktree, serviços externos e dados necessários.
2. Passos em ordem, com comandos e ações manuais quando aplicáveis.
3. Resultado esperado e evidência a guardar.
4. Impacto nos dados: somente leitura, criação temporária, alteração de dados existentes ou ação destrutiva.
5. Limpeza, rollback ou confirmação explícita antes de qualquer operação com impacto persistente.

Em staging, nunca use dados reais ou credenciais internas. Em bancos com dados operacionais, prefira testes manuais mínimos e dados temporários identificáveis; não rode smoke que altere estoque, perfis ou outros dados sensíveis sem autorização explícita.

O campo deve usar as chaves `prerequisites`, `steps`, `expectedResultAndEvidence`, `dataImpact`, `cleanupAndRollback` e `stagingRestrictions`. O planejador valida esse contrato antes de listar ou criar qualquer worktree.

No topo do arquivo, `baseBranch` e `targetBranch` são `origin/feature` (padrão SaaS) e `internalBaseBranch` é `origin/master`; `promotionTarget` não existe mais. Um ticket pode declarar `baseBranch` somente como `origin/feature` ou `origin/master`; o script recusa outro valor. O `plan` mostra a base de cada ticket `PRONTA`.

A `master` não tem `.workflow/` nem `scripts/workflow-report.mjs`. Em ticket da `master`, rode o registro de progresso a partir do checkout da `feature`, de dentro da worktree do ticket, com o comando que o `spawn` imprime (`node <checkout-feature>/scripts/workflow-report.mjs <evento> <ID> "resumo"`); ele grava o branch e o commit da worktree do ticket.

## Registro de progresso

Todo agente deve registrar o ciclo do ticket no workflow compartilhado. O comando encontra a worktree principal automaticamente, grava branch e commit atuais e usa lock para permitir agentes simultâneos:

```bash
npm run workflow:report -- start AO-101 "Iniciei o trabalho"
npm run workflow:report -- progress AO-101 "Implementação em andamento"
npm run workflow:report -- test AO-101 "Teste direcionado passou"
npm run workflow:report -- review AO-101 "PR pronto para revisão"
npm run workflow:report -- block AO-101 "Motivo exato do bloqueio"
npm run workflow:report -- merged AO-101 "Merge humano confirmado"
```

Use somente o comando correspondente ao evento real. O agente deve registrar `start` ao começar, `test` após os checks, `review` ao abrir o PR, `block` quando não puder avançar e `merged` somente depois da confirmação humana. O título ou corpo do PR deve conter o ID do ticket para a linha do tempo do GitHub conseguir relacioná-lo. Não inclua credenciais, dados internos ou tokens nos resumos e evidências.

## Prompts úteis

Para criar tickets:

```text
Transforme este plano em tickets do AutoOS no arquivo .workflow/workflow.json.
Defina escopo, critérios de aceite, testes, testInstructions reproduzíveis, riscos e blockedBy. Não implemente nada ainda.
```

Para executar um ticket:

```text
Implemente o ticket AO-101 seguindo .workflow/workflow.json e as instruções do repositório.
Trabalhe somente nesse escopo, rode os testes relevantes e não faça merge.
```
