# Portal das Impressoras do Cliente

Evolução de `status.bmitag.com.br`: o cliente entra com CPF/CNPJ + código temporário, vê todos os atendimentos do cadastro e responde ao orçamento publicado. Funciona com o AutoOS desktop fechado: login, envio do código, resposta e efetivação rodam no Supabase.

> **Estado: implementado, nada ativado.** As migrations `0034_portal_cliente.sql` e `0035_portal_senha.sql` (senha criada pelo operador); a 0034 nasce com `portal_cliente_config.portal_enabled = FALSE`. A Edge Function `portal-cliente` não foi publicada e nenhum dado de produção foi alterado.

Depende do aceite online (`docs/ACEITE_ORCAMENTO_ONLINE.md`, migrations 0030–0031) e reaproveita a configuração de WhatsApp central (`docs/FILA_ENVIOS_WHATSAPP.md`, 0033).

## Jornada

0. **Senha criada pelo operador (padrão, migration 0035).** Em Clientes → Contatos o operador libera o portal para o contato e clica em **Criar senha** (o AutoOS sugere uma senha forte; ele pode digitar outra com 8+ caracteres, letras e números). Os dados de acesso aparecem uma única vez para entregar ao contato; o banco guarda só o hash bcrypt (`pgcrypto`). O cliente entra com **CPF/CNPJ + senha**. A senha é **por contato**, não por CNPJ: é ela que diz quem entrou, se pode decidir e a quem a resposta é atribuída (senhas repetidas no mesmo CPF/CNPJ são recusadas). Trocar a senha desconecta o contato; retirar o acesso apaga a senha. Antes de aceitar/recusar, a sessão por senha reconfirma a senha (em vez de um código). Limite: 8 tentativas por CPF/CNPJ a cada 15 minutos.
1. **Entrar com código (alternativa).** CPF/CNPJ + WhatsApp ou email do contato. Se o par casar com exatamente um contato autorizado, o servidor envia um código de 6 dígitos (10 min, 5 tentativas, uso único). A resposta da tela é a mesma quando nada casa: o portal não revela quem é cliente. O CPF/CNPJ sozinho nunca dá acesso.
2. **Lista.** Todos os atendimentos com `empresa_id` + `cliente_id` do cadastro, separados em **Atuais** e **Histórico** (entregues e encerrados). Ordenação por atividade recente (padrão) ou data de entrada. O cartão mostra equipamento, série, patrimônio, entrada, etapa colorida e “Aguarda sua resposta”.
3. **Detalhe.** A tela pública de status (`StatusView`: logo, etapa com pulso, linha do tempo, data) + orçamento publicado (versão, itens, total, validade) + pedidos enviados + cartão de contato.
4. **Responder.** Aceitar ou recusar o **orçamento inteiro** (sem aprovação parcial) ou **Quero negociar**. Aceitar/recusar exige confirmação com impressora e valor e uma verificação feita há menos de 10 minutos (senão o portal envia um novo código). O comprovante tem protocolo `R-<id>`.
5. **WhatsApp opcional.** Depois de registrar, o portal oferece a mensagem pronta (`wa.me`) e “Copiar mensagem”. O registro e o alerta já existem; fechar o WhatsApp não perde nada.
6. **Mudei de ideia.** Por 15 minutos (`orcamento_aceite_config.janela_correcao_minutos`, mínimo 15) quem respondeu pode trocar ou cancelar. A equipe vê “resposta recebida, em prazo de correção” e o desktop recusa aplicar nesse período.
7. **Efetivação.** Terminado o prazo, `portal_efetivar_respostas_vencidas` aplica APROVADO/REPROVADO numa transação com as regras de `aprovar_orcamento`. Se não conseguir, a resposta fica pendente, a equipe recebe alerta e o cliente vê “precisa ser confirmada pela equipe” — nunca uma aprovação falsa. Depois de efetivada, o botão vira **Solicitar correção** (pedido ao operador; não desfaz peças nem trabalho).
8. **Quero negociar.** Registra um pedido (`orcamento_solicitacoes.tipo = NEGOCIAR`) e um alerta antes de oferecer o WhatsApp. Não é aceite, recusa nem prorrogação. Para mudar valores a equipe altera o orçamento e clica em **Publicar no Portal do Cliente**: nasce uma nova versão e a anterior deixa de aceitar respostas.

## Estados

| Cliente vê | Operador vê | Significado |
|---|---|---|
| Proposta aberta, botões | — | Versão aberta, sem resposta |
| Resposta registrada, “até HH:MM você pode mudar de ideia” | Alerta + “resposta recebida, em prazo de correção”; aplicar bloqueado | Dentro do prazo |
| “Está sendo efetivada” | “aguardando efetivação automática” | Prazo terminou, processador ainda não rodou |
| “Orçamento aprovado/recusado”, efetivada em… | Alerta “efetivado”, status APROVADO/REPROVADO | Efetivada pelo sistema |
| “Precisa ser confirmada pela equipe” | Alerta vermelho + motivo + “Revisar e aplicar decisão” | Efetivação falhou (etapa mudou, orçamento alterado, atendimento transferido, peças sem serviço, produto inativo) |
| “A equipe está revisando esta proposta” | — | Versão encerrada por edição, sem nova publicação |
| “O prazo desta proposta terminou” | — | `valido_ate` vencido |
| “Não conseguimos enviar o código” | Alerta “código não entregue” | Provedor recusou ou não configurado |
| “O portal está temporariamente indisponível” | — | `portal_enabled = FALSE` ou falha do servidor |
| Atendimento some da lista | — | `cliente_id` mudou (transferido) |

## Conflitos tratados

- **Cliques repetidos / duas abas / dois contatos.** `portal_registrar_resposta` trava equipamento e versão (mesma ordem do desktop) e confere a resposta vigente que o cliente viu. Clique repetido devolve o mesmo comprovante; tela velha recebe `RESPOSTA_DESATUALIZADA`; outro contato não muda a resposta de quem respondeu (`RESPOSTA_DE_OUTRO_CONTATO`). Teste real com 6 chamadas simultâneas: 1 resposta.
- **Proposta alterada com a página aberta.** A resposta leva `versaoId`; versão encerrada → `PROPOSTA_ALTERADA`; a página fecha a confirmação e mostra a versão nova. A atualização automática (60 s) também derruba a confirmação antiga.
- **Isolamento.** Lista e detalhe filtram por `empresa_id` e `cliente_id` da sessão, nunca por nome ou série (o contrato SQL cobre série repetida em outra empresa e `cliente_nome` sem vínculo).
- **Permissão por contato.** `cliente_contatos.portal_acesso`: `NENHUM`, `ACOMPANHAR` (vê status e orçamento) ou `DECIDIR` (também responde). Liberar `DECIDIR` exige a permissão financeira. Trocar telefone/email, inativar ou mudar de cliente zera o acesso e encerra as sessões.
- **Efetivação concorrente.** Quatro processadores simultâneos: uma efetivação, uma baixa de estoque, um alerta.

## Regras de efetivação (`portal_efetivar_resposta`)

Espelha `aprovar_orcamento` + `aplicar_decisoes` (`src-tauri/src/commands/equipamentos.rs`, `orcamento_estoque.rs`) para o orçamento inteiro:

- confere etapa `AGUARDANDO_APROVACAO`, versão aberta e igual à verificação, resposta ainda vigente, vínculo do contato com o cliente do atendimento e verificação da mesma empresa;
- valida serviços (ids únicos, valores e peças) e recusa peças antigas sem serviço vinculado;
- registra a decisão de cada serviço, baixa estoque limitado ao saldo (o resto vira pendência, estoque nunca negativo), grava `movimentacoes_estoque` com a mesma referência do desktop;
- preserva o orçamento original, grava `forma_pagamento_codigo = 'A_COMBINAR'` se estava vazia, muda status/datas/`atualizado_em` (a tela aberta do operador passa a dar conflito de concorrência, como deve);
- auditoria `BUDGET_APPROVED`/`BUDGET_REJECTED` atribuída a “Portal do cliente: <contato>” com `origem=PORTAL_CLIENTE`.

**Diferença deliberada:** o valor efetivado é o da versão que o cliente aceitou (`orcamento_versoes.valor_total`). O desktop, ao aprovar todos os serviços, usa `verificacoes.custo_total`; se os dois divergirem, o portal mantém o preço que o cliente viu.

**Respostas pelo link `#/o/<token>` continuam com conferência manual.** O link não identifica quem clicou; só respostas com código (origem `PORTAL_CLIENTE`) são efetivadas automaticamente.

## Banco (`0034_portal_cliente.sql`)

| Objeto | Função |
|---|---|
| `cliente_contatos.portal_acesso` + trigger | Acesso por contato; mudança de canal zera o acesso |
| `portal_cliente_config` | `portal_enabled`, validade do código, tentativas, reverificação, duração da sessão |
| `portal_contato_empresa` | Cartão “Fale com a equipe” (Configurações → Integrações) |
| `portal_codigos` | Desafios com HMAC do código (segredo fora do banco), entrega e tentativas |
| `portal_sessoes` | Hash do token de sessão, `verificada_em`, expiração |
| `orcamento_respostas` (+colunas) | `PORTAL_CLIENTE`, contato, sessão, efetivação automática e falha |
| `orcamento_solicitacoes` (+colunas) | `NEGOCIAR` e contato |
| `portal_alertas` | Alertas persistentes; só `lido_em`/`lido_por` mudam |
| `equipamentos.ultima_atividade_cliente_em` | Ordenação por atividade sem mexer no token de concorrência |
| `portal_*` (SECURITY DEFINER) | Única porta da Edge Function (`service_role` só tem EXECUTE nelas) |

## Ativação (ambiente de teste primeiro)

1. Aplicar 0030–0034 pelo processo de migrations (`docs/PRODUCTION_MIGRATIONS.md`) e conferir os advisors de segurança do Supabase.
2. Publicar a Edge Function `portal-cliente` (`verify_jwt = false`, já em `supabase/config.toml`) com os segredos:

| Segredo | Uso |
|---|---|
| `PORTAL_CLIENTE_SECRET` | 32+ caracteres; HMAC dos códigos e do limite por documento. Trocar invalida códigos em aberto |
| `PUBLIC_STATUS_RATE_LIMIT_SECRET`, `PUBLIC_STATUS_ORIGIN` | Os mesmos do `public-status` |
| `WHATSAPP_TOKENS` | JSON `{"<empresa_id>": "<token>"}` (o mesmo do processador central) |
| `WHATSAPP_GRAPH_VERSION`, `PORTAL_WHATSAPP_TEMPLATE` | Opcionais (Cloud API; modelo de autenticação, padrão `codigo_verificacao`) |
| `RESEND_API_KEY`, `PORTAL_EMAIL_FROM` | Envio do código por email (domínio verificado no provedor) |

3. Cadastrar o provedor de WhatsApp da empresa em `envio_whatsapp_config_empresa` (Evolution com URL `https://` acessível pela internet, ou Cloud API). Para o código basta a linha existir; o `modo` pode continuar `LOCAL`.
4. Agendar a efetivação (o portal também efetiva ao listar/abrir, mas sem o Cron uma resposta só vira status quando alguém abre o portal):

```sql
select cron.schedule('portal-efetivar-respostas', '* * * * *',
  $$ select public.portal_efetivar_respostas_vencidas(50) $$);
```

5. Publicar a página (`npm run build:public-status`, enviar `dist-public-status/` com o `.htaccess`). A URL da função pode ser trocada com `VITE_PORTAL_CLIENTE_API_URL`.
6. No AutoOS: Configurações → Integrações → cartão do portal; em Clientes → Contatos, liberar `ACOMPANHAR`/`DECIDIR`; em Equipamentos → Detalhes, **Publicar no Portal do Cliente**.
7. Ligar para um piloto: `UPDATE portal_cliente_config SET portal_enabled = TRUE;` (respostas também exigem `orcamento_aceite_config.online_enabled = TRUE`).

Pausar: `portal_enabled = FALSE` derruba login e sessões na hora; nada é apagado. Pausar só as respostas: `online_enabled = FALSE`.

## Testes

- Contrato SQL: `psql --set ON_ERROR_STOP=1 --file=supabase/tests/portal_cliente_contract.sql` (também no job `qa-real` do CI).
- Edge Function: `src/public-status/portal-cliente-function.test.ts`. Portal: `src/public-status/PortalApp.test.tsx`. Desktop: `PortalAlertas.test.tsx`, `DecisaoOrcamentoCard.test.tsx`.
- `test_budget_stock` (integração real do desktop) continua passando com as mudanças.

## Limitações conhecidas

- A Cloud API e a Evolution não foram testadas de verdade a partir da função; o modelo de autenticação da Meta precisa ser aprovado com um parâmetro (código) e o botão de copiar.
- O tempo de resposta do pedido de código é maior quando há envio real; um observador atento poderia inferir que o par CPF/CNPJ + contato existe. O conteúdo da resposta é igual.
- A sessão fica no `sessionStorage` da aba: abrir outra aba exige novo login.
- Com senha criada pelo operador, a equipe conhece a senha do cliente: a resposta prova que alguém com a senha da Ana respondeu, não que foi a Ana. Para reduzir isso, o próximo passo natural é obrigar o contato a trocar a senha no primeiro acesso (não implementado).
- Não há "esqueci minha senha" automático: o contato pede uma nova à equipe (ou entra por código, se WhatsApp/email estiverem configurados).
- Documento repetido em duas empresas com o mesmo contato não entra (não há como escolher a empresa com segurança).
