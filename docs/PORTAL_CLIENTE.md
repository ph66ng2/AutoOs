# Portal das Impressoras do Cliente

Evolução de `status.bmitag.com.br`: o cliente entra com CPF/CNPJ + a senha que a equipe criou para o contato, vê todos os atendimentos do cadastro e responde ao orçamento publicado. Funciona com o AutoOS desktop fechado: login, resposta e efetivação rodam no Supabase.

> **Estado: implementado, nada ativado.** Migrations `0035_portal_cliente.sql`, `0036_portal_senha.sql` (senha criada pelo operador) `0038_portal_por_empresa_so_senha.sql` (chaves por empresa, login por código removido) e `0039_portal_dados_ampliados.sql` (cliente, valores, etapas, fotos, histórico, ordem de compra e contato de retorno). Toda empresa nasce com o portal desligado. A Edge Function `portal-cliente` não foi publicada e nenhum dado de produção foi alterado.

Usa as versões e respostas de orçamento das migrations 0031–0032 (`docs/ACEITE_ORCAMENTO_ONLINE.md`) e a configuração de WhatsApp central (`docs/FILA_ENVIOS_WHATSAPP.md`, 0034). É o **único** caminho de resposta online: o link individual `#/o/<token>` foi removido na 0037.

## Jornada

0. **Senha criada pelo operador (padrão, migration 0036).** Nos detalhes do equipamento (**Dar acesso a um contato**) ou em Clientes → Contatos e Portal, o operador libera o portal para o contato e cria a senha (o AutoOS sugere uma senha forte; ele pode digitar outra com 8+ caracteres, letras e números). Os dados de acesso aparecem uma única vez para entregar ao contato; o banco guarda só o hash bcrypt (`pgcrypto`). O cliente entra com **CPF/CNPJ + senha**. A senha é **por contato**, não por CNPJ: é ela que diz quem entrou, se pode decidir e a quem a resposta é atribuída (senhas repetidas no mesmo CPF/CNPJ são recusadas). A senha vale por tempo indeterminado: para trocar ou se esquecer, o contato fala com a equipe, que cria outra. Trocar a senha desconecta o contato; retirar o acesso apaga a senha. Antes de aceitar/recusar, se a última conferência tiver mais de 10 minutos, o portal pede a senha de novo. Limite: 8 tentativas por CPF/CNPJ a cada 15 minutos.
1. **Sem login por código.** A entrada por código enviado por WhatsApp/email existiu na 0035 e foi removida na 0038: só há senha. O CPF/CNPJ sozinho nunca dá acesso, e senha errada e CPF/CNPJ inexistente têm a mesma resposta.
2. **Lista.** Todos os atendimentos com `empresa_id` + `cliente_id` do cadastro, separados em **Atuais** e **Histórico** (entregues e encerrados). Ordenação por atividade recente (padrão) ou data de entrada. O cartão mostra equipamento, série, patrimônio, entrada, etapa colorida e “Aguarda sua resposta”.
3. **Detalhe.** A tela pública de status (`StatusView`: logo, etapa com pulso, linha do tempo, data) + orçamento publicado (versão, itens, total, validade) + pedidos enviados + cartão de contato.
4. **Responder.** Aceitar ou recusar o **orçamento inteiro** (sem aprovação parcial) ou **Quero negociar**. Aceitar/recusar exige confirmação com impressora e valor e uma verificação feita há menos de 10 minutos (senão o portal pede a senha de novo). O comprovante tem protocolo `R-<id>`.
5. **WhatsApp opcional.** Depois de registrar, o portal oferece a mensagem pronta (`wa.me`) e “Copiar mensagem”. O registro e o alerta já existem; fechar o WhatsApp não perde nada.
6. **Mudei de ideia.** Por 15 minutos (`orcamento_aceite_config.janela_correcao_minutos`, mínimo 15) quem respondeu pode trocar ou cancelar. A equipe vê “resposta recebida, em prazo de correção” e o desktop recusa aplicar nesse período.
7. **Efetivação.** Terminado o prazo, `portal_efetivar_respostas_vencidas` aplica APROVADO/REPROVADO numa transação com as regras de `aprovar_orcamento`. Se não conseguir, a resposta fica pendente, a equipe recebe alerta e o cliente vê “precisa ser confirmada pela equipe” — nunca uma aprovação falsa. Depois de efetivada, o botão vira **Solicitar correção** (pedido ao operador; não desfaz peças nem trabalho).
8. **Quero negociar.** Registra um pedido (`orcamento_solicitacoes.tipo = NEGOCIAR`) e um alerta antes de oferecer o WhatsApp. Não é aceite, recusa nem prorrogação. Para mudar valores a equipe altera o orçamento e clica em **Publicar no Portal do Cliente**: nasce uma nova versão e a anterior deixa de aceitar respostas.

## Fluxo de trabalho da equipe

**Uma vez (ativação):** aplicar as migrations, publicar `portal-cliente`, agendar a efetivação e ligar `portal_enabled` + `online_enabled` (ver Ativação). Em Configurações → Integrações, preencher o cartão “Fale com a equipe”.

**Uma vez por contato do cliente (direto do equipamento):** o quadro do orçamento mostra “Quem responde no portal”. Sem ninguém, **Dar acesso a um contato** abre uma janela: escolher o contato (o responsável vem marcado), “pode responder orçamentos”, **Liberar acesso e criar senha**. Falta o contato? **Cadastrar ou editar contatos** abre os contatos na mesma janela e volta com o novo já marcado. A senha sai com **Enviar por WhatsApp** (link `wa.me` aberto no navegador; não passa pelo servidor nem fica no histórico) ou **Copiar**. O mesmo continua em Clientes → Contatos e Portal.

**WhatsApp do orçamento:** se o destinatário (responsável ou cliente) é um contato que responde pelo portal, a mensagem automática diz para aceitar/recusar em status.bmitag.com.br; para os outros continua “responda APROVADO”. Na Cloud API isso usa o modelo `orcamento_portal`, que precisa ser aprovado pela Meta.

**Em cada atendimento:**

1. Recepção e verificação seguem como hoje. O cliente acompanha as etapas no portal.
2. **Finalizar Verificação** → `AGUARDANDO_APROVACAO` e o WhatsApp informativo automático. O envio congela a versão do orçamento, e versão aberta = orçamento visível no portal. Se o WhatsApp não saiu ou o orçamento mudou, use **Publicar no Portal do Cliente** nos detalhes do equipamento.
3. O cliente entra, confere e **aceita**, **recusa** ou **quer negociar**.
4. No AutoOS: aviso azul “Aceite recebido — confirma às HH:MM”, o equipamento sobe na lista e o quadro do orçamento fica âmbar. **Não comece o serviço antes do horário**: o cliente ainda pode desfazer.
5. Passados 15 minutos, o servidor efetiva sozinho (status, pagamento “a combinar” se vazio, baixa de estoque) e chega o aviso verde “Orçamento aprovado pelo cliente”. Daí em diante o fluxo é o de sempre (manutenção → pronto → entrega), e o cliente vê as etapas no portal.

**Exceções:**

| Situação | Aviso | O que fazer |
|---|---|---|
| Cliente quer negociar | Violeta “Cliente quer negociar” + mensagem | Combinar com o cliente, alterar o orçamento e **Publicar** de novo (versão nova; a anterior para de aceitar resposta) |
| Efetivação falhou (etapa ou orçamento mudou, peça sem serviço…) | Vermelho “Aceite não efetivado” + motivo | Abrir o atendimento → **Revisar e aplicar decisão** |
| Cliente pediu correção depois de efetivado | Âmbar “Cliente pediu correção” | Conversar e, se for o caso, **Corrigir decisão do orçamento** (desfaz pagamento, serviços e baixas com escolha sobre o estoque) |
| Cliente respondeu por telefone/WhatsApp | — | **Aprovar/Reprovar** direto no equipamento, como antes |

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
| “O portal está temporariamente indisponível” | — | Portal desligado para a empresa (`portal_config_empresa`) ou falha do servidor |
| Atendimento some da lista | — | `cliente_id` mudou (transferido) |

## Conflitos tratados

- **Cliques repetidos / duas abas / dois contatos.** `portal_registrar_resposta` trava equipamento e versão (mesma ordem do desktop) e confere a resposta vigente que o cliente viu. Clique repetido devolve o mesmo comprovante; tela velha recebe `RESPOSTA_DESATUALIZADA`; outro contato não muda a resposta de quem respondeu (`RESPOSTA_DE_OUTRO_CONTATO`). Teste real com 6 chamadas simultâneas: 1 resposta.
- **Proposta alterada com a página aberta.** A resposta leva `versaoId`; versão encerrada → `PROPOSTA_ALTERADA`; a página fecha a confirmação e mostra a versão nova. A atualização automática (60 s) também derruba a confirmação antiga.
- **Isolamento.** Lista e detalhe filtram por `empresa_id` e `cliente_id` da sessão, nunca por nome ou série (o contrato SQL cobre série repetida em outra empresa e `cliente_nome` sem vínculo).
- **Permissão por contato.** `cliente_contatos.portal_acesso`: `NENHUM`, `ACOMPANHAR` (vê status e orçamento) ou `DECIDIR` (também responde). Liberar `DECIDIR` exige a permissão financeira. Inativar ou mudar de cliente zera o acesso, apaga a senha e encerra as sessões; corrigir telefone/email não mexe no acesso (0038). Passar um contato a `DECIDIR` apaga a senha anterior: a senha de quem decide é criada por quem tem a permissão financeira.
- **Efetivação concorrente.** Quatro processadores simultâneos: uma efetivação, uma baixa de estoque, um alerta.

## Regras de efetivação (`portal_efetivar_resposta`)

Espelha `aprovar_orcamento` + `aplicar_decisoes` (`src-tauri/src/commands/equipamentos.rs`, `orcamento_estoque.rs`) para o orçamento inteiro:

- confere etapa `AGUARDANDO_APROVACAO`, versão aberta e igual à verificação, resposta ainda vigente, vínculo do contato com o cliente do atendimento e verificação da mesma empresa;
- valida serviços (ids únicos, valores e peças) e recusa peças antigas sem serviço vinculado;
- registra a decisão de cada serviço, baixa estoque limitado ao saldo (o resto vira pendência, estoque nunca negativo), grava `movimentacoes_estoque` com a mesma referência do desktop;
- preserva o orçamento original, grava `forma_pagamento_codigo = 'A_COMBINAR'` se estava vazia, muda status/datas/`atualizado_em` (a tela aberta do operador passa a dar conflito de concorrência, como deve);
- auditoria `BUDGET_APPROVED`/`BUDGET_REJECTED` atribuída a “Portal do cliente: <contato>” com `origem=PORTAL_CLIENTE`.

**Diferença deliberada:** o valor efetivado é o da versão que o cliente aceitou (`orcamento_versoes.valor_total`). O desktop, ao aprovar todos os serviços, usa `verificacoes.custo_total`; se os dois divergirem, o portal mantém o preço que o cliente viu.

Respostas antigas de origem `PORTAL` (link removido) ou `EQUIPE` só existem em bancos de teste e, se aparecerem, continuam com conferência manual.

## Banco (`0035`, `0036`, `0038`, `0039`)

| Objeto | Função |
|---|---|
| `cliente_contatos.portal_acesso` + trigger | Acesso por contato; inativar ou mudar de cliente zera o acesso |
| `portal_config_empresa` (0038) | Chaves por empresa: `portal_enabled` (login e consulta) e `respostas_enabled` (aceitar/recusar/negociar; exige o portal ligado). Sem linha = desligado |
| `portal_cliente_config` | Reverificação e duração da sessão (globais do produto). `portal_enabled` daqui não é mais lido |
| `portal_contato_empresa` | Cartão “Fale com a equipe” (Configurações → Integrações); `endereco` (até 300) e `maps_url` (só https, até 500) vieram na 0039 |
| `portal_codigos` | Histórico do login por código (removido na 0038) |
| `portal_sessoes` | Hash do token de sessão, `verificada_em`, expiração; só sessões `metodo = SENHA` valem |
| `orcamento_respostas` (+colunas) | `PORTAL_CLIENTE`, contato, sessão, efetivação automática e falha; `ordem_compra` (1 a 60 caracteres, 0039) |
| `orcamento_solicitacoes` (+colunas) | `NEGOCIAR` e contato; `contato_telefone` / `contato_email` de retorno (0039) |
| `clientes.exige_ordem_compra` (0039) | Cliente que exige ordem de compra para aprovar pelo portal (padrão `FALSE`; ainda sem tela no desktop) |
| `portal_alertas` | Alertas persistentes; só `lido_em`/`lido_por` mudam |
| `equipamentos.ultima_atividade_cliente_em` | Ordenação por atividade sem mexer no token de concorrência |
| `portal_*` (SECURITY DEFINER) | Única porta da Edge Function (`service_role` só tem EXECUTE nelas) |

## Contrato de dados ampliado (0039)

Tudo aditivo: as chaves antigas não mudaram e os parâmetros novos das funções têm `DEFAULT`. Aplique a migration **antes** de publicar a Edge Function. Exemplo completo de `detalhe` em `supabase/tests/portal_cliente_contract.sql` (seção “Dados ampliados”).

**`detalhe`** (além do que já havia):

| Chave | Conteúdo |
|---|---|
| `cliente` | `{ nome, documento (só dígitos), exigeOrdemCompra }` |
| `defeitoRelatado` | Texto do equipamento |
| `valores` | `{ orcamento, final, atual }` (`atual` = final, senão orçamento; `null` sem valor) |
| `etapas` | `[{ status, em }]` só com data conhecida, em ordem cronológica. Datas: cadastro, verificações, 1ª versão publicada, `data_aprovacao/reprovacao/pronto/saida`; manutenção/peça só como etapa atual (`status_alterado_em`). Data anterior ao cadastro é descartada |
| `fotos` | `[{ id, categoria, url, largura, altura }]` (ENTRADA, VERIFICACAO, SAIDA; até 60). O banco devolve `caminho`; a Edge Function troca por `url` (https mantida, senão `SUPABASE_URL/storage/v1/object/public/<caminho>`) e descarta caminhos suspeitos |
| `historico` | Respostas e solicitações de **todas** as versões, mais recente primeiro (até 100): `{ tipo RESPOSTA/SOLICITACAO, subtipo, versao, valor, em, contato, protocolo, mensagem, situacao, ordemCompra }`. `situacao` da resposta: estado atual, `DESFEITA` ou `SUBSTITUIDA`; da solicitação: `TRATADA`/`AGUARDANDO` |
| `contatoEmpresa` | Ganha `endereco` e `mapsUrl` |
| `temTelefone`, `temEmail` | Do contato logado (ao lado de `contato`, que continua o nome) |
| `orcamento.resposta.ordemCompra` | Da resposta vigente |

**Lista:** cada atendimento ganha `valorAtual`.

**`responder`:** `ordemCompra` opcional (até 60). Aprovar para um cliente com `exige_ordem_compra` sem ela dá `ORDEM_COMPRA_OBRIGATORIA` (422). O comprovante traz `ordemCompra` e o alerta da equipe mostra o número.

**`solicitar`:** `telefone` (10 a 13 dígitos), `email` (até 200) e `salvarNoContato`. Inválidos dão `CONTATO_INVALIDO` (400). `salvarNoContato` só preenche campos vazios do cadastro do contato logado, nunca sobrescreve. O alerta da equipe mostra o telefone/e-mail informados.

## Ativação (ambiente de teste primeiro)

1. Aplicar 0031–0039 pelo processo de migrations (`docs/PRODUCTION_MIGRATIONS.md`) e conferir os advisors de segurança do Supabase.
2. Publicar a Edge Function `portal-cliente` (`verify_jwt = false`, já em `supabase/config.toml`) com os segredos:

| Segredo | Uso |
|---|---|
| `PORTAL_CLIENTE_SECRET` | 32+ caracteres; HMAC do limite de tentativas por documento |
| `PUBLIC_STATUS_RATE_LIMIT_SECRET`, `PUBLIC_STATUS_ORIGIN` | Os mesmos do `public-status` |

O portal não envia nada por WhatsApp nem email: não precisa de token de provedor.

3. Agendar a efetivação (o portal também efetiva ao listar/abrir, mas sem o Cron uma resposta só vira status quando alguém abre o portal):

```sql
select cron.schedule('portal-efetivar-respostas', '* * * * *',
  $$ select public.portal_efetivar_respostas_vencidas(50) $$);
```

4. Publicar a página (`npm run build:public-status`, enviar `dist-public-status/` com o `.htaccess`). A URL da função pode ser trocada com `VITE_PORTAL_CLIENTE_API_URL`.
5. No AutoOS: Configurações → Integrações → cartão “Fale com a equipe”; nos detalhes do equipamento, dar acesso ao contato e **Publicar no Portal do Cliente**.
6. Ligar para um piloto em Configurações → Integrações → **Portal do Cliente: funcionamento**: “Portal ligado” e “Clientes podem responder orçamentos” (PIN; respostas exigem a permissão financeira; auditoria `PORTAL_CONFIG_CHANGED`). As chaves são de cada empresa (`portal_config_empresa`, 0038): ligar numa empresa não liga nas outras.

Pausar: desligar “Portal ligado” derruba login e sessões na hora; nada é apagado. Desligar só as respostas mantém o acompanhamento. O cartão avisa quando respostas vencidas não estão sendo aplicadas (agendamento do passo 3 parado).

## Notificações no AutoOS (sino no canto superior direito)

- Abas **Todos**, **Erros** e **Portal do Cliente**, cada uma com “Não lidas” e “Histórico”. Erros reúne os erros do app e os alertas do portal que pedem ação (efetivação falhou).
- Alerta novo do portal vira aviso; **Ver** marca como lido e abre o atendimento. Se outra janela de detalhes estiver aberta, troca na hora; se houver formulário em preenchimento (cadastro, verificação, status, pagamento…), avisa e abre ao fechar o formulário.
- Alerta novo também atualiza a lista de Equipamentos em segundo plano (ordem “Alterados recentemente” inclui a atividade do cliente) e recarrega a resposta do atendimento aberto.
- Erros do app ficam guardados neste computador (até 50). **Copiar relatório** leva código (`AUTOOS:DB:<SQLSTATE ou categoria>`, `AUTOOS:23505:<restrição>`, `AUTOOS:OP`), descrição técnica, referência do log, contexto, tela e versão. O texto bruto do banco continua só no log (`autoos.log`), na linha com a mesma `referencia=`.

## Testes

- Contrato SQL: `psql --set ON_ERROR_STOP=1 --file=supabase/tests/portal_cliente_contract.sql` (também no job `qa-real` do CI).
- Edge Function: `src/public-status/portal-cliente-function.test.ts`. Portal: `src/public-status/PortalApp.test.tsx`. Desktop: `PortalAlertas.test.tsx`, `DecisaoOrcamentoCard.test.tsx`.
- `test_budget_stock` (integração real do desktop) continua passando com as mudanças.

## Limitações conhecidas

- A sessão fica no `sessionStorage` da aba: abrir outra aba exige novo login.
- A equipe conhece a senha do contato (decisão de produto: a troca é feita pela equipe). A resposta prova que alguém com a senha daquele contato respondeu.
- A senha identifica o contato; por isso duas senhas iguais no mesmo CPF/CNPJ são recusadas.
- Documento repetido em duas empresas com o mesmo contato não entra (não há como escolher a empresa com segurança).
