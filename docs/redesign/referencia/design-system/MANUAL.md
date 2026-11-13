O AutoOS é o sistema de uma assistência técnica: recepção, verificação, orçamento, aprovação do cliente, estoque e entrega. Usado o dia todo, em pé no balcão e sentado na bancada, por gente que precisa saber num olhar qual é o próximo passo de cada equipamento. A interface é calma, densa onde precisa e só tem uma cor que chama: a da ação.

## Conteúdo

- Português do Brasil, direto. Ações no imperativo e com o nome que o app já usa: "Iniciar Verificação", "Enviar Orçamento", "Registrar Entrega", "Finalizar Verificação". Não invente sinônimos entre telas.
- Título de página em `page-title` e uma linha em `small`/`muted` com o estado atual: "42 em atendimento. 7 esperando resposta do cliente."
- O título de modal diz o que se faz; a linha abaixo diz a consequência: "Corrigir decisão do orçamento — Desfaz a decisão e volta o orçamento para aguardando aprovação."
- Botão destrutivo leva o verbo e o objeto: "Excluir cliente", "Revogar link atual". Nunca "Sim", "OK" ou "Confirmar" sozinho em ação destrutiva.
- Erros dizem o que fazer: "Informe um valor maior que zero." Avisos dizem o que acontece depois: "Ele deixará de aparecer na verificação técnica."
- No portal, a voz é a do cliente: "O orçamento aguarda sua resposta", "Pronto para retirada".
- Sem emoji. Números com `tabular-nums`; dinheiro como "R$ 1.250,00"; datas "11/11" na lista e "11 de novembro de 2026 às 08:40" no detalhe.

## Cor

- Um acento só: `acc` (petróleo). Ele marca a ação principal, o foco, o item ativo e a etapa concluída. Uma região tem no máximo um botão `acc`.
- As cores de status são significado, não decoração. Cinco famílias, iguais em todo lugar (ver `SeloDeStatus`): `st-neutral` entrou ou saiu · `st-work` na nossa bancada · `st-wait` esperando alguém de fora · `st-ok` pronto · `st-bad` precisa de decisão.
- Cor de status vai no selo, na barra de etapas e nos números do Início. **Não vai no botão de ação** (testado e rejeitado).
- Fundo `bg`, cartões em `surface`, áreas rebaixadas em `sunken`. Texto `ink`, apoio `muted`. Bordas `line`; divisores de linha `line-soft`.
- `danger` só para o que destrói ou para erro.
- Gráficos: `chart-1` (o acento), `chart-2`, `chart-3`.
- Paleta sem neon e sem degradê. O único bloco cheio de cor é `hero-bg` (Receber equipamento no Balcão, chamada final do site).

## Tipografia

- Manrope em tudo (`sans`); IBM Plex Mono (`mono`) para série, patrimônio, códigos e senhas geradas.
- App em 14px (`body`). Escala: `page-title` 26, `modal-title` 20, `card-title` 16, `body` 14, `label`/`small` 13, `caption` 12, `eyebrow` 11 em maiúsculas.
- Balcão, celular e portal sobem um degrau: `touch` 18 para ações, campos de 16px.
- `display` só no site.

## Espaço, tamanho e forma

- Grade de 4px, com preferência pelos múltiplos de 8: `space-2` entre itens relacionados, `space-4` entre campos e cartões, `space-5` dentro de cartão e modal, `space-6` nas laterais de modal e página.
- Alturas de controle: 32 (`control-sm`, linha da tabela), 40 (`control`), 44 (`control-field`, campo de modal), 48 (`control-touch`, toque).
- Raios: `radius` 8 em botão e campo, `radius-lg` 12 em blocos internos, `radius-xl` 16 em cartão, modal e menu, `radius-pill` em selo e chip.
- Borda separa; sombra só no que flutua (`shadow-menu`, `shadow-modal`, `shadow-float`). Cartões de página não têm sombra.

## Layout

- App: `MenuLateral` de 264px à esquerda, conteúdo à direita com cabeçalho (título e uma linha à esquerda, ações à direita) e um cartão de conteúdo com filtros, tabela e paginação.
- Uma ação principal por linha, com largura fixa (`action-width`, 176px), e o resto no ⋯. Ver `AcaoDaLinha` e `MenuDeAcoes`.
- Paginação de 10 itens, numerada, no máximo 7 posições (`Paginacao`).
- Detalhes da OS e Orçamento de insumos são páginas, não modais.
- Modais em três larguras e sete formatos (`Modal`). Ação principal à direita.
- Barra de rolagem fina, trilho transparente, alça em `scroll-thumb`.

## Temas

- Claro e escuro, com a mesma estrutura: o escuro troca só cores. Toda tela e todo modal existem nos dois.
- O tema é do perfil (fica em `security_profiles`) e pode seguir o sistema.
- No escuro o acento clareia (`#7aa9b5`), então o texto sobre ele escurece (`acc-ink`).

## Superfícies

- **Balcão:** o mesmo AutoOS com menos coisa na tela. Quatro blocos (`BlocoDoBalcao`), busca grande, fila do dia ao lado, alvos ≥48px.
- **Portal do Cliente:** abre no celular do cliente pelo link do WhatsApp. Mesmos tokens e famílias de status; respostas ao orçamento em `PainelInferior`. A marca no topo é a da empresa, vinda da configuração.
- **Celular da equipe** (ainda não existe; é o futuro Mobile Field): barra inferior com Início, Equipamentos, +, Clientes, Mais. Estoque, Finanças, Equipe e Configurações ficam só no computador.
- **Site do produto:** mesmos tokens, `display` na abertura, mockups das telas reais.

## Iconografia

Lucide (o que o app já usa), traço de 2px, cantos e pontas arredondados. 16px dentro de botão, 20–22px no menu, 32px nos blocos do Balcão. Ícone sempre acompanhado de texto, exceto ⋯, ×, ‹ e o cadeado de bloquear, que levam `aria-label`.

## Marca

- O produto é o AutoOS, não a empresa que o usa. Nada de marca, e-mail ou texto fixo de um cliente em código novo: nome, logo e contatos da empresa vêm da configuração (menu lateral, portal, PDFs, e-mails).
- Marca do AutoOS (provisória): o bloco "OS" em `acc` com o nome ao lado, em `assets/Logos`. O ícone atual do app é um quadrado azul provisório e deve ser trocado por ela.
- Os PDFs de OS e orçamento mantêm o modelo de hoje; só a moldura de prévia muda.

## Acessibilidade

- Texto ≥4,5:1 no fundo onde aparece, nos dois temas; bordas de campo, foco e ícones ≥3:1. As notas dos tokens dizem em quais fundos cada cor de texto foi conferida.
- Duas correções em relação ao canvas: `st-ok` claro escureceu (`#38704e`) e campos usam `field-border` em vez de `ctl`.
- Foco visível em todo controle: 2px sólido em `focus`, 2px de afastamento.
- Status nunca só por cor: selo sempre com o nome.
- Alvos de toque ≥48px no Balcão, no celular e no portal.

## Regras do produto que o visual não pode quebrar

- Redesign muda aparência e, às vezes, o caminho; a função é a do app de hoje. O que foi desenhado sem existir está marcado no canvas e precisa de decisão antes de virar código.
- Nada em R$ no Início. Faturado só em Finanças.
- Ação sensível ou destrutiva mantém confirmação explícita e PIN quando hoje pede.

## Telas

`assets/Telas` tem as capturas do redesign (claro e algumas no escuro), na resolução das pranchetas. `assets/Antes` guarda as capturas do app de antes, para comparar. O canvas completo, com todos os modais, o portal, o celular e o site, é a referência viva.
