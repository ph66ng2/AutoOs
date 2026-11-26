# Ícones do AutoOS

Ícones próprios dos itens do menu, desenhados à mão no grid 24 (área útil 20), com linha de 2 px
(o mesmo peso do Lucide) e um preenchimento suave de 28% como segundo tom. Os ícones genéricos
(fechar, setas, mais, busca, lixeira, engrenagem) continuam vindo do `lucide-react`.

- `icons.json`: o desenho de cada ícone (formas no grid 24).
- `icon-style.json`: grid, traço, tons, paleta e o porquê de cada decisão.
- Componentes gerados: `src/components/icones-autoos/` (um arquivo por ícone, `currentColor`).

Para mudar ou acrescentar um ícone, edite `icons.json` e gere de novo com a skill
[`generate-icons`](https://github.com/sergiobanhos/generate-icons) (MIT):

```bash
python3 <skill>/scripts/validate.py design/icones/icons.json
python3 <skill>/scripts/build.py design/icones/icons.json --out /tmp/icones --framework react
cp -r /tmp/icones/src/* src/components/icones-autoos/
```

Não edite os arquivos de `src/components/icones-autoos/` à mão: eles são gerados.
