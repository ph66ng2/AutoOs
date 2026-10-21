# Avatares geométricos — AutoOS

Nove propostas em SVG, inspiradas no preview aprovado. Cada arquivo tem `viewBox="0 0 128 128"` e usa `currentColor` para o fundo e os olhos; a silhueta é branca. Os desenhos são originais e não incluem marca, texto ou traços humanos.

| ID sugerido | Arquivo | Forma |
|---|---|---|
| `shape-orb` | `shape-orb.svg` | Círculo |
| `shape-square` | `shape-square.svg` | Quadrado arredondado |
| `shape-peak` | `shape-peak.svg` | Triângulo suave |
| `shape-pill` | `shape-pill.svg` | Cápsula |
| `shape-bean` | `shape-bean.svg` | Forma orgânica |
| `shape-hex` | `shape-hex.svg` | Hexágono suave |
| `shape-arch` | `shape-arch.svg` | Arco |
| `shape-cloud` | `shape-cloud.svg` | Nuvem compacta |
| `shape-block` | `shape-block.svg` | Bloco com pés |

## Para implementação

- Renderize o conteúdo SVG **inline** e defina `color` com `avatar_cor` (por exemplo, `style={{ color }}`). Como arquivo externo em `<img>`, o `currentColor` interno não recebe a cor do elemento pai.
- O `color="#475569"` na raiz é apenas o fallback de visualização. A cor definida por CSS no SVG inline o substitui.
- Os IDs sugeridos ainda não são aceitos pelo app. Adicione-os à lista `AVATAR_ICONS` em `src/lib/profile-appearance.ts` e à validação `AVATAR_ICONES` em `src-tauri/src/commands/auth.rs`. Atualize `ProfileAvatar.tsx` para renderizar as novas formas, preservando os ícones existentes para perfis já salvos.
- O SVG já inclui o quadrado de fundo. Ao adaptar `ProfileAvatar.tsx`, evite desenhar um segundo fundo por cima ou escalar o desenho como se fosse um ícone Lucide de 16–44 px dentro de uma caixa separada.
- Confira a leitura em tamanhos de 32, 40, 72 e 104 px e contraste com todas as cores de `AVATAR_COLORS`. Ajuste os olhos se algum tom perder definição.

Estes são arquivos de design para passagem ao Claude; nenhum código do app foi alterado.
