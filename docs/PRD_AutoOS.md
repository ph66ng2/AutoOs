# Documento de Requisitos do Produto — AutoOS

**Versão:** 1.0
**Data:** Junho de 2026
**Empresa:** BMITAG
**Classificação:** Confidencial — Uso Interno e Investidores

---

## Sumário

1. [Resumo Executivo](#1-resumo-executivo)
2. [O Problema](#2-o-problema)
3. [A Solução](#3-a-solução)
4. [Produto Atual — v1.0.0](#4-produto-atual--v100)
5. [Arquitetura Técnica](#5-arquitetura-técnica)
6. [Cenário Competitivo](#6-cenário-competitivo)
7. [Modelo de Negócio](#7-modelo-de-negócio)
8. [Estratégia de Entrada no Mercado](#8-estratégia-de-entrada-no-mercado)
9. [Roadmap — Próximos Passos](#9-roadmap--próximos-passos)
10. [Pedido de Investimento](#10-pedido-de-investimento)
11. [Equipe e Credenciais](#11-equipe-e-credenciais)
12. [Riscos e Mitigação](#12-riscos-e-mitigação)

---

## 1. Resumo Executivo

O AutoOS é um sistema desktop desenvolvido pela BMITAG para a gestão completa de empresas de manutenção e serviço de impressoras. O produto cobre desde o recebimento técnico de equipamentos até o controle de estoque de insumos, passando por comunicações operacionais com clientes e um rigoroso sistema de segurança com perfis, PIN e auditoria.

Construído sobre uma stack moderna e de alto desempenho — Tauri 2.x, React 18, TypeScript, Rust e PostgreSQL —, o AutoOS entrega uma aplicação nativa para Windows e Linux, sem dependência de nuvem para suas operações essenciais. Isso significa que o software funciona mesmo em ambientes com conectividade limitada, uma realidade comum em pequenas oficinas técnicas.

O produto já se encontra na versão 1.0.0, com todas as funcionalidades centrais implementadas e validadas. O ciclo de desenvolvimento incluiu endurecimento de segurança, suporte a concorrência para múltiplos técnicos, pipeline de testes automatizados (unitários, integração e ponta a ponta), backup e restore de banco de dados integrados ao aplicativo, e prontidão para distribuição Windows com assinatura Authenticode.

O mercado de assistência técnica de impressoras no Brasil é fragmentado e carente de ferramentas específicas. A maioria das empresas opera com planilhas, grupos de WhatsApp e processos manuais que geram perda de informação, retrabalho e risco financeiro. O AutoOS resolve esse problema com um produto verticalizado, pronto para uso imediato e com um roadmap claro para expansão de funcionalidades. O investimento buscado destina-se à execução comercial e à consolidação da presença no mercado.

---

## 2. O Problema

### 2.1 Dores das Empresas de Serviço de Impressoras

Empresas de manutenção de impressoras no Brasil enfrentam desafios operacionais recorrentes que impactam diretamente sua rentabilidade e capacidade de crescimento:

**Recebimento técnico desorganizado.** Quando um cliente entrega um equipamento, a informação sobre o defeito relatado, acessórios, patrimônio e estado visual do aparelho frequentemente fica registrada em papel, cadernos ou mensagens soltas de WhatsApp. Não há um fluxo padronizado de intake técnico, o que gera disputas sobre o estado do equipamento na devolução e perda de histórico entre atendimentos.

**Controle de estoque manual.** Toners, peças de reposição, cilindros e cartuchos são gerenciados em planilhas ou de forma mental. Não há trilha de movimentações, alerta de estoque baixo ou validação de entrada e saída. O resultado é falta de insumos no momento do reparo ou excesso de capital parado em estoque desnecessário.

**Caos nas comunicações com clientes.** O WhatsApp é o canal principal, mas as conversas se perdem entre grupos, contatos pessoais e trocas de aparelho. Não há histórico vinculado ao equipamento ou ao cliente, e o técnico não sabe o que já foi comunicado. A ausência de registro formal de orçamentos e aprovações gera atrasos e mal-entendidos.

**Fluxo inexistente de orçamento e aprovação.** O técnico faz a verificação, mas o orçamento não é gerado de forma padronizada. Não há um documento profissional com layout consistente, prazo e valor, que possa ser enviado ao cliente e registrado como aprovado ou reprovado.

**Risco de perda de dados.** A maioria dessas empresas não possui cultura de backup. Um problema no computador, um ransomware ou um disco defeituoso significa a perda de todo o histórico de clientes, equipamentos e movimentações. Não há procedimento de recuperação testado.

### 2.2 Dimensionamento do Mercado

O Brasil possui mais de 15.000 empresas de assistência técnica de impressoras e equipamentos de impressão, considerando desde pequenas oficinas com 1-3 técnicos até empresas regionais com 10-20 colaboradores. Esse número inclui:

- Assistência técnica autorizada de fabricantes (HP, Epson, Brother, Samsung)
- Empresas independentes de manutenção de impressoras
- Revendedores de toner e suprimentos que oferecem serviço técnico
- Copiadoras e locadoras de equipamentos com operação de manutenção interna

O mercado é predominantemente composto por empresas de pequeno porte (1-10 funcionários) que não são atendidas por ERPs genéricos, caros e complexos demais para sua realidade.

---

## 3. A Solução

### 3.1 O Que é o AutoOS

O AutoOS é um sistema desktop completo para a gestão de uma empresa de serviço de impressoras. Ele unifica em uma única aplicação os quatro pilares operacionais essenciais:

### 3.2 Pilares do Produto

| Pilar | Descrição | Funcionalidades |
|-------|-----------|-----------------|
| **Recebimento Técnico e Ciclo de Vida do Equipamento** | Fluxo completo desde a entrada do equipamento até a entrega ao cliente | 12 status operacionais, checklist de verificação técnica customizável, registro fotográfico de entrada e saída, geração de orçamento em PDF |
| **Controle de Estoque de Insumos** | Gestão de produtos com trilha de movimentações | Entrada e saída validadas, alerta de estoque baixo, categorias de produtos, saldo em tempo real |
| **Comunicações Operacionais** | Histórico centralizado de interações com clientes | Envio de WhatsApp e email pelo sistema, registro auditado de todas as comunicações, notificações automáticas por transição de status |
| **Segurança e Auditoria** | Controle de acesso local com rastreabilidade | Perfis de usuário com PIN, permissões granulares por ação sensível, trilha de auditoria, backup e restore de banco integrados |

### 3.3 Fluxos Principais

**Fluxo de Recebimento Técnico:**
1. Técnico recebe o equipamento do cliente
2. Registra defeito relatado, patrimônio, acessórios e fotos de entrada
3. Equipamento entra com status `RECEBIDO`
4. Técnico realiza verificação técnica com checklist padronizado
5. Gera orçamento em PDF com serviços e peças necessárias
6. Envia orçamento por WhatsApp ou email
7. Cliente aprova ou reprova
8. Se aprovado, equipamento segue para `EM_MANUTENCAO` → `PRONTO` → `ENTREGUE`

**Fluxo de Controle de Estoque:**
1. Produto cadastrado com quantidade mínima e categoria
2. Entrada de estoque registrada com quantidade e observação
3. Saída de estoque validada contra saldo disponível
4. Sistema alerta quando estoque atinge nível crítico
5. Toda movimentação fica registrada com autor e data

**Fluxo de Segurança:**
1. Administrador configura PIN de acesso sensível
2. Cria perfis (ex.: Técnico, Gestor) com permissões específicas
3. Ações sensíveis (financeiro, exclusão, restore) exigem PIN
4. Toda tentativa de acesso é auditada com sucesso ou negação
5. Backup do banco pode ser gerado a qualquer momento pela interface

---

## 4. Produto Atual — v1.0.0

O AutoOS já possui um conjunto robusto de funcionalidades implementadas e validadas. Abaixo está o inventário factual do que está entregue:

### 4.1 Funcionalidades Entregues

| Funcionalidade | Status | Descrição |
|----------------|--------|-----------|
| Cadastro de clientes | ✅ | CRUD completo com busca, edição e exclusão |
| Gestão de equipamentos | ✅ | Ciclo de vida com 12 status e transições validadas |
| Verificação técnica | ✅ | Checklist customizável com 7 itens padrão, registro de serviços e peças |
| Geração de orçamento | ✅ | PDF com layout profissional, logo e resumo financeiro |
| Controle de estoque | ✅ | Entrada, saída, categorias e alerta de estoque baixo |
| Comunicações | ✅ | WhatsApp e email com registro auditado no banco |
| Perfis e permissões | ✅ | PIN local, permissões granulares, catálogo de perfis |
| Trilha de auditoria | ✅ | Registro de ações sensíveis com ator, tipo e resultado |
| Backup PostgreSQL | ✅ | Geração de backup SQL e DUMP pela interface |
| Restore PostgreSQL | ✅ | Restauração com confirmação explícita e reaplicação de migrações |
| Diagnóstico de suporte | ✅ | Pacote JSON exportável com logs, schema e status do ambiente |
| Concorrência | ✅ | Proteção contra escrita simultânea com versionamento (`atualizado_em`) |
| Build Windows | ✅ | Authenticode timestamp configurado, versão 1.0.0 |
| Pipeline de QA | ✅ | Vitest (unitários), Playwright (E2E), bins Rust (integração) |

### 4.2 Fluxo de Status de Equipamentos

O AutoOS implementa 12 status operacionais que cobrem todo o ciclo de vida de um equipamento em manutenção:

```
RECEBIDO → EM_VERIFICACAO → VERIFICADO → AGUARDANDO_APROVACAO
    → APROVADO / REPROVADO → EM_MANUTENCAO → PRONTO → ENTREGUE
```

Cada transição pode exigir campos condicionais como valor do orçamento, prazo de entrega e valor final. O sistema registra uma timeline visual de todo o histórico de status.

### 4.3 Verificação Técnica

O componente de verificação técnica permite ao técnico:

- Executar checklist com 7 itens padrão (configurável)
- Registrar serviços necessários com descrição e valor de mão de obra
- Registrar peças necessárias com quantidade e custo
- Obter resumo financeiro automático (mão de obra + peças = total)
- Definir tempo estimado para o reparo

### 4.4 Segurança e Controle de Acesso

O sistema de segurança do AutoOS opera localmente, sem dependência de servidores externos:

- **PIN de acesso sensível:** configurado pelo administrador na primeira utilização
- **Perfis de usuário:** catálogo de perfis com nome, função e permissões
- **Permissões granulares:** cada ação sensível exige uma permissão específica (financeiro, exclusão, administração, etc.)
- **Auditoria:** toda tentativa de acesso sensível é registrada, seja bem-sucedida ou negada
- **Backup/restore:** integrados à interface com validação de ferramentas PostgreSQL

---

## 5. Arquitetura Técnica

### 5.1 Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Frontend | React 18 + TypeScript | Ecossistema maduro, tipagem forte |
| Desktop | Tauri 2.x | Binários leves, segurança nativa, multiplataforma |
| Backend | Rust | Performance, segurança de memória, IPC com frontend |
| UI | Tailwind CSS + shadcn/ui | Design consistente, componentes acessíveis |
| Banco | PostgreSQL 15+ | Confiabilidade, concorrência, migrações versionadas |
| Forms | React Hook Form + Zod | Validação tipada, performance |
| Tabelas | TanStack Table | Ordenação, filtros, paginação |
| Roteamento | React Router v6 | Navegação SPA com sidebar colapsável |

### 5.2 Estrutura do Projeto

```
AutoOS/
├── src/                          # Frontend React
│   ├── components/               # Componentes reutilizáveis (UI + domínio)
│   ├── hooks/                    # Hooks customizados (CRUD, status, acesso)
│   ├── lib/                      # Serviços (PDF, email, WhatsApp, banco)
│   ├── pages/                    # Páginas de rota (Dashboard, Clientes, etc.)
│   └── types/                    # Tipos TypeScript compartilhados
├── src-tauri/                    # Backend Tauri (Rust)
│   ├── migrations/               # Migrações PostgreSQL versionadas
│   └── src/
│       ├── commands/             # Comandos IPC (auth, CRUD, utilitários)
│       ├── db.rs                 # Pool de conexões + migrações sqlx
│       └── main.rs               # Entry point + inicialização
└── e2e/                          # Testes Playwright
```

### 5.3 Segurança Arquitetural

- **Sem dependência de nuvem para operação central:** o sistema funciona com PostgreSQL local ou em servidor LAN
- **Autenticação local por PIN:** sem servidores de identidade externos
- **Permissões no backend Rust:** toda ação sensível é verificada antes da escrita no banco
- **Proteção contra concorrência:** versionamento com `atualizado_em` impede sobrescrita silenciosa
- **Backup integrado:** `pg_dump` e `pg_restore` chamados pelo aplicativo com auditoria

### 5.4 Pirâmide de Testes

| Nível | Ferramenta | Cobertura |
|-------|------------|-----------|
| Unitários | Vitest | Serviços frontend, hooks, validações |
| Integração | Bins Rust (`p1_*`) | Backend com PostgreSQL real, permissões, concorrência |
| E2E | Playwright | Fluxos web completos (smoke: 4 testes) |
| Smoke | Binário `runtime_smoke` | CRUD real com dados persistidos |

---

## 6. Cenário Competitivo

### 6.1 Competidores Diretos

ERPs genéricos de mercado (ex.: Bling, Tiny, Omie) oferecem módulos de estoque e cadastro de clientes, mas não compreendem o fluxo específico de recebimento técnico de equipamentos. Eles tratam o serviço de manutenção como uma ordem de serviço genérica, sem os 12 status operacionais, o checklist de verificação técnica ou o registro fotográfico de entrada e saída.

### 6.2 Competidores Indiretos

- **Planilhas Excel:** a maioria das empresas usa planilhas para controle de estoque e cadastro de clientes. São frágeis, não suportam concorrência e não possuem trilha de auditoria.
- **Grupos de WhatsApp:** usados para comunicação com clientes, mas sem histórico vinculado ao equipamento, sem registro formal de orçamentos e sem controle de acesso.
- **Sistemas de ordem de serviço genéricos:** existem soluções web de OS, mas nenhuma verticalizada para impressoras com o fluxo completo de recebimento, verificação e controle de insumos.

### 6.3 Diferenciais do AutoOS

| Diferencial | AutoOS | ERP Genérico | Planilha + WhatsApp |
|-------------|--------|--------------|---------------------|
| Fluxo de recebimento técnico | ✅ 12 status + checklist | ❌ OS genérica | ❌ Manual |
| Controle de estoque com trilha | ✅ Entrada/saída auditada | ⚠️ Básico | ❌ Sem trilha |
| Comunicações com histórico | ✅ WhatsApp + email auditados | ❌ Sem integração | ⚠️ Sem vínculo |
| Geração de orçamento em PDF | ✅ Layout profissional | ⚠️ Genérico | ❌ Manual |
| Segurança com perfis e PIN | ✅ Granular | ⚠️ Básico | ❌ Inexistente |
| Backup integrado | ✅ SQL + DUMP | ⚠️ Depende do ERP | ❌ Inexistente |
| Operação offline/local | ✅ Sem nuvem obrigatória | ❌ Cloud | ✅ Local |
| Concorrência protegida | ✅ Versionamento | ⚠️ Variável | ❌ Sem proteção |
| Custo de aquisição | ✅ Acessível (vertical) | ❌ Alto | ✅ Gratuito (mas ineficiente) |

### 6.4 Vantagem Competitiva Sustentável

A especialização vertical é o principal diferencial. O AutoOS entende o fluxo de uma empresa de manutenção de impressoras porque foi construído especificamente para isso. Cada funcionalidade reflete uma necessidade real do dia a dia operacional, não uma adaptação de um módulo genérico.

Além disso, a arquitetura desktop-first com operação local elimina a objeção comum de "meus dados estão na nuvem de terceiros", que é significativa para empresas que lidam com informações de clientes e equipamentos de valor.

---

## 7. Modelo de Negócio

### 7.1 Modelo de Licenciamento

O AutoOS será comercializado sob modelo de licença por computador/empresa, com as seguintes características:

- **Licença perpétua ou anual:** opção de compra única com direito a atualizações por 12 meses, ou assinatura anual com atualizações contínuas
- **Escopo por instalação:** cada licença cobre uma instalação do aplicativo (um computador ou servidor LAN)
- **Suporte incluso:** suporte técnico básico incluído na licença, com contratos de suporte premium como receita recorrente

### 7.2 Público-Alvo

| Segmento | Tamanho | Necessidade Principal |
|----------|---------|----------------------|
| Assistência técnica independente | 1-5 funcionários | Organização do recebimento técnico e estoque |
| Revendedor de toner com serviço | 3-10 funcionários | Integração entre venda de suprimentos e manutenção |
| Locadora de impressoras | 5-20 funcionários | Gestão de equipamentos em campo e manutenção preventiva |
| Autorizada de fabricante | 5-15 funcionários | Padronização do fluxo técnico e auditoria |

### 7.3 Canais de Distribuição

- **Venda direta:** contato comercial com empresas da região de atuação inicial
- **Parcerias com distribuidores:** revendedores de peças, toners e suprimentos para impressoras como canal de indicação e revenda
- **Indicação entre empresas do setor:** o nicho de assistência técnica de impressoras é altamente conectado, com forte rede de indicações

### 7.4 Receita Recorrente Futura

- **Contratos de suporte premium:** suporte técnico prioritário, treinamento e configuração inicial
- **Backup em nuvem (futuro):** serviço opcional de backup automático para nuvem, com custo mensal
- **Módulo financeiro (futuro):** integração com sistema de faturamento AutoBO, com receita compartilhada

---

## 8. Estratégia de Entrada no Mercado

### 8.1 Fase 1 — Beta Controlado

**Objetivo:** validar o produto em ambiente real com empresas conhecidas.

- Selecionar 5 a 10 empresas de assistência técnica para uso beta
- Coletar feedback sobre usabilidade, fluxos e funcionalidades faltantes
- Ajustar o produto com base nas observações reais de operação
- Gerar cases de sucesso e depoimentos para uso comercial

**Critério de sucesso:** todas as empresas beta operam o sistema de forma autônoma após onboarding inicial, com redução perceptível de erros operacionais.

### 8.2 Fase 2 — Lançamento Regional

**Objetivo:** estabelecer presença em um estado brasileiro específico.

- Focar em um estado com concentração de empresas do setor (ex.: São Paulo, Minas Gerais, Rio Grande do Sul)
- Ação comercial direta com visitas e demonstrações
- Parceria com 1-2 distribuidores regionais de peças e toners
- Presença em eventos e feiras do setor de impressão na região

**Critério de sucesso:** 20-50 empresas licenciadas no estado alvo em 12 meses.

### 8.3 Fase 3 — Expansão Nacional

**Objetivo:** escalar via parcerias com distribuidores nacionais.

- Rede de distribuidores de peças e suprimentos como revendedores
- Programa de indicação com incentivo para empresas já clientes
- Marketing digital focado no nicho (SEO, conteúdo técnico, redes sociais)
- Possível expansão para países da América Latina com mercado similar

**Critério de sucesso:** 200+ empresas licenciadas em 24 meses.

### 8.4 Estratégia de Canal

Os distribuidores de peças, toners e suprimentos para impressoras são o canal ideal porque:

- Já possuem relacionamento com o público-alvo
- Visitam regularmente as empresas de assistência técnica
- Têm interesse em que seus clientes sejam mais eficientes (mais reparos = mais peças vendidas)
- Podem oferecer o AutoOS como valor agregado à compra de suprimentos

---

## 9. Roadmap — Próximos Passos

### 9.1 Curto Prazo (P3 — Decisões Arquiteturais)

| Item | Descrição | Impacto |
|------|-----------|---------|
| Avaliação de backend central | Comparar modelo atual (Tauri + Rust local) com serviço centralizado | Define estratégia de escala |
| Avaliação de Java | Analisar viabilidade de componentes Java para integração com sistemas legados | Expande opções de integração |

### 9.2 Médio Prazo (P4 — Backlog Pós Go-Live)

| Item | Descrição | Valor |
|------|-----------|-------|
| Recepção de respostas WhatsApp | Receber e registrar respostas de clientes no sistema | Fecha o ciclo de comunicação |
| Customização de dados da empresa | Logo, nome, endereço no orçamento PDF | Profissionalização |
| Prazos padrão no orçamento | Configurar prazos default por tipo de serviço | Agilidade operacional |
| Checklists customizáveis | Permitir que cada empresa configure seu checklist de verificação | Adaptação ao fluxo real |
| Relatórios CSV/Excel | Exportação de dados para planilhas | Flexibilidade analítica |
| Notificações internas | Alertas dentro do sistema para ações pendentes | Redução de esquecimentos |

### 9.3 Longo Prazo (Backlog Estratégico)

| Item | Descrição | Dependência |
|------|-----------|-------------|
| Notificações Push | Envio de notificações ao cliente sobre status do equipamento | Backend de push |
| Aplicativo Mobile | App para consulta de status e comunicação pelo cliente | API pública |
| Relatórios Financeiros | Dashboard financeiro com métricas de receita, custo e margem | Consultas DB |
| Suporte Multi-empresa | Gestão de múltiplas filiais ou empresas no mesmo sistema | Schema DB |
| Garantia Estendida | Módulo de gestão de garantia pós-reparo | Campos backend |
| API Pública | REST API para integração com sistemas de terceiros | Autenticação |
| Backup Automático em Nuvem | Backup periódico para serviço cloud | Infraestrutura |

---

## 10. Pedido de Investimento

### 10.1 Estágio

**Seed / Pre-Seed**

O AutoOS está em um momento único para investimento: o produto é funcional, validado tecnicamente e pronto para operação comercial. O que falta é execução de go-to-market.

### 10.2 Estado Atual

| Aspecto | Situação |
|---------|----------|
| Produto | v1.0.0 funcional, production-ready |
| Tecnologia | Stack moderna, testada e documentada |
| Segurança | Endurecida com PIN, permissões e auditoria |
| QA | Pipeline completo com testes automatizados |
| Distribuição | Build Windows pronto (pendente apenas certificado) |
| Comercial | Não iniciado — necessita equipe e estratégia |

### 10.3 Uso dos Recursos

| Área | Alocação Estimada | Justificativa |
|------|-------------------|---------------|
| Equipe comercial | 30-40% | Vendas, onboarding e relacionamento com clientes beta |
| Parcerias e marketing | 15-20% | Eventos, material comercial, programa de distribuidores |
| Jurídico e compliance | 5-10% | Licenciamento de software, contratos, proteção de propriedade intelectual |
| Infraestrutura cloud | 10-15% | Preparação para features futuras (backup em nuvem, API, push) |
| Capital de giro | 20-30% | Sustentação operacional por 12-18 meses |

### 10.4 O Que o Investidor Recebe

- Participação acionária em uma empresa B2B de software verticalizado
- Produto validado tecnicamente, sem risco de desenvolvimento inicial
- Mercado claro e acessível, com 15.000+ empresas potenciais no Brasil
- Equipe técnica com capacidade de entrega comprovada
- Roadmap estruturado com visão de curto, médio e longo prazo

---

## 11. Equipe e Credenciais

### 11.1 Empresa

**BMITAG** — empresa proprietária do AutoOS, com foco em desenvolvimento de software para nichos operacionais.

### 11.2 Competência Técnica

A equipe de desenvolvimento do AutoOS demonstra domínio em tecnologias de ponta:

- **Rust:** backend de alta performance com segurança de memória e concorrência controlada
- **React 18 + TypeScript:** frontend moderno com tipagem forte e componentes reutilizáveis
- **PostgreSQL:** banco de dados relacional com migrações versionadas e operações de backup/restore
- **Tauri 2.x:** framework desktop que produz binários leves e seguros
- **QA automatizado:** pirâmide de testes com Vitest, Playwright e bins de integração Rust

### 11.3 Entregas Comprovadas

O AutoOS v1.0.0 é uma aplicação de produção com:

- Mais de 10 tabelas no banco de dados com relacionamentos complexos
- 12 status operacionais com transições validadas e campos condicionais
- Sistema de segurança com perfis, PIN, permissões granulares e auditoria
- Pipeline de testes com cobertura de unitários, integração e E2E
- Documentação operacional completa com runbooks de backup e restore
- Prontidão para distribuição Windows com assinatura Authenticode

---

## 12. Riscos e Mitigação

### 12.1 Risco de Adoção

**Risco:** empresas acostumadas com planilhas e processos manuais podem resistir à mudança para um sistema estruturado.

**Mitigação:**
- Onboarding guiado com configuração inicial assistida
- Ferramentas de migração de dados a partir de planilhas existentes
- Interface intuitiva baseada em fluxos que o técnico já conhece
- Período de teste gratuito para redução da barreira de entrada

### 12.2 Risco Técnico

**Risco:** dependência de PostgreSQL local pode ser uma barreira para empresas sem conhecimento técnico interno.

**Mitigação:**
- Documentação operacional detalhada com passo a passo de instalação
- Runbook de backup e restore testado e validado
- Diagnóstico de suporte integrado com exportação de pacote JSON
- Plano futuro de opção cloud para empresas que preferirem infraestrutura gerenciada

### 12.3 Risco Competitivo

**Risco:** grandes players de ERP podem entrar no nicho de serviço de impressoras.

**Mitigação:**
- Especialização vertical como barreira de entrada: o AutoOS entende o fluxo específico que ERPs genéricos não cobrem
- Agilidade de desenvolvimento: equipe enxuta focada em um nicho responde mais rápido a necessidades do que grandes empresas
- Relacionamento próximo com o cliente: feedback direto molda o produto de forma mais precisa
- Custo acessível: preço adequado ao porte das empresas alvo

### 12.4 Risco de Execução

**Risco:** equipe pequena pode ter dificuldade em escalar comercialmente.

**Mitigação:**
- Operação enxuta com foco em um nicho bem definido
- Canal de distribuição via distribuidores reduz necessidade de força de vendas própria
- Produto auto-suficiente com documentação e suporte integrado
- Roadmap priorizado por valor, não por volume de funcionalidades

---

## Apêndice A — Glossário Técnico

| Termo | Definição |
|-------|-----------|
| Tauri | Framework para construção de aplicativos desktop com frontend web e backend Rust |
| Rust | Linguagem de programação focada em segurança de memória e performance |
| PostgreSQL | Sistema de gerenciamento de banco de dados relacional open-source |
| sqlx | Biblioteca Rust para acesso a banco de dados com verificação de queries em tempo de compilação |
| shadcn/ui | Coleção de componentes de UI reutilizáveis para React |
| Vitest | Framework de testes unitários para JavaScript/TypeScript |
| Playwright | Framework de testes E2E para aplicações web |
| Authenticode | Tecnologia de assinatura digital de executáveis Windows |

## Apêndice B — Referências do Projeto

| Documento | Localização |
|-----------|-------------|
| README principal | `README.md` |
| Roadmap detalhado | `3-NEXT_STEPS.md` |
| Produção e homologação | `2-PRODUCTION.md` |
| Backlog pós go-live | `docs/BACKLOG_POS_GO_LIVE.md` |
| Release e QA | `docs/RELEASE.md` |
| Assinatura Windows | `docs/WINDOWS_CODE_SIGNING.md` |
| Backup e restore | `4-BACKUP.md` |
| Setup PostgreSQL | `1-SETUP.md` |
| Servidor LAN | `5-LAN-SERVER-SETUP.md` |

---

*Documento elaborado em Junho de 2026. Todas as informações são baseadas no estado factual do repositório do projeto AutoOS da BMITAG. Nenhuma métrica de receita, tração ou tamanho de equipe foi fabricada.*
