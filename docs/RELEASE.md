# Congelamento e release — AutoOS

## Convenção de versão (semver)

Um release **deve alinhar a mesma string** nos três ficheiros:

| Ficheiro | Campo |
|----------|------|
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |

Bumps sugeridos:

- **PATCH** (`1.0.x`) — correções, semântica comportamental estável.
- **MINOR** (`1.x.0`) — funcionalidades retrocompatíveis.
- **MAJOR** (`x.0.0`) — ruptura de contratos (DB/API/UX obrigando migração explícita).

Depois do bump: executar `npm install` uma vez para alinhar metadados de `package-lock.json` onde aplicável.

## Corte estável antes de etiquetar

1. **`git status` limpo por escopo**: branch dedicada (`release/X.Y.Z`), sem misturar trabalho não relacionado ou docs exploratórias.
2. **Travar escopo**: fixar objetivo na descrição do PR/tag (ex.: só Windows assinado, só correções P1).
3. **Pacote neste estado**: validar commits exatos antes do build distribuído; não retocar migrações já aplicadas em ambientes partilhados.

## QA oficial em camadas (trilhas explícitas)

| Comando | O que cobre |
|---------|--------------|
| `npm run lint` | TypeScript |
| `npm run test:run` | Vitest + mocks IPC |
| `npm run e2e` | Playwright com `VITE_E2E_MOCK=1` (store in-memory + alias do invoke) — fluxos de UI, não Postgres real |
| `npm run qa:integrations:critical` | Postgres real + cliente/equipamento/estoque/permissões (`p1_critical_integration`) |
| `npm run qa:integrations:communication` | Postgres + SMTP efémero local + HTTP fake WhatsApp + auditoria (`p1_communication_integration`) |

`npm run qa:integrations` encadeia **critical + communication**.

`npm run qa:tier:jornada-real` faz lint → Vitest → ambos bins de integração → Playwright smoke.

Na CI, o binário `ci_migrate` aplica migrations somente ao PostgreSQL descartável `test_autoos` em localhost antes do QA Real. Ele exige `AUTOOS_MIGRATION_MODE=ci` e recusa hosts externos; não é usado pelo aplicativo, Windows Test ou release.

### Pré-requisitos das integrações `p1_*`

- `DATABASE_URL` válido (ex.: `.env` em `src-tauri/` ou variável exportada).
- **Keyring do SO** disponível (`configure_sensitive_pin` / credenciais de canal gravam secrets). runners Linux headless costumam falhar até haver dbus/secret compatível ou runner self-hosted onde o comando já passe.

### Conexão do release Windows

- Cadastre `AUTOOS_DATABASE_URL` nos GitHub Actions secrets com a URL **Supavisor Session**, porta `5432`, copiada do painel Supabase.
- Não use o endpoint direto `db.<project-ref>.supabase.co` no release distribuído: ele depende de IPv6 e não é uniforme nas redes Windows atendidas.
- Mantenha `sslmode=require` na URL do release.
- O workflow interrompe o build antes de publicar quando o secret está ausente, não aponta para um Session pooler ou o histórico real de migrations diverge do build.
- O aplicativo desktop apenas valida esse histórico, com timeout e sem advisory lock; migrations devem estar aplicadas antes do build.
- `src-tauri/.env` é apenas configuração local ignorada pelo Git; não deve ser versionado nem incluído no bundle.

### Migrations SQLx em produção

Antes de publicar um release que dependa das migrations 0024–0029, aplique-as pelo workflow protegido [production-sqlx-migrations.yml](../.github/workflows/production-sqlx-migrations.yml). Configure o ambiente e confira os bloqueios de histórico e dados em [PRODUCTION_MIGRATIONS.md](./PRODUCTION_MIGRATIONS.md). O desktop não executa migrations ao iniciar.

## Windows (distribuição assistida)

1. Thumbprint só no build: ver [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md).
2. Timestamp já está configurado no `tauri.conf.json`; o bloqueio remanente de prontidão é normalmente apenas **thumbprint**.

## Card de novidades por versão

O card usa `getVersion()` do Tauri para identificar a versão instalada. Antes de abrir,
registra a versão em `release-highlights.json` no **app data dir** do Tauri
(`app.path().app_data_dir()`, conforme o identificador do aplicativo e o usuário do SO).
O arquivo guarda somente `last_seen_version`, com substituição atômica; não depende de
perfil, sessão ou banco. A chave antiga `autoos:release-highlights:0.6.2:portal-orcamento-conexao`
com valor `seen` migra como vista somente para a 0.6.2. O localStorage continua como
fallback. Na web, a versão vem de `package.json` e a persistência usa localStorage.

O registro acontece na primeira apresentação, sem depender de clicar em “Começar a
usar”: fechar o aplicativo com o card aberto também conta como visto. O antigo código
só gravava ao dispensar, e engolia falhas do localStorage. Não foi encontrada limpeza
da chave no código de produção. `SessionPinGate` substitui o `BrowserRouter` e pode
desmontar o card; o splash do #181 só adia sua abertura. Essas são causas possíveis
de repetição quando o registro não existe; não há reprodução confirmada no Windows
da máquina afetada.

Para escrever o resumo de uma mudança, preencha a seção do template de PR:

```markdown
## Novidades para o usuário

- A busca de clientes agora encontra também pelo telefone do contato.
- O orçamento vencido mostra um aviso antes da aprovação.
```

Use bullets curtos em pt-BR com o efeito percebido pelo usuário, sem Markdown
complexo. Se a mudança for interna, deixe a seção vazia. Comentários HTML,
blocos de código e checklists não entram. Somente os bullets dessa seção são lidos;
o próximo título de nível 1 ou 2 encerra a seção.

`npm run build` executa `npm run generate:release-highlights` no `prebuild`, inclusive
quando chamado pelo Tauri na CI. O script usa `gh api` com `GH_TOKEN`/`GITHUB_TOKEN`
ou a autenticação local do `gh`. Ele consulta releases publicadas estáveis, escolhe a
última cuja tag é ancestral do checkout e reúne somente os PRs mergeados para `master`
cujos commits de merge estão entre essa tag e o `HEAD` exato. Pagina releases,
comparação de commits e PRs pela API, funcionando também em checkout raso.
Tags de homologação, rascunhos e releases de outras linhas não viram base.

O resultado é `src/generated/release-highlights.json`, empacotado pelo Vite. Não há
consulta de rede ao abrir o card. Para preparar um fallback atualizado antes do
release, depois do bump de versão rode `npm run generate:release-highlights`, confira
o JSON e inclua-o no commit. Uma versão já publicada conserva seu JSON existente;
a 0.6.2 mantém textos, ícones e selos anteriores. O gerador não altera versões nem
cria tag ou release.

Sem `gh`, rede, token autorizado ou resposta completa da API, o build conserva o
JSON commitado. `AUTOOS_HIGHLIGHTS_OFFLINE=1 npm run build` força esse caminho. Se o
JSON estiver ausente, vazio, inválido ou for de outra versão, aparece uma confirmação
genérica da versão instalada, uma vez, sem apresentar novidades antigas.

O campo `notes` de `latest.json` foi avaliado: ele já abastece o aviso do updater,
mas o endpoint latest pode descrever uma versão posterior à instalada, exige rede e
é produzido depois da compilação. Por isso não é a fonte deste card, nem foi alterado.

Limitações: em outra conta do SO ou após excluir os dados do aplicativo o aviso pode
voltar. Se arquivo e localStorage falharem juntos, a proteção dura apenas a sessão.
PRs antigos sem a seção não têm resumo inferido do título. O token da CI precisa
poder ler releases, commits e PRs (em repositório privado, `contents:read` e
`pull-requests:read`); falta de acesso usa o fallback. Executar `vite build` diretamente
ignora o gerador; use o comando npm documentado. O teste web não substitui validar
instalação, atualização e persistência no Tauri/Windows.

## Auto-updater (GitHub Releases)

O workflow `.github/workflows/build.yml` é a publicação oficial do canal `latest`. Detalhes operacionais, rotação de chave e schema de `latest.json` estão em [ATUALIZACAO_EXE.md](./ATUALIZACAO_EXE.md).

Checklist extra antes da tag:

1. A mesma SemVer está em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
2. `bundle.createUpdaterArtifacts` permanece `true`.
3. `plugins.updater.pubkey` é o par da chave privada nos secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (alias `TAURI_SIGNING_KEY`).
4. `workflow_dispatch` só publica se o input `version` for essa SemVer; sem versão o job falha e não altera latest.
5. O release só deixa de ser rascunho depois de `scripts/generate-update-manifest.mjs` validar instalador, `.sig` e `latest.json`.

Não imprima a chave privada, a senha ou `AUTOOS_DATABASE_URL` em logs, PRs ou evidências. Authenticode (thumbprint) e assinatura do updater (minisign) são camadas distintas.

A jornada N para N+1 usa o workflow `updater-homolog.yml`, a tag `updater-homolog` e o endpoint de `tauri.homolog.conf.json`. Esse disparo pede a confirmação `HOMOLOG`, não embute banco e não pode ocupar o release latest. O `build.yml` permanece o único caminho do canal de produção.
