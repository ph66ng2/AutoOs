# Atualização do Executável AutoOS

## 1. Visão Geral

O AutoOS é uma aplicação desktop construída com Tauri 2.x, React 18 e backend Rust. A distribuição atual é **manual**, sem auto-updater integrado. Este documento cobre o processo completo de versionamento, build, assinatura e distribuição do executável.

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

## 6. Distribuição Manual (Processo Atual)

A distribuição atual é feita de forma manual:

1. Copie o `.msi` ou `.exe` de `src-tauri/target/release/bundle/` para uma pasta compartilhada na rede.
2. Ou envie o instalador por email aos usuários.
3. O usuário baixa e executa o instalador.
4. O instalador detecta automaticamente uma instalação existente e faz a atualização por cima.

### Pontos de atenção

- O instalador Windows (.msi) preserva dados do PostgreSQL e configurações locais.
- Em ambientes com múltiplas máquinas, distribua o mesmo build para todos os nós.
- Mantenha registro de qual versão foi distribuída para cada cliente.

---

## 7. Auto-Updater (Plano Futuro)

A arquitetura planejada utiliza o `tauri-plugin-updater` para distribuição automática de atualizações.

### Estrutura do endpoint JSON

O servidor deve expor um JSON com as informações de versão:

```json
{
  "version": "1.1.0",
  "notes": "Novas funcionalidades e correções",
  "pub_date": "2026-06-12T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://seu-servidor.com/AutoOS_1.1.0_x64.msi.zip"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://seu-servidor.com/AutoOS_1.1.0_amd64.AppImage.tar.gz"
    }
  }
}
```

### Fluxo de atualização

```
AutoOS (Cliente) → verifica → Servidor JSON → download → instala → reinicia
```

### Componentes necessários

1. **tauri-plugin-updater** — dependência Rust para verificação e download.
2. **Endpoint JSON** — servidor HTTP estático ou dinâmico com o manifesto de versões.
3. **Assinatura dos bundles** — gerar signatures com `tauri signer` para validação de integridade.
4. **Botão na UI** — "Verificar atualizações" em Configurações (trabalho futuro).

### Implementação futura (esboço)

```rust
// Exemplo conceitual — não implementar agora
use tauri_plugin_updater::UpdaterExt;

async fn check_for_updates(app: tauri::AppHandle) -> Result<(), Error> {
    let updater = app.updater()?;
    if let Some(update) = updater.check().await? {
        let mut downloaded = 0;
        update
            .download_and_install(
                |chunk_length, content_length| {
                    downloaded += chunk_length;
                    println!("progresso: {downloaded}/{content_length:?}");
                },
                || println!("download concluído"),
            )
            .await?;
        app.restart();
    }
    Ok(())
}
```

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
[ ] Release tag criada no Git
```

---

## Referências

- [RELEASE.md](./RELEASE.md) — Convenções de versão e camadas de QA
- [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md) — Assinatura Authenticode Windows
- [README.md](../README.md) — Visão geral do projeto e comandos
