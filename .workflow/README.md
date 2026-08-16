# Tickets e ondas do AutoOS

Este diretório organiza mudanças em tarefas pequenas, com dependências explícitas.

## Regra simples

1. Primeiro, transforme uma feature em tickets no `workflow.json`.
2. Depois, implemente somente tickets que aparecem como `PRONTA`.
3. Cada ticket usa uma worktree e uma branch próprias, criadas a partir de `origin/master`.
4. O agente executa testes e deixa um PR pronto; o merge é sempre humano.
5. Após o merge, mude o `status` do ticket para `merged` e rode o plano novamente.

## Comandos

```bash
# Ver quais tickets estão liberados ou bloqueados
.workflow/scripts/waves.sh plan .workflow/workflow.json

# Criar uma worktree para um ticket pronto
.workflow/scripts/waves.sh spawn .workflow/workflow.json AO-101
```

## Formato de ticket

Cada ticket deve ter `id`, `title`, `status` (`ready` ou `merged`), `blockedBy`, `context`, `scope`, `acceptanceCriteria` e `tests`.

Não use tickets vagos. Antes de implementar, defina exatamente o que entra e o que fica fora do escopo.

## Prompts úteis

Para criar tickets:

```text
Transforme este plano em tickets do AutoOS no arquivo .workflow/workflow.json.
Defina escopo, critérios de aceite, testes e blockedBy. Não implemente nada ainda.
```

Para executar um ticket:

```text
Implemente o ticket AO-101 seguindo .workflow/workflow.json e as instruções do repositório.
Trabalhe somente nesse escopo, rode os testes relevantes e não faça merge.
```
