# AutoOS Workflow

Painel visual local e publicação estática do `.workflow/workflow.json`.

## Abrir para acompanhar e editar

Na raiz do AutoOS:

```bash
npm run workflow:dashboard
```

Abra `http://127.0.0.1:4173`. Nesse modo, o painel lê o `workflow.json` da worktree principal `feature`, permite mudar status e acrescenta eventos em `.workflow/events.jsonl`.

O servidor escuta somente em `127.0.0.1`. A atualização grava o JSON com lock e troca atômica; não executa merge, push ou alteração no banco.

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

O workflow `.github/workflows/workflow-dashboard.yml` copia o JSON e os eventos para um artefato estático e publica a visão no GitHub Pages. A página pública não recebe tokens e não grava no repositório.

O painel permanece publicado em `https://ph66ng2.github.io/AutoOs/`. O atalho `https://phmedeiros.dev/workflow/`, mantido pelo site principal, redireciona para esse endereço sem exigir configuração adicional de DNS.

Na versão pública, uma mudança de status abre um Issue pré-preenchido. O workflow `workflow-status-request.yml` valida a solicitação, cria um PR para `feature` e deixa a integração para revisão humana.
