# Tickets e ondas

Este diretório organiza mudanças em tarefas pequenas, com dependências explícitas.

Copie `workflow.template.json` para `workflow.json` no repositório de produto. O JSON de produto fica no projeto; este kit só define o contrato.

## Regra simples

1. Primeiro, transforme uma feature em tickets no `workflow.json`.
2. Depois, implemente somente tickets que aparecem como `PRONTA`.
3. Cada ticket usa uma worktree e uma branch próprias, criadas exclusivamente a partir de `baseBranch`.
4. O agente executa testes e deixa um PR pronto; o merge é sempre humano.
5. Somente após validação e promoção humana as mudanças seguem de `baseBranch` para `promotionTarget`, que representa a linha usada em produção.
6. Após o merge, mude o `status` do ticket para `merged` e rode o plano novamente.

## Comandos

```bash
# Ver quais tickets estão liberados ou bloqueados
.workflow/scripts/waves.sh plan .workflow/workflow.json

# Criar uma worktree para um ticket pronto
.workflow/scripts/waves.sh spawn .workflow/workflow.json PROJ-101
```

`baseBranch` e `promotionTarget` vêm do `workflow.json` (exemplo: `origin/feature` e `origin/master`). O script recusa outra forma que não `origin/<branch>`; a linha de produção só recebe mudanças por promoção humana depois dos testes e da revisão.

## Formato de ticket

Cada ticket deve ter `id`, `title`, `status`, `blockedBy`, `context`, `scope`, `outOfScope`, `expectedBehavior`, `acceptanceCriteria`, `tests`, `testInstructions`, `likelyFiles` e `risks`.

Não use tickets vagos. Antes de implementar, defina exatamente o que entra e o que fica fora do escopo.

Status permitidos: `ready`, `in_progress`, `review`, `merged`, `blocked`.

### Instruções de teste obrigatórias

Todo ticket novo ou modificado precisa incluir `testInstructions`: um roteiro reproduzível de como o agente testaria a mudança. O roteiro deve informar:

1. Pré-requisitos e ambiente permitido, incluindo branch/worktree, serviços externos e dados necessários.
2. Passos em ordem, com comandos e ações manuais quando aplicáveis.
3. Resultado esperado e evidência a guardar.
4. Impacto nos dados: somente leitura, criação temporária, alteração de dados existentes ou ação destrutiva.
5. Limpeza, rollback ou confirmação explícita antes de qualquer operação com impacto persistente.

Em staging, nunca use dados reais ou credenciais internas. Em bancos com dados operacionais, prefira testes manuais mínimos e dados temporários identificáveis; não rode smoke que altere estoque, perfis ou outros dados sensíveis sem autorização explícita.

O campo deve usar as chaves `prerequisites`, `steps`, `expectedResultAndEvidence`, `dataImpact`, `cleanupAndRollback` e `stagingRestrictions`. O planejador valida esse contrato antes de listar ou criar qualquer worktree.

## Registro de progresso

Todo agente deve registrar o ciclo do ticket no workflow compartilhado do repositório de produto. Use somente o comando correspondente ao evento real:

- `start` ao começar
- `progress` durante a implementação
- `test` após os checks
- `review` ao abrir o PR
- `block` quando não puder avançar
- `merged` somente depois da confirmação humana

O título ou corpo do PR deve conter o ID do ticket. Não inclua credenciais, dados internos ou tokens nos resumos e evidências.

## Prompts úteis

Para criar tickets:

```text
Transforme este plano em tickets no arquivo .workflow/workflow.json.
Defina escopo, critérios de aceite, testes, testInstructions reproduzíveis, riscos e blockedBy. Não implemente nada ainda.
```

Para executar um ticket:

```text
Implemente o ticket PROJ-101 seguindo .workflow/workflow.json e as instruções do repositório.
Trabalhe somente nesse escopo, rode os testes relevantes e não faça merge.
```
