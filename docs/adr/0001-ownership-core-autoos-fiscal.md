# ADR 0001 — Ownership do Core AutoOS no fluxo Fiscal PROD

**Status:** proposta para revisão humana
**Data:** 2026-09-30
**Escopo:** produto interno AutoOS e piloto Fiscal PROD BMITAG.

## Contexto

O AutoOS já mantém os cadastros operacionais, equipamentos/ordens de serviço e estoque. Copiar esses cadastros para o AutoBO ou para o AutoPlatform como uma segunda fonte editável criaria divergência. O fluxo fiscal precisa levar uma cópia imutável dos dados da OS, sem transferir a autoridade da operação nem compartilhar tabelas entre produtos.

O modelo atual identifica o ciclo de atendimento pela chave da OS/equipamento. O número de série identifica o dispositivo físico e pode se repetir em ciclos diferentes; portanto, não identifica uma OS. O cadastro operacional também tem IDs locais numéricos no produto interno e UUIDs no SaaS. Esses identificadores não são intercambiáveis.

O contrato canônico AutoPlatform v1 ainda é um fato comercial mínimo e não descreve linhas de OS nem `os_version`. O AutoPlatform planeja o FatoComercial faturável v2 em `AP-CONTRACT-002`; este ADR define as fontes e a identidade dos dados de origem, sem antecipar o schema wire v2.

## Decisão proposta

### Fontes autoritativas

| Dado | Fonte autoritativa | O que entra no fato fiscal | Limite de ownership |
|---|---|---|---|
| Empresa/tenant | Diretório de identidade do AutoPlatform e membership autenticada | `company_id` UUID obtido da sessão autorizada | Nunca usar `empresas.id` numérico nem aceitar empresa escolhida livremente no payload como identidade compartilhada. |
| Cliente operacional | Core AutoOS (`clientes`) | ID de origem e cópia dos valores operacionais necessários no instante da versão da OS | Cliente da OS não é automaticamente pagador ou destinatário fiscal. Essa correspondência precisa ser explícita e validada no fluxo fiscal. |
| Equipamento e OS | Operação AutoOS (`equipamentos` como registro do ciclo de atendimento; dados técnicos e orçamento associados em `verificacoes`) | ID estável da OS, versão, estado elegível e os valores aprovados | O ID da OS é o ID do registro/ciclo no AutoOS, dentro da empresa e da origem `autoos`; nunca o número de série do aparelho. |
| Catálogo de produtos | Core AutoOS (`produtos`) | Referência ao produto e cópia dos valores e descrição efetivamente aprovados na OS | Uma alteração posterior de nome, preço ou cadastro não reescreve uma versão já publicada. |
| Catálogo de serviços | Core AutoOS (`servicos_catalogo`) | Referência ao serviço e cópia da linha, descrição e valor efetivamente aprovados na OS/verificação | Não recalcular um orçamento já aprovado com o preço atual do catálogo. |
| Itens de produto/serviço da OS | AutoOS (`verificacoes` e composição aprovada da OS) | Linhas, quantidades, valores unitários e totais da mesma versão | A composição do fato vem da OS aprovada, não de um carrinho reconstruído pelo AutoBO ou pelo AutoPlatform. |
| Saldo e movimentos de estoque | Core AutoOS (`produtos.quantidade_estoque` e ledger `movimentacoes_estoque`) | O fato pode referenciar as peças cobradas; não é um comando de estoque | Só o fluxo operacional do AutoOS registra entradas, saídas e ajustes. Ingestão, emissão fiscal e leitura do fato não criam uma segunda baixa nem alteram saldo. |
| Contrato, fato recebido e domínio fiscal | AutoPlatform | Cópia imutável do fato recebido, snapshots fiscais, documentos, estados e auditoria fiscal | O AutoPlatform é autoridade sobre a ingestão e o ciclo fiscal, não sobre o cadastro operacional que originou o fato. |
| Interface da jornada fiscal no piloto AutoOS | Produto AutoOS | Operação da OS e apresentação do snapshot/status retornado pelo AutoPlatform | A tela do AutoOS não é autoridade do fato, do estado fiscal ou da emissão. |
| Interface e histórico legado do AutoBO | Produto AutoBO | Consumo de contratos/APIs e apresentação do domínio fiscal no AutoBO | `autobo_nfes` continua sendo histórico/importação; não é cadastro de OS, estoque ou destino de documentos emitidos pelo novo fluxo. |
| Cadastro tributário e perfil emissor | AutoPlatform, conforme a ADR fiscal explícita do AutoBO | Somente dados fiscais determinados pelo contrato v2 e pelo perfil do estabelecimento | AutoOS não inventa NCM, CFOP, CST/CSOSN, CRT ou CNAE. A documentação de roadmap do AutoPlatform também diz que o AutoBO preserva “código, regras e histórico”; essa fronteira precisa ser reconciliada na revisão conjunta antes de congelar os campos fiscais do v2. |

O estoque é uma fronteira especialmente rígida: uma OS ou um fato pode descrever uma peça e sua quantidade, mas apenas uma movimentação operacional do AutoOS altera o saldo. A movimentação de estoque e o fato faturável têm identidades e efeitos distintos; um não é substituto do outro.

### Identidade, versão e leitura

- `company_id` vem da identidade autenticada no AutoPlatform. O adaptador do produto interno resolve a empresa autorizada; não converte implicitamente uma chave local numérica em UUID compartilhado.
- A identidade de origem da OS é o par contextualizado por empresa e origem: `origin = autoos` + ID primário do registro de OS no AutoOS. O mesmo contexto deve acompanhar IDs de cliente, produto, serviço e movimentos relacionados. IDs isolados não são globais.
- Cada fato identifica a versão completa da OS que foi lida: `company_id + origin + os_id + os_version`. A versão aumenta quando muda qualquer dado operacional incluído no snapshot. Retry da mesma versão conserva o payload canônico, seu hash e a chave idempotente; conteúdo diferente para a mesma versão é conflito, não sobrescrita.
- `event_id` identifica a publicação da versão. A chave idempotente deve representar a empresa, a origem, a OS e a versão, para que repetição da mesma versão resulte no mesmo fato e uma revisão legítima resulte em outro evento.
- O snapshot copia as linhas e os valores aprovados naquele instante. Ele não consulta preços ou descrições atuais durante ingestão/emissão. A leitura deve verificar os tokens de atualização dos registros de origem e ser refeita se os dados mudarem no meio da captura.
- `atualizado_em` é atualmente um token de concorrência de registros; sozinho, não é histórico imutável nem versão suficiente do agregado da OS, cliente, verificação e itens. A implementação de `AO-SUITE-002` deve persistir/reconstruir uma versão do agregado e seu hash antes da integração real.
- Valores monetários do snapshot devem preservar exatamente o que foi aprovado na OS, em unidades inteiras da menor denominação definida pelo contrato (centavos para BRL), sem recomputar totais com ponto flutuante ou com preço vivo de catálogo. O schema v2 decide a representação final.

### Correções e imutabilidade

1. Antes de publicar uma versão, a correção é feita na fonte operacional competente do AutoOS; o snapshot candidato é lido novamente e recebe nova versão quando já havia sido publicado.
2. Depois que uma tentativa de publicação começou, timeout ou perda de resposta não autoriza alterar o mesmo `os_version` nem gerar outro `event_id` às cegas. Primeiro se consulta/reconcilia o resultado usando a correlação/idempotência.
3. Depois que o AutoPlatform aceitou um fato, essa cópia e o hash não são sobrescritos. Uma correção operacional posterior produz nova versão/evento, preservando a versão anterior; a política de revisão do fato e a correção fiscal são detalhadas pelo contrato v2 e pelo domínio fiscal.
4. Depois de documento fiscal autorizado, corrigir ou cancelar segue o evento legal aplicável no AutoPlatform. Não se edita a OS histórica para alterar o snapshot já emitido.
5. Se o pagador/destinatário fiscal divergir do cliente operacional, essa identidade é explicitada e validada no fluxo fiscal. Não se troca `cliente_id` nem se transforma a cópia do cliente operacional em autoridade fiscal por inferência.

## Exemplos sintéticos de ownership

Os IDs abaixo são ilustrativos e não definem a serialização do contrato v2. Valores em centavos servem apenas para mostrar a origem e a soma das linhas.

| Cenário | Identidade da OS | Linhas lidas da OS | Total copiado | Efeito no estoque causado pelo fato |
|---|---|---|---:|---|
| Só serviço | `company_id=00000000-0000-4000-8000-0000000000a1`, `origin=autoos`, `os_id=OS-4201`, `os_version=1` | `service=SRV-31`, 1 × R$ 180,00 | R$ 180,00 | Nenhum. |
| Só produto | `company_id=00000000-0000-4000-8000-0000000000a1`, `origin=autoos`, `os_id=OS-4202`, `os_version=1` | `product=PRD-88`, 1 × R$ 250,00 | R$ 250,00 | Nenhum. Uma saída, se aplicável à operação, é registrada uma única vez no fluxo de estoque do AutoOS. |
| Mista | `company_id=00000000-0000-4000-8000-0000000000a1`, `origin=autoos`, `os_id=OS-4203`, `os_version=1` | `service=SRV-31`, 1 × R$ 180,00; `product=PRD-88`, 2 × R$ 65,00 | R$ 310,00 | Nenhum. O fato não repete nem cria a baixa operacional das duas peças. |

Em todos os cenários, alterar depois o cadastro `SRV-31`, `PRD-88` ou o cliente não muda `os_version=1` nem o conteúdo recebido pelo AutoPlatform. Se uma correção operacional for necessária, ela é feita no AutoOS e resulta em uma nova versão correlacionada à mesma OS.

## Consequências

- O AutoOS continua sendo a única autoridade para cliente operacional, equipamento/OS, serviços, produtos e saldo/movimentos de estoque do piloto.
- O AutoPlatform recebe um fato versionado como cópia e passa a ser autoridade dos estados e documentos fiscais que cria.
- O AutoBO não ganha uma cópia editável do Core AutoOS nem faz leitura direta de seu banco.
- `AO-SUITE-002` e `AP-CONTRACT-002` precisam alinhar a codificação dos IDs, `os_version`, hash, composição de linhas, correção e campos tributários antes de uma integração de produção.
- Esta ADR não cria endpoint, migration, schema v2 nem alteração de dados. Nenhum ambiente ou dado operacional foi modificado.

## Referências para revisão

- Workflow e escopo do AutoOS: [AO-SUITE-001](../../.workflow/workflow.json).
- [Plano Fiscal PROD do AutoPlatform](https://github.com/ph66ng2/AutoPlatform/blob/main/.workflow/FISCAL_PROD_ROADMAP.md).
- [Contrato canônico atual FatoComercial v1](https://github.com/ph66ng2/AutoPlatform/blob/main/contracts/v1/fato-comercial.schema.json) e ticket `AP-CONTRACT-002` para v2.
- [ADR fiscal do AutoBO](https://github.com/ph66ng2/AutoBO/blob/main/docs/adr/0001-cobertura-fiscal.md).
- [Reconciliação do workflow AutoOS](../WORKFLOW_RECONCILIATION.md).
