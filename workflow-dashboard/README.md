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

O site tem três páginas: **Visão geral** (`#overview`), **Kanban** (`#board`) e **Atividade** (`#activity`). O AutoOS abre por padrão em **Fiscal PROD**, com `AO-WF-RECONCILE-001` em revisão até o merge humano desta reconciliação; `AO-SUITE-001` é o próximo ticket de implementação. O quadro separa `Pode começar`, `Em curso`, `Revisão`, `Na fila`, `Fora do foco` e `Feito`. `Fora do foco` reúne adiados e escopos substituídos sem falsificar o status técnico. Os chips de foco filtram a rota; a aba **Caminho** mostra sua ordem. O histórico do PR #101 aparece em `AO-INS-ONLINE-001`. PowerSync é reservado ao futuro Mobile Field.

## Relatar progresso como agente

```bash
npm run workflow:report -- start AO-SUITE-001 "Iniciei a matriz de ownership"
npm run workflow:report -- progress AO-SUITE-001 "Exemplos de OS revisados"
npm run workflow:report -- test AO-SUITE-001 "Critérios conferidos"
npm run workflow:report -- review AO-SUITE-001 "PR pronto para revisão"
npm run workflow:report -- block AO-SUITE-001 "Aguardando decisão de autoridade"
npm run workflow:report -- merged AO-SUITE-001 "Merge humano confirmado"
```

O relatório encontra a worktree principal automaticamente, registra branch e commit atuais e usa o mesmo lock do painel. `in_progress` é recusado enquanto houver dependência não mesclada.

## Publicação no GitHub

O workflow `.github/workflows/workflow-dashboard.yml` copia o JSON e os eventos para um artefato estático e publica a visão no GitHub Pages. Ele também recebe o evento `autobo-workflow-updated`, preparado para uma Action do AutoBO solicitar a atualização quando seu workflow mudar. A página pública não recebe tokens e não grava no repositório.

O painel permanece publicado em `https://ph66ng2.github.io/AutoOs/`. O atalho `https://phmedeiros.dev/workflow/`, mantido pelo site principal, redireciona para esse endereço sem exigir configuração adicional de DNS.

Na versão pública, uma mudança de status abre um Issue pré-preenchido. O workflow `workflow-status-request.yml` valida a solicitação, cria um PR para `feature` e deixa a integração para revisão humana.
