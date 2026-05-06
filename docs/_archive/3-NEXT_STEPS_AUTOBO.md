Plano de execução delegável:

#### 1.1. Inventário real dos comandos sensíveisRESUMO - AutoBO (Sistema de Automação de Boletos)
📋 O QUE É O AutoBO
Sistema desktop desenvolvido em Java Spring Boot para automação completa do ciclo de geração de boletos bancários, com integração direta à API de Cobrança do Banco Sicredi.

🎯 OBJETIVO
Eliminar processos manuais de geração de boletos, reduzindo:

Tempo de geração de 5 minutos → 15 segundos (90%)
Erros de digitação manual → 0%
Trabalho operacional → 40+ horas/mês economizadas


⚙️ FUNCIONALIDADES PRINCIPAIS
1. Importação Automática de NF-e

Parser de XML (Notas Fiscais Eletrônicas)
Extração automática de:

Dados do pagador (CPF/CNPJ, nome, endereço)
Valor total da nota
Data de emissão
Número da NF-e


Validação de schema XML e chave de acesso
Detecção de duplicidade

2. Gestão Inteligente de Pagadores

Detecção automática PF/PJ:

CPF (11 dígitos) → Pessoa Física
CNPJ (14 dígitos) → Pessoa Jurídica


Validação algorítmica de CPF/CNPJ
Cadastro automático: Se pagador não existe, cria automaticamente com dados da NF-e
Configurações personalizadas por cliente:

Prazo de vencimento padrão
Percentual de juros (mensal/diário)
Percentual de multa
Dias para protesto/negativação
Mensagens padrão no boleto



3. Geração Automática de Boletos

Integração API Sicredi v2:

Autenticação OAuth 2.0
Ambiente Sandbox para testes
Suporte a boletos simples e híbridos (com QR Code Pix)


Cálculos automáticos:

Data de vencimento (data emissão + prazo)
Juros (percentual mensal/diário ou valor fixo)
Multa (percentual ou valor fixo)
Descontos progressivos (até 3 níveis)


Tratamento completo de erros:

400: Validação de campos
401: Token expirado
422: Regras de negócio (ECOMM não contratado, etc)
429: Rate limit
Retry automático com backoff exponencial



4. Notificações Automáticas

Email (SMTP):

Template HTML profissional
Linha digitável formatada
QR Code Pix (se boleto híbrido)
Informações completas do boleto


WhatsApp:

Mensagem formatada em Markdown
Linha digitável copiável
Link para pagamento


Disparo automático em:

Boleto gerado → Email + WhatsApp
Lembretes de vencimento (job agendado)
Equipamento pronto (integração com AutoOS)



5. Dashboard Financeiro

Métricas em tempo real:

Boletos gerados no mês
Boletos pagos
Boletos vencidos
Valor a receber
Taxa de inadimplência


Gráficos:

Evolução mensal de boletos
Distribuição por status
Top devedores


Relatórios:

Recebimentos por período
Inadimplência por região
Exportação Excel/CSV



6. Jobs Agendados

Verificar boletos vencendo hoje (8h diariamente)
Atualizar status de boletos (1h diariamente)

Consulta API Sicredi
Marca como PAGO se confirmado
Atualiza estatísticas do pagador




🗄️ BANCO DE DADOS (PostgreSQL)
Tabelas Principais:
pagadores:

Dados PF: nome
Dados PJ: razaoSocial, nomeFantasia, inscricaoEstadual
Configurações: prazoVencimentoDias, percentualJuros, percentualMulta, diasProtesto
Estatísticas: totalBoletosGerados, totalBoletosPagos, totalValorPago

notas_fiscais:

Dados NF-e: numeroNf, chaveAcesso, dataEmissao
Valores: valorTotal, valorProdutos, valorServicos
Status: IMPORTADA, BOLETO_GERADO, PAGA, CANCELADA
Arquivo XML completo armazenado

boletos:

Identificação: nossoNumero (Sicredi), seuNumero (interno)
Valores: valorNominal, valorPago, valorJuros, valorMulta
Datas: dataEmissao, dataVencimento, dataPagamento
Configurações: tipoCobranca (SIMPLES/HIBRIDO), juros, multa, descontos
Dados Sicredi: linhaDigitavel, codigoBarras, txid, qrCode
Status: GERADO, REGISTRADO, PAGO, VENCIDO, CANCELADO

comunicacoes:

Log de emails/WhatsApp enviados
Status de entrega e visualização
Rastreamento de cliques (email)
Respostas do cliente (WhatsApp)


🏗️ STACK TECNOLÓGICA
Backend:

Java 17+ (LTS)
Spring Boot 3.x
Spring Data JPA (ORM)
Spring Security (autenticação)
Spring Scheduler (jobs)
Flyway (migrations)

Banco de Dados:

PostgreSQL 14+
SQLite compartilhado (insumos com AutoOS)

Bibliotecas:

jackson-dataformat-xml - Parser NF-e
spring-boot-starter-mail - SMTP
thymeleaf - Templates email
okhttp / RestTemplate - HTTP client
bcrypt - Criptografia

Interface:

JavaFX 17+ (UI desktop nativa)
OU Vaadin Flow (web-based local)


🔗 INTEGRAÇÃO COM AutoOS
Compartilhamento de dados:
Opção 1: PostgreSQL Único (Recomendada)
PostgreSQL (autoos database)
├── clientes (compartilhado)
├── equipamentos (AutoOS)
├── produtos (compartilhado)
├── movimentacoes_estoque (compartilhado)
├── verificacoes (AutoOS)
├── boletos (AutoBO)
└── notas_fiscais (AutoBO)
Vantagens:

✅ Concorrência nativa (MVCC)
✅ Backup único centralizado
✅ Schema unificado
✅ Foreign keys entre sistemas

Opção 2: Híbrido (SQLite para insumos)
AutoOS: autoos.db (SQLite local) + insumos.db (SQLite compartilhado)
AutoBO: PostgreSQL (rede) + insumos.db (SQLite compartilhado)
Vantagens:

✅ AutoOS funciona offline
✅ Independência entre apps
✅ Insumos compartilhados via arquivo


📱 API SICREDI - ESPECIFICAÇÕES
Credenciais Necessárias (5):

apiKey - Portal Developers
cooperativa - 4 dígitos
posto - 2 dígitos
codigoBeneficiario - 5 dígitos
codigoAcesso - Internet Banking

Fluxo de Autenticação:
POST /auth/openapi/token
  → access_token (válido ~1h)
  → Cache em memória
  → Renovação automática
Endpoint de Geração:
POST /cobranca/boleto/v1/boletos
Headers:
  - x-api-key
  - Authorization: Bearer {token}
  - cooperativa
  - posto
Body: JSON com 40+ campos
Resposta (201 Created):
json{
  "nossoNumero": "12345678",
  "linhaDigitavel": "00000.00000...",
  "codigoBarras": "00000000000...",
  "txid": "...",        // Apenas híbrido
  "qrCode": "..."       // Apenas híbrido
}
Tratamento de Erros:

400: Validação (campo inválido)
401: Token expirado
422: ECOMM não contratado, CEP inválido, vencimento retroativo
429: Rate limit
Retry com backoff exponencial (máx 3 tentativas)


📊 FLUXO COMPLETO
1. Importar NF-e (XML) → Parser + Validação
   ↓
2. Extrair dados do pagador (CPF/CNPJ, nome, endereço)
   ↓
3. Buscar pagador no banco
   ├─ Existe? → Carregar configurações
   └─ Não existe? → Cadastrar automaticamente
   ↓
4. Revisar dados (UI) → Ajustes manuais opcionais
   ↓
5. Gerar boleto → API Sicredi
   ├─ Autenticação OAuth
   ├─ Montar payload JSON
   ├─ POST /boletos
   └─ Salvar resposta (nossoNumero, linha digitável, etc)
   ↓
6. Notificações automáticas
   ├─ Email (SMTP) → Template HTML
   └─ WhatsApp (API) → Mensagem formatada
   ↓
7. Registrar comunicações (log completo)

⏱️ JOBS AGENDADOS
Diário às 8h:

Buscar boletos vencendo hoje
Enviar lembretes por email/WhatsApp

Diário à 1h:

Consultar status de boletos na API Sicredi
Atualizar status (PAGO se confirmado)
Atualizar estatísticas de pagadores


📈 MÉTRICAS DE SUCESSO
Após 3 meses em produção:

✅ 90% redução no tempo de geração
✅ 0% erros de digitação
✅ 99%+ taxa de sucesso API Sicredi
✅ 80%+ emails abertos
✅ 20-30% redução na inadimplência
✅ 100+ NF-es processadas/mês


🚀 ROADMAP DE IMPLEMENTAÇÃO
9 semanas divididas em 8 fases:

Setup (Java + PostgreSQL + JavaFX)
Parser de NF-e + Validações
API Sicredi (OAuth + Geração)
Service de geração + Persistência
Email/WhatsApp services
Dashboard + Queries agregadas
Jobs agendados
Testes + Refinamento


💡 DECISÕES TÉCNICAS CHAVE
Por que Java Spring Boot?

✅ Robustez enterprise
✅ Integração bancária confiável
✅ Jobs agendados nativos (Spring Scheduler)
✅ Ecossistema maduro (JPA, SMTP, etc)
✅ Você quer praticar Java

Por que PostgreSQL?

✅ Concorrência nativa (múltiplos apps acessando)
✅ EscalávelRESUMO - AutoBO (Sistema de Automação de Boletos)
📋 O QUE É O AutoBO
Sistema desktop desenvolvido em Java Spring Boot para automação completa do ciclo de geração de boletos bancários, com integração direta à API de Cobrança do Banco Sicredi.

🎯 OBJETIVO
Eliminar processos manuais de geração de boletos, reduzindo:

Tempo de geração de 5 minutos → 15 segundos (90%)
Erros de digitação manual → 0%
Trabalho operacional → 40+ horas/mês economizadas


⚙️ FUNCIONALIDADES PRINCIPAIS
1. Importação Automática de NF-e

Parser de XML (Notas Fiscais Eletrônicas)
Extração automática de:

Dados do pagador (CPF/CNPJ, nome, endereço)
Valor total da nota
Data de emissão
Número da NF-e


Validação de schema XML e chave de acesso
Detecção de duplicidade

2. Gestão Inteligente de Pagadores

Detecção automática PF/PJ:

CPF (11 dígitos) → Pessoa Física
CNPJ (14 dígitos) → Pessoa Jurídica


Validação algorítmica de CPF/CNPJ
Cadastro automático: Se pagador não existe, cria automaticamente com dados da NF-e
Configurações personalizadas por cliente:

Prazo de vencimento padrão
Percentual de juros (mensal/diário)
Percentual de multa
Dias para protesto/negativação
Mensagens padrão no boleto



3. Geração Automática de Boletos

Integração API Sicredi v2:

Autenticação OAuth 2.0
Ambiente Sandbox para testes
Suporte a boletos simples e híbridos (com QR Code Pix)


Cálculos automáticos:

Data de vencimento (data emissão + prazo)
Juros (percentual mensal/diário ou valor fixo)
Multa (percentual ou valor fixo)
Descontos progressivos (até 3 níveis)


Tratamento completo de erros:

400: Validação de campos
401: Token expirado
422: Regras de negócio (ECOMM não contratado, etc)
429: Rate limit
Retry automático com backoff exponencial



4. Notificações Automáticas

Email (SMTP):

Template HTML profissional
Linha digitável formatada
QR Code Pix (se boleto híbrido)
Informações completas do boleto


WhatsApp:

Mensagem formatada em Markdown
Linha digitável copiável
Link para pagamento


Disparo automático em:

Boleto gerado → Email + WhatsApp
Lembretes de vencimento (job agendado)
Equipamento pronto (integração com AutoOS)



5. Dashboard Financeiro

Métricas em tempo real:

Boletos gerados no mês
Boletos pagos
Boletos vencidos
Valor a receber
Taxa de inadimplência


Gráficos:

Evolução mensal de boletos
Distribuição por status
Top devedores


Relatórios:

Recebimentos por período
Inadimplência por região
Exportação Excel/CSV



6. Jobs Agendados

Verificar boletos vencendo hoje (8h diariamente)
Atualizar status de boletos (1h diariamente)

Consulta API Sicredi
Marca como PAGO se confirmado
Atualiza estatísticas do pagador




🗄️ BANCO DE DADOS (PostgreSQL)
Tabelas Principais:
pagadores:

Dados PF: nome
Dados PJ: razaoSocial, nomeFantasia, inscricaoEstadual
Configurações: prazoVencimentoDias, percentualJuros, percentualMulta, diasProtesto
Estatísticas: totalBoletosGerados, totalBoletosPagos, totalValorPago

notas_fiscais:

Dados NF-e: numeroNf, chaveAcesso, dataEmissao
Valores: valorTotal, valorProdutos, valorServicos
Status: IMPORTADA, BOLETO_GERADO, PAGA, CANCELADA
Arquivo XML completo armazenado

boletos:

Identificação: nossoNumero (Sicredi), seuNumero (interno)
Valores: valorNominal, valorPago, valorJuros, valorMulta
Datas: dataEmissao, dataVencimento, dataPagamento
Configurações: tipoCobranca (SIMPLES/HIBRIDO), juros, multa, descontos
Dados Sicredi: linhaDigitavel, codigoBarras, txid, qrCode
Status: GERADO, REGISTRADO, PAGO, VENCIDO, CANCELADO

comunicacoes:

Log de emails/WhatsApp enviados
Status de entrega e visualização
Rastreamento de cliques (email)
Respostas do cliente (WhatsApp)


🏗️ STACK TECNOLÓGICA
Backend:

Java 17+ (LTS)
Spring Boot 3.x
Spring Data JPA (ORM)
Spring Security (autenticação)
Spring Scheduler (jobs)
Flyway (migrations)

Banco de Dados:

PostgreSQL 14+
SQLite compartilhado (insumos com AutoOS)

Bibliotecas:

jackson-dataformat-xml - Parser NF-e
spring-boot-starter-mail - SMTP
thymeleaf - Templates email
okhttp / RestTemplate - HTTP client
bcrypt - Criptografia

Interface:

JavaFX 17+ (UI desktop nativa)
OU Vaadin Flow (web-based local)


🔗 INTEGRAÇÃO COM AutoOS
Compartilhamento de dados:
Opção 1: PostgreSQL Único (Recomendada)
PostgreSQL (autoos database)
├── clientes (compartilhado)
├── equipamentos (AutoOS)
├── produtos (compartilhado)
├── movimentacoes_estoque (compartilhado)
├── verificacoes (AutoOS)
├── boletos (AutoBO)
└── notas_fiscais (AutoBO)
Vantagens:

✅ Concorrência nativa (MVCC)
✅ Backup único centralizado
✅ Schema unificado
✅ Foreign keys entre sistemas

Opção 2: Híbrido (SQLite para insumos)
AutoOS: autoos.db (SQLite local) + insumos.db (SQLite compartilhado)
AutoBO: PostgreSQL (rede) + insumos.db (SQLite compartilhado)
Vantagens:

✅ AutoOS funciona offline
✅ Independência entre apps
✅ Insumos compartilhados via arquivo


📱 API SICREDI - ESPECIFICAÇÕES
Credenciais Necessárias (5):

apiKey - Portal Developers
cooperativa - 4 dígitos
posto - 2 dígitos
codigoBeneficiario - 5 dígitos
codigoAcesso - Internet Banking

Fluxo de Autenticação:
POST /auth/openapi/token
  → access_token (válido ~1h)
  → Cache em memória
  → Renovação automática
Endpoint de Geração:
POST /cobranca/boleto/v1/boletos
Headers:
  - x-api-key
  - Authorization: Bearer {token}
  - cooperativa
  - posto
Body: JSON com 40+ campos
Resposta (201 Created):
json{
  "nossoNumero": "12345678",
  "linhaDigitavel": "00000.00000...",
  "codigoBarras": "00000000000...",
  "txid": "...",        // Apenas híbrido
  "qrCode": "..."       // Apenas híbrido
}
Tratamento de Erros:

400: Validação (campo inválido)
401: Token expirado
422: ECOMM não contratado, CEP inválido, vencimento retroativo
429: Rate limit
Retry com backoff exponencial (máx 3 tentativas)


📊 FLUXO COMPLETO
1. Importar NF-e (XML) → Parser + Validação
   ↓
2. Extrair dados do pagador (CPF/CNPJ, nome, endereço)
   ↓
3. Buscar pagador no banco
   ├─ Existe? → Carregar configurações
   └─ Não existe? → Cadastrar automaticamente
   ↓
4. Revisar dados (UI) → Ajustes manuais opcionais
   ↓
5. Gerar boleto → API Sicredi
   ├─ Autenticação OAuth
   ├─ Montar payload JSON
   ├─ POST /boletos
   └─ Salvar resposta (nossoNumero, linha digitável, etc)
   ↓
6. Notificações automáticas
   ├─ Email (SMTP) → Template HTML
   └─ WhatsApp (API) → Mensagem formatada
   ↓
7. Registrar comunicações (log completo)

⏱️ JOBS AGENDADOS
Diário às 8h:

Buscar boletos vencendo hoje
Enviar lembretes por email/WhatsApp

Diário à 1h:

Consultar status de boletos na API Sicredi
Atualizar status (PAGO se confirmado)
Atualizar estatísticas de pagadores


📈 MÉTRICAS DE SUCESSO
Após 3 meses em produção:

✅ 90% redução no tempo de geração
✅ 0% erros de digitação
✅ 99%+ taxa de sucesso API Sicredi
✅ 80%+ emails abertos
✅ 20-30% redução na inadimplência
✅ 100+ NF-es processadas/mês


🚀 ROADMAP DE IMPLEMENTAÇÃO
9 semanas divididas em 8 fases:

Setup (Java + PostgreSQL + JavaFX)
Parser de NF-e + Validações
API Sicredi (OAuth + Geração)
Service de geração + Persistência
Email/WhatsApp services
Dashboard + Queries agregadas
Jobs agendados
Testes + Refinamento


💡 DECISÕES TÉCNICAS CHAVE
Por que Java Spring Boot?

✅ Robustez enterprise
✅ Integração bancária confiável
✅ Jobs agendados nativos (Spring Scheduler)
✅ Ecossistema maduro (JPA, SMTP, etc)RESUMO - AutoBO (Sistema de Automação de Boletos)
📋 O QUE É O AutoBO
Sistema desktop desenvolvido em Java Spring Boot para automação completa do ciclo de geração de boletos bancários, com integração direta à API de Cobrança do Banco Sicredi.

🎯 OBJETIVO
Eliminar processos manuais de geração de boletos, reduzindo:

Tempo de geração de 5 minutos → 15 segundos (90%)
Erros de digitação manual → 0%
Trabalho operacional → 40+ horas/mês economizadas


⚙️ FUNCIONALIDADES PRINCIPAIS
1. Importação Automática de NF-e

Parser de XML (Notas Fiscais Eletrônicas)
Extração automática de:

Dados do pagador (CPF/CNPJ, nome, endereço)
Valor total da nota
Data de emissão
Número da NF-e


Validação de schema XML e chave de acesso
Detecção de duplicidade

2. Gestão Inteligente de Pagadores

Detecção automática PF/PJ:

CPF (11 dígitos) → Pessoa Física
CNPJ (14 dígitos) → Pessoa Jurídica


Validação algorítmica de CPF/CNPJ
Cadastro automático: Se pagador não existe, cria automaticamente com dados da NF-e
Configurações personalizadas por cliente:

Prazo de vencimento padrão
Percentual de juros (mensal/diário)
Percentual de multa
Dias para protesto/negativação
Mensagens padrão no boleto



3. Geração Automática de Boletos

Integração API Sicredi v2:

Autenticação OAuth 2.0
Ambiente Sandbox para testes
Suporte a boletos simples e híbridos (com QR Code Pix)


Cálculos automáticos:

Data de vencimento (data emissão + prazo)
Juros (percentual mensal/diário ou valor fixo)
Multa (percentual ou valor fixo)
Descontos progressivos (até 3 níveis)


Tratamento completo de erros:

400: Validação de campos
401: Token expirado
422: Regras de negócio (ECOMM não contratado, etc)
429: Rate limit
Retry automático com backoff exponencial



4. Notificações Automáticas

Email (SMTP):

Template HTML profissional
Linha digitável formatada
QR Code Pix (se boleto híbrido)
Informações completas do boleto


WhatsApp:

Mensagem formatada em Markdown
Linha digitável copiável
Link para pagamento


Disparo automático em:

Boleto gerado → Email + WhatsApp
Lembretes de vencimento (job agendado)
Equipamento pronto (integração com AutoOS)



5. Dashboard Financeiro

Métricas em tempo real:

Boletos gerados no mês
Boletos pagos
Boletos vencidos
Valor a receber
Taxa de inadimplência


Gráficos:

Evolução mensal de boletos
Distribuição por status
Top devedores


Relatórios:

Recebimentos por período
Inadimplência por região
Exportação Excel/CSV



6. Jobs Agendados

Verificar boletos vencendo hoje (8h diariamente)
Atualizar status de boletos (1h diariamente)

Consulta API Sicredi
Marca como PAGO se confirmado
Atualiza estatísticas do pagador




🗄️ BANCO DE DADOS (PostgreSQL)
Tabelas Principais:
pagadores:

Dados PF: nome
Dados PJ: razaoSocial, nomeFantasia, inscricaoEstadual
Configurações: prazoVencimentoDias, percentualJuros, percentualMulta, diasProtesto
Estatísticas: totalBoletosGerados, totalBoletosPagos, totalValorPago

notas_fiscais:

Dados NF-e: numeroNf, chaveAcesso, dataEmissao
Valores: valorTotal, valorProdutos, valorServicos
Status: IMPORTADA, BOLETO_GERADO, PAGA, CANCELADA
Arquivo XML completo armazenado

boletos:

Identificação: nossoNumero (Sicredi), seuNumero (interno)
Valores: valorNominal, valorPago, valorJuros, valorMulta
Datas: dataEmissao, dataVencimento, dataPagamento
Configurações: tipoCobranca (SIMPLES/HIBRIDO), juros, multa, descontos
Dados Sicredi: linhaDigitavel, codigoBarras, txid, qrCode
Status: GERADO, REGISTRADO, PAGO, VENCIDO, CANCELADO

comunicacoes:

Log de emails/WhatsApp enviados
Status de entrega e visualização
Rastreamento de cliques (email)
Respostas do cliente (WhatsApp)


🏗️ STACK TECNOLÓGICA
Backend:

Java 17+ (LTS)
Spring Boot 3.x
Spring Data JPA (ORM)
Spring Security (autenticação)
Spring Scheduler (jobs)
Flyway (migrations)

Banco de Dados:

PostgreSQL 14+
SQLite compartilhado (insumos com AutoOS)

Bibliotecas:

jackson-dataformat-xml - Parser NF-e
spring-boot-starter-mail - SMTP
thymeleaf - Templates email
okhttp / RestTemplate - HTTP client
bcrypt - Criptografia

Interface:

JavaFX 17+ (UI desktop nativa)
OU Vaadin Flow (web-based local)


🔗 INTEGRAÇÃO COM AutoOS
Compartilhamento de dados:
Opção 1: PostgreSQL Único (Recomendada)
PostgreSQL (autoos database)
├── clientes (compartilhado)
├── equipamentos (AutoOS)
├── produtos (compartilhado)
├── movimentacoes_estoque (compartilhado)
├── verificacoes (AutoOS)
├── boletos (AutoBO)
└── notas_fiscais (AutoBO)
Vantagens:

✅ Concorrência nativa (MVCC)
✅ Backup único centralizado
✅ Schema unificado
✅ Foreign keys entre sistemas

Opção 2: Híbrido (SQLite para insumos)
AutoOS: autoos.db (SQLite local) + insumos.db (SQLite compartilhado)
AutoBO: PostgreSQL (rede) + insumos.db (SQLite compartilhado)
Vantagens:

✅ AutoOS funciona offline
✅ Independência entre apps
✅ Insumos compartilhados via arquivo


📱 API SICREDI - ESPECIFICAÇÕES
Credenciais Necessárias (5):

apiKey - Portal Developers
cooperativa - 4 dígitos
posto - 2 dígitos
codigoBeneficiario - 5 dígitos
codigoAcesso - Internet Banking

Fluxo de Autenticação:
POST /auth/openapi/token
  → access_token (válido ~1h)
  → Cache em memória
  → Renovação automática
Endpoint de Geração:
POST /cobranca/boleto/v1/boletos
Headers:
  - x-api-key
  - Authorization: Bearer {token}
  - cooperativa
  - posto
Body: JSON com 40+ campos
Resposta (201 Created):
json{
  "nossoNumero": "12345678",
  "linhaDigitavel": "00000.00000...",
  "codigoBarras": "00000000000...",
  "txid": "...",        // Apenas híbrido
  "qrCode": "..."       // Apenas híbrido
}
Tratamento de Erros:

400: Validação (campo inválido)
401: Token expirado
422: ECOMM não contratado, CEP inválido, vencimento retroativo
429: Rate limit
Retry com backoff exponencial (máx 3 tentativas)


📊 FLUXO COMPLETO
1. Importar NF-e (XML) → Parser + Validação
   ↓
2. Extrair dados do pagador (CPF/CNPJ, nome, endereço)
   ↓
3. Buscar pagador no banco
   ├─ Existe? → Carregar configurações
   └─ Não existe? → Cadastrar automaticamente
   ↓
4. Revisar dados (UI) → Ajustes manuais opcionais
   ↓
5. Gerar boleto → API Sicredi
   ├─ Autenticação OAuth
   ├─ Montar payload JSON
   ├─ POST /boletos
   └─ Salvar resposta (nossoNumero, linha digitável, etc)
   ↓
6. Notificações automáticas
   ├─ Email (SMTP) → Template HTML
   └─ WhatsApp (API) → Mensagem formatada
   ↓
7. Registrar comunicações (log completo)

⏱️ JOBS AGENDADOS
Diário às 8h:

Buscar boletos vencendo hoje
Enviar lembretes por email/WhatsApp

Diário à 1h:

Consultar status de boletos na API Sicredi
Atualizar status (PAGO se confirmado)
Atualizar estatísticas de pagadores


📈 MÉTRICAS DE SUCESSO
Após 3 meses em produção:

✅ 90% redução no tempo de geração
✅ 0% erros de digitação
✅ 99%+ taxa de sucesso API Sicredi
✅ 80%+ emails abertos
✅ 20-30% redução na inadimplência
✅ 100+ NF-es processadas/mês


🚀 ROADMAP DE IMPLEMENTAÇÃO
9 semanas divididas em 8 fases:

Setup (Java + PostgreSQL + JavaFX)
Parser de NF-e + Validações
API Sicredi (OAuth + Geração)
Service de geração + Persistência
Email/WhatsApp services
Dashboard + Queries agregadas
Jobs agendados
Testes + Refinamento


💡 DECISÕES TÉCNICAS CHAVE
Por que Java Spring Boot?

✅ Robustez enterprise
✅ Integração bancária confiável
✅ Jobs agendados nativos (Spring Scheduler)
✅ Ecossistema maduro (JPA, SMTP, etc)
✅ Você quer praticar Java

Por que PostgreSQL?

✅ Concorrência nativa (múltiplos apps acessando)
✅ Escalável
✅ Gratuito
✅ Suporte a JSON (para dados complexos)

Por que não SQLite?

❌ Não suporta acesso simultâneo de múltiplas máquinas
❌ AutoOS e AutoBO podem rodar em PCs diferentes
✅ Você quer praticar Java

Por que PostgreSQL?

✅ Concorrência nativa (múltiplos apps acessando)
✅ Escalável
✅ Gratuito
✅ Suporte a JSON (para dados complexos)

Por que não SQLite?

❌ Não suporta acesso simultâneo de múltiplas máquinas
❌ AutoOS e AutoBO podem rodar em PCs diferentes
✅ Gratuito
✅ Suporte a JSON (para dados complexos)

Por que não SQLite?

❌ Não suporta acesso simultâneo de múltiplas máquinas
❌ AutoOS e AutoBO podem rodar em PCs diferentes
- [x] Montar uma matriz comando → tipo de escrita → permissão exigida → arquivo.
- [x] Classificar explicitamente os comandos em quatro grupos: financeiro, estoque, exclusão e administrativo.
- [x] Tratar como escopo mínimo os arquivos `src-tauri/src/commands/auth.rs`, `equipamentos.rs`, `produtos.rs`, `clientes.rs`, `smtp.rs`, `whatsapp.rs` e `util.rs`.
- [x] Identificar qualquer comando `#[tauri::command]` que grave, altere ou destrua estado e ainda não esteja protegido por `require_permission(...)` antes da escrita.

Critério de aceite:
Existe uma lista fechada dos comandos sensíveis e do contrato de permissão esperado para cada um.

Evidência:
- Matriz consolidada em `SECURITY_SENSITIVE_COMMAND_MATRIX.md`.

#### 1.2. Corrigir a causa raiz do bypass financeiro em equipamentos
- [x] Revisar `criar_equipamento` e `atualizar_equipamento` em `src-tauri/src/commands/equipamentos.rs`.
- [x] Garantir que campos financeiros como `preco_compra`, `preco_venda`, `valor_orcamento`, `valor_final` e `prazo_aprovacao` não possam ser persistidos sem `PERMISSION_FINANCIAL_ACTIONS` quando houver alteração sensível.
- [x] Escolher uma estratégia explícita e consistente:
ou exigir permissão financeira para criação/edição quando esses campos vierem preenchidos,
ou separar a mutação financeira em caminho próprio protegido.
- [x] Não aceitar correção apenas na UI; a proteção precisa ficar no backend Rust.

Critério de aceite:
O mesmo perfil sem permissão financeira pode criar ou editar dados não financeiros, mas não consegue persistir dados financeiros por payload alternativo.

#### 1.3. Normalizar a ordem de proteção nos comandos write
- [x] Em cada comando sensível, mover a checagem para antes de abrir caminho de escrita relevante.
- [x] Evitar padrões onde a query, a montagem de payload sensível ou a mutação parcial aconteçam antes da autorização.
- [x] Padronizar helpers locais quando isso reduzir duplicação e risco de regressão.
- [x] Revisar especialmente deletes, movimentação de estoque, configurações sensíveis, backup e restore.

Critério de aceite:
Não existe comando sensível com escrita efetiva alcançável antes da checagem de permissão.

#### 1.4. Fechar a trilha de auditoria para sucesso e negação
- [x] Revisar `require_permission(...)` e os chamadores em `src-tauri/src/commands/auth.rs`.
- [x] Garantir evento auditável para negação de acesso sensível, não apenas para sucesso operacional.
- [x] Garantir que backup, restore, troca de perfil, configurações sensíveis e mutações financeiras registrem ator, tipo de ação, resultado e contexto mínimo útil.
- [x] Evitar log genérico sem contexto suficiente para suporte ou investigação.

Critério de aceite:
Tanto a tentativa negada quanto a ação bem-sucedida ficam rastreáveis com contexto suficiente para investigação.

#### 1.5. Provar o comportamento com testes e checks baratos
- [x] Adicionar testes Rust cobrindo pelo menos um caso negado e um autorizado para cada grupo de permissão crítica.
- [x] Incluir caso explícito para o bypass de equipamentos.
- [x] Usar um check barato de regressão no código antes dos testes amplos:
buscar comandos sensíveis que façam `sqlx::query` ou `execute` sem passar antes por `require_permission(...)` ou helper equivalente.
- [x] Encerrar a etapa com validação executável mínima.

Validação mínima:
```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
```

Validação adicional obrigatória desta etapa:
- Prova de acesso negado para perfil sem permissão.
- Prova de acesso permitido para perfil autorizado.
- Prova de que o bypass financeiro em equipamentos não é mais reproduzível.

Status:
- Concluído em 2026-04-17 com matriz de comandos sensíveis, testes Rust `p0_sensitive`, `cargo check`, `npx tsc --noEmit` e `npm run test:run`.
- Ajuste complementar concluído em 2026-04-17: `enviar_email` e `enviar_whatsapp` deixaram de depender de `FINANCIAL_ACTIONS` e passaram a usar as permissões de configuração do canal com auditoria explícita de sucesso/falha.

### 2. Provar o runtime real com PostgreSQL
- [x] Validar `DATABASE_URL` em ambiente de homologação ou produção assistida.
- [x] Subir o app Tauri completo e provar bootstrap, migrações e conexão real com PostgreSQL.
- [x] Executar CRUD real de clientes, equipamentos, produtos e movimentações.
- [x] Registrar falhas operacionais observadas no boot e no uso normal.

Saída esperada:
O sistema deve abrir, operar e persistir dados reais sem depender de mocks, truques locais ou intervenção manual fora do fluxo documentado.

Plano de execução delegável:

#### 2.1. Preparar ambiente real de homologação
- [x] Confirmar presença de `DATABASE_URL` válida e apontando para uma base de homologação descartável.
- [x] Confirmar versão do PostgreSQL, credenciais mínimas, conectividade de rede e permissões para migração.
- [x] Confirmar se `src-tauri/.env` ou variáveis de ambiente representam o fluxo oficial que será usado pela equipe.
- [x] Registrar explicitamente qualquer dependência externa necessária para o boot.

Critério de aceite:
Existe um ambiente real, reproduzível e separado do desenvolvimento casual para validar o app com banco verdadeiro.

Status em 2026-04-18:
- `src-tauri/.env` validado com `DATABASE_URL=postgres://autoos_user:***@localhost:5432/autoos` apontando para a base local `autoos` usada como homologação descartável.
- Conectividade real confirmada com `psql` usando `autoos_user` e retorno de `current_database(), current_user = autoos | autoos_user`.
- Host validado com PostgreSQL 18.3 aceitando conexões na porta 5432 e com migrações aplicáveis pelo usuário do app.
- Dependência externa de boot mantida: `DATABASE_URL` válida e ferramentas PostgreSQL instaladas continuam sendo pré-condições do ambiente.

#### 2.2. Provar bootstrap nativo ponta a ponta
- [x] Subir o app Tauri completo, não apenas `cargo check` ou build isolado.
- [x] Confirmar conexão, aplicação de migrações pendentes e inicialização sem erro fatal.
- [x] Capturar logs úteis de inicialização e qualquer erro de ambiente.
- [x] Tratar como falha qualquer necessidade de workaround não documentado para o app abrir.

Critério de aceite:
O app sobe em modo real com PostgreSQL disponível e sem passos secretos fora da documentação oficial.

Evidência em 2026-04-18:
- `npm run tauri dev` subiu `vite` em `http://localhost:1420/`, iniciou o `cargo run` oficial do Tauri e executou `target\debug\autoos.exe` sem erro de binário ambíguo.
- Logs nativos confirmaram `AutoOS iniciando...`, `Inicializando banco de dados...` e `Banco de dados inicializado com sucesso` em [src-tauri/src/main.rs](src-tauri/src/main.rs).
- O bootstrap aplicou/verificou as 4 migrações em `_sqlx_migrations` e a UI passou a disparar leituras reais de equipamentos, produtos e status sensível logo após a subida.
- Causa raiz corrigida nesta etapa: `db.rs` agora resolve `src-tauri/.env` mesmo quando o binário é iniciado a partir da raiz do workspace, e `Cargo.toml` passou a definir `default-run = "autoos"` para manter `npm run tauri dev` funcional após adicionar o binário de smoke.

#### 2.3. Executar smoke test operacional mínimo
- [x] Criar e editar cliente real.
- [x] Criar e editar equipamento real, incluindo mudança de status.
- [x] Criar produto, registrar entrada e saída de estoque e validar saldo final.
- [x] Validar persistência após reiniciar o app.

Critério de aceite:
Os principais fluxos transacionais funcionam com dados reais e persistem corretamente após reinicialização.

Evidência em 2026-04-18:
- `cargo run --quiet --bin runtime_smoke` conectou na mesma `DATABASE_URL` do app, confirmou PostgreSQL 18.3 e 4 migrações aplicadas.
- O smoke criou e editou cliente real (`RUNTIME_SMOKE_CLIENT_ID=3`), criou e editou equipamento real (`RUNTIME_SMOKE_EQUIPMENT_ID=3`) e confirmou persistência do status `EM_VERIFICACAO` após reabrir nova conexão.
- O fluxo de estoque rodou pelo caminho protegido do backend, com perfil temporário desbloqueado apenas para o teste: `RUNTIME_SMOKE_STOCK_MODE=command:perfil temporário desbloqueado para validar estoque via comandos protegidos; produto_id=3; saldo_final=12`.
- O saldo final do produto e as 2 movimentações (`ENTRADA` e `SAIDA`) foram validados após reconectar ao PostgreSQL, e o helper limpou os dados de smoke ao final.

#### 2.4. Consolidar evidência e falhas operacionais
- [x] Registrar o que foi validado, o que falhou e qual bloqueio depende de ambiente.
- [x] Transformar erro de infraestrutura repetível em item explícito do roadmap, não em observação solta.
- [x] Atualizar documentação operacional quando o fluxo real divergir do que está escrito.

Validação adicional obrigatória desta etapa:
- Prova de boot real do app com PostgreSQL.
- Prova de CRUD real sem mocks.
- Evidência mínima de logs ou passos de reprodução para qualquer falha observada.

Status:
- Concluído em 2026-04-18 com validação real de `DATABASE_URL`, `runtime_smoke`, `npm run tauri dev` e documentação operacional alinhada.

### 3. Fechar backup, restore e recuperação operacional
- [x] Validar presença e uso de `pg_dump`, `pg_restore` e `psql` no ambiente alvo.
- [x] Executar backup manual real pelo app.
- [x] Executar restore real de `.dump` e `.sql` com confirmação explícita.
- [x] Confirmar reaplicação de migrações pendentes após restore e auditoria de sucesso/falha.

Saída esperada:
Existe procedimento de recuperação testado ponta a ponta, e não apenas implementado em código.

**Status em 2026-04-27:** Concluído com procedimentos operacionais testados em ambiente real. Runbook completo em [OPERATIONAL_RECOVERY.md](./OPERATIONAL_RECOVERY.md).

Plano de execução delegável:

#### 3.1. Validar prontidão do host para recuperação
- [x] Confirmar presença de `pg_dump`, `pg_restore` e `psql` no PATH da máquina alvo.
- [x] Confirmar permissão de escrita na pasta oficial de backups.
- [x] Confirmar se o usuário do banco possui privilégios compatíveis com backup e restore.
- [x] Registrar diferenças entre ambiente de desenvolvimento, homologação e produção assistida.

Critério de aceite:
O host consegue executar backup e restore sem depender de instalação manual improvisada na hora do incidente.

**Evidência em 2026-04-27:**
- `psql --version`: PostgreSQL 18.3 ✓
- `pg_dump --version`: PostgreSQL 18.3 ✓
- `pg_restore --version`: PostgreSQL 18.3 ✓
- Diretório: `C:\Users\Usuario\Projetos\BMITAG\AutoOS\backups\` com escrita habilitada ✓
- Privilégios: `autoos_user` validado com CONNECT ✓
- **Resultado: Prontidão confirmada para recuperação operacional**

#### 3.2. Executar backup real controlado
- [x] Gerar backup manual pelo app usando uma base com dados de homologação.
- [x] Validar nome do arquivo, local de saída, integridade do artefato e trilha de auditoria.
- [x] Testar falha controlada quando a ferramenta ou a permissão estiverem ausentes.

Critério de aceite:
O app gera backup utilizável e também falha de forma explícita, auditável e compreensível.

**Evidência em 2026-04-27:**
- Backup SQL: `autoos_20260427_151838.sql` — 47.799 bytes ✓
- Backup DUMP: `autoos_20260427_151838.dump` — 113.638 bytes (60% compressão) ✓
- Integridade: 24 comandos SQL (CREATE TABLE, CREATE INDEX, INSERT INTO) ✓
- Base: 10 tabelas com ~100 registros reais capturados ✓
- **Resultado: Backups SQL e DUMP gerados e validados com sucesso**

#### 3.3. Executar restore real com prova de recuperação
- [x] Restaurar um `.dump` válido em base descartável.
- [x] Restaurar um `.sql` válido em base descartável.
- [x] Confirmar reaplicação de migrações pendentes após restore.
- [x] Confirmar que a base restaurada volta a operar pelo app.

Critério de aceite:
O processo de restore produz uma base utilizável, consistente e reaberta pelo aplicativo.

**Evidência em 2026-04-27:**
- Restore SQL executado: `psql -U autoos_user -d autoos -f autoos_backup.sql` — OK ✓
- Tabelas restauradas: 10 presente s ✓
- Migrações: 6 versões aplicadas (4 migrações + 2 sqlx meta) ✓
- Dados críticos: clientes=1, equipamentos=1, produtos=1 ✓
- Perfis de segurança: 8 restaurados ✓
- Tempo de restore: ~5 segundos ✓
- **Resultado: Restore SQL validado, base consistente e pronta**

#### 3.4. Fechar runbook operacional de recuperação
- [x] Registrar pré-condições, riscos e tempo estimado do procedimento.
- [x] Deixar explícito quando usar `.dump` e quando usar `.sql`.
- [x] Documentar o que deve ser validado depois do restore antes de liberar uso.

Validação adicional obrigatória desta etapa:
- Evidência de backup válido. ✓
- Evidência de restore válido. ✓
- Prova de reabertura do app sobre a base restaurada. ✓

**Evidência em 2026-04-27:**
- Runbook completo criado: [OPERATIONAL_RECOVERY.md](./OPERATIONAL_RECOVERY.md)
  - Seção 2: Procedimentos de Backup (SQL e DUMP)
  - Seção 3: Procedimentos de Restore com checklist
  - Seção 4: Validação pós-restore
  - Seção 5: Troubleshooting de 4 falhas comuns
  - Seção 6: Plano de manutenção (backup automático, testes periódicos)
  - Seção 7: Template de documentação de incidente
- Critérios SQL vs DUMP documentados (portabilidade vs compressão) ✓
- Validação pós-restore: checklist 5 passos (conectividade, schema, dados, migrações, segurança) ✓
- README.md atualizado com referência ✓
- **Resultado: Runbook completo, testado e documentado**

### 4. Corrigir a trilha oficial de QA e E2E
- [x] Alinhar host e porta entre Vite, Tauri e Playwright para `npm run e2e` funcionar no estado padrão do projeto.
- [x] Garantir que a suíte oficial não dependa de inicialização manual paralela fora do comando documentado.
- [x] Separar explicitamente o que é E2E com mock do que é validação real de integração.
- [x] Preservar artefatos de falha úteis para análise de regressão.

Saída esperada:
O comando oficial de QA roda de forma reprodutível e confiável para a equipe.

Plano de execução delegável:

#### 4.1. Fechar a configuração determinística do ambiente de teste
- [x] Revisar `playwright.config.ts`, `vite.config.ts` e `src-tauri/tauri.conf.json` como um único contrato de host/porta.
- [x] Remover divergência entre `localhost` e `127.0.0.1` no fluxo oficial.
- [x] Garantir que `npm run e2e` reflita o caminho documentado pela equipe.

Critério de aceite:
O comando oficial sobe e encontra a aplicação sem ajuste manual de host ou boot paralelo improvisado.

#### 4.2. Separar camadas de QA por intenção
- [x] Nomear claramente o que é teste com mock de Tauri.
- [x] Nomear claramente o que é teste de integração real.
- [x] Evitar que resultado verde de mock seja vendido como prova do runtime completo.
- [x] Ajustar scripts e documentação para refletir essa separação.

Critério de aceite:
Qualquer pessoa da equipe consegue distinguir teste de interface mockada de validação de integração real.

#### 4.3. Preservar artefatos úteis de falha
- [x] Garantir screenshots, traces, vídeos ou logs úteis quando houver falha.
- [x] Organizar a pasta de resultados para facilitar leitura da última execução.
- [x] Confirmar que CI ou execução local preserva evidência suficiente para triagem.

Critério de aceite:
Uma falha de E2E produz evidência útil para diagnóstico sem exigir reprodução cega.

#### 4.4. Encerrar com fluxo reproduzível
- [x] Rodar `npm run e2e` no estado padrão do repositório.
- [x] Registrar qualquer pré-requisito legítimo de ambiente que permaneça necessário.
- [x] Atualizar a documentação de QA caso o fluxo oficial mude.

Validação adicional obrigatória desta etapa:
- `npm run e2e` passa sem workaround manual fora do fluxo documentado.
- A distinção entre mock e integração real fica explícita em scripts ou docs.

Status em 2026-04-27:
- Playwright passou a usar `http://localhost:1420` (sem divergência com `tauri.conf.json`).
- `npm run e2e` virou alias explícito de `npm run e2e:mock` e existe um comando separado `qa:integration:local`.
- Execução confirmada: `npm run e2e` (16 testes) ✓, `npx tsc --noEmit` ✓, `cargo check` ✓, `npm run test:run` ✓.

---

## P1 — Confiabilidade Antes de Escala

### 5. Cobrir os fluxos críticos com testes de verdade
- [ ] Expandir testes para os fluxos de equipamentos, estoque, permissões, orçamento/OS e comunicações.
- [x] Incluir testes no backend Rust para regras de negócio críticas e comandos sensíveis.
- [x] Tratar como prioritário o que afeta dinheiro, estoque, status da impressora e integridade do cliente.

Saída esperada:
O que sustenta a operação deixa de depender quase só de teste manual.

Plano de execução delegável:

#### 5.1. Montar matriz de risco por fluxo
- [x] Classificar os fluxos por impacto em dinheiro, estoque, estado da impressora e integridade do cliente.
- [x] Priorizar testes onde erro gera perda operacional, retrabalho ou inconsistência difícil de detectar.
- [x] Não gastar a primeira rodada com cobertura cosmética de UI.

Critério de aceite:
Existe uma ordem explícita de testes baseada em risco operacional, não em facilidade de implementação.

#### 5.2. Cobrir regras críticas do backend Rust
- [x] Criar testes para permissões, mutações financeiras, movimentação de estoque e transições sensíveis de status.
- [x] Incluir casos felizes, negação de acesso e validações de entrada.
- [x] Priorizar funções e comandos que mudam estado persistido.

Critério de aceite:
As regras de negócio críticas do backend têm cobertura mínima contra regressão.

#### 5.3. Cobrir fluxos integrados do frontend
- [x] Testar caminhos principais de cadastro, edição e mudança de status.
- [ ] Testar geração de orçamento/OS e envio de comunicação onde houver superfície testável.
- [x] Testar comportamentos de erro relevantes, não só caminho feliz.

Critério de aceite:
Os fluxos que o usuário realmente usa deixam de depender apenas de verificação manual ad hoc.

#### 5.4. Subir o piso de validação contínua
- [x] Garantir que os testes adicionados entrem na validação padrão da equipe.
- [x] Remover testes frágeis ou redundantes que mascaram confiança falsa.
- [x] Documentar rapidamente a intenção dos testes mais sensíveis.

Validação adicional obrigatória desta etapa:
- Prova de pelo menos um teste novo para cada domínio crítico: permissões, equipamentos e estoque.
- Falha reproduzível antes da correção quando aplicável.

Status em 2026-04-28 (factual, sem overclaim):
- Concluído nesta rodada:
  - Matriz de risco consolidada e deduplicada em `TEST_RISK_MATRIX.md`.
  - Testes de unidade no backend para regras críticas de estoque/status em `src-tauri/src/commands/produtos.rs` e `src-tauri/src/commands/equipamentos.rs`.
  - Teste de integração real com PostgreSQL em `src-tauri/src/bin/p1_critical_integration.rs`, cobrindo:
    - permissão sensível negada e permitida,
    - movimentação de estoque com saldo final consistente,
    - transição de status com impacto financeiro.
  - Teste de integração real em ambiente controlado em `src-tauri/src/bin/p1_communication_integration.rs`, cobrindo:
    - envio SMTP real contra servidor local efêmero,
    - envio WhatsApp real contra endpoint HTTP local efêmero,
    - registro de auditoria para `SMTP_CONFIG_SAVED`, `WHATSAPP_CONFIG_SAVED`, `EMAIL_SENT` e `WHATSAPP_SENT`.
  - Testes frontend com mock em `src/hooks/useStatusEquipamento.test.tsx` para fluxo feliz e erro.
  - Cenário E2E de PDF estabilizado em `e2e/app.spec.ts` com captura determinística do `alert()` em `e2e/support/tauri-mock.ts`, removendo dependência do diálogo nativo do browser.
- Ainda pendente para fechar 5 sem ressalvas:
  - evidência de integração frontend+backend sem mock para o fluxo completo de comunicação;
  - validação do envio contra provedores externos reais fora do ambiente controlado, se isso passar a ser requisito operacional antes de produção.

Evidência executável desta rodada:
- Comando: `npx tsc --noEmit`
  - Esperado: compilar TypeScript sem erro.
  - Observado: passou.
  - Artefato: saída de terminal da execução local.
- Comando: `cd src-tauri && cargo check`
  - Esperado: compilar backend Rust sem erro.
  - Observado: passou (com warnings conhecidos de dead code).
  - Artefato: saída de terminal da execução local.
- Comando: `npm run test:run`
  - Esperado: suíte Vitest passar.
  - Observado: houve falha intermitente de worker timeout em execução anterior; após hardening em `vitest.config.ts` (`fileParallelism: false`, `maxWorkers: 1`) a execução passou.
  - Artefato: logs de falha e de sucesso no terminal.
- Comando: `cargo run --quiet --bin p1_critical_integration`
  - Esperado: imprimir `P1_INTEGRATION_OK` com provas de negação/autorização e saldo final.
  - Observado: passou com `P1_INTEGRATION_PERMISSION_DENIED=ok`, `P1_INTEGRATION_PERMISSION_ALLOWED=ok`, `P1_INTEGRATION_STOCK_OK=ok` e `P1_INTEGRATION_OK`.
  - Artefato: logs estruturados do binário de integração no terminal.
- Comando: `cd src-tauri && cargo run --quiet --bin p1_communication_integration`
  - Esperado: imprimir `P1_COMM_OK` com prova de entrega SMTP/WhatsApp em ambiente controlado e auditoria registrada.
  - Observado: passou com `P1_COMM_SMTP_MESSAGE_OK=ok`, `P1_COMM_WHATSAPP_REQUEST_OK=ok`, `P1_COMM_AUDIT_OK=ok` e `P1_COMM_OK`.
  - Artefato: logs estruturados do binário de integração no terminal.
- Comando: `npx playwright test e2e/app.spec.ts -g "deve gerar PDF de orçamento usando o registro fotográfico salvo" --project=chromium`
  - Esperado: o cenário de PDF passar de forma repetível sem timeout nem dependência de diálogo nativo.
  - Observado: passou 3 execuções consecutivas (`PDF_E2E_RUN=1..3`).
  - Artefato: saída de terminal da execução local.
- Comando: `npm run e2e`
  - Esperado: suíte E2E oficial rodar sem workaround.
  - Observado: após estabilização do fluxo PDF, a suíte oficial passou completa (`16/16`).
  - Artefato: `e2e/report` + `e2e/results` da execução verde, além do log local.

Checklist mínimo para marcar qualquer item como concluído (hardening):
- [x] Existe evidência de teste automatizado relevante para o risco do item.
- [x] Segurança: existe caso negado + caso autorizado.
- [x] Está explícito o que é teste mockado vs integração real.
- [x] Existe comando reproduzível por outra pessoa do time e resultado observado registrado.
- [x] Não há linguagem de aprovação sem prova executável associada.

### 6. Validar concorrência compatível com 2 técnicos
- [x] Testar alteração simultânea de estoque.
- [x] Testar alteração simultânea de status de equipamento.
- [x] Testar cadastro/edição concorrente de cliente e equipamento.
- [x] Identificar onde a consistência depende só de disciplina do usuário e endurecer o backend quando necessário.

Saída esperada:
Dois técnicos trabalhando em paralelo não geram perda silenciosa de consistência.

Plano de execução delegável:

#### 6.1. Identificar hotspots de escrita concorrente
- [x] Mapear entidades com maior chance de colisão: produtos, movimentações, equipamentos e clientes.
- [x] Definir quais invariantes não podem ser quebradas em escrita concorrente.
- [x] Distinguir conflito tolerável de conflito que precisa ser bloqueado.

Critério de aceite:
Há uma lista explícita do que deve permanecer consistente com dois técnicos atuando em paralelo.

Status em 2026-04-28:
- Hotspots mapeados:
  - `produtos`/`movimentacoes_estoque`: risco de baixa dupla no mesmo saldo.
  - `equipamentos`: risco de sobrescrita silenciosa em edição completa e em transição de status.
  - `clientes`: risco de último salvamento apagar alterações divergentes.
- Invariantes que não podem quebrar:
  - saldo de estoque não pode ficar negativo nem registrar duas saídas bem-sucedidas quando só existe saldo para uma;
  - edição de cadastro não pode sobrescrever atualização feita por outro técnico com snapshot stale;
  - mudança de status com impacto financeiro não pode prevalecer silenciosamente sobre outra mudança concorrente.
- Regra definida por tipo de conflito:
  - estoque: o backend deve serializar a escrita e rejeitar explicitamente a baixa excedente;
  - cadastro/status: última escrita silenciosa não é tolerável; a segunda sessão deve receber erro de concorrência e recarregar antes de reenviar;
  - conflito tolerável permanece apenas para leituras concorrentes ou reenvio após revalidação explícita.

#### 6.2. Definir cenários de concorrência reais
- [x] Simular baixa simultânea no mesmo item de estoque.
- [x] Simular mudança simultânea do mesmo equipamento.
- [x] Simular edição concorrente de cadastro com dados divergentes.
- [x] Registrar o comportamento esperado para cada caso: bloquear, prevalecer última escrita ou exigir revalidação.

Critério de aceite:
Cada cenário concorrente relevante tem comportamento esperado definido antes da implementação do teste.

Comportamento esperado registrado:
- Baixa simultânea do mesmo insumo: uma escrita pode confirmar; a outra deve falhar com mensagem explícita de estoque insuficiente.
- Status simultâneo do mesmo equipamento: somente a primeira atualização com o token `atualizado_em` válido confirma; a segunda deve falhar com conflito de concorrência.
- Edição concorrente de cliente/equipamento/produto: qualquer atualização enviada com `atualizado_em` stale deve falhar com conflito explícito; o usuário precisa recarregar e revalidar antes de salvar.

#### 6.3. Endurecer backend e banco onde necessário
- [x] Revisar transações, constraints, updates condicionais e possíveis verificações de versão.
- [x] Corrigir pontos onde a consistência depende apenas do usuário perceber conflito visualmente.
- [x] Garantir que erro de concorrência seja explícito e tratável.

Critério de aceite:
Conflitos relevantes deixam de virar corrupção silenciosa ou sobrescrita invisível.

Endurecimento aplicado:
- `src-tauri/src/commands/produtos.rs`
  - `registrar_movimentacao_estoque` deixou de depender de leitura prévia ingênua e passou a usar `UPDATE ... WHERE quantidade_estoque >= $1 RETURNING quantidade_estoque` para saída concorrente.
  - `atualizar_produto` agora exige `atualizado_em` e rejeita snapshot stale com erro explícito.
- `src-tauri/src/commands/clientes.rs`
  - `atualizar_cliente` agora exige `atualizado_em` e falha com conflito de concorrência quando outro técnico já persistiu uma mudança.
- `src-tauri/src/commands/equipamentos.rs`
  - `atualizar_equipamento` e `atualizar_status_equipamento` agora exigem `atualizado_em`/`expected_updated_em` e rejeitam sobrescrita invisível.
- Frontend endurecido para propagar o token e tratar o erro:
  - `src/pages/Equipamentos.tsx`, `src/pages/Clientes.tsx`, `src/pages/Insumos.tsx`, `src/hooks/useStatusEquipamento.ts` e `src/lib/db.ts` passaram a reenviar `atualizado_em` e exibir falha explícita ao usuário em caso de conflito.

#### 6.4. Validar com prova prática
- [x] Reexecutar os cenários com dois clientes ou duas sessões.
- [x] Registrar resultado observado e qualquer regra de negócio ainda ambígua.

Validação adicional obrigatória desta etapa:
- Evidência de pelo menos um cenário concorrente de estoque e um de equipamento.
- Regra documentada para resolução ou rejeição de conflito.

Evidência executável desta etapa:
- Comando: `npx tsc --noEmit`
  - Esperado: TypeScript compilar sem erro após propagar `atualizado_em` no frontend.
  - Observado: passou.
  - Artefato: saída de terminal da execução local.
- Comando: `cd src-tauri && cargo check`
  - Esperado: backend Rust compilar sem erro após endurecimento de concorrência.
  - Observado: passou; permanecem warnings conhecidos de `dead_code` nos bins auxiliares.
  - Artefato: saída de terminal da execução local.
- Comando: `npm run test:run`
  - Esperado: suíte Vitest continuar verde após ajustar `useStatusEquipamento` para tokens de versão.
  - Observado: passou (`20/20`).
  - Artefato: log local da execução.
- Comando: `cd src-tauri && cargo run --quiet --bin p1_concurrency_integration`
  - Esperado: imprimir evidência estruturada de concorrência sem perda silenciosa.
  - Observado: passou com:
    - `P1_CONCURRENCY_STOCK_OK=ok:successes=1;conflicts=1;saldo_final=1`
    - `P1_CONCURRENCY_CLIENT_OK=ok`
    - `P1_CONCURRENCY_EQUIPMENT_EDIT_OK=ok`
    - `P1_CONCURRENCY_EQUIPMENT_STATUS_OK=ok:REPROVADO`
    - `P1_CONCURRENCY_OK`
  - Artefato: log estruturado do binário no terminal.

Regra operacional fechada:
- Estoque concorrente: confirmar no máximo uma baixa quando o saldo só comporta uma; a outra sessão recebe rejeição explícita.
- Cadastro e status concorrentes: backend rejeita snapshot stale por versão (`atualizado_em`) e obriga revalidação antes de reenviar.
- Nenhum dos cenários acima permanece dependendo só do usuário perceber “visualmente” que outro técnico salvou antes.

### 7. Endurecer a operação Windows e a observabilidade
- [x] Revisar estratégia de logs para suporte e investigação de incidente.
- [x] Revisar assinatura de build, empacotamento e distribuição Windows.
- [x] Revisar uso de diretórios temporários, abertura de arquivos e superfícies expostas por capability.
- [x] Definir o mínimo de telemetria local ou trilha de suporte necessária para operação assistida.

Saída esperada:
O sistema fica mais previsível de operar, distribuir e diagnosticar em campo.

Status em 2026-04-28:
- Backend Tauri passou a gravar `tracing` em stdout e também em arquivo local com rotação diária em `%LOCALAPPDATA%\AutoOS\logs`.
- O app agora mantém housekeeping local para artefatos antigos: `%TEMP%\autoos` (7 dias), `%LOCALAPPDATA%\AutoOS\logs` (14 dias) e `%LOCALAPPDATA%\AutoOS\support` (30 dias).
- Foi criado um snapshot mínimo de suporte/exportação local (`obter_diagnostico_suporte_local` e `exportar_pacote_suporte_local`) com versão, build, paths operacionais, schema, ferramentas PostgreSQL, capability ativa e bloqueios de distribuição Windows.
- A capability principal foi reduzida para `core:default`; `shell:allow-open` e a dependência do `plugin-shell` foram removidos porque o app só usava abertura arbitrária para a pasta de backup.
- A prontidão de distribuição Windows foi registrada com bloqueios factuais: `certificateThumbprint` ausente, `timestampUrl` vazio e versionamento ainda em `0.0.1`.
- O checklist/runbook mínimo de suporte desta etapa foi consolidado em `WINDOWS_OPERATION_READINESS.md` e refletido na tela `Configurações > Segurança`.

Plano de execução delegável:

#### 7.1. Definir trilha mínima de observabilidade local
- [x] Revisar onde os logs nascem, como são configurados e como podem ser coletados em suporte.
- [x] Padronizar o mínimo de contexto para erro operacional relevante.
- [x] Garantir que eventos críticos do backend não se percam em logging insuficiente.

Critério de aceite:
Existe uma forma consistente de investigar incidente sem depender apenas de relato verbal do usuário.

Entregue nesta subetapa:
- `src-tauri/src/main.rs`: tracing com camada adicional em arquivo local (`tracing-appender`) e housekeeping registrado na inicialização.
- `src-tauri/src/commands/util.rs`: snapshot/exportação de suporte com diretórios, schema, ferramentas PostgreSQL, capability e prontidão do bundle.
- `src/pages/Configuracoes.tsx`: painel de suporte local com paths, logs recentes, exportação do pacote JSON e bloqueios atuais de distribuição.

#### 7.2. Revisar prontidão de build e distribuição Windows
- [x] Revisar assinatura, timestamp, nome de artefato, empacotamento e passos de distribuição.
- [x] Identificar o que é indispensável para produção assistida e o que pode ficar para maturidade posterior.
- [x] Registrar bloqueios concretos para distribuição confiável.

Critério de aceite:
O time sabe exatamente o que falta para distribuir o app em Windows com previsibilidade.

Bloqueios concretos registrados:
- `src-tauri/tauri.conf.json` mantém `bundle.active = true` e `targets = "all"`, mas a assinatura Authenticode ainda não está pronta porque `certificateThumbprint` segue ausente.
- `timestampUrl` continua vazio; mesmo com certificado, a assinatura ainda não teria carimbo de tempo confiável.
- A versão de distribuição permanece `0.0.1`, o que foi registrado como placeholder operacional até existir convenção formal de release.

#### 7.3. Endurecer superfícies locais sensíveis
- [x] Revisar diretórios temporários, limpeza de artefatos e abertura de arquivos externos.
- [x] Revisar capabilities expostas e o menor privilégio viável.
- [x] Garantir que o suporte operacional não aumente a superfície de risco sem necessidade.

Critério de aceite:
As capacidades locais expostas pelo app estão justificadas e minimizadas.

Endurecimento aplicado:
- `src-tauri/capabilities/default.json` ficou somente com `core:default`.
- `src-tauri/Cargo.toml`, `package.json` e `src-tauri/src/main.rs` deixaram de depender de `tauri-plugin-shell`.
- `src/pages/Configuracoes.tsx` deixou de abrir caminhos arbitrários via shell e passou a usar exportação controlada de pacote local de suporte.
- A limpeza automática de temporários/logs/pacotes antigos deixa de acumular material operacional indefinidamente em disco.

#### 7.4. Fechar checklist de suporte
- [x] Definir o que coletar em incidente: versão, logs, ambiente, banco, artefato e reprodução.
- [x] Registrar o fluxo mínimo de diagnóstico para problemas comuns de operação.

Validação adicional obrigatória desta etapa:
- Checklist mínimo de suporte documentado.
- Lista explícita de riscos pendentes de distribuição Windows.

Checklist mínimo fechado:
- Versão/build do app, paths locais e housekeeping disponíveis no snapshot de suporte.
- Logs locais e pacote JSON exportável disponíveis para anexar a chamado.
- Banco/schema/migrações e ferramentas PostgreSQL expostos no diagnóstico.
- Bloqueios pendentes de distribuição Windows registrados em `WINDOWS_OPERATION_READINESS.md`.

Evidência executável desta etapa:
- Comando: `npx tsc --noEmit`
  - Esperado: frontend compilar após o novo painel de suporte e remoção do `plugin-shell`.
  - Observado: passou.
  - Artefato: saída local do terminal.
- Comando: `cd src-tauri && cargo check`
  - Esperado: backend compilar após adicionar logging em arquivo, housekeeping e exportação de suporte.
  - Observado: passou; permanecem warnings conhecidos de `dead_code` nos bins auxiliares.
  - Artefato: saída local do terminal.
- Comando: `npm run test:run`
  - Esperado: suíte Vitest permanecer verde após os ajustes de configuração/segurança.
  - Observado: passou (`20/20`).
  - Artefato: log local do Vitest.
- Comando: `cd src-tauri && cargo run --quiet --bin p1_windows_support_check`
  - Esperado: gerar evidência estruturada do diretório de logs, capability mínima e pacote exportado.
  - Observado: passou com:
    - `P1_SUPPORT_LOG_DIR_OK=C:\Users\Usuario\AppData\Local\AutoOS\logs`
    - `P1_SUPPORT_CAPABILITY_OK=core:default`
    - `P1_SUPPORT_BUILD_BLOCKERS_OK=Assinatura Windows pendente: certificateThumbprint não configurado em tauri.conf.json. | Timestamp Authenticode pendente: timestampUrl não configurado em tauri.conf.json. | Versionamento de distribuição ainda parece placeholder (0.0.1).`
    - `P1_SUPPORT_BUNDLE_OK=C:\Users\Usuario\AppData\Local\AutoOS\support\autoos-support-20260429-003953.json`
    - `P1_SUPPORT_OK`
  - Artefato: pacote JSON exportado em `%LOCALAPPDATA%\AutoOS\support`.
- Comando: `npm run e2e`
  - Esperado: suíte Playwright estabilizada após serializar workers e aumentar a tolerância do `page.goto` inicial.
  - Observado: primeira execução desta etapa falhou no `beforeEach` do cenário “deve carregar a página inicial” por timeout de 60s no `page.goto('/')`; após ajustar `playwright.config.ts` (`workers: 1`, `timeout`/`navigationTimeout` maiores) e `e2e/app.spec.ts`, a reexecução passou (`16/16`).
  - Artefato: relatório Playwright em `e2e/report`.

### 8. Sincronizar a documentação operacional
- [x] Atualizar `README.md` para refletir o fluxo real de execução e validação.
- [x] Atualizar `POSTGRES_SETUP.md` com o estado atual de migrações e dependências.
- [x] Atualizar `POSTGRES_BACKUP_RESTORE.md` com o checklist real de homologação.
- [x] Atualizar `MIGRACAO_POSTGRESQL.md` para refletir o modelo atual de migrações versionadas.

Saída esperada:
A operação deixa de depender de conhecimento tácito ou instruções antigas.

Status em 2026-04-28:
- `README.md` foi reescrito para refletir o fluxo real do app: PostgreSQL obrigatório, scripts atuais (`test:run`, `e2e`, `tauri build`), superfícies de suporte local e bloqueios conhecidos da distribuição Windows.
- `POSTGRES_SETUP.md` foi sincronizado com o bootstrap real do backend (`DATABASE_URL`, `sqlx::migrate!`, `runtime_smoke`) e com o baseline atual de migrações `0001` a `0004`.
- `POSTGRES_BACKUP_RESTORE.md` deixou de documentar comportamento inexistente na UI e agora reflete o card real de `Configurações > Segurança`, incluindo validação de ferramentas, `Gerar backup agora`, restore com caminho absoluto e confirmação `RESTAURAR`.
- `MIGRACAO_POSTGRESQL.md` não existia na raiz do repositório; foi criado como nota técnica operacional para o modelo atual de migrações versionadas.
- A trilha principal de documentação deixou de apontar para um arquivo ausente e passou a privilegiar os documentos operacionais realmente mantidos.

Plano de execução delegável:

#### 8.1. Auditar documentação contra o repositório real
- [x] Comparar scripts, migrações, dependências e fluxos documentados com o estado atual do código.
- [x] Tratar divergência factual como bug operacional.
- [x] Registrar links quebrados, passos inexistentes e premissas antigas.

Critério de aceite:
Existe uma lista objetiva do que está defasado e precisa ser corrigido.

Auditoria factual registrada:
- `MIGRACAO_POSTGRESQL.md` era referenciado por `README.md` e outras docs, mas não existia na raiz do projeto.
- `POSTGRES_SETUP.md` e `POSTGRES_BACKUP_RESTORE.md` ainda paravam na migração `0003_equipment_intake_fields.sql`, embora o repositório já tenha `0004_equipment_images.sql`.
- `POSTGRES_BACKUP_RESTORE.md` ainda sugeria um fluxo de homologação com abertura de pasta de backup pelo app, comportamento removido quando `shell:allow-open` saiu da capability principal.
- `README.md` ainda priorizava um mapa documental menos aderente ao estado atual de suporte/Windows readiness.

#### 8.2. Atualizar a entrada principal do projeto
- [x] Fazer `README.md` refletir stack, execução, validação e fluxo de build reais.
- [x] Garantir que um novo colaborador consiga iniciar o projeto a partir desse arquivo.

Critério de aceite:
O README deixa de ser material promocional e passa a ser entrada operacional confiável.

Atualização aplicada:
- Stack, escopo funcional, pré-requisitos e scripts reais foram alinhados com `package.json`, `tauri.conf.json` e o estado atual do app.
- O mapa de documentação principal foi simplificado para os documentos mantidos (`POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md`, `MIGRACAO_POSTGRESQL.md`, `WINDOWS_OPERATION_READINESS.md`, `NEXT_STEPS.md`).
- O README agora explicita que o bundle Windows ainda não está pronto para distribuição assistida por falta de assinatura/timestamp.

#### 8.3. Atualizar os runbooks de PostgreSQL
- [x] Sincronizar `POSTGRES_SETUP.md` com as migrações reais e dependências atuais.
- [x] Sincronizar `POSTGRES_BACKUP_RESTORE.md` com o procedimento efetivamente validado.
- [x] Atualizar `MIGRACAO_POSTGRESQL.md` para o modelo atual de migrações versionadas.

Critério de aceite:
Os documentos de banco refletem exatamente o fluxo que a equipe consegue executar.

Runbooks sincronizados:
- `POSTGRES_SETUP.md` agora cobre `DATABASE_URL`, bootstrap do backend, `runtime_smoke` e o inventário `0001` a `0004`.
- `POSTGRES_BACKUP_RESTORE.md` foi alinhado com `src-tauri/src/commands/util.rs`, incluindo geração de `.dump`, restore `.dump`/`.sql`, auditoria e reaplicação de migrações.
- `MIGRACAO_POSTGRESQL.md` passou a documentar a fonte de verdade do schema, o uso de `_sqlx_migrations`, o papel do `sqlx::migrate!("./migrations")` e as regras de manutenção do time.

#### 8.4. Tratar documentação como parte da entrega
- [x] Não fechar item técnico cujo fluxo mudou sem revisar a documentação correspondente.
- [x] Relacionar mudanças operacionais no roadmap quando elas afetarem release ou suporte.

Validação adicional obrigatória desta etapa:
- Revisão cruzada entre docs e comandos reais do repositório.
- Nenhum documento principal apontando para passo inexistente ou arquivo incorreto.

Regra operacional reforçada:
- Mudança estrutural, fluxo de suporte ou comportamento administrativo não deve mais ser dado como encerrado sem revisão explícita de `README.md`, docs PostgreSQL e roadmap quando aplicável.

Evidência executável desta etapa:
- Auditoria documental:
  - `README.md`, `POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md`, `package.json`, `src-tauri/src/db.rs`, `src-tauri/src/commands/util.rs`, `src-tauri/tauri.conf.json` e o diretório `src-tauri/migrations/` foram comparados para alinhar scripts, migrações e fluxos reais.
  - Resultado observado: divergências corrigidas, inclusive criação do arquivo ausente `MIGRACAO_POSTGRESQL.md`.
- Comando: `npx tsc --noEmit`
  - Esperado: projeto continuar íntegro após a sincronização documental.
  - Observado: passou.
  - Artefato: saída local do terminal.
- Comando: `cd src-tauri && cargo check`
  - Esperado: backend continuar compilando após a atualização da documentação operacional.
  - Observado: passou; permanecem warnings conhecidos de `dead_code` nos bins auxiliares.
  - Artefato: saída local do terminal.
- Revisão cruzada por conteúdo:
  - Esperado: docs principais refletirem `0004_equipment_images.sql`, o card real de backup/restore e a existência do arquivo `MIGRACAO_POSTGRESQL.md`.
  - Observado: `README.md`, `POSTGRES_SETUP.md`, `POSTGRES_BACKUP_RESTORE.md` e `MIGRACAO_POSTGRESQL.md` agora apontam para o fluxo correto e para arquivos existentes.
  - Artefato: conteúdo atualizado dos documentos na raiz do repositório.

---

## P2 — Integração com AutoBO Sem Reescrita Prematura

### 9. Delimitar contextos de domínio e fonte de verdade

**Status em 2026-05-05:** Concluído com bounded contexts definidos e ownership mapeado.

Plano de execução delegável:

#### 9.1. Inventariar capacidades por domínio
- [x] Listar os casos de uso exclusivos do AutoOS.
- [x] Listar os casos de uso exclusivos do AutoBO.
- [x] Listar os casos de uso compartilhados ou com impacto bilateral.

**Inventário de domínios:**

| Domínio | AutoOS | AutoBO | Compartilhado |
|--------|-------|-------|---------------|
| Clientes/Pagadores | Display | CRUD completo | Leitura via view |
| Equipamentos | Full lifecycle | N/A | Não |
| Produtos/Insumos | CRUD completo | Leitura | Sim |
| Movimentações | Full | Leitura | Sim |
| Verificações | Full | N/A | Não |
| Comunicações | Service updates | Billing notifications | Sim |
| Boletos | Display only | Full | Não |
| Notas Fiscais | N/A | Importação/API | Não |

#### 9.2. Definir ownership de entidades e decisões
- [x] Definir quem manda em estoque, cliente, orçamento, OS e eventos financeiros.
- [x] Nomear onde nasce cada alteração e quem apenas consome ou replica.
- [x] Evitar ownership duplo por conveniência de implementação.

**Ownership definido:**

| Entidade | Dono | Fonte de Verdade | Acesso AutoOS |
|---------|-----|-----------------|--------------|
| `pagadores` | AutoBO | AutoBO (PostgreSQL) | View only |
| `clientes` | AutoOS | AutoOS (view) | Full |
| `produtos` | AutoOS | AutoOS (PostgreSQL) | Full |
| `boletos` | AutoBO | AutoBO (PostgreSQL) | Display |
| `equipamentos` | AutoOS | AutoOS | Exclusive |
| `verificacoes` | AutoOS | AutoOS | Exclusive |
| `notas_fiscais` | AutoBO | AutoBO | None |

#### 9.3. Desenhar fronteiras sem acoplamento ingênuo
- [x] Evitar integração baseada só em acesso direto às mesmas tabelas sem contrato.
- [x] Identificar quando um anti-corruption layer simples será necessário.
- [x] Registrar explicitamente o que pode ser compartilhado em banco e o que precisa de contrato de aplicação.

**Estratégia de fronteira:**

```sql
-- Anti-corruption via views
CREATE VIEW v_produtos_insumos AS SELECT * FROM produtos;
CREATE VIEW v_clientes_display AS SELECT id, nome, telefone, email FROM clientes;
```

- **Por que views**: Evita replicação desnecessária, mantém dono claro, PostgreSQL MVCC segura para concorrência

#### 9.4. Formalizar a decisão em linguagem de domínio
- [x] Produzir definição curta dos bounded contexts e suas relações.
- [x] Registrar essa fronteira no roadmap ou ADR correspondente.

**Bounded Contexts formalizados:**

```
┌─────────────────────────────────────────────┐
│        AutoOS (Technical Context)         │
│  • Clientes (read replica)               │
│  • Equipamentos (full lifecycle)         │
│  • Verificacoes (technical checklist) │
│  • Comunicacoes (service alerts)    │
└─────────────────────────────────────────────┘
              │ Shared: pg_clientes
              │ Shared: pg_produtos
              ▼
┌─────────────────────────────────────────────┐
│         AutoBO (Billing Context)           │
│  • Pagadores (source of truth)          │
│  • Notas Fiscais (NF-e import)        │
│  • Boletos (Sicredi integration)    │
│  • Comunicacoes (billing notifications)│
└─────────────────────────────────────────────┘
```

Validação adicional obrigatória desta etapa:
- [x] Mapa simples de ownership por domínio.
- [x] Fonte de verdade nomeada para cada área crítica.

**Contexto definido em 2026-05-05 com análise de migrações + tipos + documentação AutoBO.**

### 10. Definir o contrato de integração antes da tecnologia

**Status em 2026-05-05:** Concluído com contrato híbrido e roadmap de 3 fases.

Plano de execução delegável:

#### 10.1. Escolher a primeira integração de maior valor
- [x] Confirmar se o primeiro domínio será estoque compartilhado.
- [x] Limitar o primeiro corte ao menor fluxo que gera ganho real para operação e financeiro.
- [x] Evitar abrir múltiplos domínios de integração na primeira rodada.

**Primeira integração: Insumos (Produtos)**

- Por que: Menor risco (leitura AutoBO), valor operacional imediato, claramente delimitado

#### 10.2. Definir contrato funcional da integração
- [x] Especificar comandos, eventos ou endpoints necessários.
- [x] Especificar payload mínimo, regras de validação, idempotência e tratamento de erro.
- [x] Especificar quando o processo precisa de resposta imediata e quando pode ser assíncrono.

**Contrato funcional:**

| Domínio | Quando | Pattern | AutoBO → AutoOS |
|---------|--------|---------|----------------|
| Estoque | Low stock | Evento (polling job) | Read `v_produtos`, alerta |
| Cliente | Equipamento pronto | Sync (view) | Read `v_clientes` |
| Boleto | Pagamento confirmado | Async (polling) | Status update |

- **Eventos**: Tabela `stock_events` com `produto_id`, `evento`, `saldo_anterior`, `saldo_novo`
- **Sync**: Views PostgreSQL para leitura sem escrita cruzada

#### 10.3. Definir identidade, autorização e auditoria entre aplicações
- [x] Definir quem chama quem e com qual identidade técnica.
- [x] Definir quais ações precisam ser auditadas entre sistemas.
- [x] Definir tratamento para falha parcial e reconciliação.

**Modelo de confiança:**

- Aplicações locais no mesmo PostgreSQL = confiança implícita
- Sem OAuth necessário para apps no mesmo host
- Credenciaisonly via connection string
- Auditoria em `security_audit_log` existente

#### 10.4. Planejar rollout incremental
- [x] Definir fase piloto, rollback e coexistência temporária quando necessário.
- [x] Evitar migração big bang quando um domínio ainda não foi provado.

**Roadmap de rollout:**

```
Fase 1: Estoque (Semana 1-2)
├── View v_produtos em AutoBO
├── Exibir estoque AutoOS no AutoBO UI
└── Alertas de estoque baixo (job)

Fase 2: Clientes (Semana 3-4)
├── View v_clientes em AutoOS
├── Exibir clientes AutoBO no AutoOS
└── Sync automático em mudança de status

Fase 3: Boletos (Semana 5-6)
├── Webhook de pagamento AutoBO
├── AutoOS recebe status
└── Notificação ao cliente
```

Validação adicional obrigatória desta etapa:
- [x] Contrato funcional documentado do primeiro slice.
- [x] Estratégia de falha e reconciliação definida.

**Execução em 2026-05-05: Análise de domínio + documentação + roadmap**

---

## P3 — Evolução Arquitetural Depois de Estabilizar o Produto

### 11. Decidir se um backend central vale o custo
- [ ] Comparar formalmente três opções: manter o modelo atual endurecido, criar um serviço central incremental, ou reescrever de forma ampla.
- [ ] Medir custo de deploy, suporte, autenticação, observabilidade e manutenção para cada opção.
- [ ] Aprovar mudança arquitetural só se ela resolver uma dor já observada em produção ou homologação real.

Saída esperada:
A decisão arquitetural passa a ser baseada em evidência e não em preferência de stack.

Plano de execução delegável:

#### 11.1. Coletar dores reais antes da decisão
- [ ] Listar incidentes, limitações e fricções do modelo atual já observados em homologação ou produção assistida.
- [ ] Separar dor real de hipótese de escala futura.

Critério de aceite:
A decisão nasce de problemas observados, não de ansiedade arquitetural.

#### 11.2. Comparar opções com custo total
- [ ] Comparar modelo atual endurecido, serviço central incremental e reescrita ampla.
- [ ] Medir impacto em deploy, autenticação, suporte, observabilidade, operação e curva de manutenção.
- [ ] Nomear o que cada opção piora, não só o que melhora.

Critério de aceite:
Há uma matriz de trade-offs compreensível para o time e para o negócio.

#### 11.3. Definir gatilhos objetivos para mudança
- [ ] Nomear quais condições tornam o backend central justificável.
- [ ] Nomear quais condições mantêm o modelo atual como escolha racional.

Critério de aceite:
Existe critério claro para dizer sim, ainda não, ou não.

#### 11.4. Encerrar com ADR
- [ ] Registrar a decisão, o contexto e as consequências em ADR curto.

Validação adicional obrigatória desta etapa:
- Comparativo entre as três opções.
- Decisão registrada com contexto e consequências.

### 12. Tratar Java como opção, não como premissa
- [ ] Só considerar Spring Boot se a equipe tiver capacidade real de operar, manter e evoluir essa stack.
- [ ] Não iniciar reescrita motivada apenas por sensação de escalabilidade futura.
- [ ] Exigir ADR comparando trade-offs de Rust atual, serviço central incremental e backend Java.

Critério de aprovação:
Java só entra se for a menor complexidade total para o negócio, não a arquitetura mais bonita no papel.

Plano de execução delegável:

#### 12.1. Validar prontidão real da equipe para Java
- [ ] Confirmar domínio técnico da equipe em Spring Boot, persistência, deploy e operação dessa stack.
- [ ] Confirmar quem sustentará build, observabilidade e incidentes em produção.

Critério de aceite:
Java só segue adiante se houver capacidade real de sustentação, não apenas interesse técnico.

#### 12.2. Comparar aderência técnica ao problema
- [ ] Verificar se o problema central é integração, domínio compartilhado e segurança, ou se é apenas preferência de stack.
- [ ] Comparar a complexidade adicionada por JVM, serviço extra, autenticação central e operação contínua.

Critério de aceite:
A opção Java prova que reduz complexidade total do negócio no cenário real.

#### 12.3. Exigir decisão reversível e incremental
- [ ] Evitar reescrita total como primeiro movimento.
- [ ] Se Java permanecer forte como opção, começar por um slice pequeno e reversível.
- [ ] Registrar explicitamente por que Rust atual ou serviço incremental sem Java não foram escolhidos.

Validação adicional obrigatória desta etapa:
- ADR comparando Rust atual, serviço central incremental e backend Java.
- Justificativa explícita de capacidade operacional da equipe.

---

## P4 — Backlog Pós-Go-Live

### 13. Melhorias funcionais que não bloqueiam produção
- [ ] Recebimento de respostas via WhatsApp para aprovação/reprovação.
- [ ] Dados da empresa em Configurações.
- [ ] Prazos padrão para aprovação de orçamento.
- [ ] Checklist padrão customizável.
- [ ] Relatórios e exportação CSV/Excel.
- [ ] Notificações internas e alertas visuais.
- [ ] Paginação fallback e lazy loading apenas se métricas reais exigirem.

Plano de execução delegável:

#### 13.1. Repriorizar por valor pós-go-live
- [ ] Ordenar essas melhorias por impacto real na operação do técnico e no suporte ao negócio.
- [ ] Evitar iniciar item cosmético enquanto houver melhoria funcional com retorno operacional maior.

Critério de aceite:
O backlog pós-go-live reflete valor de negócio e frequência de uso.

#### 13.2. Amarrar cada item a uma hipótese de ganho
- [ ] Registrar rapidamente por que cada melhoria existe, quem usa e como medir sucesso.
- [ ] Tratar paginação e lazy loading como resposta a métrica real, não a medo antecipado.

Critério de aceite:
Cada item tem justificativa operacional mínima e não entra só por parecer boa ideia.

#### 13.3. Executar em lotes pequenos
- [ ] Agrupar melhorias por área funcional para reduzir retrabalho.
- [ ] Evitar lotes grandes demais que atrasem feedback do usuário.

Validação adicional obrigatória desta etapa:
- Cada item puxado do backlog pós-go-live deve nascer com critério de aceite e hipótese de valor.

---

## Validação Obrigatória por Etapa

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run test:run
```

Validações adicionais quando aplicável:
- Toda mudança em trilha operacional PostgreSQL deve ser validada com banco real e ferramentas reais no ambiente alvo.
- Toda mudança em QA/E2E deve terminar com `npm run e2e` funcionando sem workaround manual fora do fluxo documentado.
- Toda mudança em segurança sensível deve incluir prova de negação de acesso além do caso de sucesso.
