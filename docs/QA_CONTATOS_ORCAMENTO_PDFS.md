# QA de integração — contatos, orçamento e PDFs

Data: 11/09/2026

Branch: `integration/ao-cont-orc-pdf-qa`

Base: `origin/master` em `0a11686`

## Trabalhos integrados

- Agente 1: PR #18, merge `e48bf57` (`agent/ao-cont-core-001`).
- Agente 2: PR #19, merge `f83e567` (`agent/ao-cont-ui-001`).
- Agente 3: PR #20, merge `0a11686` (`agent/ao-pdf-002`).

## Contratos entregues

- Migration: `src-tauri/migrations/0017_contatos_pagamento_orcamento.sql`.
- Tipos públicos: `ClienteContato`, `FormaPagamentoCodigo` e `FormaPagamento`.
- Métodos públicos adicionados a `src/lib/db.ts`:
  - `listarClienteContatos(clienteId, empresaId)`;
  - `criarClienteContato(input)`;
  - `atualizarClienteContato(id, input)`;
  - `inativarClienteContato(id, empresaId)`;
  - `atualizarServicosVerificacao(input, profileId)`;
  - `aprovarOrcamento(input)`.
- Payload de `aprovarOrcamento`:

```ts
{
  empresa_id: number;
  equipamento_id: number;
  expected_updated_em: string;
  pagamento: {
    codigo: FormaPagamentoCodigo;
    detalhe?: string | null;
  };
}
```

- Payload de `atualizarServicosVerificacao`:

```ts
{
  equipamento_id: number;
  empresa_id?: number;
  servicos: ServicoNecessario[];
  pecas: PecaNecessaria[];
  custo_total: number;
  observacoes?: string;
  forma_pagamento_codigo?: FormaPagamentoCodigo;
  forma_pagamento_detalhe?: string;
  divergence?: boolean;
}
```

O bridge serializa serviços e peças e envia os campos opcionais como `observacoes`,
`formaPagamentoCodigo`, `formaPagamentoDetalhe` e `empresaId`. Não foram adicionadas
chamadas `invoke()` diretas em páginas para estes contratos.

## Banco e isolamento

- As 17 migrations foram executadas em PostgreSQL descartável criado vazio.
- O teste Rust usa somente dados com prefixo `TESTE-CONTATO`.
- Foram validados: isolamento por empresa/cliente, inativação, preservação dos snapshots,
  carregamento legado com responsável e pagamento nulos, permissão financeira, validação
  do pagamento, concorrência otimista e rollback da aprovação.
- Uma tentativa com token obsoleto preservou simultaneamente o status
  `AGUARDANDO_APROVACAO` e o pagamento nulo; a tentativa válida gravou `PIX`,
  `APROVADO` e `data_aprovacao` na mesma transação.
- O ajuste persistiu descrição, serviços, peças, custos e pagamento `OUTRO` com detalhe.
- A consulta final encontrou zero clientes, contatos e equipamentos sintéticos. O cluster
  PostgreSQL descartável foi removido após os testes.

## Supabase e PowerSync

- `supabase/schema.sql` contém a tabela e colunas equivalentes.
- `supabase/rls.sql` habilita RLS tenant-safe e concede ao papel `anon` apenas
  `SELECT`, `INSERT` e `UPDATE` para contatos; `DELETE` permanece sem concessão.
- O contrato SQL foi executado sob `SET LOCAL ROLE anon`: contato de outro tenant não
  foi visível, atualização do tenant corrente funcionou e inserção cross-tenant falhou.
- O PowerSync AppSchema usa IDs/datas como texto e booleano como inteiro, não declara
  uma coluna `id` adicional e não adiciona streams.

## Jornada e comunicações

- A jornada cliente → contato → equipamento → verificação → aprovação foi exercitada
  no teste Rust de integração.
- O cancelamento/erro de aprovação preserva o modal no teste de UI e o backend não
  produz persistência parcial nos testes de permissão e concorrência.
- Resolução de destinatário, fallback e persistência foram cobertos pelos testes unitários.
- SMTP e WhatsApp foram testados contra servidores falsos locais. Nenhum envio real foi feito.

## PDFs renderizados e inspecionados

- `output/pdf/qa-integracao/01-orcamento.pdf`: A4, 2 páginas.
- `output/pdf/qa-integracao/02-orcamento-ajustado.pdf`: A4, 2 páginas.
- `output/pdf/qa-integracao/03-ordem-servico.pdf`: A4, 1 página.
- `output/pdf/qa-integracao/04-relatorio-status.pdf`: A4, 1 página.

Os seis lados renderizados foram inspecionados. Foram confirmados responsável e canais,
descrição editada, patrimônio, total de R$ 199,00, pagamento `OUTRO` com detalhe,
assinatura técnica e rodapés. Defeitos de espaçamento encontrados entre cabeçalho/tabela,
número de série/condições comerciais e observações/assinatura foram corrigidos e cobertos
por teste de regressão.

## Comandos executados

- `npm run lint`: passou.
- `npm run test:run`: 39 arquivos e 273 testes passaram.
- `npm run build`: passou.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked`: passou.
- `npm run e2e:real` com `CI=1` e PostgreSQL descartável: passou; integrações crítica e
  de comunicação passaram, e Playwright passou em 1920×1080 e 1366×768 (2/2).
- Contrato `supabase/tests/contatos_pagamento_contract.sql`: passou.

## Limitações conhecidas

- Os warnings Rust de código não utilizado nos binários de integração já existiam e não
  impedem `cargo check`.
- O build mantém o aviso existente de chunk principal acima de 500 kB e base
  `caniuse-lite` desatualizada.
- O PowerSync foi limitado ao AppSchema, sem streams ou sincronização, conforme o escopo.
- A integração `master → feature` depende do merge humano deste PR de correção.
