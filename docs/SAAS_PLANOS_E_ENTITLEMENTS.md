# Desktop Online e futuro Mobile Field

**Decisão atual:** PowerSync fica reservado ao futuro aplicativo **Mobile Field**. O AutoOS desktop interno e o desktop SaaS usam acesso remoto ao Supabase, autenticação e RLS; não inicializam PowerSync nem oferecem um modo Offline baseado nele. O [contrato anterior de dois planos desktop](_archive/SAAS_PLANOS_E_ENTITLEMENTS_DESKTOP_OFFLINE_OLD.md) é histórico e não deve orientar novas implementações.

Esta mudança de arquitetura ainda é de **planejamento**. Código e documentos legados de PowerSync podem continuar no repositório; não presuma que tenham sido retirados do bundle até um PR de implementação verificar isso. O marco imediato segue sendo Fiscal PROD BMITAG, depois Financeiro básico. Assinatura SaaS e Mobile Field vêm depois.

## Matriz de plataformas

| Capacidade | AutoOS interno (desktop) | SaaS Online (desktop) | Mobile Field (futuro) |
|---|---|---|---|
| Origem dos dados operacionais | Core AutoOS | Core AutoOS por API/adapter Supabase tenant-safe | Core AutoOS por contratos versionados |
| Supabase Auth e RLS | Conforme runtime interno | Sim, por usuário e empresa | A definir no contrato mobile |
| Operação sem rede | Não prometida por este roadmap | Não | Planejada e sujeita a piloto |
| PowerSync | Não | **Não** | **Candidato exclusivo para sincronização offline** |
| Token PowerSync | Nunca | Nunca | Somente após contrato mobile e autorização server-side |
| Estoque e ações financeiras | Operações autoritativas no servidor | Operações autoritativas no servidor | Não aceitar escrita offline sem regra de conflito específica |
| Prioridade agora | Fiscal PROD BMITAG | Pausada após módulos Online já entregues | Planejamento posterior |

O código SaaS Online já entregue — Clientes, Equipamentos, Serviços, Insumos, identidade e Equipe — permanece histórico válido. A mudança não marca nenhum desses PRs como desfeito nem cria uma migração de dados automática.

## Assinatura e capacidades

O servidor continua autoridade de assinatura, vínculo de empresa e capacidades. `AO-SUB-003` fica adiado até a retomada do SaaS. Um desktop não pode elevar permissões por flag local, receber `service_role`, senha PostgreSQL ou credencial administrativa.

Não reutilizar o antigo contrato `plan=offline`, `audience=autoos-desktop` e `offline_sync=true` para habilitar PowerSync no Tauri. Se Mobile Field vier a usar PowerSync, deverá receber contrato e tickets próprios com identidade, tenant, expiração, conflito, limpeza e evidência de staging. A relação entre oferta comercial e sincronização mobile será decidida nessa fase; não é implícita no preço ou no nome de um plano desktop.

## Tratamento dos tickets antigos

| Ticket | Situação de roadmap | Motivo |
|---|---|---|
| `AO-PS-005` | Substituído | Preparação de PowerSync para o antigo plano desktop Offline; PR de implementação foi fechado sem merge. |
| `AO-PS-006` | Substituído | Connector PowerSync Tauri/Rust não pertence ao desktop atual. |
| `AO-PS-007` | Substituído | Piloto `useClientes` offline no desktop não pertence à jornada atual. |
| `AO-PS-008` | Substituído | Gate conjunto Online/Offline desktop perdeu seu objeto. |
| `AO-SUB-004` | Substituído | Runtime alternando adapters Online/Offline no mesmo desktop perdeu seu objeto. |
| `AO-SUB-005` | Substituído | Downgrade com cache PowerSync desktop perdeu seu objeto. |
| `AO-SUB-003` | Adiado | Assinatura e entitlement server-side continuam necessários para SaaS comercial, sem implicar PowerSync desktop. |

Essas classificações não alteram `status` histórico. O planejador de ondas mostra `SUBSTITUIDA` ou `ADIADA` e recusa abrir worktree desses IDs até nova decisão registrada. Antes de qualquer trabalho mobile, criar tickets Mobile Field novos com escopo, dependências e testes próprios.
