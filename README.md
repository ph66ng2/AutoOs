# AutoOS

Sistema desktop da BMI TAG para assistência técnica de impressoras: recebe o equipamento no balcão,
acompanha a OS do orçamento à entrega, conversa com o cliente (WhatsApp, e-mail e portal) e controla o
estoque de insumos e peças.

- **App desktop** (Windows): Tauri 2 + React 18 + Rust, sobre PostgreSQL.
- **Portal do Cliente** ([status.bmitag.com.br](https://status.bmitag.com.br)): site separado onde o
  cliente acompanha a OS e responde o orçamento.
- **Versão atual:** a de `package.json` (o checklist de versão está em [docs/RELEASE.md](./docs/RELEASE.md)).

> Vai mexer no código? Leia também o [AGENTS.md](./AGENTS.md): é a fonte das regras do projeto
> (convenções, permissões, migrations, o que nunca fazer). Este README é o mapa para começar.

## Como é o sistema

Prints gerados com dados fictícios pelo teste `e2e/ui-screenshots.spec.ts` (veja
[Atualizar os prints](#atualizar-os-prints)).

| | |
|---|---|
| **Início:** resumo do dia, fila por etapa e pendências.<br>![Início](docs/telas/01-inicio.png) | **Equipamentos:** a lista de OS, com filtro por etapa e a próxima ação de cada uma.<br>![Equipamentos](docs/telas/02-equipamentos.png) |
| **OS:** etapas, orçamento, verificação, fotos, histórico e comunicação.<br>![OS](docs/telas/03-os.png) | **Clientes:** empresas e pessoas, contatos e os equipamentos de cada um.<br>![Clientes](docs/telas/04-clientes.png) |
| **Insumos e peças:** saldo, mínimo, entrada e saída de estoque.<br>![Insumos e peças](docs/telas/05-insumos.png) | **Equipe e acessos:** perfis, permissões e PIN de cada pessoa.<br>![Equipe e acessos](docs/telas/06-equipe.png) |
| **Entrar:** cada pessoa escolhe o perfil e digita o PIN dela.<br>![Entrar](docs/telas/08-entrar.png) | **Configurações:** integrações, portal, banco e segurança.<br>![Configurações do portal](docs/telas/07-config-portal.png) |
| **Portal do Cliente:** entrada com CPF/CNPJ e senha.<br>![Portal: entrar](docs/telas/09-portal-entrar.png) | **Portal do Cliente:** etapa, orçamento e contato da OS.<br>![Portal: atendimento](docs/telas/10-portal-atendimento.png) |

### O que ele faz

- **Atendimento:** Nova entrada (com rascunho), OS com 12 etapas, verificação técnica, orçamento com
  serviços e peças, aprovação, pronto e entrega. Fotos de entrada e saída, inclusive pelo celular (QR code).
- **Clientes:** PF e PJ com CPF/CNPJ validado, contatos, histórico de equipamentos e acesso ao portal.
- **Comunicação:** WhatsApp (API e mensagens prontas), e-mail por SMTP e PDFs da OS e do orçamento.
- **Estoque:** insumos e peças, movimentações, peças ligadas ao orçamento e venda avulsa de insumos.
- **Modo Balcão:** tela de toque para a recepção (entrada rápida, busca e estoque).
- **Equipe e acessos:** perfis com PIN local, permissões por função e trilha de auditoria.
- **Ao vivo:** as telas se atualizam sozinhas quando outro computador muda algo.
- **Suporte:** chamado com prints pelo próprio app (Slack), sino de avisos, backup e restore.

## Rodar na sua máquina

Pré-requisitos:

- Node.js 18+ e Rust estável;
- PostgreSQL 15+ (local serve);
- Linux (Fedora): `webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel openssl-devel librsvg2-devel`;
- Windows: Visual Studio C++ Build Tools;
- opcional, para backup/restore de verdade: `pg_dump`, `pg_restore` e `psql` no `PATH`.

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Aponte para um banco em `src-tauri/.env` (o arquivo fica só na sua máquina; nunca vai para o Git):

   ```env
   DATABASE_URL=postgres://autoos_user:SUA_SENHA@localhost:5432/autoos
   ```

3. Abra o app:

   ```bash
   npm run tauri dev
   ```

O app só confere o schema ao abrir; ele **não** aplica migrations. Para montar um banco local de teste
com as migrations e dados fictícios, use `node scripts/prepare-ui-screenshot-db.mjs` (veja o cabeçalho
do script). Em produção, migration é aplicada pelo processo de implantação
([docs/PRODUCTION_MIGRATIONS.md](./docs/PRODUCTION_MIGRATIONS.md)).

Sem banco, dá para ver a interface com dados simulados no navegador:

```bash
VITE_E2E_MOCK=1 npm run dev   # http://localhost:1420
```

## Antes de abrir um PR

```bash
npm run lint                               # TypeScript (tsc --noEmit)
npm run test:run                           # testes do frontend (Vitest)
cd src-tauri && cargo check                # Rust
cd src-tauri && cargo clippy -- -W warnings
scripts/pre-qa-check.sh                    # filtro de lixo: debug esquecido, query!, segredo, migration editada…
```

- **Testes de integração com PostgreSQL de verdade:** `npm run qa:integrations` e `npm run e2e:real`
  (lista completa no [AGENTS.md](./AGENTS.md#commands)).
- **Modelo de PR:** o `.github/pull_request_template.md` tem a seção "Novidades para o usuário". Ela vira
  a tela de novidades do app na próxima versão, então escreva frases curtas, para quem usa o app.
- **CI** (`.github/workflows/ci.yml`): lint, Vitest, cargo, QA real com PostgreSQL e prints de UI.

### Atualizar os prints

Os prints deste README saem do mesmo teste que roda no CI, com o banco fictício `test_autoos`:

```bash
DATABASE_URL=postgres://test_user:test_password@127.0.0.1:5432/test_autoos \
  AUTOOS_MIGRATION_MODE=ci node scripts/prepare-ui-screenshot-db.mjs
npm run e2e:ui-screenshots                 # gera e2e/ui-screenshots/*.png
```

Copie as telas para `docs/telas/` (largura de 1280 px). Os do portal vêm do build
`npm run build:public-status` aberto no navegador com a API simulada.

## Onde fica cada coisa

```
src/                      App (React + TypeScript)
  pages/                  Telas (Equipamentos.tsx é a maior: lista, OS e diálogos)
  components/             Componentes; ui/ = base shadcn; icones-autoos/ = ícones próprios (gerados)
  hooks/                  Acesso a dados por domínio (useClientes, useEquipamentos, …)
  lib/db.ts               Única porta para o backend (invoke); telas nunca chamam invoke direto
  public-status/          Portal do Cliente (build separado: vite.public-status.config.ts)
src-tauri/                Backend (Rust)
  src/commands/           Comandos IPC por domínio (auth, equipamentos, produtos, smtp, suporte…)
  src/db.rs               Pool global do PostgreSQL e resolução da DATABASE_URL
  migrations/             Migrations do PostgreSQL (fonte de verdade do schema)
  src/bin/                Testes de integração como binários (runtime_smoke, p1_*, test_*)
supabase/functions/       Edge Functions (portal-cliente, public-status, envio-whatsapp)
e2e/                      Testes Playwright (modo simulado e prints de UI)
design/icones/            Fonte dos ícones do menu (generate-icons)
docs/                     Documentação por assunto (índice abaixo)
```

## Documentação por assunto

| Assunto | Onde |
|---|---|
| Regras do projeto, convenções e comandos | [AGENTS.md](./AGENTS.md) |
| Instalação e configuração | [1-SETUP.md](./1-SETUP.md) |
| Produção, homologação e servidor na rede local | [2-PRODUCTION.md](./2-PRODUCTION.md), [5-LAN-SERVER-SETUP.md](./5-LAN-SERVER-SETUP.md) |
| Migrations em produção | [docs/PRODUCTION_MIGRATIONS.md](./docs/PRODUCTION_MIGRATIONS.md) |
| Versão, release e atualização automática | [docs/RELEASE.md](./docs/RELEASE.md), [docs/VERSIONING.md](./docs/VERSIONING.md), [docs/ATUALIZACAO_EXE.md](./docs/ATUALIZACAO_EXE.md) |
| Assinatura do instalador Windows | [docs/WINDOWS_CODE_SIGNING.md](./docs/WINDOWS_CODE_SIGNING.md) |
| Backup e restore | [4-BACKUP.md](./4-BACKUP.md) |
| Portal do Cliente e link de acompanhamento | [docs/PORTAL_CLIENTE.md](./docs/PORTAL_CLIENTE.md), [docs/PORTAL_STATUS_PUBLICO.md](./docs/PORTAL_STATUS_PUBLICO.md), [docs/ACEITE_ORCAMENTO_ONLINE.md](./docs/ACEITE_ORCAMENTO_ONLINE.md) |
| Equipe, perfis e PIN | [docs/TEAM_ACCESS.md](./docs/TEAM_ACCESS.md), [SECURITY_SENSITIVE_COMMAND_MATRIX.md](./SECURITY_SENSITIVE_COMMAND_MATRIX.md) |
| Estoque ligado ao orçamento e venda de insumos | [docs/ESTOQUE_ORCAMENTO.md](./docs/ESTOQUE_ORCAMENTO.md), [docs/ORCAMENTOS_INSUMOS.md](./docs/ORCAMENTOS_INSUMOS.md) |
| WhatsApp (fila e modelos da Meta) | [docs/FILA_ENVIOS_WHATSAPP.md](./docs/FILA_ENVIOS_WHATSAPP.md), [docs/MODELOS_WHATSAPP_META.md](./docs/MODELOS_WHATSAPP_META.md) |
| Modo Balcão | [docs/COUNTER_MODE_BASELINE.md](./docs/COUNTER_MODE_BASELINE.md) |
| Abertura animada (BMI TAG) | [docs/ABERTURA_BMITAG.md](./docs/ABERTURA_BMITAG.md) |
| Testes de integração e riscos | [docs/TESTES_INTEGRACAO.md](./docs/TESTES_INTEGRACAO.md), [TEST_RISK_MATRIX.md](./TEST_RISK_MATRIX.md) |
| Produto e próximos passos | [docs/PRD_AutoOS.md](./docs/PRD_AutoOS.md), [3-NEXT_STEPS.md](./3-NEXT_STEPS.md), [docs/BACKLOG_POS_GO_LIVE.md](./docs/BACKLOG_POS_GO_LIVE.md) |

## Regras que mais dão problema

Resumo; o detalhe está no [AGENTS.md](./AGENTS.md).

- **Só PostgreSQL.** Não reintroduza SQLite em código, docs ou comentários. O `sqlx` usa só queries em
  tempo de execução (`sqlx::query(...)`), nunca as macros `query!`/`query_as!`.
- **Nunca edite uma migration já aplicada.** O `sqlx` guarda o checksum de cada uma: editar quebra as
  instalações com `migration N was previously applied but has been modified`. Mudança de schema é sempre
  um arquivo novo com o próximo número, escrito de forma idempotente (`IF NOT EXISTS`; para constraint,
  `DO $$ … EXCEPTION WHEN duplicate_object …`). Cada migration nova atualiza
  `REQUIRED_PROMOTION_MIGRATIONS` e `EXPECTED_MIGRATION_COUNT` em `production_migrate.rs`.
- **Segredo não vai para o banco.** PIN, senha de SMTP e tokens ficam no cofre do sistema (keyring). A
  única exceção documentada é a senha do portal definida pela equipe (ver [docs/PORTAL_CLIENTE.md](./docs/PORTAL_CLIENTE.md)).
- **Ação sensível pede permissão e fica auditada.** Valores e decisões de orçamento exigem
  `FINANCIAL_ACTIONS` ou `PREPARE_QUOTES`; toda ação sensível chama `record_security_event()`.
- **Concorrência:** UPDATE leva `WHERE atualizado_em = $token`; sem linha afetada, é conflito.
- **Duas linhas de produto:** `master` é o AutoOS interno (em produção); `feature` é o SaaS. A `feature`
  nunca é mesclada na `master`.

## Operação e suporte

| | Linux | Windows |
|---|---|---|
| Logs | `~/.local/share/AutoOS/logs` | `%LOCALAPPDATA%\AutoOS\logs` |
| Pacotes de suporte (JSON) | `~/.local/share/AutoOS/support` | `%LOCALAPPDATA%\AutoOS\support` |
| Temporários | `/tmp/autoos` | `%TEMP%\autoos` |
| Backups gerados pelo app | `~/AutoOS/backups` | `%USERPROFILE%\Documents\AutoOS\backups` |
| Exportações CSV | `~/Documents/AutoOS/Exportacoes` | `%USERPROFILE%\Documents\AutoOS\Exportacoes` |

O restore só aceita arquivos da pasta de backups e pede confirmação por escrito. O estado do schema e o
pacote de suporte ficam em **Configurações › Segurança**.

## Build

```bash
npm run tauri build          # instalador desktop local
npm run build:public-status  # site do portal, em dist-public-status/
```

O instalador oficial do Windows sai do workflow `build.yml` (versão, assinatura e `latest.json` do
atualizador), disparado por tag `v*` ou à mão no GitHub. O portal é publicado pelo `deploy-portal-site.yml` a cada
mudança na `master`, depois de uma aprovação no ambiente `production-portal-site`.

## Licença

Proprietário — BMI TAG.
