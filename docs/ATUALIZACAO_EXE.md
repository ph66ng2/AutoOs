# Atualização do Executável AutoOS

## 1. Visão Geral

O AutoOS é uma aplicação desktop construída com Tauri 2.x, React 18 e backend Rust. O release Windows assinado publica instalador, `.sig` e `latest.json` no GitHub Releases para o `tauri-plugin-updater`. A instalação manual continua disponível como fallback. Este documento cobre versionamento, build, assinatura Authenticode, chave do updater e distribuição.

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
5. O script escolhe o MSI assinado (ou NSIS se o MSI não tiver `.sig`), recusa arquivos vazios e grava `latest.json`.
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
- `latest.json` sem `windows-x86_64`, URL fora deste repositório ou assinatura diferente do `.sig`.
- Publicar o canal `latest` antes do manifesto válido.

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
