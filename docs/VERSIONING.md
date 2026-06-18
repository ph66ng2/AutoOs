# Versionamento e Releases do AutoOS

## Política de Versionamento

O AutoOS segue o versionamento semântico simplificado:

```
MAJOR.MINOR.PATCH
```

| Componente | Quando incrementar |
|------------|-------------------|
| **MAJOR** | Mudanças incompatíveis que exigem migração manual ou reinstalação completa |
| **MINOR** | Novas funcionalidades, módulos ou melhorias significativas |
| **PATCH** | Correções de bugs, ajustes e melhorias menores |

## Regras de Release

### Versão 1.0

A versão **1.0** será marcada **apenas quando o AutoOS estiver pronto para uso em produção**. Atualmente o sistema está em fase de maturação e desenvolvimento ativo.

### Versão atual

A base atual de desenvolvimento é **0.1.3**. Todas as próximas tags devem partir deste ponto:

- Correções: `0.1.4`, `0.1.5`...
- Novas features: `0.2.0`, `0.3.0`...

### Tags para release Windows

O workflow de build Windows dispara apenas para tags com prefixo `v`:

```yaml
on:
  push:
    tags:
      - 'v*'
```

**Sempre use o prefixo `v`:**

```bash
# Correto
GIT_MASTER=1 git tag -a v0.1.4 -m "Descrição do release"

# Errado — não dispara o workflow
GIT_MASTER=1 git tag -a 0.1.4 -m "Descrição do release"
```

## Arquivos de Versão

Sempre que alterar a versão, atualize **os três arquivos** abaixo para manter consistência entre frontend, backend e instalador:

| Arquivo | Formato | Exemplo |
|---------|---------|---------|
| `package.json` | `"version": "0.1.3"` | Frontend e build scripts |
| `src-tauri/Cargo.toml` | `version = "0.1.3"` | Backend Rust |
| `src-tauri/tauri.conf.json` | `"version": "0.1.3"` | Bundle do instalador Windows |

## Checklist antes de criar uma tag

1. Verificar se os 3 arquivos de versão estão sincronizados
2. Rodar `cargo check` no `src-tauri`
3. Rodar `npx tsc --noEmit` no frontend
4. Criar a tag com prefixo `v`
5. Fazer push da tag: `git push origin v0.x.x`
6. Aguardar o workflow "Build e Release Windows" na aba Actions

## Documentação Relacionada

- [RELEASE.md](./RELEASE.md) — Checklist completo de release
- [WINDOWS_CODE_SIGNING.md](./WINDOWS_CODE_SIGNING.md) — Assinatura de código Windows
