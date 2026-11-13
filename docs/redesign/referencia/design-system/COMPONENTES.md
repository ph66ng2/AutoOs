# Componentes do Design System

Cada seção é o guia de um componente. A aparência de referência está nas classes de `componentes.css` (só tokens) e nas telas de `../telas/`.

## Botao

Botão de ação, em seis variantes e três alturas.


**Quando usar**
- `--pri` (preenchido em `acc`): a ação principal da região. No máximo um por cabeçalho, rodapé de modal ou linha.
- `--sec` (contorno `ctl`): Cancelar, Voltar, Fechar e ações de apoio.
- `--soft` (`acc-soft`): a ação principal da linha da tabela e atalhos repetidos (WhatsApp, Copiar).
- `--link`: ação textual dentro de um aviso ("Corrigir decisão do orçamento").
- `--danger`: confirma algo destrutivo. O rótulo diz o que acontece ("Excluir cliente", nunca "Sim").
- `--danger-line`: ação destrutiva secundária num rodapé ("Remover senha", "Revogar link atual").


**Alturas:** padrão 40px (`control`); `--sm` 32px (`control-sm`) na linha da tabela; `--touch` 48px (`control-touch`) no Balcão, no celular e no portal.


**O que você fornece:** o rótulo, no imperativo e com os nomes reais do app ("Iniciar Verificação", "Finalizar Verificação").


**Não faça**
- Não pinte o botão com a cor do status da linha. Isso foi testado e rejeitado: a cor de fase fica no selo e na barra de etapas.
- Não use dois `--pri` lado a lado.
- Ação principal sempre à direita no rodapé do modal.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col">
 <div class="ao-row"><button class="ao-btn ao-btn--pri">+ Nova entrada</button><button class="ao-btn ao-btn--sec">Exportar</button><button class="ao-btn ao-btn--soft">Abrir WhatsApp</button><button class="ao-btn ao-btn--link">Corrigir decisão do orçamento</button></div>
 <div class="ao-row"><button class="ao-btn ao-btn--danger">Excluir cliente</button><button class="ao-btn ao-btn--danger-line">Remover senha</button><button class="ao-btn ao-btn--pri" disabled>Baixando...</button></div>
 <div class="ao-row"><button class="ao-btn ao-btn--sm ao-btn--soft">Marcar Pronto</button><button class="ao-btn ao-btn--touch ao-btn--pri">Registrar Entrega</button></div>
</div>
</div>
```

</details>

## AcaoDaLinha

A próxima ação de um equipamento: um botão de largura fixa (176px, `action-width`) e o botão ⋯ ao lado.


**Regras**
- Todo botão principal tem a mesma largura, em toda linha e no topo de Detalhes da OS. Assim a coluna "Próxima ação" fica alinhada.
- Uma ação principal por linha. As outras vão para o ⋯ (`MenuDeAcoes`).
- O rótulo vem do status. Esta é a tabela que manda, tirada do app de hoje:

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


**O que você fornece:** o status da linha. Quem implementa deve gerar os rótulos de uma função única (`acoesPorStatus`) e testar contra as transições permitidas no backend.


**Não faça:** cor de status no botão; botão com largura do texto; mais de um botão visível por linha.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<table class="ao-table" style="max-width:720px"><tbody><tr>
<td><span style="display:block;font-weight:700">Argox OS-214 Plus</span><span class="ao-serial">OS214-2203</span></td>
<td><span class="ao-pill ao-pill--wait"><i></i>Aguardando aprovação</span></td>
<td class="num"><span class="ao-row" style="justify-content:flex-end;gap:6px"><button class="ao-btn ao-btn--sm ao-btn--soft ao-acao">Aprovar</button><button class="ao-mais" aria-label="Mais ações" aria-haspopup="menu" aria-expanded="false">⋯</button></span></td>
</tr><tr>
<td><span style="display:block;font-weight:700">Zebra ZT411</span><span class="ao-serial">ZT411-0042</span></td>
<td><span class="ao-pill ao-pill--neutral"><i></i>Recebido</span></td>
<td class="num"><span class="ao-row" style="justify-content:flex-end;gap:6px"><button class="ao-btn ao-btn--sm ao-btn--soft ao-acao">Iniciar Verificação</button><button class="ao-mais" aria-label="Mais ações" aria-haspopup="menu" aria-expanded="true">⋯</button></span></td>
</tr></tbody></table>
</div>
```

</details>

## MenuDeAcoes

O menu do botão ⋯: as ações que não são a principal, sempre nas mesmas quatro seções e na mesma ordem.


**Seções, nesta ordem**
1. **Neste status**: o que só vale agora (vem da tabela de `AcaoDaLinha`). Some quando está vazia.
2. **Orçamento**: Orçamento PDF, Alterar Orçamento, Peças da OS.
3. **Corrigir um engano**: Corrigir Status, Corrigir decisão do orçamento.
4. **Equipamento**: Status, Editar Equipamento, Excluir (em `danger`, sempre por último).


**Comportamento:** abre ancorado ao ⋯ (posição fixa, calculada pelo botão), fecha com Esc, clique fora ou escolha. Largura 248px, `radius-xl`, `shadow-menu`. No celular vira `PainelInferior` com as mesmas seções.


**O que você fornece:** o título (modelo · série) e a lista do status atual.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div role="menu" aria-label="Ações do equipamento" class="ao-menu">
 <h5>Argox OS-214 Plus · OS214-2203</h5>
 <h4>NESTE STATUS</h4><button role="menuitem">Reprovar</button><button role="menuitem">WhatsApp</button>
 <h4>ORÇAMENTO</h4><button role="menuitem">Orçamento PDF</button><button role="menuitem">Alterar Orçamento</button><button role="menuitem">Peças da OS</button>
 <h4>CORRIGIR UM ENGANO</h4><button role="menuitem">Corrigir Status</button><button role="menuitem">Corrigir decisão do orçamento</button>
 <h4>EQUIPAMENTO</h4><button role="menuitem">Status</button><button role="menuitem">Editar Equipamento</button><button role="menuitem" class="is-danger">Excluir</button>
</div>
</div>
```

</details>

## SeloDeStatus

Selo com o nome do status, colorido pela família de significado.


**Famílias** (a mesma regra em app, Balcão, portal, celular e site):

| Família | Quer dizer | Status |
|---|---|---|
| `neutral` | entrou ou saiu | Recebido, Entregue, Abandonado |
| `work` | está na nossa bancada | Em verificação, Verificado, Aprovado, Em manutenção |
| `wait` | esperando alguém de fora | Aguardando aprovação, Aguardando peça |
| `ok` | pronto, deu certo | Pronto |
| `bad` | problema, precisa de decisão | Reprovado, Orçamento vencido |


**Regras**
- Sempre com o texto do status. A cor nunca é a única pista (o ponto e a palavra ficam).
- Orçamento de insumos usa as mesmas famílias: Rascunho e Entregue `neutral`, Enviado `wait`, Aprovado `ok`, Reprovado `bad`, Cancelado `neutral`.
- No portal os títulos mudam para a voz do cliente ("O orçamento aguarda sua resposta"), mas a família é a mesma.


**O que você fornece:** o código do status. Mapeie com uma função única (`statusFamily`).

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col">
 <div class="ao-row"><span class="ao-pill ao-pill--neutral"><i></i>Recebido</span><span class="ao-pill ao-pill--neutral"><i></i>Entregue</span></div>
 <div class="ao-row"><span class="ao-pill ao-pill--work"><i></i>Em verificação</span><span class="ao-pill ao-pill--work"><i></i>Verificado</span><span class="ao-pill ao-pill--work"><i></i>Aprovado</span><span class="ao-pill ao-pill--work"><i></i>Em manutenção</span></div>
 <div class="ao-row"><span class="ao-pill ao-pill--wait"><i></i>Aguardando aprovação</span><span class="ao-pill ao-pill--wait"><i></i>Aguardando peça</span><span class="ao-pill ao-pill--ok"><i></i>Pronto</span><span class="ao-pill ao-pill--bad"><i></i>Reprovado</span><span class="ao-pill ao-pill--bad"><i></i>Orçamento vencido</span></div>
</div>
</div>
```

</details>

## BarraDeEtapas

Mostra em que ponto do caminho o equipamento está.


**Duas formas**
- **Compacta** (lista de equipamentos): 7 traços de 14×4px. Os já percorridos levam a cor da família do status atual; o resto, `track`.
- **Grande** (Detalhes da OS, portal): 6 etapas — Recebido, Verificação, Orçamento, Manutenção, Pronto, Entregue. Concluídas em `acc`, a atual na cor da família, as futuras em `track`, com o nome embaixo.


**Regras:** desvios (Reprovado, Orçamento vencido, Aguardando peça) param na etapa onde aconteceram e trocam a cor da atual para a família deles. No celular só o nome da etapa atual aparece.


**O que você fornece:** o índice da etapa e o status.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col" style="max-width:640px">
 <div class="ao-row"><span style="width:120px;font-weight:600">Lista</span><span class="ao-steps"><span style="background:var(--st-wait)"></span><span style="background:var(--st-wait)"></span><span style="background:var(--st-wait)"></span><span style="background:var(--st-wait)"></span><span></span><span></span><span></span></span><span class="ao-muted">Aguardando aprovação</span></div>
 <div class="ao-steps--big ao-steps" aria-label="Andamento da OS"><span style="background:var(--acc)"></span><span style="background:var(--acc)"></span><span style="background:var(--st-wait)"></span><span></span><span></span><span></span></div>
 <div class="ao-steps--big" style="font:700 12px var(--font-sans)"><span>Recebido</span><span>Verificação</span><span>Orçamento</span><span class="ao-muted">Manutenção</span><span class="ao-muted">Pronto</span><span class="ao-muted">Entregue</span></div>
</div>
</div>
```

</details>

## FiltroDeStatus

Fileira de chips com o número de itens em cada status; um ligado por vez.


**Regras**
- O primeiro é sempre "Todos". Os outros seguem a ordem do fluxo, não a quantidade.
- O chip ligado usa `chip-on-bg` (escuro no claro, claro no escuro), não o acento: o acento fica para ações.
- O número é a contagem real com os outros filtros aplicados.
- No celular a fileira rola na horizontal.


**O que você fornece:** a lista de status com contagem e o status atual.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-row">
 <button class="ao-chip" aria-pressed="true">Todos<b>42</b></button><button class="ao-chip" aria-pressed="false">Recebido<b>5</b></button><button class="ao-chip" aria-pressed="false">Em verificação<b>8</b></button><button class="ao-chip" aria-pressed="false">Aguardando aprovação<b>7</b></button><button class="ao-chip" aria-pressed="false">Pronto<b>4</b></button><button class="ao-chip" aria-pressed="false">Vencido<b>2</b></button>
</div>
</div>
```

</details>

## Paginacao

Paginação numerada, como a de hoje: 10 itens por página, no máximo 7 posições.


**Regras**
- Até 7 páginas: mostra todas. Mais: 1 … (atual-1, atual, atual+1) … última; perto das pontas, as 5 primeiras ou as 5 últimas.
- À esquerda o texto "Mostrando X–Y de N". A página atual em `acc-soft`, com `aria-current="page"`.
- Usada em Equipamentos, Clientes, Serviços, Insumos e Orçamentos de insumos.


**O que você fornece:** total, itens por página (10) e página atual.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<nav aria-label="Páginas" class="ao-pag" style="max-width:720px">
 <span class="ao-muted" style="font-size:13px">Mostrando 41–50 de 186</span>
 <ol><li><button aria-label="Ir para página 1">1</button></li><li aria-hidden="true" class="ao-muted">…</li><li><button>4</button></li><li><button aria-current="page" aria-label="Página 5, atual">5</button></li><li><button>6</button></li><li aria-hidden="true" class="ao-muted">…</li><li><button>19</button></li></ol>
</nav>
</div>
```

</details>

## Tabela

Lista densa dentro de um cartão: cabeçalho em `head`, linhas de 56px, divisor `line-soft`.


**Regras**
- Coluna principal com duas linhas: nome em `body-strong` e código em `serial`.
- Valores em R$ alinhados à direita, com `tabular-nums`. "—" quando não há.
- A última coluna é a `AcaoDaLinha`. Clicar no nome abre o detalhe.
- Fica dentro de um contêiner com rolagem horizontal; a página nunca rola de lado.
- Embaixo vem a `Paginacao`.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<table class="ao-table" style="max-width:820px">
 <thead><tr><th>Equipamento</th><th>Cliente</th><th>Andamento</th><th class="num">Orçamento</th></tr></thead>
 <tbody>
  <tr><td><span style="display:block;font-weight:700">Argox OS-214 Plus</span><span class="ao-serial">OS214-2203</span></td><td>Mercado Bom Preço<span style="display:block;font-size:12px" class="ao-muted">Lúcia Costa</span></td><td><span class="ao-pill ao-pill--wait"><i></i>Aguardando aprovação</span></td><td class="num" style="font-weight:600">R$ 480,00</td></tr>
  <tr><td><span style="display:block;font-weight:700">Datamax E-4205A</span><span class="ao-serial">E4205-5521</span></td><td>Transportes Lima<span style="display:block;font-size:12px" class="ao-muted">Davi Lima</span></td><td><span class="ao-pill ao-pill--ok"><i></i>Pronto</span></td><td class="num" style="font-weight:600">R$ 1.250,00</td></tr>
 </tbody>
</table>
</div>
```

</details>

## Campo

Rótulo, controle e uma linha de ajuda ou erro, empilhados.


**Regras**
- Rótulo em cima, em `label`. Obrigatório termina em " *".
- Controle de 44px (`control-field`) em modal; 48px no Balcão e no celular. Borda `field-border` (3:1), não `ctl`.
- Ajuda em `muted` embaixo. Erro substitui a ajuda: borda de 2px `danger` e a frase em `danger`, dizendo o que fazer ("Informe um valor maior que zero.").
- Dinheiro usa o prefixo "R$" fora do texto digitado. Série, patrimônio e códigos em mono.
- Erro geral (do servidor) vai num `Aviso` no topo do corpo do modal.


**O que você fornece:** rótulo, valor, placeholder com exemplo real, ajuda e mensagem de erro.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:560px">
 <label class="ao-field" style="grid-column:1/-1">Nº Série *<input class="ao-input" style="font-family:var(--font-mono)" value="OS214-2203"></label>
 <label class="ao-field">Marca *<select class="ao-input"><option>Argox</option></select></label>
 <label class="ao-field">Patrimônio<input class="ao-input" placeholder="Código patrimonial, se houver"></label>
 <label class="ao-field" style="grid-column:1/-1">Valor *<span class="ao-prefix" style="border:2px solid var(--danger)"><span>R$</span><input value="0,00" aria-invalid="true"></span><span class="ao-err">Informe um valor maior que zero.</span></label>
 <label class="ao-field" style="grid-column:1/-1">Motivo da correção *<textarea class="ao-input" placeholder="Ex.: status alterado por clique indevido"></textarea><span class="ao-help">Fica registrado na auditoria.</span></label>
</div>
</div>
```

</details>

## Escolha

Rádio em cartão, checkbox com descrição e chips de múltipla escolha.


**Quando usar**
- **Rádio em cartão:** escolha entre caminhos com consequências diferentes (Corrigir decisão, Quem recebe o orçamento). Título curto e uma linha de consequência.
- **Checkbox:** confirmação ou opção extra. Texto completo da ação, sem "Sim/Não".
- **Chips:** itens soltos e curtos (acessórios na entrada).
- **Botão de opção** (cartão com ›): quando a escolha já executa, sem "Continuar" (Reabrir orçamento).


**Regras:** alvo de 20px, cor `acc`; o cartão escolhido ganha borda de 2px `acc` e fundo `acc-soft`.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col" style="max-width:560px">
 <label class="ao-radio-card"><input type="radio" name="r" checked><span>Restaurar o orçamento enviado ao cliente<small>Volta a Aguardando aprovação com a versão enviada.</small></span></label>
 <label class="ao-radio-card"><input type="radio" name="r"><span>Voltar para aguardando aprovação mantendo o orçamento atual</span></label>
 <label class="ao-check"><input type="checkbox" checked><span>Enviar o orçamento ao cliente agora (WhatsApp e e-mail)</span></label>
 <div class="ao-row"><button class="ao-chip" aria-pressed="true">✓ Cabo de Força</button><button class="ao-chip" aria-pressed="true">✓ Fonte</button><button class="ao-chip" aria-pressed="false">Etiqueta</button><button class="ao-chip" aria-pressed="false">Ribbon</button></div>
</div>
</div>
```

</details>

## Aviso

Bloco de texto com fundo, para informar sem interromper.


**Tons:** `info` (`sunken`, regra ou consequência), `warn` (`st-wait`, risco evitável), `danger` (`danger-soft`, irreversível), `ok` (`st-ok`, deu certo).


**Regras:** título em negrito só quando o aviso é longo. Diga o que acontece e o que fazer. Não use para erro de campo (vai no `Campo`). Dentro de modal, ocupa a largura toda.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col" style="max-width:560px">
 <div role="note" class="ao-note ao-note--info">Ao salvar, você escolhe entre ajustar sem nova aprovação ou pedir nova aprovação pelo portal.</div>
 <div role="note" class="ao-note ao-note--warn"><strong>Atenção: série já cadastrada</strong>O histórico anterior será preservado. Este será um registro independente.</div>
 <div role="note" class="ao-note ao-note--danger"><strong>Atenção: esta ação é irreversível!</strong>O perfil será excluído com seu PIN e histórico vinculado.</div>
 <div role="note" class="ao-note ao-note--ok">Senha salva. Entregue os dados ao contato.</div>
</div>
</div>
```

</details>

## Modal

Janela sobre a tela, com cabeçalho, corpo em grade de 2 colunas e rodapé.


**Tamanhos:** P 440px (`modal-p`, confirmação), M 560px (`modal-m`, formulário curto, escolha, ação com PIN), G 760px (`modal-g`, formulário longo; o corpo rola, cabeçalho e rodapé ficam), Visualizador até 1040px (`viewer-width`, PDF e imagem).


**Os 7 formatos:** confirmação simples, confirmação sensível (PIN no próprio modal), formulário curto, formulário longo, escolha, assistente em passos, visualizador.


**Regras**
- Título diz o que se faz ("Corrigir decisão do orçamento"); a linha de baixo diz a consequência ou o objeto.
- Ação principal à direita; ação destrutiva secundária à esquerda do rodapé.
- Esc e clique fora fecham, menos em ação sensível e assistente.
- Ação sensível pede PIN dentro do modal, sem abrir outro.
- Campos que dependem do status somem quando não valem; não desabilite sem explicar.


**O que você fornece:** título, subtítulo, campos e as ações do rodapé.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-scrim">
 <div role="dialog" aria-label="Novo Gasto Fixo" class="ao-modal">
  <header><div><h2>Novo Gasto Fixo</h2><p>Repete todo mês até você encerrar.</p></div><button class="ao-x" aria-label="Fechar">×</button></header>
  <main>
   <label class="ao-field full">Nome *<input class="ao-input" value="Aluguel do escritório"></label>
   <label class="ao-field">Valor (R$) *<span class="ao-prefix"><span>R$</span><input value="2.400,00"></span></label>
   <label class="ao-field">Vencimento (dia)<input class="ao-input" value="5"></label>
  </main>
  <footer><button class="ao-btn ao-btn--sec">Cancelar</button><button class="ao-btn ao-btn--pri">Salvar</button></footer>
 </div>
</div>
</div>
```

</details>

## Confirmacao

Modal P (440px) para confirmar uma ação, sem cabeçalho com barra.


**Regras:** ícone de 44px no tom (`danger-soft` para destruir, `st-wait-bg` para risco), pergunta no título, objeto e consequência na linha de baixo, botões "Cancelar" e o verbo exato. Nunca "Sim/Não", nunca "OK".

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-scrim">
 <div role="alertdialog" aria-label="Excluir cliente?" class="ao-modal ao-modal--p">
  <div class="ao-confirm"><span class="ao-icon ao-icon--danger"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></span><h2>Excluir cliente?</h2><p>Jorge Matos. Esta ação não pode ser desfeita.</p></div>
  <footer><button class="ao-btn ao-btn--sec">Cancelar</button><button class="ao-btn ao-btn--danger">Excluir cliente</button></footer>
 </div>
</div>
</div>
```

</details>

## Abas

Duas formas de trocar de vista sem sair da página.

- **Abas sublinhadas:** seções de um mesmo objeto (Detalhes da OS: Orçamento, Verificação, Fotos, Histórico, Comunicação). A ativa tem traço de 2px em `acc`.
- **Segmentado:** vistas irmãs de um módulo, no cabeçalho (Insumos: Estoque · Orçamentos; Início: Parados · Para fazer). A ativa em `acc-soft`.

Contagem vai no próprio rótulo ("Fotos · 6").

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-col">
 <div role="tablist" class="ao-tabs" style="max-width:640px"><button role="tab" aria-selected="true">Orçamento</button><button role="tab" aria-selected="false">Verificação</button><button role="tab" aria-selected="false">Fotos · 6</button><button role="tab" aria-selected="false">Histórico</button></div>
 <div role="tablist" class="ao-seg"><button role="tab" aria-selected="false">Estoque</button><button role="tab" aria-selected="true">Orçamentos · 5 abertos</button></div>
</div>
</div>
```

</details>

## CartaoKPI

Número do Início com rótulo e uma linha de contexto na cor da família.


**Regras**
- Os quatro do Início: Em atendimento, Aguardando aprovação, Prontos para entrega, Aguardando peça.
- **Nada em R$ no Início.** Faturado e gastos ficam em Finanças.
- A linha de contexto diz o que pede ação, não uma variação percentual.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;max-width:900px">
 <div class="ao-kpi"><span class="ao-muted">Em atendimento</span><b>42</b><span style="font-size:12px;font-weight:700;color:var(--st-work)">6 em manutenção</span></div>
 <div class="ao-kpi"><span class="ao-muted">Aguardando aprovação</span><b>7</b><span style="font-size:12px;font-weight:700;color:var(--st-wait)">3 há mais de 2 dias</span></div>
 <div class="ao-kpi"><span class="ao-muted">Prontos para entrega</span><b>4</b><span style="font-size:12px;font-weight:700;color:var(--st-ok)">mais antigo: 01/11</span></div>
 <div class="ao-kpi"><span class="ao-muted">Aguardando peça</span><b>2</b><span style="font-size:12px;font-weight:700;color:var(--st-wait)">1 há 6 dias</span></div>
</div>
</div>
```

</details>

## MenuLateral

Menu fixo de 264px (`sidebar-width`) agrupado por área, com o perfil e Configurações no pé.


**Grupos e itens:** Início · Atendimento (Equipamentos, Balcão, Clientes) · Estoque (Insumos e peças, Serviços) · Financeiro (Finanças) · Administração (Equipe e acessos). No pé: Configurações e o cartão do perfil (avatar, nome, papel, trocar e bloquear).


**Regras:** item ativo em `nav-on-bg` / `nav-on-ink`. Contadores só onde o app já tem o número. No topo, o nome da empresa vem da configuração — nunca fixo.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<nav class="ao-nav" aria-label="Menu principal">
 <div class="ao-row" style="padding:0 8px 12px"><span class="ao-mark">OS</span><span style="display:flex;flex-direction:column;line-height:1.2"><b>Sua empresa</b><span class="ao-muted" style="font-size:12px">Matriz</span></span></div>
 <a href="#">Início</a>
 <h4>Atendimento</h4><a href="#" aria-current="page">Equipamentos<b>42</b></a><a href="#">Balcão</a><a href="#">Clientes</a>
 <h4>Estoque</h4><a href="#">Insumos e peças</a><a href="#">Serviços</a>
 <h4>Financeiro</h4><a href="#">Finanças</a>
 <h4>Administração</h4><a href="#">Equipe e acessos</a>
</nav>
</div>
```

</details>

## Avatar

Iniciais do perfil num quadrado arredondado, na cor escolhida pela pessoa.


**Regras:** nome, cor e ícone vêm de `security_profiles`. Use matiz da pessoa com saturação ≤40% e luminosidade 38–46%, para o branco passar de 4,5:1. Perfil escolhido ganha anel de 2px em `acc`. Tamanhos 36px (listas), 48px (cabeçalho), 56px (entrar).

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-row" style="gap:16px">
 <span class="ao-avatar" style="background:hsl(190 32% 38%)">MA</span><span class="ao-avatar" style="background:hsl(28 40% 44%)">IV</span><span class="ao-avatar" style="background:hsl(330 30% 46%)">BC</span>
 <span class="ao-avatar" style="width:56px;height:56px;border-radius:18px;font-size:16px;background:hsl(28 40% 44%);box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--acc)">IV</span>
</div>
</div>
```

</details>

## BlocoDoBalcao

Bloco grande de toque do modo Balcão: ícone, título e uma linha.


**Regras**
- Só quatro: Receber equipamento (em `hero-bg`, a ação do dia), Entregar equipamento, Consultar cliente, Preço e estoque.
- Mínimo de 160px de altura; tudo no Balcão tem alvo ≥48px (`control-touch`) e texto ≥15px.
- O Balcão não é uma cor diferente do app: é outro layout, com menos coisas na tela.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:640px">
 <a class="ao-tile ao-tile--hero" href="#"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span style="display:flex;flex-direction:column"><strong>Receber equipamento</strong><span>Nova entrada em 4 passos</span></span></a>
 <a class="ao-tile" href="#"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/></svg><span style="display:flex;flex-direction:column"><strong>Entregar equipamento</strong><span>Retirada pelo cliente</span></span></a>
</div>
</div>
```

</details>

## PainelInferior

O modal do celular e do portal: sobe do rodapé, com alça, ocupando a largura.


**Regras:** usado para responder ao orçamento no portal (confirmar senha, aceitar com ordem de compra, recusar, pedir correção, comprovante) e para o ⋯ no celular. Botões de 48px lado a lado, principal à direita. Altura máxima 78% da tela; o conteúdo atrás fica escurecido por `scrim`.

<details><summary>Marcação de exemplo</summary>

```html
<div class="ao" style="padding:20px;background:var(--bg)">
<div class="ao-sheet" role="dialog" aria-label="Confirme que é você">
 <span class="alca"></span><h2>Confirme que é você</h2><span class="ao-muted">Por segurança, digite sua senha de novo para responder ao orçamento.</span>
 <label class="ao-field">Senha<input class="ao-input" type="password" value="123456789" style="height:48px"></label>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="ao-btn ao-btn--touch ao-btn--sec">Cancelar</button><button class="ao-btn ao-btn--touch ao-btn--pri">Continuar</button></div>
</div>
</div>
```

</details>
