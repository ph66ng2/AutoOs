# Planos SaaS e contrato de entitlement

## Decisões deste ticket

- Há um único AutoOS, um único binário e uma única base de código.
- Os planos técnicos são **Online** e **Offline**. Nomes, preços e ofertas podem mudar sem mudar os identificadores `online` e `offline`.
- O Supabase staging é compartilhado pelos dois planos. Apenas o Offline usa a instância PowerSync de staging.
- Assinatura e capacidades são autoritativas no servidor. O desktop apenas consome um entitlement assinado e mantém cache limitado quando necessário.
- A primeira entrega usa uma porta de cobrança independente de fornecedor; nenhum SDK ou formato de Stripe (ou equivalente) entra no domínio de assinatura.
- O app distribuído nunca recebe senha PostgreSQL, `service_role`, secret key ou credencial administrativa do PowerSync.

Estas decisões tratam exclusivamente do SaaS. A `master` continua como baseline interno da BMITAG, sem PowerSync.

## Matriz de capacidades

| Capacidade | Online | Offline |
| --- | --- | --- |
| Supabase Auth e RLS | Sim | Sim |
| Mesmas páginas e regras de domínio | Sim | Sim |
| Leitura/escrita remota | Sim, com rede | Sim, quando sincronizado |
| Operação sem rede | Não | Sim, até expirar o entitlement offline |
| Cache local PowerSync | Não inicializa | Sim |
| Fila e sincronização local | Não | Sim |
| Solicitar token PowerSync | Nunca | Somente com `offline_sync=true` |
| Chave publicável Supabase no app | Sim | Sim |
| `service_role`, senha PostgreSQL e segredos | Nunca | Nunca |

O plano é consequência de capacidades assinadas, não de uma flag editável localmente. A capacidade que distingue o Offline é `offline_sync`; o cliente deve negar qualquer capacidade desconhecida em vez de supor que está liberada.

## Estados de assinatura e política v1

O estado pertence a uma `empresa_id`; o usuário só acessa a empresa a que está autorizado. O servidor avalia datas e transições em UTC.

| Estado | Acesso Online | `offline_sync` | Regra operacional |
| --- | --- | --- | --- |
| `trial` | Permitido | Não por padrão | Trial é Online; avaliação Offline exige capacidade emitida pelo servidor. |
| `active` | Permitido | Conforme plano | Emite o entitlement normal do plano contratado. |
| `past_due` | Permitido por 7 dias | Não é renovado | Exibe aviso; não recebe nova concessão Offline. |
| `grace` | Permitido até o fim da carência | Somente drenagem | Máximo de 7 dias; bloqueia novas operações offline e permite terminar pendências existentes. |
| `canceled` | Permitido até `current_period_end` | Conforme entitlement vigente | Cancelamento programado, não revogação imediata. Depois vira `expired`. |
| `expired` | Negado | Negado | Não há token novo nem acesso a dados locais sincronizados. |

`past_due` não pode virar uso perpétuo. O servidor faz a transição para `grace` ou `expired` e emite novo entitlement; relógio ou configuração local não prolongam a carência.

### Downgrade e retenção

1. No downgrade Offline → Online, o servidor aumenta a revisão do entitlement, deixa de emitir novos tokens PowerSync e informa o fim da carência.
2. Em `grace`, a UI bloqueia novas mutações offline. A implementação posterior deve limitar a drenagem de alterações e uploads que já estavam pendentes também no servidor, não somente na interface.
3. O app exibe pendências e tenta sincronizar com rede; não promete envio se a rede permanecer indisponível.
4. No fim da carência, o runtime desconecta PowerSync e remove o cache local do tenant. Não permanece uma cópia navegável de dados pagos após a revogação.
5. Dados remotos ficam no servidor por 90 dias após `expired`, sem acesso pelo desktop, e depois seguem a política operacional de retenção/apagamento. A janela precisa de revisão jurídica/comercial antes do lançamento público, mas não concede acesso ao cliente.

Um upgrade só entra em vigor quando o servidor emitir um entitlement novo e válido. O cache local não transforma Online em Offline.

## Contrato de entitlement v1

O endpoint autenticado retorna um JWS assinado pelo servidor. A assinatura usa chave assimétrica rotacionável; o aplicativo contém somente chaves públicas identificadas por `kid`. A chave privada fica server-side.

```json
{
  "version": 1,
  "entitlement_id": "ent_01H...",
  "revision": 42,
  "issuer": "autoos-entitlements",
  "audience": "autoos-desktop",
  "company_id": "11111111-1111-1111-1111-111111111111",
  "subject_user_id": "22222222-2222-2222-2222-222222222222",
  "plan": "offline",
  "subscription_state": "active",
  "capabilities": {
    "online_access": true,
    "offline_sync": true,
    "offline_write": true
  },
  "issued_at": "2026-08-17T12:00:00Z",
  "not_before": "2026-08-17T12:00:00Z",
  "expires_at": "2026-08-20T12:00:00Z"
}
```

O cliente obrigatoriamente valida assinatura, `kid`, `issuer`, `audience`, versão, `not_before`, `expires_at`, usuário da sessão e vínculo da `company_id`. Ele armazena apenas o JWS integral e metadados não privilegiados; rejeita algoritmos, versões e capacidades desconhecidas; e não aceita regressão de `revision` depois de uma sessão online.

O TTL normal é de até **15 minutos** para Online e **72 horas** para Offline. Online não funciona sem conexão e entitlement atual. Offline pode trabalhar sem rede somente até a expiração da concessão assinada: isso limita, mas não elimina, a janela de revogação de uma máquina realmente desconectada.

O token PowerSync é outro artefato, curto e tenant-safe. Ele é solicitado somente depois de `offline_sync=true`, contém a empresa e expiração próprias e não substitui o entitlement. O Online nunca chama esse fluxo.

## Limites de autoridade

| Controle | Autoridade | Papel do desktop |
| --- | --- | --- |
| Estado, plano e carência | Servidor | Exibir estado recebido |
| Emissão/revogação de entitlement | Servidor | Validar assinatura e TTL |
| Token PowerSync | Servidor | Usar token curto já autorizado |
| Tenant e dados | Supabase Auth + RLS | Enviar JWT; não escolher empresa livremente |
| Cache e UX de plano | Desktop | Guardar cópia assinada e avisos |
| Preferências visuais | Desktop | Sem efeito de autorização |

Editar `plano=offline`, DevTools ou cache não cria `offline_sync`: não há assinatura válida, o servidor não emite token e RLS continua limitando dados remotos. O app registra o maior horário/revisão vistos do servidor; uma regressão de relógio exige validação online. Isso reduz a fraude de prazo, sem alegar revogação instantânea durante isolamento real.

## Porta de cobrança independente de fornecedor

O domínio server-side expõe uma interface lógica `BillingProvider`:

```text
verifyWebhook(request) -> VerifiedProviderEvent
normalizeEvent(event) -> BillingEvent
reconcileSubscription(companyId) -> SubscriptionSnapshot
createCustomerReference(companyId) -> ProviderReference
requestCancellation(subscriptionId) -> SubscriptionSnapshot
```

`BillingEvent` é idempotente por fornecedor + `provider_event_id` e guarda tipo normalizado, empresa, momento e payload sanitizado para auditoria. O serviço de entitlement lê o estado normalizado da assinatura, não payloads nem SDKs do provedor. Trocar Stripe, Mercado Pago ou outro fornecedor muda somente o adapter server-side. Segredos de webhook e cobrança nunca entram no Git ou desktop.

## Revisão e evidências do ticket

| Cenário | Resultado esperado |
| --- | --- |
| Online ativo | CRUD remoto RLS; não abre PowerSync nem pede token. |
| Offline ativo | Valida entitlement, inicia PowerSync e sincroniza apenas o tenant autorizado. |
| Entitlement expirado | Não inicializa/renova PowerSync; Online pede reconexão ou renovação. |
| Cache adulterado | Falha em JWS/token e não concede capacidade. |
| `past_due` ou `grace` | Aviso; não renova Offline; apenas drenagem definida. |
| `canceled` antes do período final | Mantém somente o entitlement vigente até `current_period_end`. |
| `expired` | Desconecta sync, remove cache ao fim da carência e nega acesso remoto. |

Os exemplos usam IDs fictícios. Este ticket não acessa Supabase, PowerSync, cobrança ou dados internos. Endpoints, RLS, tokens e limpeza efetiva de cache pertencem aos tickets posteriores.
