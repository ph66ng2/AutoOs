# Abertura BMI TAG: leitura de tag

Protótipo da abertura que deve substituir o carimbo. **Ainda não está ligado ao fluxo de inicialização**: `BootSplash`, `StampDemo` e `App.tsx` não foram alterados.

- Componente: `src/components/opening/BmiTagOpening.tsx` + `bmi-tag-opening.css`
- Demonstração: `opening-demo.html` (entrada) + `src/opening-demo/`. Rode `npm run dev` e abra `http://localhost:1420/opening-demo.html`. A página não entra no `vite build` do app, porque não é uma entrada do Rollup.
- Testes do ciclo de vida: `src/components/opening/BmiTagOpening.test.tsx`

## Asset de marca

Fonte: `public/bmi-tag-logo.png` (819×655, RGBA, fundo transparente). É a mesma arte de `public/logo-tag-trasparente.svg`, que não é vetorial: é esse PNG embutido em um SVG.

A logo não foi redesenhada nem vetorizada. Cada parte animada é um recorte retangular do PNG, posicionado nas coordenadas do próprio arquivo, então a composição final coincide com o original pixel a pixel. Os recortes funcionam porque as partes são separadas por faixas transparentes:

| Parte | x | y | largura | altura |
|-------|---|---|---------|--------|
| B | 69 | 144 | 147 | 174 |
| M | 228 | 144 | 187 | 174 |
| I | 436 | 144 | 51 | 174 |
| QR + colchetes | 500 | 144 | 172 | 174 |
| T | 237 | 328 | 144 | 147 |
| A | 385 | 328 | 146 | 147 |
| G | 552 | 328 | 145 | 147 |

O slogan "TECNOLOGIA QRCODE E RFID" (y 491–513) fica de fora: na escala da abertura ele teria menos de 6 px de altura.

**Limitação de fidelidade.** O QR ocupa cerca de 122 px no arquivo. No primeiro quadro (zoom 1,4) em tela de densidade 2× ele é desenhado com até ~175 px físicos, ou seja, ampliado em ~1,4×. Fica aceitável, mas não nítido. Para finalizar é preciso a logo em vetor (SVG com letras em curvas e o QR em módulos) ou, no mínimo, um PNG transparente com 2000 px ou mais de largura. Com o vetor, os recortes viram grupos do SVG e nada mais muda na coreografia.

## Quadro final

Unidade `u` = 1 pixel do PNG na escala atual. Caixa do conjunto: 628u × 459u.

- Logo (BMI + QR em cima, TAG embaixo): 628u × 331u.
- Filete de 72u × 1 px, 30u acima do nome.
- Nome da solução: 54u de corpo, peso 500, espaçamento 0,045em, fonte do app.
- Largura da logo: `clamp(190px, 22cqw + 130px, 320px)` em relação ao contêiner. 320 px → 200, 390 → 216, 430 → 225, janela de notebook → 320. A logo não cresce com a janela.
- O conjunto fica 5% acima do centro geométrico, por causa da assinatura abaixo.

## Coreografia

Só `transform` e `opacity` são animados. Não há mudança de layout.

| Etapa | Início–fim (ms) | Elemento | Do estado | Para o estado | Curva |
|-------|-----------------|----------|-----------|---------------|-------|
| A. Presença | 0–220 | QR + colchetes | opacidade 0, escala 0,955 | opacidade 1, escala 1 | `cubic-bezier(.2,.8,.2,1)` |
| B. Leitura | 240–700 | linha de leitura | y = 12u (topo dos colchetes) | y = 160u (base) | `cubic-bezier(.45,.1,.55,.9)`, quase linear; opacidade entra e sai nos 12% das pontas |
| B. Confirmação | 640–960 | cópia clara dos colchetes | opacidade 0 | 1 aos 35%, depois 0 | `ease-out` |
| C. Enquadramento | 720–1320 | conjunto inteiro | `translate(-203u, 142.5u) scale(1.4)`, origem no centro do QR | identidade | `cubic-bezier(.55,0,.15,1)` |
| C. BMI | I 790, M 870, B 980 (+440) | cada letra | opacidade 0, x +22u | opacidade 1, x 0 | `cubic-bezier(.2,.7,.2,1)` |
| C. TAG | G 830, A 900, T 970 (+440) | cada letra | opacidade 0, y −18u | opacidade 1, y 0 | `cubic-bezier(.2,.7,.2,1)` |
| D. Assinatura | 1180–1440 filete; 1220–1500 nome | filete, nome | opacidade 0; filete escala X 0,4; nome y +7 px | opacidade 1, sem deslocamento | `cubic-bezier(.2,.7,.2,1)` |
| E. Saída | 300 (marca some em 180) | abertura inteira | opacidade 1 | opacidade 0 | `cubic-bezier(.4,0,.2,1)` |

Relações de posição:

- O QR nunca sai da logo. No início o conjunto está ampliado 1,4× e deslocado de modo que o centro do QR (517u, 87u dentro da caixa) coincida com o centro da tela. Recuar o enquadramento leva o QR ao lugar definitivo. Não existe um segundo QR.
- As letras entram inteiras, da mais próxima do QR para a mais distante. Nenhuma letra é cortada por máscara.
- O B entra por último (980 ms) porque em tela de 320 px ele só cabe depois de o enquadramento recuar cerca de 60%. Se o zoom inicial ou a curva do enquadramento mudarem, reconferir esse quadro em 320 px.
- A linha de leitura é filha do recorte do QR, que tem `overflow: hidden`: ela não passa por cima do resto da marca.
- A confirmação é uma cópia do recorte do QR com `brightness(1.6)`, recortada em moldura (o quadro branco do QR fica de fora). Os módulos do QR não mudam.

Movimento reduzido (`prefers-reduced-motion: reduce`): marca completa e parada, com fade de 200 ms. Sem leitura, sem deslocamento.

## Ciclo de vida do componente

```tsx
<BmiTagOpening product="AutoOS" ready={appPronto} onFinished={desmontar} status="Conectando ao banco" />
```

- A abertura dura 1500 ms (220 ms com movimento reduzido). Se `ready` já for verdadeiro nesse ponto, a saída começa na hora. Não há espera mínima além da própria abertura.
- Se `ready` ainda for falso, a marca fica parada. Depois de 900 ms aparece `status`, discreto, sem repetir a leitura.
- `onFinished` é chamado uma vez, 300 ms depois do início da saída. Os temporizadores são limpos ao desmontar.
- Erro de inicialização é responsabilidade de quem hospeda: ao detectar erro, desmonte a abertura e mostre a tela de erro. A abertura não deve cobrir um erro.

## Integração no AutoOS (não feita)

Hoje `BootSplash` mostra o carimbo (`StampDemo`) na primeira abertura do dia e depois a impressora (`AutoOsBootAnimation`), e `App.tsx` segura o splash por `MIN_BOOT_SPLASH_MS = 1100`. Passos sugeridos, depois da aprovação visual:

1. Em `BootSplash.tsx`, trocar o bloco do `StampDemo` por `<BmiTagOpening product="AutoOS" onFinished={finishOpening} />`. O `finishOpening` e o fallback já existentes continuam valendo.
2. Decidir o destino da impressora. A abertura nova já tem assinatura e estado de espera, então manter as duas em sequência repete a marca. A recomendação é a abertura nova ser a única, com `ready` ligado ao fim real do boot.
3. Se a abertura nova for a única, `MIN_BOOT_SPLASH_MS` deixa de ser necessário: a duração mínima passa a ser a da própria abertura. Isso altera a regra "Boot splash mandatory" do `AGENTS.md`, que precisa ser atualizada no mesmo PR.
4. Retomada do aplicativo (janela já carregada volta ao foco): não tocar a abertura.
5. Remover `src/components/stamp/` e o áudio só depois de a troca estar em produção.

## Adaptação mobile (React Native)

- A demonstração mobile é uma página web em tela estreita. Ela valida composição e proporção, não o código nativo.
- O CSS não é reaproveitável no React Native. O que se reaproveita é a tabela de recortes e a tabela de coreografia acima.
- Com o asset em vetor: `react-native-svg` para a logo em grupos e a biblioteca de animação que o projeto adotar (por exemplo Reanimated) para `transform` e `opacity`. Confirmar nas versões instaladas se a animação de `transform` em grupos de SVG roda fora da thread de JS antes de assumir isso.
- Com o PNG: sete `Image` recortadas, ou sete fatias exportadas, dentro de uma `View` com as mesmas coordenadas.
- A splash nativa do sistema (estática, exibida antes de o JS carregar) deve ser só o fundo `#060a13`. A animação começa quando a primeira tela do app é montada, com o QR surgindo sobre o mesmo fundo, para não haver salto.
- Respeitar áreas seguras: o conjunto é centralizado dentro da área segura, não da tela física.
