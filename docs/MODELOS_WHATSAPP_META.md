# Modelos de WhatsApp para a Meta (orçamento com acesso ao portal)

Estes são os modelos novos que a Cloud API vai usar quando o orçamento for enviado com link do portal, usuário e senha. O texto da Evolution (mensagem livre) é montado no código e não precisa de aprovação.

Os modelos antigos (`orcamento_portal`, `orcamento_informativo`, `equipamento_pronto`) **continuam como estão** e seguem em uso. Os novos têm sufixo `_v2` e **só são usados quando há senha nova a transmitir** (a senha acabou de ser criada no envio). Sem senha nova (o contato já tem senha), o código usa os modelos já aprovados: `orcamento_portal` (pode aceitar ou recusar) e `orcamento_informativo` (só acompanha), ambos com 4 parâmetros: contato, equipamento, total e prazo.

## Como criar

No Gerenciador do WhatsApp, em **Modelos de mensagem > Criar modelo**:

- **Categoria:** Utilidade
- **Idioma:** Português (BR), `pt_BR`
- **Nome:** exatamente como abaixo (minúsculas e `_`). O código envia por este nome.
- **Cabeçalho, rodapé e botões:** nenhum.
- **Corpo:** cole o texto abaixo e, para cada variável, informe o exemplo da tabela.

As variáveis precisam aparecer no texto na ordem `{{1}}`, `{{2}}`, … e a Meta recusa valor com quebra de linha. Por isso os parâmetros são sempre uma linha só.

## 1. `orcamento_portal_v2` (contato que pode aceitar ou recusar)

Corpo:

```
Olá, {{1}}! O orçamento da empresa {{2}} para o equipamento {{3}} está pronto. Total: {{4}}. Prazo para aprovação: {{5}}. Para aceitar ou recusar, acesse o Portal das Impressoras em https://status.bmitag.com.br com o CPF/CNPJ {{6}} e a senha {{7}}. Guarde a senha e não a compartilhe.
```

## 2. `orcamento_portal_acompanhar_v2` (contato que só acompanha)

Corpo:

```
Olá, {{1}}! O orçamento da empresa {{2}} para o equipamento {{3}} está pronto. Total: {{4}}. Prazo para aprovação: {{5}}. Você pode acompanhar no Portal das Impressoras em https://status.bmitag.com.br com o CPF/CNPJ {{6}} e a senha {{7}}. Para aprovar, responda APROVADO a esta mensagem.
```

## Variáveis (mesma ordem nos dois modelos)

| # | O que é | Exemplo para a Meta |
|---|---------|---------------------|
| 1 | Nome do contato | Maria Souza |
| 2 | Empresa (cliente) | Gráfica Exemplo Ltda |
| 3 | Equipamento | Zebra GC420t |
| 4 | Total do orçamento | R$ 1.250,00 |
| 5 | Prazo para aprovação | 29/10/2026 |
| 6 | CPF ou CNPJ do cadastro | 12.345.678/0001-90 |
| 7 | Senha do portal | K7mQ-9xRt-4wPz |

## Contrato com o código

- O nome do modelo, a ordem e a quantidade de parâmetros são o contrato com `mensagem_informativo` (`src-tauri/src/commands/envio_whatsapp.rs`). Mudar um deles exige mudar o outro e o teste de parâmetros.
- O 7º parâmetro é **sempre a senha nova**, criada no envio (ex.: "K7mQ-9xRt-4wPz"). Os `_v2` só são usados nesse caso. Quando o contato **já tinha senha**, o código não usa `_v2`: envia `orcamento_portal` (nível Decidir) ou `orcamento_informativo` (nível Acompanhar), com 4 parâmetros, e a senha não é reexibida nem gravada.
- O modelo sem portal (`orcamento_informativo`) tem 4 parâmetros: contato, equipamento, total e prazo.

## Atenção: risco de recusa

A Meta pode recusar um modelo que carregue **senha**. Se isso acontecer:

1. Remova do texto `e a senha {{7}}` e a frase `Guarde a senha e não a compartilhe.`, e use só as variáveis `{{1}}` a `{{6}}`.
2. A senha segue por e-mail e na mensagem livre da Evolution. No código, basta tirar o sétimo parâmetro da lista do modelo.

Enquanto os modelos não forem aprovados, quem usa a Evolution não é afetado. Na Cloud API, o envio automático falha e o técnico usa o envio manual.

## Onde isto entra no código

O nome do modelo e a ordem dos parâmetros ficam em `mensagem_informativo` (`src-tauri/src/commands/envio_whatsapp.rs`). A ordem da tabela acima é o contrato: mudar uma exige mudar a outra.
