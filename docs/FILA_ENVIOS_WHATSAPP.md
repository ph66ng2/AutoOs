# Fila de envios de WhatsApp

Todo WhatsApp enviado ao cliente por evento do atendimento passa por **um comando**, `solicitar_envio_whatsapp(equipamento_id, tipo, reenvio_manual, confirmar_incerto)`. A tela não monta nem transmite o texto: o backend busca os dados atualizados, congela o orçamento quando necessário, escolhe a mensagem, impede duplicidade e registra cada tentativa.

> **Estado atual (passo 1):** fila, idempotência e gatilhos migrados, ainda com a **Evolution API** como transporte. Cloud API, webhook de entrega, processador central e `codigo_verificacao` são os próximos passos e **não existem** ainda. Nenhuma migration foi aplicada em produção.

## Tipos de evento

| Tipo | Quando | Identidade do evento | Origem na interface |
|---|---|---|---|
| `orcamento_informativo` | Ao concluir a verificação (automático) e botão de reenvio | `v:<orcamento_versoes.id>` | `useStatusEquipamento`, botão WhatsApp de orçamento |
| `orcamento_decisao` | Botão **Enviar por WhatsApp** do card de decisão | `v:<orcamento_versoes.id>` | `DecisaoOrcamentoCard` |
| `equipamento_pronto` | Ao mudar para `PRONTO` (automático) e botão de reenvio | `s:<status_alterado_em em µs>` | `useStatusEquipamento`, botão WhatsApp de pronto |
| `codigo_verificacao` | Etapa futura | — | — |

O orçamento só é enviado em `AGUARDANDO_APROVACAO`; o aviso de pronto só em `PRONTO` e exige a data confiável da mudança de etapa. `orcamento_decisao` exige o aceite online ativado.

O link de acompanhamento (`#/c/<token>`) **continua fora da fila**: o token só existe na tela que o gerou e o AutoOS guarda apenas o hash. O email também segue no fluxo atual.

## Garantias

- **Um pedido por evento.** `UNIQUE (empresa_id, equipamento_id, tipo, chave_evento)`. Repetir o gatilho automático devolve `JA_SOLICITADO` sem enviar.
- **Uma tentativa em andamento por pedido.** Índice único parcial em `estado = 'PREPARANDO'` mais bloqueio da linha do pedido: dois cliques ou dois computadores no mesmo banco não chamam o provedor duas vezes (o segundo recebe `EM_ANDAMENTO`).
- **Reenvio é gesto explícito.** `reenvio_manual = true` cria a tentativa seguinte do mesmo pedido, sempre rastreável.
- **Orçamento editado = novo evento.** O orçamento é congelado por `obter_ou_criar_versao`: se a versão aberta tem exatamente o mesmo conteúdo ela é **reaproveitada** (reenvio não invalida link nem pedido); se mudou, a versão antiga é encerrada, seus links caem e o novo conteúdo gera outro pedido.
- **Texto da versão congelada.** O informativo usa o `snapshot` da versão, não o que estiver na tela.
- **Link de decisão por tentativa.** Cada tentativa gera um token novo; só o hash fica no banco. O envio automático **nunca revoga** links anteriores da mesma versão, porque o de uma tentativa incerta pode já estar com o cliente. "Gerar novo link" manual no card continua encerrando os anteriores.
- **Histórico imutável.** Pedidos não mudam; tentativas só saem de `PREPARANDO` uma vez. Nada é apagado (exceto por exclusão do equipamento).

## Estados de uma tentativa

| Estado | Significado | Pode repetir? |
|---|---|---|
| `PREPARANDO` | Reservada por uma instância; chamada ao provedor em curso | Não (`EM_ANDAMENTO`). Após 2 minutos vira `INCERTA` |
| `ENVIADA` | Provedor **aceitou** o pedido (não prova entrega) | Só por reenvio manual |
| `FALHOU` | Nada saiu ou o provedor recusou (sem telefone, sem configuração, falha de conexão, HTTP 4xx) | Reenvio manual, sem confirmação |
| `INCERTA` | Pode ter saído: tempo esgotado, HTTP 5xx, instância interrompida | **Somente** com `confirmar_incerto` |

Resultados do comando: `ENVIADA`, `FALHOU`, `INCERTA`, `EM_ANDAMENTO`, `JA_SOLICITADO` e `REQUER_CONFIRMACAO`. A interface pede confirmação ao operador em `REQUER_CONFIRMACAO` e, no card de decisão, quando o orçamento já foi enviado.

## Dados e privacidade

- `envios_whatsapp_pedidos` e `envios_whatsapp_tentativas` (migration `0032`), com RLS por empresa e sem acesso de `anon`, `authenticated` ou `service_role`.
- O telefone fica **mascarado** na tentativa (`5571****8888`); o número completo continua só em `comunicacoes`, como antes.
- O token e a URL de decisão não entram em log, em `erro_resumo` (sanitizado, até 300 caracteres) nem no histórico: `comunicacoes` recebe um texto sem o link. O teste de integração confere isso.
- A tabela `comunicacoes` continua sendo o histórico visível por equipamento; é gravada **depois** do resultado, uma linha por tentativa. Se a gravação falhar, a fila mantém o registro.
- Permissões: `CONFIG_WHATSAPP` (como o envio anterior) e, para `orcamento_decisao`, também `MANAGE_STATUS_LINKS`.

## Seam para a Cloud API

`MensagemWhatsapp` já carrega, além do texto da Evolution, `template`, `parametros` e `url_botao` (o token). Trocar o transporte significa implementar outro `despachar_*` em `whatsapp.rs` com a mesma classificação de erro (`Falhou` × `Incerto`) e escolher por configuração da empresa; pedidos, tentativas e gatilhos não mudam.

## Testes

- Unitários Rust (`cargo test --bin autoos envio_whatsapp`): formatação, mensagens, token fora do histórico, mascaramento.
- Integração (`npm run qa:integrations:whatsapp-queue`, em banco `autoos_stock_test*`, com servidor HTTP local no lugar da Evolution): idempotência, reenvio, concorrência (um só envio), HTTP 5xx → incerto → confirmação, HTTP 400, cliente sem telefone, tentativa abandonada, imutabilidade, link de decisão por versão (reenvio reaproveita a versão e mantém os dois links), edição do orçamento invalida os links, aceite desligado.
- Frontend: serviço, card de decisão (confirmação de reenvio) e adaptador de envio.

## Próximos passos

1. Cloud API por empresa, modelos aprovados e webhook de entrega (`ENVIADA` → entregue/falhou).
2. Processador central (para enviar com o app fechado e para o webhook), separado da Edge Function de decisão.
3. `codigo_verificacao` (modelo de autenticação) e reconciliação de tentativas `INCERTA` pelo identificador da Meta.
