# Estoque por serviço — AutoOS e AutoBO

O AutoOS oferece o controle operacional temporário do estoque para a equipe financeira. O AutoBO continua sendo o destino do financeiro completo. Os dois aplicativos usam **o mesmo Supabase/Postgres**, com `produtos` e `movimentacoes_estoque` compartilhados. Não existe cópia, sincronização assíncrona ou segunda baixa no AutoBO.

## Operação

- Categorias: Impressora, Peça, Etiqueta, Ribbon e Outros. Toner e Cartucho ficam em Ribbon; Fusor, Cilindro e rolos de componentes ficam em Peça. As etiquetas ETQ-* do inventário da migration 0020 passam de Rolo para Etiqueta.
- O catálogo de serviços pode sugerir peças. Na verificação técnica e em **Alterar Orçamento**, cada serviço permite vincular produtos, quantidades e preços. Editar o catálogo não modifica orçamentos existentes.
- Ao aprovar, o modal pergunta **“Todos os serviços de troca foram aprovados?”**. A seleção inclui serviços com ou sem peças. Somente os selecionados são aprovados; os demais ficam reprovados.
- O backend confirma a empresa, versão do orçamento e saldo em uma transação. Baixa apenas peças de serviços aprovados. Saldo insuficiente gera demanda pendente; estoque nunca fica negativo.
- Quando todos são aprovados, conserva-se o valor total negociado. Em aprovação parcial, o total é a soma dos serviços e peças selecionados, exibida antes de confirmar.
- O orçamento original e as decisões ficam registrados. Reprovação total conserva os itens e valor, sem consumo.
- Entradas pelo AutoBO ou AutoOS não atendem pendências automaticamente. Na OS, use **Peças da OS → Confirmar baixa pendente**. Repetir a confirmação não duplica consumo.
- Em OS já aprovada ou em manutenção, **Alterar Orçamento** exige confirmação de que o cliente aprovou as mudanças. Apenas acréscimos consomem novas unidades. Reduzir/remover cancela demanda ainda não consumida, sem devolver automaticamente peças já baixadas. Devoluções físicas usam a movimentação explícita de entrada.
- Peças antigas em linhas avulsas devem ser vinculadas aos respectivos serviços e suas linhas antigas removidas antes da aprovação. Não se tenta adivinhar qual peça pertence a qual serviço.

## Publicação coordenada no Supabase

1. Preparar backup e revisar a migration **0021_orcamento_estoque.sql**, de propriedade do AutoOS. Aplicá-la pelo processo de migrations SQL do projeto ao banco compartilhado. O startup do aplicativo valida o schema e não aplica migrations de produção.
2. Publicar as versões compatíveis de AutoOS e AutoBO juntas. A constraint das categorias impede clientes antigos de reintroduzir Toner/Cartucho ou categorias removidas.
3. Cadastros de produtos legados sem empresa só são vinculados automaticamente quando há exatamente uma empresa no banco. Havendo várias, revisar e vincular esses registros à empresa correta antes de usar a aprovação; nenhum tenant é escolhido por adivinhação.
4. Novas tabelas de decisão e consumo têm RLS, índices e acesso REST revogado para `anon`/`authenticated`; o acesso segue o backend Rust/Postgres existente, com permissões locais e filtro de empresa. Não colocar credenciais privilegiadas do Supabase no frontend.
5. Não replicar a migration no runner `autobo_migrations`. AutoBO apenas opera as tabelas compartilhadas existentes.

Migration 0021 aplicada em 27/09/2026 ao projeto Supabase `autoos`, a pedido do responsável. Categorias e vínculo de empresa verificados; saldos preservados. O instalador de teste Windows é gerado pelo workflow Windows Test Build.

## Verificação reproduzível

Use exclusivamente um banco descartável cujo nome comece com `autoos_stock_test`. Aplique nele as migrations de `src-tauri/migrations` em ordem. Configure `AUTOOS_STOCK_TEST_DATABASE_URL` para esse banco e execute:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --bin autoos stock_ -- --ignored
cargo run --manifest-path src-tauri/Cargo.toml --bin test_budget_stock
npm run lint
npm run test:run
```

O primeiro comando cobre o ciclo de estoque e duas aprovações concorrentes disputando uma unidade. O segundo usa os comandos reais do aplicativo para catálogo, aprovação parcial, pendências, ajustes, reprovação e controle de versão. O keyring desse executável é apenas em memória. Os testes deixam fixtures no banco descartável.
