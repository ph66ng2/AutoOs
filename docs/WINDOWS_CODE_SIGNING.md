# Assinatura de build Windows (Authenticode)

## O que o repositório já define

Em `src-tauri/tauri.conf.json`:

- `bundle.windows.timestampUrl` = `http://timestamp.digicert.com` (carimbo de tempo público habitual para Authenticode).
- `bundle.windows.digestAlgorithm` = `sha256`.
- `certificateThumbprint` = `null` no Git (sem segredo gravado).

Enquanto o thumbprint não for aplicado antes do pacote público assistido, o diagnóstico de suporte continuará a listar pendência de assinatura (comportamento esperado).

## Preencher o thumbprint apenas no build de release

1. Copie o **SHA1** (40 hex) do certificado de assinatura de código (ex.: MMC “Certificados”, ou `certutil`, ou `Get-PfxCertificate` em PowerShell).
2. Execute no checkout de release:

```bash
export AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT='<40_hex_sem_espaços>'
# opcional: outro servidor RFC3161 Authenticode válido para a sua PKI
export AUTOOS_WINDOWS_CODESIGN_TIMESTAMP_URL='http://timestamp.digicert.com'
npm run bundle:prep:windows:sign
npm run tauri build
git checkout src-tauri/tauri.conf.json
```

Não faça commit do `tauri.conf.json` após aplicar thumbprint corporativo — use apenas em pipeline/tag.

## Observação sobre headless CI

O `bundlerWindows.certificateThumbprint` precisa estar presente quando o instalador deve ser distribuído. Em GitHub-hosted runners típicos, normalmente você injeta o thumbprint nos passos antes do build a partir dos **secrets**, sem persistir em branch.
