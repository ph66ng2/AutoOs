# CLAUDE.md

@AGENTS.md

Este arquivo só define o que é específico do Claude Code: qual modelo e qual effort fazem o quê. As regras do projeto estão no AGENTS.md importado acima. Base: [Which Claude model should you build with?](https://claude.dev/blog/which-claude-model-should-you-build-with/).

## Sessão principal

Rode a sessão principal em **Opus 5.5 com effort `medium`** (padrão do Claude Code). Ela conversa com o usuário, decide e **edita o código**. Confira com `/effort` e `/model`.

> No plano Pro, Opus como padrão consome a cota mais rápido que Sonnet. Se a cota apertar, use Sonnet 5.5 (`medium`) para tarefas bem especificadas, mantendo o contexto curto.

## Escada: effort antes de modelo

Quando o resultado não está bom, suba nesta ordem:

1. **Dê um jeito de o modelo se verificar**: teste, lint, build ou script. Costuma render mais que subir effort.
2. **Suba o effort um nível** (`medium` → `high`). Mais effort faz pensar e checar mais, mas não dá conhecimento que o modelo não tem.
3. **Suba para o próximo modelo**, começando num effort mais baixo que o usado antes.

Não vá além de `high` no Opus sem antes testar o Fable num effort menor: o nível seguinte pode custar tanto quanto um modelo maior. Em tarefas verificáveis por comando, rode em `low` e repita em `high` só o que falhou.

## Quando usar cada modelo

| Tarefa | Modelo | Effort inicial |
|--------|--------|----------------|
| Engenharia do dia a dia, debug, feature em vários PRs | Opus 5.5 (sessão principal) | `medium`, depois `high` |
| Correção ou feature bem especificada, fatias independentes | Sonnet 5.5 (`executor-sonnet`, opcional) | `medium`, `high` se difícil |
| Busca, leitura de log, resumo, classificação | Haiku 5.5 (`leitor-haiku`) | padrão |
| Refatoração/migração grande, planejamento de arquitetura, pesquisa profunda | **Fable 5.2** | `medium`, depois `high` |

**Fable 5.2 só para tarefa realmente difícil** (custa o dobro do Opus por token). Antes de levar o Opus acima de `high`, tente o Fable em `high`.

## Subagentes

| Etapa | Subagente | Modelo |
|-------|-----------|--------|
| Plano fatiado | `fatiador` | Opus (`fable` se for arquitetura/migração) |
| Busca, leitura, resumo, classificação | `leitor-haiku` | Haiku, somente leitura |
| Fatia especificada, várias em paralelo (opcional) | `executor-sonnet` | Sonnet |
| Edição de código, julgamento, fatia com decisão | nenhum: a sessão principal | Opus |
| Checagem (lint, typecheck, testes) | nenhum: rode o comando | — |
| Filtro de lixo antes do QA | nenhum: rode `scripts/pre-qa-check.sh` | — |

Regras:

1. **Edição de código nunca vai para Haiku.** Haiku só faz tarefa lateral em que um erro é fácil de notar.
2. O `fatiador` roda **uma vez por tarefa**, no plano. Não o chame no meio da execução.
3. Se o `executor-sonnet` falhar uma vez, a sessão principal assume a fatia (subindo o effort se preciso). Se ainda falhar, a fatia volta para o `fatiador` ser cortada de novo.
4. Se `scripts/pre-qa-check.sh` rejeitar, a fatia responsável é refeita com o motivo. Compare a lista de arquivos alterados que o script imprime com o plano: arquivo fora do plano também volta.
5. Passe para cada subagente só a fatia e o contexto dela, nunca a conversa inteira. Peça resultado resumido. Mantenha enxuto o contexto do modelo caro e deixe a leitura verbosa para o `leitor-haiku`.
6. Troque de modelo em pontos naturais da conversa (o cache de prompt é por modelo); use `/compact` antes de trocar.
7. Mudança de uma linha: faça direto, sem subagente.
8. Antes de executar qualquer plano com mais de uma fatia, mostre as fatias ao usuário e espere a confirmação dele. Não delegue para `executor-sonnet` sem o OK.
9. Não use o alias `opusplan`: ele põe as edições no Sonnet.
