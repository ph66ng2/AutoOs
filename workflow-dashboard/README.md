# AutoOS Workflow

Painel visual local e publicação estática do `.workflow/workflow.json`.

## Projetos no mesmo painel

As abas `AutoOS` e `AutoBO` usam o mesmo painel, mas nunca misturam tickets ou dependências. O AutoOS continua lendo a fonte local e pode ser editado no modo local. O AutoBO aparece como um espelho somente leitura do seu repositório privado.

Na publicação do GitHub Pages, a Action baixa somente `AutoBO/.workflow/workflow.json` usando o segredo `AUTOBO_WORKFLOW_READ_TOKEN`, valida o conteúdo e gera o espelho estático. O token e o restante do repositório privado nunca entram no artefato público.

Para validar ou atualizar o espelho localmente a partir de uma cópia do AutoBO, execute na raiz do AutoOS:

```bash
npm run workflow:dashboard:sync-autobo
```

O comando valida o formato e recusa campos cujo nome pareça conter segredo. Ele só atualiza `workflow-dashboard/data/autobo-workflow.json`. Para usar outro caminho local, defina `AUTOBO_WORKFLOW_SOURCE` com o caminho absoluto do `workflow.json`.

## Abrir para acompanhar e editar

Na raiz do AutoOS:

```bash
npm run workflow:dashboard
```

Abra `http://127.0.0.1:4173`. Nesse modo, o painel lê o `workflow.json` da worktree principal `feature`, permite mudar status e acrescenta eventos em `.workflow/events.jsonl`.

O servidor escuta somente em `127.0.0.1`. A atualização grava o JSON com lock e troca atômica; não executa merge, push ou alteração no banco.

O site tem três páginas: **Visão geral** (`#overview`), **Kanban** (`#board`) e **Atividade** (`#activity`). O quadro é um Kanban por estado (`Pode começar`, `Em curso`, `Revisão`, `Na fila`, `Feito`). Os chips de foco (SaaS, Interface, Correções, Atualização) filtram a rota. No Kanban, a aba **Caminho** mostra a ordem recomendada daquele foco. `?foco=interface` abre direto na página do Kanban.

## Relatar progresso como agente

```bash
npm run workflow:report -- start AO-PS-005 "Iniciei a configuração"
npm run workflow:report -- progress AO-PS-005 "Conexão staging validada"
npm run workflow:report -- test AO-PS-005 "Teste A/B passou"
npm run workflow:report -- review AO-PS-005 "PR pronto para revisão"
npm run workflow:report -- block AO-PS-005 "Aguardando credencial"
npm run workflow:report -- merged AO-PS-005 "Merge humano confirmado"
```

O relatório encontra a worktree principal automaticamente, registra branch e commit atuais e usa o mesmo lock do painel. `in_progress` é recusado enquanto houver dependência não mesclada.

## Publicação no GitHub

O workflow `.github/workflows/workflow-dashboard.yml` copia o JSON e os eventos para um artefato estático e publica a visão no GitHub Pages. Ele também recebe o evento `autobo-workflow-updated`, preparado para uma Action do AutoBO solicitar a atualização quando seu workflow mudar. A página pública não recebe tokens e não grava no repositório.

O painel permanece publicado em `https://ph66ng2.github.io/AutoOs/`. O atalho `https://phmedeiros.dev/workflow/`, mantido pelo site principal, redireciona para esse endereço sem exigir configuração adicional de DNS.

Na versão pública, uma mudança de status abre um Issue pré-preenchido. O workflow `workflow-status-request.yml` valida a solicitação, cria um PR para `feature` e deixa a integração para revisão humana.
