# Backlog Pós-Go-Live - AutoOS

## Como ler este backlog

Existem **duas ordenações diferentes** por desenho:

- **Coluna `#` na tabela** — visão ampla por valor/percepção no roadmap (nem todas as linhas têm esforço comparável).
- **Secção “Hipóteses de Ganho”** — **ROI estimado** para próximos experimentos quando o objetivo é retorno rápido; pode divergir da ordem da tabela.

Itens grandes (**Push**, **App mobile**, **API pública**) devem ser planeados em **fases** (MVP técnico → piloto → escala); não aparecem na tabela como “do mesmo porte” que campos extras no Postgres.

---

## Priorização por Valor + Hipótese de Ganho

| # | Item | Usuário | Hipótese de Sucesso | Como Medir | Depende |
|---|------|---------|---------------------|-------------|---------|
| 1 | Notificações Push | Cliente final | Reduzir chamadas sobre status | # tickets status | Backend: push |
| 2 | App Mobile | Cliente final | Acesso remoto | Downloads | Backend: API |
| 3 | Relatórios Financeiros | Gestor | Decisão mais rápida | Tempo geração | DB: queries |
| 4 | Multi-empresa | BMITAG | Cobrança por filial | # empresas | DB: schema |
| 5 | Garantia Estendida | Gestor | Receita extra | # garantias | Backend: campos |
| 6 | Histórico de Peças | Técnico | Reparo mais rápido | Tempo busca | DB: index |
| 7 | API pública | Integração | Automação 3ºs | # integrações | Backend: auth |
| 8 | Backup Automático Nuvem | Suporte | Recuperação desastre | RTO/RPO | Infra: cloud |
| 9 | Checklist Segurança | Suporte | Compliance | # auditorias | Frontend: UI |
| 10 | Dashboard Customizável | Gestor | Visão personalizada | Tempo config | Frontend: drag-drop |

## Hipóteses de Ganho (ordenadas por ROI estimado)

1. **Garantia Estendida** — Receita recorrente, baixo esforço
2. **Relatórios Financeiros** — Alta utilidade, esforço médio
3. **API Pública** — Integrações = viralidade
4. **App Mobile** — Conveniência = retenção

## Dependências Técnicas

| Dependência | Impacto | Itens impactados |
|-------------|---------|-------------------|
| DB: schema multi-empresa | Alto | **4** (produto núcleo). **Escopo multi-filial** para **5** e **6**: útil quando houver várias empresas, mas **não é pré-requisito inviolável** para um MVP único-espaço — podem iniciar como campos/índices no modelo atual e evoluir. |
| Backend: API REST | Alto | **7**, **2** |
| Frontend: drag-drop | Baixo | **10** |
| Infra: cloud | Médio | **8** |

---

*Gerado em 2026-05-06 — pendente validação do product owner*
