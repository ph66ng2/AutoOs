# Aceite online de orçamento

O cliente responde ao orçamento por um link próprio. A resposta é **registrada na hora**, mas só a equipe altera status, pagamento e estoque, depois de conferir. Isso separa a *resposta do cliente* da *etapa operacional do equipamento* e deixa espaço para corrigir um toque errado.

> **Estado atual: fases 1 e 2 implementadas, nada ativado.** Migrations 0030 e 0031, Edge Function `orcamento-decisao`, página `#/o/<token>` e desktop estão no código. O aceite online nasce **desligado** (`online_enabled = FALSE`), a função ainda não foi publicada e o envio do link por email/WhatsApp **não está ligado a nenhum provedor**.

## Regras de produto

- Abrir o link ou tocar uma vez nunca decide nada: a página repete valor e ação e pede confirmação.
- O cliente vê uma **versão congelada** do orçamento. Editar o orçamento, a verificação, o prazo ou a etapa do equipamento encerra a versão e revoga seus links; o cliente nunca aprova valores que não viu.
- Até a equipe aplicar, o cliente pode **desfazer ou alterar** a resposta pelo link. Cada mudança entra no histórico; nada é apagado. A equipe só aplica uma resposta do portal depois de **pelo menos 15 minutos** (`janela_correcao_minutos`, mínimo 15) desde a última resposta.
- Resposta dada por telefone ou WhatsApp é registrada pela equipe como **decisão informada à equipe** (permissão `FINANCIAL_ACTIONS`, com PIN) no mesmo histórico, e encerra o link público.
- A primeira versão aceita ou recusa o **orçamento inteiro**. Escolha de serviços individuais fica para uma etapa posterior.
- Depois que a equipe aplica a decisão, o link deixa de aceitar respostas, mas continua aberto (até expirar) para mostrar o resultado e receber um **pedido de mudança**. O pedido apenas avisa a equipe: não cancela serviço nem devolve peça.
- **Tenho uma dúvida** envia uma mensagem (até 500 caracteres) sem registrar decisão; no máximo 5 mensagens por hora e versão.
- Correção posterior é feita pela equipe, com **Corrigir decisão do orçamento**; o sistema nunca devolve peças ao estoque sem confirmação explícita.

## Banco (`0030_aceite_orcamento_online.sql`)

| Objeto | Função |
|---|---|
| `orcamento_versoes` | Snapshot imutável (JSONB), valor, validade e motivo de encerramento. Não aceita `DELETE` direto nem alteração do conteúdo. |
| `orcamento_links_decisao` | Hash SHA-256 do token (nunca o token), validade de até 30 dias limitada ao prazo do orçamento, revogação com motivo. Separado de `links_status_publico`. |
| `orcamento_respostas` | Histórico somente de acréscimo (`APROVAR`, `RECUSAR`, `DESFEITA`; origem `PORTAL` ou `EQUIPE`). Só as colunas `aplicada_*` podem ser preenchidas depois. |
| `orcamento_aceite_config` | Chave `online_enabled` (padrão `FALSE`), **separada** de `status_portal_config.public_enabled`, e a janela de correção. |
| `registrar_resposta_orcamento(token_hash, decisao, resposta_vigente_id)` | Operação atômica: confere chave, link, versão, etapa, prazo e resposta vigente sob bloqueio. Toque duplo devolve a resposta já gravada (`repetida`); dois aparelhos ou tela antiga falham com `RESPOSTA_DESATUALIZADA`. |
| Triggers em `equipamentos` e `verificacoes` | Encerram versões e links quando status, valor, prazo, serviços, peças ou custo mudam. |

Erros da função (para a Edge Function mapear): `ACEITE_PAUSADO`, `LINK_INDISPONIVEL` (inexistente, vencido, revogado, versão encerrada ou etapa mudada — mesma resposta pública), `RESPOSTA_DESATUALIZADA`, `RESPOSTA_JA_APLICADA`, `NADA_A_DESFAZER`, `DECISAO_INVALIDA`.

### Fase 2 (`0031_aceite_orcamento_fase2.sql`)

| Objeto | Função |
|---|---|
| `orcamento_solicitacoes` | Dúvidas e pedidos de mudança do cliente (somente acréscimo; a equipe preenche `tratado_*`). |
| `orcamento_correcoes` | Registro imutável de cada correção de decisão (motivo, estoque devolvido, quantidade, quem). |
| `consultar_orcamento_decisao(token_hash)` | Devolve só campos em lista branca da versão congelada (descrição, valor, peças com nome, quantidade e preço unitário), o estado (`ABERTO` ou `APLICADO`) e a resposta vigente. Não expõe custos, ids de produto nem dados do cliente. |
| `registrar_solicitacao_orcamento(token_hash, tipo, mensagem)` | `DUVIDA` só com o link aberto, `MUDANCA` só depois da aplicação. Remove caracteres de controle e limita a 5 por hora. |
| `autoos_estado_link_orcamento` | Auxiliar que decide `ABERTO`/`APLICADO`/`LINK_INDISPONIVEL` num só lugar. |

Mudança de comportamento em relação à 0030: ao aplicar uma resposta, a versão é encerrada, mas o **link não é mais revogado** (só os links de versões sem resposta aplicada).

**Privilégios.** As quatro funções do aceite são `SECURITY DEFINER` (`search_path` fixo), executáveis só por `service_role`. `SELECT … FOR UPDATE/SHARE` exige privilégio de UPDATE, que o `service_role` não deve ter; por isso a 0031 também **retira** os grants diretos de tabela que a 0030 tinha dado. A Edge Function chega ao banco apenas por essas funções. `anon` e `authenticated` não têm acesso.

Erros novos: `LIMITE_SOLICITACOES`, `MENSAGEM_INVALIDA`, `TIPO_INVALIDO`.

## Desktop

- `src-tauri/src/commands/orcamento_decisao.rs`: `obter_decisao_orcamento`, `criar_link_decisao_orcamento` (`MANAGE_STATUS_LINKS`), `revogar_link_decisao_orcamento`, `registrar_decisao_informada` (`FINANCIAL_ACTIONS`).
- `aprovar_orcamento` chama `conferir_e_aplicar_resposta` na mesma transação:
  - sem resposta registrada, o fluxo é o de sempre;
  - `resposta_esperada_id` diferente da resposta vigente falha ("recarregue e confira"), cobrindo a tela antiga do operador;
  - resposta do portal dentro da janela não pode ser aplicada;
  - decisão diferente da do cliente exige `motivo_divergencia` (mínimo 5 caracteres);
  - a resposta é marcada como aplicada junto com pagamento, status e baixa de estoque.
- `orcamento_correcao.rs`: `analisar_correcao_decisao` e `corrigir_decisao_orcamento` (`FINANCIAL_ACTIONS`, com PIN). Veja "Corrigir decisão do orçamento" abaixo.
- `marcar_solicitacao_orcamento_tratada` marca dúvidas e pedidos do cliente como tratados.
- A lista de equipamentos mostra **"Cliente respondeu: aprovou/recusou — aguardando conferência"** (coluna `resposta_cliente` em `EQUIPAMENTO_SELECT`, só enquanto a resposta não foi aplicada e a versão está aberta).
- No fluxo de aprovação, se a decisão do operador diferir da do cliente aparece o campo **Motivo da divergência** (mínimo de 5 caracteres, também exigido pelo backend).
- `DecisaoOrcamentoCard` (detalhe do equipamento): mostra "Cliente respondeu: aprovou — aguardando conferência", versão, valor, janela, histórico, gerar/encerrar link e as ações de decisão informada. "Revisar e aplicar decisão" abre o fluxo atual de pagamento com PIN.

## Corrigir decisão do orçamento

Ação ao lado de "Mudar Status" para orçamentos `APROVADO` ou `REPROVADO`. "Corrigir Status" para `AGUARDANDO_APROVACAO` nesses casos é recusado e aponta para ela, porque trocar só o rótulo não desfaz pagamento, serviços aprovados nem baixa de estoque.

1. A análise mostra pagamento registrado, valor atual e o valor enviado ao cliente, e as peças já baixadas.
2. **Bloqueia** (atendimento humano) se o serviço já passou de `APROVADO`/`REPROVADO`, se o orçamento não guardou a versão original (legado) ou se foi ajustado depois da aprovação.
3. Com peças baixadas, o operador precisa marcar que elas estão intactas; só então o sistema gera entrada de estoque (`origem = CORRECAO_ORCAMENTO`). Sem a confirmação, nada é alterado.
4. Na mesma transação: restaura serviços, peças e valor originais, apaga forma de pagamento e decisões por serviço, zera as quantidades aprovadas/baixadas, volta a etapa para `AGUARDANDO_APROVACAO` e grava `orcamento_correcoes` e o evento de auditoria `BUDGET_DECISION_CORRECTED`. Conflito de concorrência (`atualizado_em`) cancela tudo.

## Envio do link

O botão **Enviar por WhatsApp** do card pede o envio ao comando central da fila (`orcamento_decisao`, veja `docs/FILA_ENVIOS_WHATSAPP.md`): o backend congela o orçamento, gera o token, monta o texto e registra a tentativa; a tela não vê o link. Reenviar o mesmo orçamento reaproveita a versão e não invalida o link já enviado; editar o orçamento cria nova versão e derruba os links antigos. Hoje o transporte é a Evolution API.

O card também mostra a **mensagem pronta** (`orcamento-link-message.ts`) com **Copiar mensagem** e **Copiar só o link** para envio manual por outro canal. O botão de email segue desabilitado: `registrarProvedorEnvioOrcamento` em `orcamento-link-envio.ts` é o ponto de ligação quando houver um provedor.

## Edge Function e página

- `supabase/functions/orcamento-decisao/index.ts` (`verify_jwt = false` em `supabase/config.toml`): `POST` JSON com `token` e `acao` = `consultar`, `responder` (`decisao`, `respostaVigenteId`) ou `solicitar` (`tipo`, `mensagem`). Reaproveita os segredos e a origem do acompanhamento (`PUBLIC_STATUS_RATE_LIMIT_SECRET`, `PUBLIC_STATUS_ORIGIN`) e o limite por cliente (60/min) e por token (30/min leitura, 10/min escrita).
- Link inexistente, vencido, revogado, versão encerrada, etapa mudada e aceite pausado respondem o mesmo `404`. Conflitos viram `409` (`DESATUALIZADA`, `JA_APLICADA`, `NADA_A_DESFAZER`); erros internos do banco nunca vão ao navegador.
- Página: mesma publicação do acompanhamento (`npm run build:public-status`). `#/c/<token>` continua sendo o acompanhamento e `#/o/<token>` é o orçamento. Fluxo: aprovar/não aprovar → confirmação com valor → "Resposta recebida às HH:MM" com Desfazer/Alterar → depois da aplicação, "Pedir mudança". A URL da função pode ser trocada com `VITE_ORCAMENTO_DECISAO_API_URL`.

## Ativação

1. Aplicar as migrations 0030 e 0031 (as 0024–0029 antes). Confirme os advisors de segurança do Supabase.
2. Publicar `orcamento-decisao` com os mesmos segredos do `public-status` e publicar a página (`npm run build:public-status`).
3. Após o QA, `UPDATE public.orcamento_aceite_config SET online_enabled = TRUE` para um piloto.
4. Pausar: `online_enabled = FALSE`. A função passa a responder `404` para todos os links; nada é apagado.

## Pendências conhecidas

- **Cloud API do WhatsApp**, webhook de entrega, processador central e, depois, o código de verificação (veja `docs/FILA_ENVIOS_WHATSAPP.md`). Provedor de email ainda indefinido.
- Nenhuma migration foi aplicada e a função não foi publicada em nenhum ambiente.
- O fluxo da lista e do campo de motivo foi coberto por testes de backend e de componentes; falta o QA manual no app com um banco real.

## Limitação

> O Portal das Impressoras do Cliente (`docs/PORTAL_CLIENTE.md`, migration 0034) resolve isto para quem entra com código: respostas de origem `PORTAL_CLIENTE` são atribuídas ao contato e efetivadas pelo servidor depois do prazo de correção. Respostas pelo link continuam com conferência da equipe.

Possuir o link não prova quem clicou. Nesta versão a conferência humana antes de iniciar o serviço é parte da proteção. Um código enviado ao contato cadastrado exige um serviço de envio no servidor, pois a configuração de WhatsApp e email guardada no desktop não funciona com o app fechado.

## QA

Cobertos: SQL (resposta, toque duplo, aparelho desatualizado, alterar, desfazer, imutabilidade, invalidação por edição, cascata) e a trava do desktop em `test_budget_stock` (tela antiga, janela, divergência, aplicação). Também cobertos: Edge Function (tradução de erros, validação, limites, sem vazar erros do banco), página (confirmação, desfazer, tela desatualizada, dúvida, pedido de mudança, link indisponível), SQL como `service_role` sem acesso direto às tabelas, correção de decisão com devolução de estoque e bloqueio após o início do serviço. Falta QA manual com peça em falta e com dois aparelhos reais.
