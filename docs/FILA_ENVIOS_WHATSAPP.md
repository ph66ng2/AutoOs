# Fila de envios de WhatsApp

Todo WhatsApp enviado ao cliente por evento do atendimento passa por **um comando**, `solicitar_envio_whatsapp(equipamento_id, tipo, reenvio_manual, confirmar_incerto)`. A tela não monta nem transmite o texto: o backend busca os dados atualizados, congela o orçamento quando necessário, escolhe a mensagem, impede duplicidade e registra cada tentativa.

> **Estado atual (passos 1 e 2):** fila, idempotência, gatilhos migrados e **processador central** (modo `CENTRAL`, por empresa) implementados. Transportes: Evolution API e Cloud API (esta ainda **não testada contra a Meta**). Webhook de entrega e `codigo_verificacao` não existem. Nenhuma migration foi aplicada nem função publicada em nenhum ambiente, e toda empresa continua no modo `LOCAL` até a configuração ser inserida.

## Tipos de evento

| Tipo | Quando | Identidade do evento | Origem na interface |
|---|---|---|---|
| `orcamento_informativo` | Ao concluir a verificação (automático) e botão de reenvio | `v:<orcamento_versoes.id>` | `useStatusEquipamento`, botão WhatsApp de orçamento |
| `equipamento_pronto` | Ao mudar para `PRONTO` (automático) e botão de reenvio | `s:<status_alterado_em em µs>` | `useStatusEquipamento`, botão WhatsApp de pronto |
| `codigo_verificacao` | Etapa futura | — | — |

O orçamento só é enviado em `AGUARDANDO_APROVACAO`; o aviso de pronto só em `PRONTO` e exige a data confiável da mudança de etapa. O tipo `orcamento_decisao` (link individual de decisão) foi removido na 0037: o banco recusa novos pedidos e o processador marca como `FALHOU`, sem enviar, qualquer pedido antigo que tenha sobrado.

O link de acompanhamento (`#/c/<token>`) **continua fora da fila**: o token só existe na tela que o gerou e o AutoOS guarda apenas o hash. O email também segue no fluxo atual.

## Garantias

- **Um pedido por evento.** `UNIQUE (empresa_id, equipamento_id, tipo, chave_evento)`. Repetir o gatilho automático devolve `JA_SOLICITADO` sem enviar.
- **Uma tentativa em andamento por pedido.** Índice único parcial em `estado = 'PREPARANDO'` mais bloqueio da linha do pedido: dois cliques ou dois computadores no mesmo banco não chamam o provedor duas vezes (o segundo recebe `EM_ANDAMENTO`).
- **Reenvio é gesto explícito.** `reenvio_manual = true` cria a tentativa seguinte do mesmo pedido, sempre rastreável.
- **Orçamento editado = novo evento.** O orçamento é congelado por `obter_ou_criar_versao`: se a versão aberta tem exatamente o mesmo conteúdo ela é **reaproveitada** (reenvio não invalida link nem pedido); se mudou, a versão antiga é encerrada, seus links caem e o novo conteúdo gera outro pedido.
- **Texto da versão congelada.** O informativo usa o `snapshot` da versão, não o que estiver na tela.
- **Histórico imutável.** Pedidos não mudam; tentativas só saem de `PREPARANDO` uma vez. Nada é apagado (exceto por exclusão do equipamento).

## Estados de uma tentativa

| Estado | Significado | Pode repetir? |
|---|---|---|
| `PENDENTE` | Na fila central, ainda não reservada (só no modo `CENTRAL`) | Não (`EM_ANDAMENTO`). Após 6 horas sem ser enviada vira `FALHOU` (nunca saiu) |
| `PREPARANDO` | Reservada por uma instância; chamada ao provedor em curso | Não (`EM_ANDAMENTO`). Após 2 minutos vira `INCERTA` |
| `ENVIADA` | Provedor **aceitou** o pedido (não prova entrega) | Só por reenvio manual |
| `FALHOU` | Nada saiu ou o provedor recusou (sem telefone, sem configuração, falha de conexão, HTTP 4xx) | Reenvio manual, sem confirmação |
| `INCERTA` | Pode ter saído: tempo esgotado, HTTP 5xx, instância interrompida | **Somente** com `confirmar_incerto` |

Resultados do comando: `ENFILEIRADA` (modo central), `ENVIADA`, `FALHOU`, `INCERTA`, `EM_ANDAMENTO`, `JA_SOLICITADO` e `REQUER_CONFIRMACAO`. A interface pede confirmação ao operador em `REQUER_CONFIRMACAO` e, no card de decisão, quando o orçamento já foi enviado.

## Dados e privacidade

- `envios_whatsapp_pedidos` e `envios_whatsapp_tentativas` (migration `0033`), com RLS por empresa e sem acesso de `anon`, `authenticated` ou `service_role`.
- O telefone fica **mascarado** na tentativa (`5571****8888`); o número completo continua só em `comunicacoes`, como antes.
- O token e a URL de decisão não entram em log, em `erro_resumo` (sanitizado, até 300 caracteres) nem no histórico: `comunicacoes` recebe um texto sem o link. O teste de integração confere isso.
- A tabela `comunicacoes` continua sendo o histórico visível por equipamento; é gravada **depois** do resultado, uma linha por tentativa. Se a gravação falhar, a fila mantém o registro.
- Permissões: `CONFIG_WHATSAPP` (como o envio anterior) e, para `orcamento_decisao`, também `MANAGE_STATUS_LINKS`.

## Processador central (vários computadores no mesmo banco)

Cada empresa tem um modo em `envio_whatsapp_config_empresa` (sem linha = `LOCAL`):

| Modo | Quem envia | Configuração do provedor |
|---|---|---|
| `LOCAL` | O computador que clicou, como no passo 1 | Chaveiro do próprio computador (Evolution) |
| `CENTRAL` | A Edge Function `envio-whatsapp` | Identificadores no banco; **token só nos segredos da função** |

No modo `CENTRAL` o desktop valida o evento, congela o orçamento, monta o conteúdo e grava a tentativa como `PENDENTE` (`ENFILEIRADA` para a tela). Ele não chama o provedor e não tem o token do provedor.

A função `envio-whatsapp` (separada de `portal-cliente`) faz, a cada execução do Cron:

1. `varrer_envios_whatsapp`: reserva parada há mais de 2 minutos vira `INCERTA`; fila parada há mais de 6 horas vira `FALHOU`. Ambos geram linha no histórico.
2. Repete `reservar_envios_whatsapp(instância, 1)` (`FOR UPDATE SKIP LOCKED`): instâncias simultâneas recebem tentativas diferentes, e nada fica reservado esperando a vez. Limite de 25 por execução e 100 s.
3. Para cada uma: confere que o evento ainda vale (orçamento não editado; equipamento ainda `PRONTO`), busca a configuração da empresa, envia e conclui com `concluir_envio_whatsapp`.
4. A conclusão tem trava de posse: se a reserva foi varrida, uma resposta tardia não sobrescreve o resultado. Se a própria conclusão falhar na rede (3 tentativas), a tentativa fica para a varredura marcar como `INCERTA`; **a mensagem nunca é reenviada**.

Classificação do resultado, igual à do envio local: 2xx = `ENVIADA`; 4xx e falha de conexão (DNS, recusa) = `FALHOU`; 5xx, tempo esgotado e qualquer outra falha de rede = `INCERTA`. Mensagens de erro são limpas de tokens, URLs e sequências hexadecimais antes de gravar, e a função não registra token, link nem telefone em log (teste cobre isso).

### Transportes

- **Evolution:** `POST` na URL da empresa com `apikey` e `Bearer` do token, mesmo corpo do envio local. **Não confirmado** se a Evolution é acessível pela internet; se não for, use a Cloud API ou mantenha `LOCAL`.
- **Cloud API:** `POST https://graph.facebook.com/<versão>/<phone_number_id>/messages` com `type: template`, nome do modelo igual ao tipo do evento (`orcamento_informativo`, `equipamento_pronto`) e parâmetros de corpo na ordem de `parametros`. Parâmetros vazios viram `-` (a Meta recusa vazio). O texto dos modelos submetidos precisa casar com os parâmetros enviados. **Escrita conforme a documentação, não testada contra a Meta.**

### Segredos e configuração

Segredos da função (nunca no banco nem no desktop):

| Segredo | Conteúdo |
|---|---|
| `ENVIO_WHATSAPP_PROCESSOR_SECRET` | 32+ caracteres; o Cron o envia no cabeçalho `x-processador-secret` |
| `WHATSAPP_TOKENS` | JSON `{"<empresa_id>": "<token do provedor>"}` |
| `WHATSAPP_GRAPH_VERSION` | Opcional (padrão `v21.0`) |

Agendamento (execute uma vez no projeto, guardando o segredo no Vault do Supabase):

```sql
select cron.schedule('envio-whatsapp', '10 seconds', $$
  select net.http_post(
    url := 'https://<projeto>.supabase.co/functions/v1/envio-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-processador-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'envio_whatsapp_processor_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000
  );
$$);
```

Ativar uma empresa (reversível):

```sql
insert into envio_whatsapp_config_empresa (empresa_id, modo, provedor, evolution_api_url)   -- ou cloud_phone_number_id / cloud_waba_id
values (<id>, 'CENTRAL', 'EVOLUTION', 'https://...')
on conflict (empresa_id) do update set modo = 'CENTRAL', provedor = excluded.provedor,
  evolution_api_url = excluded.evolution_api_url, atualizado_em = now();
-- Voltar: update envio_whatsapp_config_empresa set modo = 'LOCAL' where empresa_id = <id>;
```

Ao voltar para `LOCAL`, o que já está `PENDENTE` continua sendo enviado pelo processador enquanto o Cron estiver ativo, ou expira em 6 horas.

Antes de ligar uma empresa: aplicar 0033 e 0034, publicar a função, definir os segredos, agendar o Cron e testar com um número interno.

## Conteúdo da mensagem

`MensagemWhatsapp` (backend) carrega o texto da Evolution e, para a Cloud API, `template`, `parametros` e `url_botao`. No modo `CENTRAL` isso é gravado em `mensagem_payload`. No modo `LOCAL` o payload não é gravado. A Cloud API só é usada no modo `CENTRAL`.

## Destinatário e senha do portal

- **Destinatário escolhido no pedido.** `solicitar_envio_whatsapp` resolve o destinatário pelo cadastro atual, na ordem descrita em `PORTAL_CLIENTE.md` ("Envio do orçamento"). A fila grava o nome e o telefone desse momento; o processador central não refaz a escolha.
- **`senha_portal` não é persistida.** A senha criada no envio chega ao comando só nessa chamada. Não entra em `envios_whatsapp_pedidos`, em `envios_whatsapp_tentativas`, em `erro_resumo`, em log nem em `comunicacoes`, onde fica mascarada (`••••-••••-••••`).
- **Modo `CENTRAL`.** Com senha nova do portal, o comando **não enfileira**: não grava pedido nem tentativa e volta `estado: FALHOU`, `senhaRetida: true` e a mensagem "O envio central não leva a senha do portal. Use o envio manual.". A tela abre **Enviar manualmente** com a senha. Sem senha nova (o contato já tem senha), o central enfileira normalmente, com os modelos abaixo.

Como a senha nova nunca entra na fila, nenhum payload gravado carrega a senha nem a máscara.

## Modelos de template (Cloud API)

| Caso | Modelo | Parâmetros |
|---|---|---|
| Orçamento sem portal | `orcamento_informativo` | 4: contato, equipamento, total, prazo |
| Pode aceitar ou recusar, sem senha nova | `orcamento_portal` | 4: contato, equipamento, total, prazo |
| Só acompanha, sem senha nova | `orcamento_informativo` | 4: contato, equipamento, total, prazo |
| Pode aceitar ou recusar, com senha nova | `orcamento_portal_v2` | 7 (ver `MODELOS_WHATSAPP_META.md`) |
| Só acompanha, com senha nova | `orcamento_portal_acompanhar_v2` | 7 (ver `MODELOS_WHATSAPP_META.md`) |

Os `_v2` só são usados com senha nova; sem ela valem os modelos já aprovados.

> **Aprovação da Meta:** os dois `_v2` precisam ser aprovados no Gerenciador do WhatsApp antes de um envio com senha nova pela Cloud API. Até lá, esse caso falha na Cloud e o técnico usa **Enviar manualmente**; os envios sem senha nova não dependem deles. Nomes, ordem e quantidade de parâmetros são o contrato de `MODELOS_WHATSAPP_META.md`.

## Testes

- Unitários Rust (`cargo test --bin autoos envio_whatsapp`): formatação, mensagens, token fora do histórico, mascaramento.
- Integração (`npm run qa:integrations:whatsapp-queue`, em banco `autoos_stock_test*`, com servidor HTTP local no lugar da Evolution): idempotência, reenvio, concorrência (um só envio), HTTP 5xx → incerto → confirmação, HTTP 400, cliente sem telefone, tentativa abandonada, imutabilidade, versão do orçamento (reenvio reaproveita a versão; edição gera novo evento), tipo `orcamento_decisao` recusado.
- Frontend: serviço de WhatsApp e processador (`envio-whatsapp-function.test.ts`).

- Banco: concorrência de reservas (20 tentativas, 4 processadores), posse na conclusão, varredura, imutabilidade e permissões como `service_role` (sem acesso direto às tabelas).
- Integração Rust (modo central): enfileirar sem chamar o provedor, fila que impede duplicidade, 8+ reservas simultâneas sem repetição, link gerado só no envio com hash gravado, histórico e fila sem token, orçamento editado antes da reserva.
- Edge Function (`envio-whatsapp-function.test.ts`): autenticação do Cron, reserva uma a uma, Evolution e Cloud API, classificação de erros, evento obsoleto, token ausente, conclusão repetida, e ausência de segredos em log.

## Próximos passos

1. Testar com a Meta e/ou a Evolution reais e ajustar os modelos aprovados aos parâmetros.
2. Webhook de entrega (`ENVIADA` → entregue/falhou) e reconciliação das tentativas `INCERTA` pelo identificador da Meta.
3. `codigo_verificacao` (modelo de autenticação) pelo mesmo processador.
