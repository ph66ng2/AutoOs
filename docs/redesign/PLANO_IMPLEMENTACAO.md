# Plano de implementação do redesign (direção B)

Este plano é para o agente que vai implementar o redesign do AutoOS. Leia antes o `ALVO.md` (o que o dono quer e o que já rejeitou) e depois este plano inteiro, antes de mexer em código. As regras do `AGENTS.md` e do `CLAUDE.md` continuam valendo e ganham de qualquer coisa escrita aqui.

## 1. Objetivo

Trocar a aparência do app interno (Tauri + React, branch `master`) pela direção B decidida no canvas, sem mudar o que o app faz. Muda o visual e, em poucos pontos marcados, o caminho até uma função. Regra de negócio, comandos Rust, migrations e textos de ação ficam como estão.

## 2. Fontes da verdade

| O quê | Onde | Observação |
|---|---|---|
| Intenção, decisões e o que foi rejeitado | `docs/redesign/ALVO.md` | Comece por aqui. |
| Todas as telas e modais, claro e escuro, em imagem | `docs/redesign/referencia/README.md` | Exportado do canvas; não precisa de acesso a nada. |
| Tokens, classes e guia de cada componente | `docs/redesign/referencia/design-system/` | Cópia do Design System. |
| Design System original | https://claude.ai/artifact/Anq1devqZurhUUPmurNof7 | Leia `project/README.md`, `project/tokens.json`, `project/components/bundle.css` e o `README.md` de cada componente. |
| Canvas original | https://claude.ai/artifact/8eViR9jqgzKn3cJ4U1Nj2E | Páginas Fundamentos, Entrada, Início, Atendimento, Balcão, Estoque, Finanças, Administração, Portal. |
| Comportamento | o código atual | Se o desenho e o código discordarem sobre **o que** acontece, o código vence. Pare e reporte. |

Os dois links "original" da tabela são o desenho interativo, para quem tiver acesso; a cópia no repositório basta para o trabalho. Os links são privados. Um agente com a ferramenta Artifact na mesma conta consegue ler com `action: "read"`. Se você não conseguir abrir, pare e peça ao usuário para compartilhar. Não reconstrua o desenho de memória.

As tabelas essenciais estão copiadas na seção 9 deste arquivo, para as fases 1 a 3 não dependerem dos links.

## 3. Regras que não se negociam

1. **Função igual.** Nenhum teste existente pode ser editado ou apagado para passar. Se um teste de fluxo quebrar, você mudou função: desfaça e reporte. Testes novos podem ser adicionados.
2. **Uma fatia, um arquivo, um critério por comando.** Cada fatia abaixo diz o arquivo, o que existe, o que deve existir e o comando que prova que está pronta.
3. **Branch e PR.** O trabalho parte de `origin/master` e vai em PR para `master` (ver "Branches" no `AGENTS.md`). Uma fase por PR, ou uma fatia por PR quando ela for grande. **Não faça push, não abra PR e não faça merge sem confirmação explícita do usuário.**
4. **Antes de entregar cada PR:** `scripts/pre-qa-check.sh`, `npm run lint`, `npm run test:run` e `npm run e2e` (Playwright em modo mock). Compare a lista de arquivos alterados que o script imprime com as fatias da fase; arquivo fora do plano volta.
5. **Sem dependência nova** sem aprovação do usuário. O menu ⋯ já existe com Radix Select agrupado (`src/components/ui/action-priority-row.tsx`): reestilize, não troque de biblioteca. Exceção já prevista: as fontes (fatia 1.3), que também pedem OK.
6. **Sem marca fixa.** Código novo não leva nome, logo ou e-mail da BMI TAG. O que já existe fica (não refatorar por isso).
7. **Não reescreva a lógica do `Equipamentos.tsx`** (3.892 linhas). Extraia componentes visuais e funções puras; a regra continua onde está.
8. **Fora do escopo:** o app de celular, o site do AutoOS e os itens da nota vermelha do canvas (tempo até pronto, taxa de aprovação, lista "Precisa de atenção", ocultar valores, contadores no menu, fila do dia do Balcão, uso no ano dos serviços, valor em estoque, saídas do mês, números do cliente no painel, último acesso da equipe). Não implemente nenhum deles.

## 4. Decisões pendentes do usuário

Pergunte antes da fase indicada. Sem resposta, siga a recomendação.

| # | Decisão | Bloqueia | Recomendação |
|---|---|---|---|
| D1 | Lançar o visual novo para todos de uma vez, ou atrás de uma opção em Configurações por um tempo? | merge da fase 1 | De uma vez. Se o usuário pedir a opção, troque `:root`/`.dark` por um escopo `.ds-v2` ligado por uma preferência local. |
| D2 | Nomes dos componentes novos: português (como no DS) ou inglês? | fase 2 | Português, seguindo `lib/`, `hooks/` e as páginas, que já são em português. |
| D3 | Rótulos de status: manter "Aguardando Aprovação" (como hoje) ou passar para "Aguardando aprovação" (como no DS)? | fase 2 | Manter. Mudar caixa de texto quebra testes e não é visual puro. |
| D4 | Detalhes da OS vira página com rota própria (`/equipamentos/:id`), como no canvas? | fase 6 | Sim, mas só depois da lista pronta. É a única mudança de navegação. |
| D5 | Instalar `@fontsource-variable/manrope` e `@fontsource/ibm-plex-mono`? | fatia 1.3 | Sim. O Tauri não deve depender do Google Fonts em tempo de execução. |

## 5. Preparação (fase 0)

**0.1 Branch.** Parta de `origin/master` atualizado. Pronto quando `git log --oneline origin/master..HEAD` estiver vazio antes do primeiro commit.

**0.2 Capturas de antes.** Rode `npm run e2e:ui-screenshots` e guarde a pasta de saída **fora do repositório**, com o nome `antes/`. Elas servem para a comparação lado a lado em cada PR. Não commite as imagens.

## 6. Fases com fatias prontas para executar

### Fase 1: base visual (1 PR)

Resultado: o app inteiro passa a usar a paleta, a fonte e os raios novos, sem nenhuma tela editada.

**1.1 `src/index.css`: trocar os valores das variáveis.**
- Hoje: variáveis HSL do shadcn em `:root, .light` e `.dark` (paleta azul).
- Depois: os mesmos nomes com os valores da tabela 9.1, nos dois blocos. Acrescente as variáveis novas da tabela 9.2 nos dois blocos. `--radius` continua `0.5rem` (8px, igual ao DS).
- Pronto quando `npm run lint` e `npm run test:run` passam e `grep -c "221 72% 48%" src/index.css` dá 0.

**1.2 `tailwind.config.js`: expor as variáveis novas.**
- Acrescente em `theme.extend.colors`, no padrão `hsl(var(--x))`:
  - `acc-soft` (`DEFAULT` e `foreground`);
  - `track`;
  - `ctl`;
  - `nav-active` (`DEFAULT` e `foreground`);
  - `status` com `neutral`, `work`, `wait`, `ok` e `bad`, cada um com `DEFAULT` (texto) e `bg`;
  - `chart` com `1`, `2` e `3`.
- Acrescente `fontFamily.sans: ["Manrope Variable", "Manrope", "Segoe UI", "system-ui", "sans-serif"]` e `fontFamily.mono: ["IBM Plex Mono", "ui-monospace", "Consolas", "monospace"]`.
- Pronto quando `npm run lint` passa e uma classe como `bg-status-wait-bg` aparece no CSS gerado por `npx vite build` (procure no arquivo `.css` de `dist/assets`).

**1.3 Fontes (depende de D5).**
- Instale os dois pacotes `@fontsource` e importe-os em `src/main.tsx`.
- Troque o `font-family` do `body` em `src/index.css` por Manrope.
- Pronto quando o build passa e a captura da fatia 1.5 mostra Manrope.

**1.4 `src/index.css`: barra de rolagem.**
- Barra fina, com trilho transparente.
- Alça com raio 999px, nas cores `#c9d0d8` no claro (`#9ba5b1` ao passar o mouse) e `#283039` no escuro (`#3a4552` ao passar o mouse). Defina essas cores como variáveis nos dois blocos.
- Pronto com lint e testes.

**1.5 Verificação da fase.**
- `npm run e2e` passa sem editar teste.
- `npm run e2e:ui-screenshots` gera as capturas de depois.
- No PR, ponha capturas de antes e depois de Início, Equipamentos, Clientes, Balcão e Configurações, e uma em tema escuro (troque o tema pelo perfil).
- Rode `scripts/pre-qa-check.sh`.

O que vai continuar errado depois da fase 1, e é esperado: as 116 cores fixas do Tailwind (fase 2) e o layout antigo (fases 4 em diante).

### Fase 2: cores de status num lugar só (1 PR)

**2.1 `src/lib/status-familia.ts` (novo) e `src/lib/status-familia.test.ts` (novo).**
- Função `statusFamilia(status: string): "neutral" | "work" | "wait" | "ok" | "bad"`, com a tabela 9.3.
- Use `normalizeStatusKey` de `src/lib/status-fsm.ts` para aceitar as variações que o app já aceita. Status desconhecido devolve `"neutral"`.
- O teste cobre os 12 status de `STATUS_EQUIPAMENTO` e um desconhecido.
- Pronto quando `npx vitest run src/lib/status-familia.test.ts` passa.

**2.2 `src/types/index.ts`: `STATUS_COLORS`.**
- Hoje: uma cor do Tailwind por status (`bg-blue-100 text-blue-800`…).
- Depois: classes por família, por exemplo `bg-status-wait-bg text-status-wait`, montadas a partir de `statusFamilia`.
- Mantenha o nome e o tipo da constante: `EquipamentosStatusBadge.tsx`, `ClientesStatusBadge.tsx`, `Dashboard.tsx` e `HistoricoComunicacoes.tsx` dependem dela.
- Pronto com lint, `npm run test:run` e `grep -c "\-100 text-" src/types/index.ts` dando 0.

**2.3 `src/pages/equipamentos/EquipamentosStatusBadge.tsx` e `src/pages/clientes/ClientesStatusBadge.tsx`.**
- Forma do componente `SeloDeStatus`: pílula, ponto de 7px na cor do texto, `text-xs font-bold`, `px-2.5 py-0.5`.
- Pronto com lint e testes.

**2.4 em diante: uma fatia por arquivo com cor fixa.**
- **Arquivos, em ordem (contagem de hoje):**
  - `pages/Equipamentos.tsx` (69), `components/PortalAlertas.tsx` (37), `components/AuthDialog.tsx` (24), `pages/Dashboard.tsx` (22);
  - `hooks/useSensitiveAccess.tsx` (21), `components/ui/error-alert.tsx` (20), `pages/Clientes.tsx` (18), `components/ReleaseHighlightsDialog.tsx` (18);
  - `pages/Balcao.tsx` (17), `components/equipamentos/ClienteSelectorClienteCard.tsx` (17), `pages/insumos/OrcamentoInsumosDialog.tsx` (16), `pages/configuracoes/ConfiguracoesTabIntegracoes.tsx` (16);
  - `components/TeamAccessManager.tsx` (16), `components/DatabaseConfigDialog.tsx` (16) e o resto da lista do comando abaixo.
- **Regra de troca:** tabela 9.4.
- **Não mexa** em `src/components/opening/` (animação de abertura da marca) nem em `src/public-status/` (build separado, fase 9).
- **Pronto quando**, para o arquivo da fatia, este comando dá 0, e lint e testes passam:
  `grep -oE "(bg|text|border|ring|from|to)-(blue|green|red|amber|yellow|orange|purple|emerald|sky|indigo|slate|gray|violet|teal|rose|lime|cyan|fuchsia|pink|zinc|stone|neutral)-[0-9]+" <arquivo> | wc -l`.
- **Paralelismo:** estas fatias são independentes e servem para o `executor-sonnet`. O `Equipamentos.tsx` fica com a sessão principal.

Ao fim da fase 2, o app fica coerente na cor, ainda com o layout de hoje. É um bom ponto para o usuário usar por alguns dias.

### Fase 3: ações por status, sem mudar a tela (1 PR)

**3.1 `src/lib/acoes-por-status.ts` (novo) e teste.**
- Hoje: os botões de cada status são montados dentro de `src/pages/Equipamentos.tsx` (procure a partir de "Cada status tem ações específicas", perto da linha 2121). As seções do menu "Mais" já existem em `secaoAcaoOs` e `agruparAcoesOs`, em `src/pages/equipamentos/equipamentos-page-utils.ts`.
- Depois: função pura `acoesPorStatus(status)` que devolve `{ principal: { id, rotulo }, nesteStatus: Array<{ id, rotulo }> }`, com os **mesmos ids e rótulos** que o `Equipamentos.tsx` usa hoje. A tabela 9.5 é a referência do desenho. Se ela discordar do código, **o código vence**: anote a diferença no PR.
- O teste confere, para cada status:
  - o rótulo principal esperado;
  - que toda ação principal que muda status leva a uma transição aceita por `canTransition` de `src/lib/status-fsm.ts`.
- Pronto quando o teste novo passa e `npm run test:run` continua verde.

**3.2 `src/pages/Equipamentos.tsx`: usar a função.**
- Troque a montagem dos rótulos pela função, mantendo handlers, permissões e ordem.
- Nada muda na tela.
- Pronto quando `npm run e2e` e `npm run test:run` passam sem editar teste. Fatia da sessão principal, não delegar.

## 7. Fases que o `fatiador` corta antes de começar

Cada fase abaixo vira um PR (ou mais). Rode o `fatiador` uma vez no início de cada uma, com esta descrição, o README do componente no DS e a prancheta indicada. Mostre as fatias ao usuário e espere o OK (regra 8 do `CLAUDE.md`).

**Fase 4: estrutura das páginas.**
- `src/components/Layout.tsx`: menu lateral do `MenuLateral`, com 264px e estes grupos e itens:
  - Início;
  - Atendimento: Equipamentos, Balcão, Clientes;
  - Estoque: Insumos e peças, Serviços;
  - Financeiro: Finanças, que é só o rótulo de `/gastos` (a rota não muda);
  - Administração: Equipe e acessos;
  - no pé: Configurações e o cartão do perfil.
- Item ativo em `nav-active`.
- Respeite os comentários `[BLOQUEIO-TEMPORARIO-INSUMOS]` e o que estiver bloqueado hoje.
- Novo `PageHeader`: título em 26px, uma linha de apoio e as ações à direita.
- `CounterLayout.tsx` (Balcão) fica para a fase 7.
- Prancheta: "Sidebar" e "Sidebar escuro" em Fundamentos.

**Fase 5: lista de Equipamentos.**
- `action-priority-row.tsx`: botão principal com largura fixa de 176px, estilo `acc-soft`, e ⋯ de 32px. O menu continua sendo o Select agrupado, reestilizado como `MenuDeAcoes`, com as quatro seções fixas da tabela 9.5.
- Filtro por status em chips com contador (`FiltroDeStatus`).
- Barra de etapas compacta na coluna "Andamento" (`BarraDeEtapas`).
- `pagination-controls.tsx` no estilo `Paginacao` (10 por página e 7 posições continuam como hoje em `lib/pagination.ts`).
- Prancheta: "Equipamentos claro e escuro" em Atendimento.

**Fase 6: Detalhes da OS (depende de D4).**
- Vira página em `/equipamentos/:id`.
- No topo: ação principal com 176px e o ⋯.
- Barra de 6 etapas e abas Orçamento, Verificação, Fotos, Histórico, Comunicação.
- Coluna lateral com Cliente, Equipamento, Comunicação e o painel do portal.
- Os diálogos que hoje abrem a partir dos detalhes continuam abrindo como modais.
- O E2E que abre os detalhes vai precisar seguir a rota nova. É a única edição de teste permitida no plano: só a navegação, nunca a verificação. Peça o OK do usuário antes.

**Fase 7: modais.**
- Em `src/components/ui/dialog.tsx`, acrescente tamanhos P (440px), M (560px) e G (760px, corpo rola) e o visualizador (até 1040px). Cabeçalho, corpo e rodapé seguem o `Modal`; confirmações seguem a `Confirmacao`.
- Depois, um PR por grupo, na ordem das folhas do canvas: Equipamento, Orçamento e envio, Portal do Cliente, Clientes, Estoque e serviços, Finanças, Balcão, Acesso e sistema.
- Os PDFs não mudam (`src/lib/pdf-service.ts` fica intocado); só a moldura da prévia.

**Fase 8: as outras telas, uma por PR.**
- Início: os quatro números, sem nenhum valor em R$. O faturado vai para Finanças. Confirme com o usuário se algum teste verifica o R$ no Início.
- Clientes.
- Balcão (`CounterLayout.tsx` e `Balcao.tsx`): quatro blocos de toque e alvos de 48px ou mais.
- Insumos e Orçamentos de insumos (orçamento vira página, como no canvas).
- Serviços.
- Finanças.
- Equipe e acessos, e Configurações.
- Entrar e Primeiro acesso: mantenha o `PinLock` e a animação dele.

**Fase 9: Portal do Cliente** (`src/public-status/`, build separado com `npm run build:public-status`).
- Trocar `public-status.css` e `portal-orcamento.css` pelos tokens.
- No celular, as respostas ao orçamento abrem como painel que sobe do rodapé.
- O tema escuro do portal depende de decisão do usuário.
- Pode correr em paralelo a qualquer fase depois da fase 1.

## 8. Divisão de trabalho (do `CLAUDE.md`)

- **Sessão principal (Opus):** fases 1 e 3, `Equipamentos.tsx`, Detalhes da OS e tudo que pede julgamento.
- **`executor-sonnet`:** as fatias 2.4 em diante, e os grupos de modais e as telas simples depois que o padrão estiver pronto. Só com o OK do usuário. Se falhar uma vez, a sessão principal assume.
- **`leitor-haiku`:** ler os READMEs do DS e as pranchetas para extrair medidas. Nunca edita código.

## 9. Tabelas de referência

### 9.1 Variáveis existentes do shadcn → tokens do DS

| Variável | Token do DS | Claro (hex) | Claro (HSL) | Escuro (hex) | Escuro (HSL) |
|---|---|---|---|---|---|
| `--background` | `bg` | #f4f5f6 | `210 10% 96%` | #0a0c10 | `220 23% 5%` |
| `--foreground` | `ink` | #1d242c | `212 21% 14%` | #e6e9ee | `218 19% 92%` |
| `--card` | `surface` | #ffffff | `0 0% 100%` | #12161c | `216 22% 9%` |
| `--card-foreground` | `ink` | #1d242c | `212 21% 14%` | #e6e9ee | `218 19% 92%` |
| `--popover` | `surface` | #ffffff | `0 0% 100%` | #12161c | `216 22% 9%` |
| `--popover-foreground` | `ink` | #1d242c | `212 21% 14%` | #e6e9ee | `218 19% 92%` |
| `--primary` | `acc` | #1f5e6e | `192 56% 28%` | #7aa9b5 | `192 29% 59%` |
| `--primary-foreground` | `acc-ink` | #ffffff | `0 0% 100%` | #0c1416 | `192 29% 7%` |
| `--secondary` | `badge-bg` | #f0f2f5 | `216 20% 95%` | #232a33 | `214 19% 17%` |
| `--secondary-foreground` | `ink` | #1d242c | `212 21% 14%` | #e6e9ee | `218 19% 92%` |
| `--muted` | `sunken` | #f4f6f8 | `210 22% 96%` | #0a0c10 | `220 23% 5%` |
| `--muted-foreground` | `muted` | #5d6673 | `215 11% 41%` | #9aa3ae | `213 11% 64%` |
| `--accent` | `acc-soft` | #e6eef0 | `192 25% 92%` | #17252a | `196 29% 13%` |
| `--accent-foreground` | `acc-soft-ink` | #1a4f5c | `192 56% 23%` | #a9c9d1 | `192 30% 74%` |
| `--destructive` | `danger` | #a8443f | `3 45% 45%` | #d58a84 | `4 49% 68%` |
| `--destructive-foreground` | `danger-ink` | #ffffff | `0 0% 100%` | #1d0d0c | `4 41% 8%` |
| `--warning` | `st-wait` | #8a6420 | `38 62% 33%` | #cfac6e | `38 50% 62%` |
| `--warning-foreground` | texto sobre `st-wait` | #ffffff | `0 0% 100%` | #1a1206 | `36 62% 6%` |
| `--info` | `st-work` | #3f5f8a | `214 37% 39%` | #8ea7c9 | `215 35% 67%` |
| `--info-foreground` | texto sobre `st-work` | #ffffff | `0 0% 100%` | #0e1116 | `218 22% 7%` |
| `--border` | `line` | #e1e5ea | `213 18% 90%` | #232a33 | `214 19% 17%` |
| `--input` | `field-border` | #7f8ea1 | `214 15% 56%` | #56677a | `212 17% 41%` |
| `--ring` | `focus` (= `acc`) | #1f5e6e | `192 56% 28%` | #7aa9b5 | `192 29% 59%` |
| `--sidebar` | `nav-bg` | #ffffff | `0 0% 100%` | #080a0d | `216 24% 4%` |
| `--sidebar-border` | `line` | #e1e5ea | `213 18% 90%` | #232a33 | `214 19% 17%` |

Os HSL foram arredondados a partir do hex. Se a diferença incomodar, use o hex direto nas variáveis novas.

### 9.2 Variáveis novas

| Variável | Claro (hex) | Claro (HSL) | Escuro (hex) | Escuro (HSL) |
|---|---|---|---|---|
| `--acc-soft` | #e6eef0 | `192 25% 92%` | #17252a | `196 29% 13%` |
| `--acc-soft-foreground` | #1a4f5c | `192 56% 23%` | #a9c9d1 | `192 30% 74%` |
| `--track` | #e3e7ec | `213 19% 91%` | #2a323c | `213 18% 20%` |
| `--ctl` | #cfd5dc | `212 16% 84%` | #2c3540 | `213 19% 21%` |
| `--nav-active` | #e6eef0 | `192 25% 92%` | #17252a | `196 29% 13%` |
| `--nav-active-foreground` | #1a4f5c | `192 56% 23%` | #a9c9d1 | `192 30% 74%` |
| `--st-neutral` | #5f6772 | `215 9% 41%` | #9aa3ae | `213 11% 64%` |
| `--st-neutral-bg` | #eceef1 | `216 15% 94%` | #1b2027 | `215 18% 13%` |
| `--st-work` | #3f5f8a | `214 37% 39%` | #8ea7c9 | `215 35% 67%` |
| `--st-work-bg` | #e8edf4 | `215 35% 93%` | #18202b | `215 28% 13%` |
| `--st-wait` | #8a6420 | `38 62% 33%` | #cfac6e | `38 50% 62%` |
| `--st-wait-bg` | #f5eddc | `41 56% 91%` | #2a2318 | `37 27% 13%` |
| `--st-ok` | #38704e | `144 33% 33%` | #7fb08f | `140 24% 59%` |
| `--st-ok-bg` | #e4efe8 | `142 26% 92%` | #17241c | `143 22% 12%` |
| `--st-bad` | #a8443f | `3 45% 45%` | #d58a84 | `4 49% 68%` |
| `--st-bad-bg` | #f6e8e6 | `7 47% 93%` | #2c1b1a | `3 26% 14%` |
| `--chart-1` | #1f5e6e | `192 56% 28%` | #7aa9b5 | `192 29% 59%` |
| `--chart-2` | #8ea2be | `215 27% 65%` | #5f7792 | `212 21% 47%` |
| `--chart-3` | #b08a4f | `36 38% 50%` | #c9a46a | `37 47% 60%` |

`--ctl` é a borda clara de botão de contorno e chip. Campo de texto, select, checkbox e rádio usam `--input` (`field-border`), que tem contraste de 3:1. Não troque um pelo outro.

### 9.3 Status → família

| Família | Quer dizer | Status |
|---|---|---|
| `neutral` | entrou ou saiu | RECEBIDO, ENTREGUE, ABANDONADO |
| `work` | está na nossa bancada | EM_VERIFICACAO, VERIFICADO, APROVADO, EM_MANUTENCAO |
| `wait` | esperando alguém de fora | AGUARDANDO_APROVACAO, AGUARDANDO_PECA |
| `ok` | pronto | PRONTO |
| `bad` | precisa de decisão | REPROVADO, ORCAMENTO_VENCIDO |

Orçamento de insumos usa as mesmas famílias: Rascunho e Entregue `neutral`, Enviado `wait`, Aprovado `ok`, Reprovado `bad`, Cancelado `neutral`. **A cor de status nunca vai no botão de ação**: o usuário testou e rejeitou.

### 9.4 Troca de cores fixas

| Hoje | Vira | Quando |
|---|---|---|
| `green-*`, `emerald-*` | `status-ok` / `status-ok-bg` | sucesso, pronto, "deu certo" |
| `amber-*`, `yellow-*`, `orange-*` | `status-wait` / `status-wait-bg`, ou `warning` | espera, atenção |
| `red-*`, `rose-*` | `destructive` em ação ou erro; `status-bad` / `status-bad-bg` em estado | |
| `blue-*`, `indigo-*`, `sky-*`, `violet-*`, `purple-*` | `primary` em ação ou link; `status-work` / `status-work-bg` em estado | |
| `gray-*`, `slate-*`, `zinc-*`, `stone-*`, `neutral-*` | `muted-foreground`, `muted`, `border`, `secondary` | texto de apoio, fundo, divisor |
| `bg-white` | `bg-card` | |
| `teal-*`, `cyan-*` | `primary` ou `acc-soft` | |

Caso que não encaixe: pare e pergunte. Não crie cor nova.

### 9.5 Ações por status (referência do desenho; o código atual vence)

| Status | Botão principal | Também no ⋯ "Neste status" |
|---|---|---|
| Recebido | Iniciar Verificação | OS PDF |
| Em verificação | Abrir Verificação | |
| Verificado | Enviar Orçamento | WhatsApp |
| Aguardando aprovação | Aprovar | Reprovar, WhatsApp |
| Aprovado | Iniciar Manutenção | Desfazer aprovação |
| Em manutenção | Marcar Pronto | Mudar status para Aguardando peça |
| Aguardando peça | Retomar Manutenção | |
| Pronto | Registrar Entrega | WhatsApp |
| Reprovado | Reabrir Orçamento | Mudar Status |
| Orçamento vencido | Renovar orçamento | Mudar Status |

As seções fixas do ⋯, nesta ordem:
1. Neste status (some quando vazia).
2. Orçamento: Orçamento PDF, Alterar Orçamento, Peças da OS.
3. Corrigir um engano: Corrigir Status, Corrigir decisão do orçamento.
4. Equipamento: Status, Editar Equipamento, Excluir (em vermelho, por último).

## 10. Como reportar cada PR

- **Título:** `redesign(fase N): <o que mudou>`.
- **Corpo:**
  - fatias feitas;
  - comandos rodados, com o resultado;
  - capturas de antes e depois;
  - diferenças encontradas entre o desenho e o código;
  - o que ficou para a próxima fase.
- **Se algo não couber nas regras acima:** pare, descreva o caso e pergunte. Não improvise.
