# Reconciliação do workflow AutoOS — 30/09/2026

## Decisão para começar

1. O [PR #101](https://github.com/ph66ng2/AutoOs/pull/101) foi mesclado na `feature`. Sua entrega, **Insumos SaaS Online**, agora tem o ticket histórico `AO-INS-ONLINE-001` no catálogo. O merge não prova aplicação em produção: o próprio PR declara migração aplicada em staging e suíte de testes não executada.
2. O [PR #102](https://github.com/ph66ng2/AutoOs/pull/102), o [AutoPlatform #10](https://github.com/ph66ng2/AutoPlatform/pull/10) e o [AutoBO #9](https://github.com/ph66ng2/AutoBO/pull/9) mesclaram a mudança de rumo. O ticket de alinhamento `AO-WF-RECONCILE-001` fica em revisão enquanto esta reconciliação do catálogo e do painel aguarda merge humano.
3. **O próximo ticket de implementação no AutoOS, após essa revisão, é `AO-SUITE-001`**: aprovar a autoridade dos dados de cliente, produto, serviço, estoque, equipamento e OS. Não se deve portar o AutoBO inteiro em bloco. Depois do ownership, `AO-SUITE-002` produz o fato faturável, condicionado ao contrato externo no AutoPlatform. Os `AO-FISC-*` seguem os bloqueios do DAG.
4. O desktop AutoOS opera Online. **PowerSync é reservado ao futuro Mobile Field**. Os tickets que prescreviam PowerSync/Offline para desktop foram classificados como *substituídos*, preservando seu estado factual. A futura trilha mobile exige tickets próprios quando entrar no foco.

## PRs mesclados que não tinham ticket no catálogo

Os IDs abaixo foram incluídos como histórico `merged` porque os PRs foram mesclados. `merged` aqui significa código/documentação integrados à `feature`, não homologação nem promoção para `master`.

| PR | Ticket recuperado | Entrega |
| --- | --- | --- |
| [#72](https://github.com/ph66ng2/AutoOs/pull/72) | `AO-EQP-ONLINE-001` | Equipamentos Online |
| [#74](https://github.com/ph66ng2/AutoOs/pull/74) | `AO-SAAS-ID-001` | identidade individual vinculada à empresa |
| [#77](https://github.com/ph66ng2/AutoOs/pull/77) | `AO-SAAS-SESSION-001` | perfil e sessão individual |
| [#78](https://github.com/ph66ng2/AutoOs/pull/78) | `AO-SAAS-AUTHZ-001` | autorização sensível no servidor |
| [#80](https://github.com/ph66ng2/AutoOs/pull/80) | `AO-SAAS-INVITE-001` | convites de usuários |
| [#81](https://github.com/ph66ng2/AutoOs/pull/81) | `AO-SAAS-TEAM-001` | acesso da equipe |
| [#83](https://github.com/ph66ng2/AutoOs/pull/83) | `AO-EQP-ONLINE-002` | informações e contatos do equipamento |
| [#84](https://github.com/ph66ng2/AutoOs/pull/84) | `AO-EQP-ONLINE-003` | verificação e orçamento |
| [#85](https://github.com/ph66ng2/AutoOs/pull/85) | `AO-EQP-ONLINE-004` | comunicações |
| [#86](https://github.com/ph66ng2/AutoOs/pull/86) | `AO-EQP-ONLINE-005` | histórico |
| [#98](https://github.com/ph66ng2/AutoOs/pull/98) | `AO-SRV-ONLINE-001` | Serviços Online |
| [#101](https://github.com/ph66ng2/AutoOs/pull/101) | `AO-INS-ONLINE-001` | Insumos Online |

Os vínculos e ressalvas específicos de cada entrega estão nos campos `evidence` e `validationGap` do `workflow.json`. Em especial, o [PR #80](https://github.com/ph66ng2/AutoOs/pull/80) ainda apontava lacuna no redirecionamento de convite; o [PR #98](https://github.com/ph66ng2/AutoOs/pull/98) não aplicou sua migração em staging no próprio PR; o [PR #101](https://github.com/ph66ng2/AutoOs/pull/101) não executou a suíte e não aplicou a migração em produção. Essas pendências não viram automaticamente novos tickets Fiscal: precisam de verificação específica antes de rollout SaaS.

## O que já batia e o que não virou entrega

IDs como `AO-CLI-ONLINE-004` ([#73](https://github.com/ph66ng2/AutoOs/pull/73)), `AO-CLI-003` ([#68](https://github.com/ph66ng2/AutoOs/pull/68)), `AO-SHELL-001` ([#67](https://github.com/ph66ng2/AutoOs/pull/67)), `AO-UPD-001/002/003` ([#65](https://github.com/ph66ng2/AutoOs/pull/65), [#66](https://github.com/ph66ng2/AutoOs/pull/66)), `AO-AUTH-004/005` ([#55](https://github.com/ph66ng2/AutoOs/pull/55)) e `AO-SUB-002` ([#43](https://github.com/ph66ng2/AutoOs/pull/43)) já constavam do catálogo com status compatível; não foram duplicados.

O [PR #99](https://github.com/ph66ng2/AutoOs/pull/99), associado a `AO-PS-005`, foi **fechado sem merge**. Não há evidência de conexão Cloud, streams persistentes ou validação A/B de staging. O ticket foi classificado como escopo substituído pela decisão de PowerSync apenas mobile, sem marcá-lo `merged`. `AO-PS-006/007/008` e `AO-SUB-004/005` também descreviam a antiga rota desktop Offline e ficam substituídos.

O [PR #30](https://github.com/ph66ng2/AutoOs/pull/30) entregou documentação de provisionamento, mas deixou `AO-AUTH-OPS-001` como trabalho futuro para o runbook produtivo; o ticket foi registrado como `blocked` e adiado. O [PR #54](https://github.com/ph66ng2/AutoOs/pull/54) retirou deliberadamente `AO-UI-001` a `AO-UI-023` do backlog; esses IDs não foram recriados.

## Regra de leitura

`status` informa o estado real do ticket. `roadmap.focusIds`, `deferredIds` e `supersededIds` indicam prioridade e direção de produto. O planejador e o painel não recomendam adiados ou substituídos para iniciar. Bloqueios entre repositórios em `externalPrerequisites` ainda precisam de conferência humana porque o planejador local não os executa.
