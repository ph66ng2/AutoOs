# O alvo do redesign

Leia isto antes do plano (`PLANO_IMPLEMENTACAO.md`). O plano diz **como** fazer; este arquivo diz **o que** o dono do produto quer ver quando terminar, e o que ele já disse que não quer. As decisões abaixo saíram de várias rodadas de desenho com ele. Não reabra nenhuma sem perguntar.

## Em uma frase

Um app calmo e sério, em que qualquer pessoa da loja olha uma tela e sabe, sem ler muito, **em que pé está cada equipamento e qual é o próximo botão a apertar**. A cor serve para isso e para mais nada.

## Por que mudar

- O dono não gosta da cara de hoje: azul de sistema genérico, cores fortes demais, "cara de vibecodado".
- Cada tela usa cores de um jeito: o mesmo status aparece em azul numa tela e roxo na outra (hoje são 12 cores para 12 status, mais 116 cores fixas espalhadas em 41 arquivos).
- A lista de equipamentos tem botões de larguras diferentes e várias ações soltas por linha.
- O Balcão é quase o app completo com outra cor.
- O modo escuro não tem os mesmos elementos do claro.

## A direção escolhida (direção B)

Foram desenhadas duas direções, A (preto e branco, cantos retos, IBM Plex) e B. **A B venceu** e é a base de todas as telas. A A fica só no canvas, na página "Arquivo".

- **Cor:** fundo cinza muito claro, cartões brancos, texto quase preto. Um único acento, **petróleo `#1f5e6e`**, só para ação, foco e item ativo. No escuro o acento clareia para `#7aa9b5`.
- **Tipografia:** Manrope em tudo; IBM Plex Mono para série, patrimônio e códigos.
- **Forma:** botões e campos com raio 8, blocos internos 12, cartões e modais 16. Borda separa; sombra só no que flutua (menu, modal).
- **Densidade:** app em 14px, tabelas com linhas de 56px. Balcão, celular e portal sobem um degrau para o toque (48px ou mais).

Antes e depois, para sentir a diferença: compare `referencia/telas/04-atendimento/01-equipamentos-lista-claro.webp` com a captura do app de hoje que o `npm run e2e:ui-screenshots` gera.

## As decisões, uma a uma

Cada linha é algo que o dono pediu ou aprovou. Onde diz **rejeitado**, foi testado e ele mandou desfazer.

### Cor e significado

1. **A cor tem significado.** Cinco famílias, iguais em todo lugar (app, Balcão, portal, celular, site):
   - **cinza:** entrou ou saiu;
   - **azul acinzentado:** está na nossa bancada;
   - **âmbar:** esperando alguém de fora;
   - **verde:** pronto;
   - **vermelho:** precisa de decisão.

   A tabela status → família está no plano (9.3).
2. **Paleta menos neon.** Cores apagadas, sem degradê, sem brilho. Se uma cor parecer "de app gerado por IA", está errada.
3. **Rejeitado: botão de ação colorido pela fase do status.** Foi feito e o dono mandou voltar. O botão de ação usa sempre o acento (`acc-soft` na linha, `acc` no topo). A cor da fase fica no selo e na barra de etapas.

### Lista de equipamentos e ações

4. **Uma ação principal por linha, todos os botões com a mesma largura (176px).** As outras ações vão no ⋯ ao lado, em quatro seções fixas: Neste status, Orçamento, Corrigir um engano, Equipamento.
5. **Os nomes das ações são os do app de hoje.** "Iniciar Verificação", "Enviar Orçamento", "Registrar Entrega". O fluxo de status foi mapeado do código (`status-fsm.ts`, `is_regular_status_transition`), e os botões desenhados batem com ele. Ver a prancheta `01-fundamentos/02-fluxo-de-status`.
6. **Paginação como hoje** (10 por página, numerada, com reticências), só no estilo novo.
7. **Filtro por status em chips com contador** no topo da lista, como já existe, no estilo novo.

### Telas e caminhos

8. **Início sem dinheiro.** Nenhum valor em R$ no Início. Faturado e gastos ficam em **Finanças**, que é o novo nome de "Gastos" (só o nome; a rota `/gastos` continua).
9. **Detalhes da OS vira página** (hoje é modal). O dono gostou de modais virarem telas quando o conteúdo é grande.
10. **Orçamento de insumos igual ao orçamento de equipamento:** lista com status, página de detalhe e prévia do PDF.
11. **O Balcão é um modo de verdade, não um recolor:**
    - quatro blocos grandes de toque (Receber, Entregar, Consultar cliente, Preço e estoque);
    - busca grande;
    - entrada em quatro passos;
    - menos coisas na tela.
12. **Menu lateral com o perfil embaixo**, agrupado por área, inspirado num painel que o dono viu no Twitter. O mesmo vale para o estilo do Início e de Finanças: cartões limpos, gráficos discretos.
13. **Primeiro acesso com poucas mudanças:** mesmos três passos, mesma regra de PIN. O **cadeado de roletes que gira continua, com a animação**. O dono pediu isso explicitamente.

### Modais

14. **Todos os modais seguem 7 formatos e 3 larguras** (P 440, M 560, G 760; visualizador até 1040). Ação principal à direita, destrutiva em vermelho com o nome do que faz, PIN dentro do próprio modal, erro embaixo do campo.
15. **Os modais mantêm os campos e botões de hoje.** As folhas de modais do canvas foram feitas lendo o código de cada diálogo.
16. **PDFs não mudam.** OS, orçamento e orçamento de insumos continuam no modelo de `pdf-service.ts`; só a moldura da prévia muda.

### Temas

17. **Toda tela e todo modal tem versão clara e escura, com os mesmos elementos.** O escuro é escuro de verdade (fundo `#0a0c10`), não um cinza médio. Barras de rolagem acompanham o tema.

### Produto

18. **Função igual.** O redesign muda a aparência e, às vezes, o caminho (itens 8 a 10). Não muda regra, permissão, auditoria, PIN, confirmação ou texto de ação.
19. **O AutoOS é um produto separado da BMI TAG.** Código novo não leva marca, e-mail ou texto fixo da BMI TAG. Nome e logo da empresa vêm da configuração.

## O que foi desenhado e não existe no app

Aparece nas telas para dar a ideia do todo, mas **não implemente sem um ticket próprio e o OK do dono**. Na dúvida, reproduza só o que o app já calcula e deixe o espaço vazio.

- **Início:** tempo até pronto, taxa de aprovação, lista "Precisa de atenção", botão de ocultar valores.
- **Finanças:**
  - saldo do mês;
  - comparação com a média;
  - maior categoria;
  - composição dos gastos;
  - "peso no faturamento";
  - lista de lançamentos do mês.

  Hoje a tela de Gastos tem total fixo, total variável, total geral e o gráfico de 12 meses. A receita por mês existe no Início de hoje e pode ir para Finanças.
- **Detalhes da OS:** "Portal do cliente ativo · último acesso" (confira no código antes; o número de ciclos do serial já existe).
- **Serviços:** uso no ano.
- **Insumos:** valor em estoque, saídas do mês.
- **Clientes:** números do cliente no painel.
- **Equipe:** último acesso.
- **Menu lateral:** contadores (só onde o número já existe na tela).
- **Balcão:** fila do dia ("Prontos para retirada" e "Chegaram hoje").
- **Portal:** tema escuro.

O celular da equipe e o site do produto estão no canvas, mas **não fazem parte deste redesign**.

## Como saber se uma tela está certa

Abra a tela implementada ao lado da imagem em `referencia/telas/` e confira:

- [ ] Só um botão em `acc` (cheio) por região. Ações de linha em `acc-soft`, todas com 176px.
- [ ] Nenhuma cor fora dos tokens (`grep` de cor do Tailwind dá zero no arquivo).
- [ ] Status sempre com selo e texto, na cor da família certa.
- [ ] Mesmos campos, botões e textos de ação que o app tinha antes.
- [ ] Os dois temas iguais em estrutura; o escuro escuro de verdade.
- [ ] Nada em R$ no Início.
- [ ] Testes existentes passando sem edição.
- [ ] Em caso de dúvida entre a imagem e o código, o comportamento do código venceu e a diferença está anotada no PR.

## Onde está cada coisa

| Precisa de | Abra |
|---|---|
| Ver como cada tela deve ficar | `referencia/README.md` (índice com todas as imagens, claro e escuro) |
| Cores, fontes, raios e tamanhos | `referencia/design-system/tokens.json` (ou `tokens.css`) e o plano, seções 9.1 e 9.2 |
| Como cada componente se comporta | `referencia/design-system/COMPONENTES.md` |
| Regras gerais de conteúdo e layout | `referencia/design-system/MANUAL.md` |
| Classes de referência prontas | `referencia/design-system/componentes.css` |
| A ordem do trabalho | `PLANO_IMPLEMENTACAO.md` |
| O original interativo | Canvas: https://claude.ai/artifact/8eViR9jqgzKn3cJ4U1Nj2E · Design System: https://claude.ai/artifact/Anq1devqZurhUUPmurNof7 (privados; peça acesso ao dono se precisar) |
