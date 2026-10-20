# CLAUDE.md

Leia `AGENTS.md` antes de começar. Ele é a fonte única das regras do projeto, incluindo o fluxo de fatiar, a checagem por comando e o filtro de lixo. Este arquivo só define o que é específico do Claude Code: qual modelo faz o quê.

## Sessão principal

Rode a sessão principal em **Sonnet** (ou Haiku para tarefas triviais). Ela conversa com o usuário e coordena, e cada mensagem dela consome cota. Rodar a sessão principal em Opus anula a economia do resto do fluxo.

## Roteamento

| Etapa | Subagente | Modelo |
|-------|-----------|--------|
| Plano fatiado | `fatiador` | Opus |
| Busca, leitura, levantamento | `executor-haiku` | Haiku |
| Fatia de implementação (padrão) | `executor-haiku` | Haiku |
| Fatia que o Haiku errou uma vez, ou marcada como multi-arquivo no plano | `executor-sonnet` | Sonnet |
| Checagem (lint, typecheck, testes) | nenhum: rode o comando | — |
| Filtro de lixo antes do QA | nenhum: rode `scripts/pre-qa-check.sh` | — |

Regras:

1. O Opus entra **uma vez por tarefa**: no plano. Não chame o Opus no meio da execução.
2. Na dúvida entre Haiku e Sonnet, use Haiku. Suba para Sonnet só depois de uma falha.
3. Se o Sonnet também falhar, a fatia volta para o `fatiador` ser cortada de novo. Não tente outra vez no Sonnet.
4. Se `scripts/pre-qa-check.sh` rejeitar, a fatia responsável volta para o `executor-haiku` com o motivo. Compare a lista de arquivos alterados que o script imprime com o plano: arquivo fora do plano também volta.
5. Passe para cada subagente só a fatia e o contexto dela, nunca a conversa inteira. Peça resultado resumido.
6. Mudança de uma linha: faça direto, sem subagente.
