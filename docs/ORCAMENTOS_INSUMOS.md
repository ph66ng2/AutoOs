# Orçamento de venda avulsa de insumos (OI-<n>)

Orçamento de etiquetas, ribbons, peças e outros itens do estoque para um cliente, **sem equipamento em
manutenção**. Fica na aba **Orçamentos** de Insumos/Peças (`/insumos`). Não tem item próprio no menu.

Migration `0040_orcamentos_insumos.sql`. Código: `src-tauri/src/commands/orcamentos_insumos.rs`,
`src/pages/insumos/` (aba, diálogo, editor de itens), `src/lib/orcamento-insumos*.ts`,
`PdfService.construirOrcamentoInsumos`.

## Fluxo e status

```
RASCUNHO ──enviar──> ENVIADO ──aprovar──> APROVADO ──entregar──> ENTREGUE
   │  └───────aprovar────────────^            │
   ├── reprovar ──> REPROVADO                  └── cancelar (devolve o estoque) ──> CANCELADO
   └── cancelar ──> CANCELADO   (também a partir de ENVIADO)
```

- RASCUNHO e ENVIADO podem ser editados. Editar um ENVIADO o devolve a RASCUNHO (o cliente recebeu outra
  versão; é preciso enviar de novo).
- REPROVADO, CANCELADO e ENTREGUE são finais.
- Enviar = PDF salvo (a partir da prévia), e-mail ou WhatsApp. O PDF só marca ENVIADO quando é salvo,
  não ao abrir a prévia.
- O número é sequencial **por empresa** (`orcamentos_insumos_contadores`) e aparece como `OI-<n>`.
  Cancelar ou reprovar não libera o número.
- Todo valor é calculado no backend, em centavos (`calcular_totais`). O total da tela é só prévia.
  O desconto não pode passar do subtotal. Nome e categoria do item são copiados do produto na hora de
  salvar, então o documento não muda se o cadastro mudar depois.

## Estoque

- Criar, editar, enviar e reprovar **não mexem** no estoque.
- **Aprovar** confere o saldo de cada item (com o produto travado) e, se faltar algum, recusa com a
  lista do que falta; não existe aprovação parcial. Estando tudo certo, numa única transação: uma
  `SAIDA` por item em `movimentacoes_estoque` (origem `VENDA_INSUMOS`, referência `OI-<n>`) pelo mesmo
  código de `registrar_movimentacao_estoque` (`aplicar_movimentacao_em_tx`), forma de pagamento
  (padrão "A combinar") e status APROVADO.
- **Cancelar um APROVADO** (ainda não entregue) devolve cada item com uma `ENTRADA` de mesma origem e
  referência. Exige `confirmar_devolucao_estoque: true` no comando; a tela pede a confirmação.
- ENTREGUE não devolve nada e não pode ser cancelado.
- Só produtos da empresa, ativos e que não sejam da categoria IMPRESSORA entram no orçamento.

## Permissões, concorrência e auditoria

- Consultar a lista: qualquer perfil com sessão ativa.
- Criar, editar, enviar, aprovar, reprovar, cancelar e entregar exigem `FINANCIAL_ACTIONS` (os valores
  são do orçamento). O PIN segue a regra do perfil (`ensureSensitiveAccess`).
- Toda alteração manda o `atualizado_em` que a tela viu; se mudou, o backend responde
  "Conflito de concorrência" e nada é gravado. Duas aprovações simultâneas: só uma vale.
- Todas as consultas filtram por `empresa_id` do perfil ativo. As tabelas têm RLS ligado, sem policy e
  sem acesso para `anon`/`authenticated`.
- Auditoria (`security_audit_log`): `INSUMOS_QUOTE_CREATED`, `_UPDATED`, `_SENT`, `_APPROVED`,
  `_REJECTED`, `_CANCELLED`, `_DELIVERED`.

## Envios

PDF no padrão BMI TAG do orçamento técnico (cliente com CPF/CNPJ, itens, desconto, total, validade e
condições). E-mail com o PDF em anexo (cópia para a gerência, como nos demais e-mails) e WhatsApp com o
texto do orçamento, ambos pelas configurações de SMTP/WhatsApp já existentes. O histórico de
comunicações (`comunicacoes`) é por equipamento e não é usado aqui; o registro do envio é o status
ENVIADO, `enviado_em` e a auditoria. Os serviços atuais de e-mail e WhatsApp não consultam
`receber_email`/`receber_whatsapp`; a tela só avisa quando o cliente pediu para não receber.

## Para a etapa do portal (não implementado)

O modelo já tem o necessário: status APROVADO/REPROVADO, `decidido_em`, forma de pagamento e contato
(`contato_id`). Falta: publicar o orçamento (versão congelada, como `orcamento_versoes`), funções
`portal_*` para listar e responder, o vínculo `orcamento_respostas` equivalente, a aprovação pelo
portal reaproveitando a mesma baixa de estoque transacional (com a recusa por falta de saldo virando
"aguardando equipe") e a tela de resposta. Nenhuma função do portal foi alterada na 0040.

## Testes

- Rust: unitários em `orcamentos_insumos.rs`; integração `test_orcamentos_insumos` com
  `AUTOOS_OI_TEST_DATABASE_URL` apontando para um banco local `autoos_oi_test*` já migrado.
- Vitest: `orcamento-insumos`, `pdf-service-orcamento-insumos`, `orcamento-insumos-service`,
  `OrcamentoInsumosDialog`, `OrcamentosInsumosTab`, `Insumos`.
