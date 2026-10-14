# Aceite online de orçamento

O cliente responde ao orçamento por um link próprio. A resposta é **registrada na hora**, mas só a equipe altera status, pagamento e estoque, depois de conferir. Isso separa a *resposta do cliente* da *etapa operacional do equipamento* e deixa espaço para corrigir um toque errado.

> **Estado atual: fase 1 (banco + desktop).** A Edge Function e a página pública (fase 2) ainda não existem, e o aceite online nasce **desligado**.

## Regras de produto

- Abrir o link ou tocar uma vez nunca decide nada: a página repete valor e ação e pede confirmação.
- O cliente vê uma **versão congelada** do orçamento. Editar o orçamento, a verificação, o prazo ou a etapa do equipamento encerra a versão e revoga seus links; o cliente nunca aprova valores que não viu.
- Até a equipe aplicar, o cliente pode **desfazer ou alterar** a resposta pelo link. Cada mudança entra no histórico; nada é apagado. A equipe só aplica uma resposta do portal depois de **pelo menos 15 minutos** (`janela_correcao_minutos`, mínimo 15) desde a última resposta.
- Resposta dada por telefone ou WhatsApp é registrada pela equipe como **decisão informada à equipe** (permissão `FINANCIAL_ACTIONS`, com PIN) no mesmo histórico, e encerra o link público.
- A primeira versão aceita ou recusa o **orçamento inteiro**. Escolha de serviços individuais fica para uma etapa posterior.
- Depois que a equipe aplica a decisão, o link deixa de aceitar respostas. Correção posterior é feita pela equipe; o sistema não devolve peças ao estoque por conta própria.

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

Os privilégios de `service_role` já cobrem só o necessário para a função de servidor; `anon` e `authenticated` não têm acesso.

## Desktop

- `src-tauri/src/commands/orcamento_decisao.rs`: `obter_decisao_orcamento`, `criar_link_decisao_orcamento` (`MANAGE_STATUS_LINKS`), `revogar_link_decisao_orcamento`, `registrar_decisao_informada` (`FINANCIAL_ACTIONS`).
- `aprovar_orcamento` chama `conferir_e_aplicar_resposta` na mesma transação:
  - sem resposta registrada, o fluxo é o de sempre;
  - `resposta_esperada_id` diferente da resposta vigente falha ("recarregue e confira"), cobrindo a tela antiga do operador;
  - resposta do portal dentro da janela não pode ser aplicada;
  - decisão diferente da do cliente exige `motivo_divergencia` (mínimo 5 caracteres);
  - a resposta é marcada como aplicada junto com pagamento, status e baixa de estoque.
- `DecisaoOrcamentoCard` (detalhe do equipamento): mostra "Cliente respondeu: aprovou — aguardando conferência", versão, valor, janela, histórico, gerar/encerrar link e as ações de decisão informada. "Revisar e aplicar decisão" abre o fluxo atual de pagamento com PIN.

## Ativação

1. Aplicar a migration 0030 (as 0024–0029 antes).
2. Fase 2: publicar a função e a página; só então, após o QA, `UPDATE public.orcamento_aceite_config SET online_enabled = TRUE` para um piloto.
3. Pausar: `online_enabled = FALSE`. Links existentes passam a responder `ACEITE_PAUSADO`.

## Pendências conhecidas

- **Fase 2:** Edge Function (token por `POST`, limite de consultas como no acompanhamento), página `#/o/<token>` com confirmação, desfazer e "Tenho uma dúvida", e "Pedir mudança" depois da aplicação.
- Indicação "Cliente respondeu" na **lista** de equipamentos (hoje só no detalhe).
- Ação "Corrigir decisão do orçamento" ao lado de "Mudar Status", que verifique pagamento, serviços e baixas antes de reabrir. Enquanto isso, "Mudar Status" de `APROVADO` para `AGUARDANDO_APROVACAO` não reverte pagamento nem estoque.
- UI para informar o `motivo_divergencia` (o backend já exige; sem motivo a aplicação divergente é recusada).
- Envio do link por email/WhatsApp pelo app (hoje: copiar).

## Limitação

Possuir o link não prova quem clicou. Nesta versão a conferência humana antes de iniciar o serviço é parte da proteção. Um código enviado ao contato cadastrado exige um serviço de envio no servidor, pois a configuração de WhatsApp e email guardada no desktop não funciona com o app fechado.

## QA

Cobertos: SQL (resposta, toque duplo, aparelho desatualizado, alterar, desfazer, imutabilidade, invalidação por edição, cascata) e a trava do desktop em `test_budget_stock` (tela antiga, janela, divergência, aplicação). A cobrir na fase 2: link vencido na página, dois aparelhos pela Edge Function, aprovação com peça em falta e correção após início do serviço.
