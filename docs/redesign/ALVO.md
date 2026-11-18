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
24. **Formulários que montam ou editam orçamento são páginas; confirmações continuam modais** (decisão do dono, 18/11/2026). Substitui a regra antiga de que "os diálogos que hoje abrem a partir dos detalhes continuam abrindo como modais".
    - Viram página: criar/editar venda (`/vendas/novo`, `/vendas/:id/editar`), **ajuste de orçamento da OS** (`/equipamentos/:id/orcamento`) e **verificação técnica** (`/equipamentos/:id/verificacao`). Barra fixa no rodapé com cancelar e a ação de hoje ("Confirmar" no ajuste, "Finalizar verificação" na verificação).
    - Continuam janela: escolha do ajuste de orçamento aprovado ou respondido (aparece **ao confirmar** a página, como no código; não antes de editar), OS só de garantia, forma de pagamento ao aprovar, reprovar, cancelar, entregar, excluir, recusa por falta de estoque, PIN, envio de fotos e prévia do PDF.
    - Pranchetas: "Ajuste de orçamento · página", "Verificação técnica · página" e "Ajuste e verificação · estados, janelas e celular", na página Atendimento do canvas.
25. **Detalhes da OS e página da venda são da mesma família** (prancheta "Detalhes OS × venda · família única"):
    - **Barra de etapas:** um desenho, com nome e data de cada etapa alcançada. A OS acrescenta "· pessoa" quando o histórico de status tem o autor; a venda mostra só a data.
    - **Selo:** um só (o do DS) no cabeçalho de detalhe e de edição; as listas usam nome + barrinha.
    - **Cartão Cliente:** um só (nome, documento, e-mail, telefone, canais com WhatsApp riscado quando recusa, contato). A OS acrescenta o rodapé "Portal do Cliente".
    - **O que aconteceu:** a linha do tempo do Histórico da OS serve aos dois. Na venda ela substitui "Registro", com as mesmas datas e sem "Registrado por", que não existe.
    - **Condições e total:** dentro do cartão do orçamento (OS) ou de Itens (venda), abaixo do total. Na venda, Condições sai da coluna da direita.
16. **PDFs não mudam.** OS, orçamento e orçamento de insumos continuam no modelo de `pdf-service.ts`; só a moldura da prévia muda.

### Temas

17. **Toda tela e todo modal tem versão clara e escura, com os mesmos elementos.** O escuro é escuro de verdade (fundo `#0a0c10`), não um cinza médio. Barras de rolagem acompanham o tema.

### Notificações

20. **Sino, painel e avisos rápidos seguem a folha "Notificações"** (`referencia/telas/01-fundamentos/05-notificacoes-*`). Mesmas abas, filtros, textos e regra de leitura de hoje. Muda o visual:
    - a cor da família fica só no ícone;
    - sai a faixa colorida na lateral do item;
    - sai o fundo colorido do aviso rápido (o `richColors` do sonner);
    - o contador do sino vai para petróleo, porque conta tudo o que não foi lido, não só problema;
    - item não lido tem título em negrito e um ponto petróleo.

    Este item foi acrescentado depois: no começo, as notificações ficaram fora do desenho.

### Acabamento

21. **Detalhe medido, não no olho** (inspirado num vídeo de polimento de componente que o dono mostrou; regras em "Acabamento" no `referencia/design-system/MANUAL.md`):
    - **Folga concêntrica:** ícone, ⋯ ou seta encostados no canto de um cartão ficam à mesma distância das duas bordas próximas, até 1px de diferença.
    - **Linha do tempo:** no histórico, a linha vertical passa pelo centro dos ícones e vai do primeiro ao último, sem falha nem sobra.
    - **Movimento curto e com propósito:** 150ms em hover, 220ms em menus e avisos, 300ms em expandir e modais, curva `ease-saida`. Nada passa de 300ms, e nada anima com movimento reduzido. A abertura da marca, o cadeado de roletes e o voo do avatar no primeiro acesso ficam como estão.
    - **O que abre e fecha:** o cabeçalho inteiro é um botão só, e o nome lido é o texto visível.
22. **Alto contraste: decisão pendente.** Se entrar, é um terceiro tema (texto ≥7:1), com ticket próprio. Não faz parte do redesign atual.

### Vendas de insumos

23. **Orçamentos de insumos (OI-n) viram "Vendas de insumos" (`/vendas`)**, item próprio no menu em Atendimento, abaixo de Clientes. O nome fica; a sigla OI-n também. Desenho em `referencia/telas/10-vendas/`.
    - **Ação principal por situação:**
      - Rascunho → Enviar;
      - Enviado → **Aprovar** (não "Abrir");
      - Rascunho ou Enviado vencido → **Renovar validade**, que abre a edição, porque aprovar fica bloqueado;
      - Aprovado → Marcar entregue;
      - Entregue, Reprovado e Cancelado → Ver.
    - **Validade só para Rascunho e Enviado.** Nas outras situações, a coluna mostra a data do que aconteceu ("aprovado 12/11 · Pix", "entregue 10/11").
    - **Orçamento, criar e editar são páginas** (`/vendas/:id`, `/vendas/novo`, `/vendas/:id/editar`), não janela.
    - **Falta de estoque aparece antes de aprovar:** na tabela ("6 · falta 4") e num aviso com "Dar entrada no estoque" e "Editar quantidades". A recusa do backend usa o texto dele.
    - **No Balcão, a venda aprovada se entrega como um equipamento pronto.** O bloco vira "Entregar ao cliente" e a fila "Prontos para retirada" mistura os dois, com etiqueta.
      - O balcão mostra o que o cliente leva, o total e a forma de pagamento.
      - Avisa que o app não sabe se foi pago.
      - Confirma e usa o mesmo "marcar entregue", com PIN e "Ações financeiras".
      - Venda ainda não aprovada aparece na busca, sem botão e com o motivo.
      - Sem a permissão, o backend recusa e a tela explica.
    - **Não desenhe como se existisse:**
      - quem fez cada passo e por qual canal (só existem as datas; quem criou existe em `criado_por_profile_id`);
      - pagamento recebido;
      - versões do orçamento.
    - **Pendente do dono do produto:**
      - quem não tem "Ações financeiras" vê a prévia do PDF mas não salva, porque salvar marca Enviado;
      - a data mostrada para Cancelado;
      - "Dar entrada no estoque" abrir a movimentação já com o item e a quantidade que falta.

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
- **Verificação técnica:** checklist de 7 itens no formulário (os itens existem no código e aparecem em verificações antigas, mas o formulário de hoje não os mostra nem salva) e custos calculados enquanto digita (hoje o total só é calculado ao finalizar). Os dois estão marcados PROPOSTA na prancheta.

O celular da equipe e o site do produto estão no canvas, mas **não fazem parte deste redesign**.

## Como saber se uma tela está certa

Abra a tela implementada ao lado da imagem em `referencia/telas/` e confira:

- [ ] Só um botão em `acc` (cheio) por região. Ações de linha em `acc-soft`, todas com 176px.
- [ ] Nenhuma cor fora dos tokens (`grep` de cor do Tailwind dá zero no arquivo).
- [ ] Status sempre com selo e texto, na cor da família certa.
- [ ] Mesmos campos, botões e textos de ação que o app tinha antes.
- [ ] Os dois temas iguais em estrutura; o escuro escuro de verdade.
- [ ] Nada em R$ no Início.
- [ ] Notificações e avisos rápidos com a cor só no ícone, sem faixa lateral e sem fundo colorido.
- [ ] Folga igual dos dois lados nos ícones de canto; animações dentro dos tempos e desligadas com movimento reduzido; item que expande é um botão só.
- [ ] Nada pula: botão carregando, troca de rótulo, seleção e aba mantêm o tamanho (`PLANO_IMPLEMENTACAO.md`, 9.7).
- [ ] Estados percorridos e anotados no PR, incluindo o conflito de concorrência nas telas que editam (`PLANO_IMPLEMENTACAO.md`, 9.6).
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
