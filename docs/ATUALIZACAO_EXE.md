# Atualização do Executável AutoOS

## 1. Visão Geral

O AutoOS é uma aplicação desktop construída com Tauri 2.x, React 18 e backend Rust. O release Windows assinado publica instalador, `.sig` e `latest.json` no GitHub Releases para o `tauri-plugin-updater`. A instalação manual continua disponível como fallback.

**No app (desde a 0.6.2):** qualquer pessoa vê o aviso "AutoOS X disponível" no canto da tela. O app consulta o `latest.json` 15 s depois de abrir e a cada 6 h, em silêncio (sem rede, nada aparece). "Ver e atualizar" abre o mesmo painel de Configurações › Banco, que baixa, valida a assinatura e reabre o app; "Depois" esconde o aviso daquela versão até o app ser aberto de novo. A instalação nunca começa sozinha. Este documento cobre versionamento, build, assinatura Authenticode, chave do updater e distribuição.

Para detalhes sobre convenções de versão e camadas de QA, consulte [RELEASE.md](./RELEASE.md). Para assinatura Windows, consulte [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md).

---

## 2. Bump de Versão

A versão deve estar alinhada em **3 arquivos** antes de qualquer build de release. Todos devem conter a mesma string de versão.

| Arquivo | Campo | Exemplo |
|---------|-------|---------|
| `package.json` | `version` | `"1.0.0"` |
| `src-tauri/tauri.conf.json` | `version` | `"1.0.0"` |
| `src-tauri/Cargo.toml` | `package.version` | `"1.0.0"` |

### Convenção semver

- **PATCH** (`1.0.x`) — correções de bugs, sem alteração comportamental.
- **MINOR** (`1.x.0`) — funcionalidades novas retrocompatíveis.
- **MAJOR** (`x.0.0`) — ruptura de contratos que exige migração explícita (schema, API, UX).

### Após o bump

Execute `npm install` para atualizar o `package-lock.json` com os metadados corretos.

---

## 3. QA Antes do Build

Execute as camadas de validação na ordem. Cada camada deve passar antes de prosseguir.

```bash
npm run lint                    # TypeScript — verifica tipos sem gerar output
npm run test:run                # Vitest — testes unitários com mocks IPC
npm run e2e                     # Playwright — testes de UI com mocks in-memory
npm run qa:integrations         # PostgreSQL real — testes critical + communication
```

### Camadas de QA em detalhe

| Comando | O que cobre |
|---------|-------------|
| `npm run lint` | Verificação de tipos TypeScript |
| `npm run test:run` | Vitest com mocks IPC |
| `npm run e2e` | Playwright com `VITE_E2E_MOCK=1` (store in-memory) |
| `npm run qa:integrations:critical` | Postgres real: cliente, equipamento, estoque, permissões |
| `npm run qa:integrations:communication` | Postgres + SMTP efêmero + HTTP fake WhatsApp + auditoria |
| `npm run qa:integrations` | Encadeia critical + communication |

### Trilha completa (opcional)

```bash
npm run qa:tier:jornada-real
```

Executa lint, Vitest, ambos bins de integração e Playwright smoke. Requer keyring do SO funcionando.

### Pré-requisitos das integrações

- `DATABASE_URL` válida em `src-tauri/.env` ou variável de ambiente.
- Keyring do SO disponível (necessário para `configure_sensitive_pin` e credenciais de canal).

---

## 4. Build do Executável

```bash
npm run tauri build
```

### Output gerado

O build produz bundles em `src-tauri/target/release/bundle/`:

| Plataforma | Formatos |
|------------|----------|
| Windows | `.msi` e `.exe` |
| Linux | `.AppImage` e `.deb` |

O frontend é compilado primeiro (`npm run build`), depois o backend Rust é compilado em modo release, e finalmente o Tauri empacota o bundle.

---

## 5. Assinatura Windows (se aplicável)

O `tauri.conf.json` já possui configuração de assinatura Authenticode:

- `timestampUrl`: `http://timestamp.digicert.com` (configurado)
- `digestAlgorithm`: `sha256` (configurado)
- `certificateThumbprint`: `null` no Git (não commitar)

### Processo de assinatura

1. Obtenha o SHA1 (40 hex) do certificado de code signing.
2. Aplique o thumbprint apenas no build de release:

```bash
export AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT='<40_hex_sem_espaços>'
npm run bundle:prep:windows:sign
npm run tauri build
git checkout src-tauri/tauri.conf.json
```

3. Não faça commit do `tauri.conf.json` com o thumbprint aplicado.

Detalhes completos em [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md).

---

## 6. Distribuição Manual (fallback)

Se o auto-updater não estiver disponível na máquina do cliente:

1. Copie o `.msi` ou `.exe` de `src-tauri/target/release/bundle/` para uma pasta compartilhada na rede.
2. Ou envie o instalador por email aos usuários.
3. O usuário baixa e executa o instalador.
4. O instalador detecta automaticamente uma instalação existente e faz a atualização por cima.

### Pontos de atenção

- O instalador Windows (.msi) preserva dados do PostgreSQL e configurações locais.
- Em ambientes com múltiplas máquinas, distribua o mesmo build para todos os nós.
- Mantenha registro de qual versão foi distribuída para cada cliente.

---

## 7. Auto-updater Windows

A fonte única de `latest.json` é `scripts/generate-update-manifest.mjs`. O `tauri-action` só compila e anexa o instalador/`.sig` a um **release em rascunho**; o manifesto é validado e o rascunho só vira `latest` depois disso. Clientes em produção continuam no release anterior se a validação falhar.

Endpoint embarcado em `src-tauri/tauri.conf.json`:

```text
https://github.com/ph66ng2/AutoOs/releases/latest/download/latest.json
```

Schema publicado:

```json
{
  "version": "0.5.5",
  "notes": "Veja as notas de release no GitHub.",
  "pub_date": "2026-09-22T18:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<conteúdo do arquivo .sig>",
      "url": "https://github.com/ph66ng2/AutoOs/releases/download/v0.5.5/AutoOS_0.5.5_x64_en-US.msi"
    }
  }
}
```

### Pipeline

1. Tag `vX.Y.Z` (ou `workflow_dispatch` com o input `version` igual a `X.Y.Z`).
2. O job valida o alinhamento entre tag, `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`. Sem SemVer válida o job falha; **não existe fallback 0.0.0**.
3. Exige `TAURI_SIGNING_PRIVATE_KEY` (alias `TAURI_SIGNING_KEY`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` nos GitHub Secrets.
4. O build Windows gera MSI/NSIS com `createUpdaterArtifacts` e assina o `.sig`.
5. O script escolhe o MSI assinado **da versão do release** (ou o NSIS dessa versão, se o MSI não tiver `.sig`), recusa arquivos vazios e grava `latest.json`. O nome do instalador precisa conter `_X.Y.Z_`; instalador de outra versão é recusado. Antes do build, o job apaga `src-tauri/target/release/bundle`, porque o cache do `target` pode restaurar bundles de um release anterior (foi o que fez o `latest.json` da v0.6.2 apontar para o MSI 0.6.1).
6. Só então o rascunho é publicado como latest.

Validação local com artefatos sintéticos (sem chave real):

```bash
node --test scripts/__tests__/generate-update-manifest.test.mjs
node scripts/generate-update-manifest.mjs --check-versions
```

### Chave do updater (minisign)

Esta chave **não** é o certificado Authenticode. Authenticode usa thumbprint no bundle; o updater usa par minisign.

Geração inicial (fora do repositório, nunca commitar `.key`):

```bash
npx @tauri-apps/cli signer generate -w "$HOME/.tauri/autoos.key"
```

1. Conteúdo da chave privada → secret `TAURI_SIGNING_PRIVATE_KEY`.
2. Senha → secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Chave pública → `plugins.updater.pubkey` em `src-tauri/tauri.conf.json` (já versionada).
4. Confirme que o pubkey embarcado é o par da chave privada vigente antes do primeiro release que os clientes vão baixar.

### Rotação compatível

Trocar o pubkey no cliente antigo impede a atualização. Rotação segura:

1. Assine a versão **N+1** com a chave **antiga**, para os clientes atuais aceitarem o download.
2. Embarque o **novo** pubkey em N+1.
3. Assine **N+2** com a chave nova.

Não apague o secret antigo antes de N+1 estar instalado nas máquinas que precisam atualizar. Não gere um release latest com chave diferente da pubkey já embarcada nas instalações ativas.

### O que o pipeline recusa

- Tag ou dispatch sem SemVer, ou versão `0.0.0`.
- `package.json` / `Cargo.toml` / `tauri.conf.json` divergentes da tag.
- Instalador ou `.sig` ausente ou vazio.
- Instalador de outra versão no diretório de bundle, ou `latest.json` cuja URL aponta para artefato de versão diferente de `version`.
- `latest.json` sem `windows-x86_64`, URL fora deste repositório ou assinatura diferente do `.sig`.
- Publicar o canal `latest` antes do manifesto válido.

### Canal de homologação

O build de homologação/hotfix mescla `src-tauri/tauri.homolog.conf.json` e consulta, nesta ordem:

```text
https://github.com/ph66ng2/AutoOs/releases/download/updater-homolog/latest.json
https://github.com/ph66ng2/AutoOs/releases/latest/download/latest.json
```

O segundo endpoint é só um fallback: o plugin passa para ele quando o primeiro não responde com sucesso (por exemplo, 404 porque a release `updater-homolog` ainda não existe). Enquanto o canal isolado responder, o build de homologação não olha a produção. O `tauri.conf.json` de produção continua com um endpoint só e nunca consulta o canal de homologação. Atenção: um build de homologação que cair no fallback recebe o instalador de produção, que sai conectado ao banco de produção.

O workflow `.github/workflows/updater-homolog.yml` tem dois disparos:

- `workflow_dispatch`, com `version` e a confirmação `HOMOLOG`;
- push de tag `homolog-X.Y.Z` ou `hotfix-X.Y.Z`. A versão vem da tag e precisa bater com os três manifests do commit. Tag `v*` não dispara este workflow.

Nos dois casos ele recusa variável de banco, compila só o NSIS, apaga bundles antigos antes do build e publica `latest.json`, o instalador e o `.sig` na tag fixa `updater-homolog`, como prerelease com `make_latest: false`. Os assets são sobrescritos a cada execução; a primeira execução cria a release. O release marcado como Latest de produção permanece o que o `build.yml` publica. `assertHomologWorkflow` (em `scripts/generate-update-manifest.mjs`, coberto por teste) recusa qualquer outro gatilho nesse YAML: push de branch, tag fora de `homolog-*`/`hotfix-*`, `pull_request`, `release`, `schedule`, `workflow_call`.

O `windows-test-build.yml` não faz parte deste canal: ele gera um instalador interno ligado à produção e não publica release nem manifesto.

Se o canal ou o instalador não existir, a tela mostra "O canal ou o pacote de atualização não foi encontrado no servidor", em vez do erro HTTP genérico.

Para exercitar a jornada, dispare o workflow duas vezes, em commits com SemVer consecutivas e alinhadas nos três manifests. O primeiro instalador é N. O segundo substitui o manifesto nessa mesma tag, e o app N encontra só N+1. A tela desse build mostra que o canal é de homologação.

Ainda falta a prova numa VM Windows descartável: instalar N, atualizar pelo botão, reabrir em N+1 e repetir offline, interrupção e assinatura inválida. Sem essa evidência o canal existe, mas a homologação não está concluída. Não dispare esse workflow com dados reais e não promova a tag `updater-homolog` a latest.

---

## 8. Checklist de Pré-Release

```
[ ] Bump de versão nos 3 arquivos (package.json, tauri.conf.json, Cargo.toml)
[ ] npm install executado
[ ] npm run lint passa
[ ] npm run test:run passa
[ ] npm run e2e passa
[ ] npm run qa:integrations passa (requer PostgreSQL)
[ ] git status limpo
[ ] Branch release/X.Y.Z criada
[ ] Build executado com sucesso (npm run tauri build)
[ ] Executável testado em máquina limpa
[ ] Release tag criada no Git (`vX.Y.Z`, alinhada aos 3 manifests)
[ ] Secrets TAURI_SIGNING_PRIVATE_KEY e TAURI_SIGNING_PRIVATE_KEY_PASSWORD presentes
[ ] pubkey em tauri.conf.json corresponde à chave privada do release
[ ] Release publicado contém instalador, .sig e latest.json válidos
[ ] /releases/latest/download/latest.json aponta para o asset do mesmo tag
```

---

## Referências

- [RELEASE.md](./RELEASE.md) — Convenções de versão e camadas de QA
- [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md) — Assinatura Authenticode Windows
- [README.md](../README.md) — Visão geral do projeto e comandos
