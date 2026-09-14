# Tickets e ondas do AutoOS

Este diretório organiza mudanças em tarefas pequenas, com dependências explícitas.

## Regra simples

1. Primeiro, transforme uma feature em tickets no `workflow.json`.
2. Depois, implemente somente tickets que aparecem como `PRONTA`.
3. Cada ticket usa uma worktree e uma branch próprias, criadas exclusivamente a partir de `origin/feature`.
4. O agente executa testes e deixa um PR pronto; o merge é sempre humano.
5. Somente após validação e promoção humana as mudanças seguem de `feature` para `master`, que representa a linha usada em produção.
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

`baseBranch` deve permanecer `origin/feature` e `promotionTarget` deve permanecer `origin/master`. O script recusa outra configuração; `master` só recebe mudanças por promoção humana depois dos testes e da revisão.

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
