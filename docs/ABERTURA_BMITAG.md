# Abertura BMI TAG: leitura de tag

Abertura do AutoOS, tocada **em toda inicialização**. Substituiu o carimbo da primeira abertura do dia e a animação da impressora, que foram apagados.

- Componente: `src/components/opening/BmiTagOpening.tsx` + `bmi-tag-opening.css`
- Integração no boot: `src/components/BootSplash.tsx` e `src/components/BootUi.tsx`
- Demonstração para ajustes (não faz parte do app): `opening-demo.html` (entrada) + `src/opening-demo/`. Rode `npm run dev` e abra `http://localhost:1420/opening-demo.html`. A página não entra no `vite build` do app, porque não é uma entrada do Rollup.
- Testes do ciclo de vida: `src/components/opening/BmiTagOpening.test.tsx`

## Asset de marca

Fonte: `public/bmi-tag-logo.png` (819×655, RGBA, fundo transparente). É a mesma arte de `public/logo-tag-trasparente.svg`, que não é vetorial: é esse PNG embutido em um SVG.

Letras e QR são recortes retangulares do PNG, posicionados nas coordenadas do próprio arquivo. Não foram redesenhados nem vetorizados.

| Parte | x | y | largura | altura |
|-------|---|---|---------|--------|
| B | 69 | 144 | 147 | 174 |
| M | 228 | 144 | 187 | 174 |
| I | 436 | 144 | 51 | 174 |
| QR (cartão branco com a sombra) | 518 | 162 | 135 | 132 |
| T | 237 | 328 | 144 | 147 |
| A | 385 | 328 | 146 | 147 |
| G | 552 | 328 | 145 | 147 |

**Aproximação declarada: as duas barras.** O que parece um par de colchetes é, no arquivo, duas barras azuis retas (x 503–540 e 631–667, y 148–308) com o cartão do QR por cima. Como o meio de cada barra fica escondido atrás do QR, o recorte do PNG não serve enquanto o QR ainda não apareceu. As barras são retângulos em CSS com o degradê vertical medido no PNG em sete pontos. No quadro final elas ficam embaixo do recorte do QR, na mesma posição do original.

O slogan "TECNOLOGIA QRCODE E RFID" (y 491–513) fica de fora: na escala da abertura ele teria menos de 6 px de altura.

**Limitação de fidelidade.** O QR ocupa cerca de 122 px no arquivo. Durante a leitura (zoom 1,4) em tela de densidade 2× ele é desenhado com até ~175 px físicos, ou seja, ampliado em ~1,4×. Fica aceitável, mas não nítido. Para finalizar é preciso a logo em vetor (SVG com letras em curvas e o QR em módulos) ou, no mínimo, um PNG transparente com 2000 px ou mais de largura. Com o vetor, os recortes viram grupos do SVG e nada mais muda na coreografia.

## Quadro final

Unidade `u` = 1 pixel do PNG na escala atual. A logo fica sozinha, no centro da tela, sem nome de solução abaixo (decisão do responsável do produto). Caixa: 628u × 331u.

- Logo (BMI + QR em cima, TAG embaixo): 628u × 331u.
- Largura da logo: `clamp(200px, 24cqw + 135px, 360px)` em relação ao contêiner. 320 px → 212, 390 → 229, 430 → 238, janela de notebook → 360. A logo não cresce com a janela.
- Fundo liso `#070a10`.

## Coreografia

Um ator por vez, com duas pausas. Abertura de marca: 2450 ms.

| Etapa | Início–fim (ms) | Elemento | Do estado | Para o estado | Curva |
|-------|-----------------|----------|-----------|---------------|-------|
| 1. Bloco | 0–300 | símbolo (as duas barras encostadas) | opacidade 0, escala 0,6 | opacidade 1, escala 1 | mola curta `cubic-bezier(.3,1.35,.5,1)` |
| 2. Abertura das barras | 360–700 | barra esquerda / direita | x +44,5u / −45,5u (encostadas no centro) | x 0 | mola curta |
| 3. Leitura | 720–1180 | linha + cartão do QR | linha em y 18u; cartão com `clip-path: inset(0 0 100% 0)` | linha em y 150u; cartão inteiro | `cubic-bezier(.4,.1,.6,.9)`, a mesma nos dois, para a linha imprimir o QR |
| 4. Confirmação | 1160–1460 | barras e símbolo | — | barras clareiam (0 → 0,75 → 0); símbolo escala 1 → 1,035 → 1 | `ease-out` |
| pausa | 1460–1560 | — | — | — | — |
| 5. Recuo | 1560–2040 | conjunto inteiro | `translate(-202u, 81.5u) scale(1.4)`, origem no centro do símbolo (516u, 84u) | identidade | `cubic-bezier(.6,0,.2,1)` |
| 6. BMI | 1900–2300 | bloco BMI | x +150u, escondido atrás da barra esquerda | x 0 | `cubic-bezier(.2,.7,.2,1)` |
| 7. TAG | 2020–2420 | bloco TAG | y −80u, escondido acima da própria janela | y 0 | `cubic-bezier(.2,.7,.2,1)` |
| pausa | até `ready` | — | — | — | — |
| 8. Saída | 300 (marca some em 180) | abertura inteira | opacidade 1 | opacidade 0 | `cubic-bezier(.4,0,.2,1)` |

Máscaras e relações de posição:

- O símbolo nunca sai da logo. No início o conjunto está ampliado 1,4× e deslocado de modo que o centro do símbolo coincida com o centro da tela. O recuo o leva ao lugar definitivo. Não existe um segundo QR.
- BMI: janela com `overflow: hidden` que termina 3u antes da borda esquerda da barra. O bloco desliza por trás dessa borda, então as letras saem de trás do símbolo.
- TAG: janela que começa em y 180u, logo abaixo da linha de base de BMI. O bloco desce de trás dessa linha.
- A linha de leitura e o recorte do QR usam a mesma duração e a mesma curva: o QR aparece exatamente até onde a linha já passou.
- A mola passa cerca de 4% do ponto e assenta. Ela só é usada no símbolo (etapas 1 e 2). Não há rotação.

Movimento reduzido (`prefers-reduced-motion: reduce`): marca completa e parada, com fade de 200 ms. Sem leitura, sem deslocamento.

## Ciclo de vida do componente

```tsx
<BmiTagOpening ready={appPronto} onFinished={desmontar} status="Conectando ao banco" />
```

- A abertura dura 2450 ms (220 ms com movimento reduzido). Se `ready` já for verdadeiro nesse ponto, a saída começa na hora. Não há espera mínima além da própria abertura.
- Se `ready` ainda for falso, a marca fica parada. Depois de 900 ms aparece `status`, discreto, sem repetir a leitura.
- `onFinished` é chamado uma vez, 300 ms depois do início da saída. Os temporizadores são limpos ao desmontar.
- Erro de inicialização é responsabilidade de quem hospeda: ao detectar erro, desmonte a abertura e mostre a tela de erro. A abertura não deve cobrir um erro.

## Integração no AutoOS

- `BootSplash.tsx` renderiza `<BmiTagOpening ready={fadeOut} onIntroDone={...} status={...} />` dentro do contêiner `role="status"` (z-40) que o e2e `boot-splash-cobre-menu` confere.
- `onIntroDone` (fim da montagem da logo) libera o PIN/perfil (`completeBootAnimation` em `BootUi.tsx`) e avisa o `App` (`completionAnimationElapsed`). O PIN abre por cima da logo parada.
- O `App` só libera a saída (`fadeOut`) quando o boot real terminou e a sessão está resolvida. A saída é a da própria abertura (300 ms); o `App` desmonta o splash 540 ms depois.
- Não existe mais duração mínima separada (`MIN_BOOT_SPLASH_MS` foi removido): o mínimo é a própria abertura.
- Carga lenta: a logo fica parada e, 900 ms depois, aparece "Iniciando o AutoOS" perto da base, enquanto o progresso real for menor que 100.
- Erro de banco: o `DatabaseConfigDialog` e a tela de PIN continuam abrindo por cima, como antes.
- Trava de segurança: o PIN nunca espera a animação por mais de 20 s (`BOOT_ANIMATION_HARD_LIMIT_MS`).
- E2E em modo mock (`VITE_E2E_MOCK=1`): a abertura toca, mas o PIN não espera por ela.
- Retomada do aplicativo (janela que volta ao foco) não toca a abertura: ela só monta no carregamento do app.

## Adaptação mobile (React Native)

- A demonstração mobile é uma página web em tela estreita. Ela valida composição e proporção, não o código nativo.
- O CSS não é reaproveitável no React Native. O que se reaproveita é a tabela de recortes e a tabela de coreografia acima.
- Com o asset em vetor: `react-native-svg` para a logo em grupos e a biblioteca de animação que o projeto adotar (por exemplo Reanimated) para `transform` e `opacity`. Confirmar nas versões instaladas se a animação de `transform` em grupos de SVG roda fora da thread de JS antes de assumir isso.
- Com o PNG: sete `Image` recortadas, ou sete fatias exportadas, dentro de uma `View` com as mesmas coordenadas.
- A splash nativa do sistema (estática, exibida antes de o JS carregar) deve ser só o fundo `#060a13`. A animação começa quando a primeira tela do app é montada, com o QR surgindo sobre o mesmo fundo, para não haver salto.
- Respeitar áreas seguras: o conjunto é centralizado dentro da área segura, não da tela física.
