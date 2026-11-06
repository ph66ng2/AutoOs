# Diagnóstico: atualização de equipamentos

Data: 27/10/2026. Base funcional: master `bbb9efb`, com as otimizações de carregamento na branch `perf/desktop-load`. Os arquivos do fluxo de atualização analisado não foram alterados por esta rodada.

## O que foi medido, e o que não foi

1. Hook React **real** `useEquipamentos` executado em jsdom, com a ponte `db` simulada. Dez amostras de cada combinação (editar/status × atraso 0/50/150 ms por chamada): 60 operações medidas. Cada operação confere que o novo dado chegou ao estado React. O relógio termina depois de `act` concluir, sem incluir layout/pintura de navegador.
2. JSON de fixtures sintéticas com o mesmo formato de `EquipamentoImagemInput`, inclusive o campo `storage_path` contendo data URL. Vinte amostras por fixture, após uma passagem de aquecimento. Isso mede tamanho/serialização JS, não compressão JPEG, Rust/Serde, tráfego real ou tempo do banco.
3. Rastreamento estático de SQL e do fluxo da tela. Contagem de consultas não é medição de tempo, plano de execução nem evidência de índice lento.

Não há PostgreSQL/cliente psql ou toolchain Tauri/Rust disponíveis neste ambiente. Não foi usado acesso ao banco de produção, nem foram alterados equipamentos reais. Portanto, **não há número medido de latência ponta a ponta Tauri + PostgreSQL**, nem estimativa de ganho percentual real de salvamento.

## Hook: salvar e refletir na lista

| Atraso artificial por comando IPC | Operação | Mediana total até estado React atualizado | Mediana aguardando o mock |
|---|---|---:|---:|
| 0 ms | Editar equipamento | 0.34 ms | 0.02 ms |
| 0 ms | Alterar status | 0.18 ms | 0.01 ms |
| 50 ms | Editar equipamento | 101.37 ms | 100.59 ms |
| 50 ms | Alterar status | 101.08 ms | 100.60 ms |
| 150 ms | Editar equipamento | 301.31 ms | 300.73 ms |
| 150 ms | Alterar status | 301.38 ms | 300.76 ms |

Em todas as 60 operações houve **duas chamadas IPC sequenciais**: escrita → nova consulta da página. A latência 150 ms resulta em aproximadamente 300 ms por construção do cenário. Não são dois round-trips PostgreSQL: cada comando Tauri executa várias consultas internamente. O resultado com atraso zero mostra apenas o baixo custo deste hook isolado, não o custo de renderizar a página completa ou salvar fotos.

A recarga usa `loading=true`; a página substitui a tabela inteira por um spinner enquanto espera. A atualização em segundo plano já existe no hook para eventos do portal, mas não é o caminho usado pelas mutações comuns.

## Fotos: custo de payload confirmado

`arquivoParaImagemEquipamento` redimensiona para até 1600 px e gera JPEG qualidade 0,82 via `canvas.toDataURL`. O texto inteiro é armazenado em `storage_path`. `imagemPersistidaParaDraft` preserva esse valor ao abrir uma edição. `onSubmit` envia novamente todos os drafts para `substituirImagensEquipamento`, mesmo se apenas uma observação do equipamento mudou.

Alguns registros podem conter uma URL curta em vez de data URL. Os números abaixo representam **cenários sintéticos de fotos já codificadas**, não uma análise das fotos reais da empresa ou do tamanho típico delas.

| Quantidade de fotos | Bytes binários por foto antes de Base64 | Tamanho real do JSON da requisição | Stringify p50 / p95 (Node) | Parse p50 / p95 (Node) |
|---:|---:|---:|---:|---:|
| 3 | 262,144 B | 1,049,152 B | 2.03 / 2.71 ms | 0.97 / 1.89 ms |
| 6 | 262,144 B | 2,098,273 B | 5.29 / 8.50 ms | 2.06 / 6.58 ms |
| 3 | 1,048,576 B | 4,194,883 B | 8.52 / 13.43 ms | 4.19 / 8.52 ms |
| 6 | 1,048,576 B | 8,389,735 B | 19.68 / 29.60 ms | 9.21 / 28.28 ms |

A escrita apaga as linhas de imagens e faz um INSERT por foto, depois retorna a lista completa de imagens, incluindo `storage_path`. A tela ignora essa resposta. Assim, além do envio, o conteúdo pode voltar na resposta sem uso. Os 8.389.735 B do maior cenário são **somente a requisição**. Não se trata de um upload binário separado: é texto Base64 dentro do JSON/coluna. Tempos de serialização dependem do host/GC e não devem ser tratados como tempo de produção.

## Operações SQL no caminho crítico — contagem estática

Cenário de referência: edição comum em RECEBIDO, cliente válido, com ou sem contato responsável. Não inclui ações financeiras especiais, concorrência/falhas, aquisição de conexão ou consultas disparadas por outras telas.

| Trecho | Operações SQL aguardadas em sequência |
|---|---:|
| Validação de status/permissão não financeira | 2 (empresa + status atual) |
| Escrita: resolver empresa, validar cliente, contato opcional, UPDATE, buscar registro com empresa | 5–6 |
| Recarregar página: empresa + COUNT + itens | 3 |
| Subtotal dados/lista | **10–11** |
| Substituir imagens: validar existência, BEGIN, DELETE, N INSERTs, COMMIT, listar imagens | **N + 5** |
| Total com seis fotos | **21–22** |

Mudança simples de status por ação rápida tem aproximadamente **9 consultas aguardadas**, incluindo auditoria e recarga, antes de eventuais operações extras de fluxos de orçamento/entrega. A auditoria atual é aguardada; não deve ser removida para reduzir tempo.

A listagem executa `COUNT(*)` e SELECT da página, em sequência, com os mesmos filtros. Busca usa vários `ILIKE '%termo%'` e um EXISTS no cliente. A ordenação padrão usa `GREATEST` de atividade do técnico/cliente. Há índices por empresa/status/cliente, mas não foi encontrado índice que corresponda a essa ordenação ou trigram nas migrations inspecionadas. Isso é **candidato para EXPLAIN**, não prova de que um novo índice melhorará a produção. Não foi aplicada migration.

## Problemas de consistência reproduzidos

- **Resposta antiga pode vencer a nova:** o cenário inicia a consulta do filtro antigo, muda o filtro, recebe o resultado novo e só depois libera o resultado antigo. O hook termina mostrando o resultado antigo (`staleResponseOverwritesNewerFilter: true`). `carregar()` não verifica uma geração da requisição antes de publicar seu resultado.
- **Salvar pode confirmar sucesso com a lista desatualizada:** após a escrita retornar sucesso, a consulta da lista falha. `carregar()` captura o erro sem rejeitar; `atualizar()` retorna sucesso, o hook disponibiliza `error`, mas preserva a lista antiga. A página de Equipamentos não recebe esse campo `error` na desestruturação. O teste registra sucesso da escrita e o serial antigo ainda exibido. Não significa que o banco perdeu o salvamento; falta separar claramente “salvo” de “não consegui atualizar a visualização”.
- Edições comuns feitas em outro computador não têm notificação automática geral no caminho analisado. O polling de 30 s é de alertas do portal. Acelerar SELECT/React não cria sincronização entre computadores.

## Ordem recomendada de otimização

1. **Evitar substituir fotos inalteradas.** Manter snapshot/dirty tracking de ordem, categoria, observação e conteúdo após carregamento bem-sucedido. Se nada mudou, não executar a operação. Preservar adição, exclusão e reordenação explícitas. Com seis fotos, isso pode eliminar a chamada de imagens e 11 operações SQL do caminho comum; é uma redução de operações, não uma promessa de 50% no tempo real.
2. **Proteger resultados de consulta e tornar falha de recarga visível.** Antes de cache ou atualização local, adicionar controle de geração/obsolescência e impedir que respostas de filtros antigos substituam o estado atual. Diferenciar falha da escrita e falha da visualização.
3. **Feedback após confirmação do banco e recarga sem desmontar a tabela.** A escrita já devolve o registro atualizado. Aproveitar esse resultado com revalidação autoritativa em segundo plano, preservando filtro, ordem por atividade, paginação e totais. Não anunciar sucesso antes do backend confirmar e não eliminar o token `atualizado_em`.
4. **Quando as fotos realmente mudarem, reduzir round-trips.** Inserção em lote, resposta sem a coleção pesada que o chamador descarta, preservando transação e validações. Antes de agrupar operações, revisar os checks de empresa/permissão e concorrência de imagens: o helper atual valida somente existência por ID, e a operação não usa o token do equipamento.
5. **Medir SELECT/COUNT em PostgreSQL de teste representativo.** Usar EXPLAIN (ANALYZE, BUFFERS) nas leituras com e sem busca e nas duas ordenações. Só então decidir sobre índices, combinação de consultas ou redução das subconsultas de `EQUIPAMENTO_SELECT`. Não trocar contagem por estimativa ou retirar campos derivados silenciosamente.
6. **Definir atualização entre máquinas como requisito separado.** Um evento local do Tauri não notifica outro PC. Um mecanismo compartilhado deve respeitar empresa, edição em andamento, custo de consultas e bloqueio por inatividade.

## Referências do código

- `src/hooks/useEquipamentos.ts:47–75, 96–111, 148–160` — recarga, escrita e status.
- `src/pages/Equipamentos.tsx:348, 503–529, 959–1022, 2370` — consumo do hook, carregamento/reescrita de fotos e spinner.
- `src/lib/equipamento-imagem-utils.ts:93–153` — data URL preservada e JPEG gerado no formulário.
- `src-tauri/src/commands/equipamentos.rs:88–191, 435–475, 898–990, 1106–1210` — filtros/ordem, autorização, edição e status.
- `src-tauri/src/commands/equipamento_imagens.rs:203–329` — existência, DELETE/INSERT, transação e resposta.
- `src-tauri/src/commands/auth.rs:793–815, 1092–1124` — empresa por sessão e auditoria aguardada.

## Reproduzir

Na raiz do repositório, sem builds/testes concorrentes:

```bash
npx vitest run --config scripts/benchmarks/vitest.equipment-update.config.ts
node scripts/benchmarks/equipment-photo-payload.mjs
```

Os resultados são gravados no diretório temporário do sistema; o primeiro aceita `AUTOOS_UPDATE_BENCH_OUTPUT` e o segundo aceita o caminho de saída como primeiro argumento. Não usam banco, fotos ou equipamentos reais. O benchmark é opt-in e não acrescenta os atrasos artificiais à suíte unitária normal. Os JSONs desta rodada estão em `equipment-update-hook.json` e `equipment-photo-payload.json`.

**Nenhuma otimização de comportamento foi aplicada nesta etapa**: foram adicionados somente os instrumentos e este diagnóstico. A estimativa estática e os cenários controlados servem para priorizar trabalho, não para afirmar latência ou ganho em PostgreSQL de produção.

## Implementação posterior ao diagnóstico

As correções foram aplicadas na mesma branch das otimizações desktop. Consulte `equipment-update-implementation-2026-10-27.md` para o comportamento final, compatibilidade com Cloudflare, trade-offs e limites de validação. As medições e problemas acima documentam o estado anterior às correções.
