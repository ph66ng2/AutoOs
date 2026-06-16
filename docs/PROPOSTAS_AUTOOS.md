# 📋 Propostas de Melhoria - AutoOS

**Data:** 2026-06-12
**Versão:** 1.0
**Status:** Pronto para implementação

---

## 🟢 Fáceis (Prioridade 1 - Implementar Primeiro)

### 1. Mudar SMTP Padrão para Gmail
**Dificuldade:** 🟢 Fácil | **Estimativa:** 5-10 min

#### Objetivo
Substituir o servidor SMTP padrão do AutoOS (hostmail.bmitag.com.br) para Gmail (smtp.gmail.com), permitindo que o sistema envie emails usando a infraestrutura do Google desde a primeira instalação.

#### Contexto Atual
```typescript
// src/pages/configuracoes/configuracoes-shared.ts
export const SMTP_DEFAULTS = {
  host: "hostmail.bmitag.com.br",
  port: 465,
  username: "bmitag@bmitag.com.br",
  from_name: "BMI Tag",
  from_email: "bmitag@bmitag.com.br",
  use_tls: true,
};
```

#### O que Mudar
- **Arquivo:** `src/pages/configuracoes/configuracoes-shared.ts`
- **Alteração:** Atualizar constantes para valores do Gmail
- **Opcional:** Adicionar nota sobre "Senha de App" do Google

#### Considerações
- O Gmail requer **senha de app** (não a senha normal da conta)
- Devemos adicionar uma nota explicativa na tela de configurações
- A senha de app é gerada em: https://myaccount.google.com/apppasswords

#### Próximos Passos
1. [ ] Alterar `SMTP_DEFAULTS` no arquivo `configuracoes-shared.ts`
2. [ ] Atualizar texto informativo na tela de configurações
3. [ ] Adicionar nota sobre "Senha de App" do Gmail
4. [ ] Testar envio de email com Gmail

---

### 2. Renomear "Insumos" para "Insumos/Peças"
**Dificuldade:** 🟢 Fácil | **Estimativa:** 15-20 min

#### Objetivo
Atualizar todos os labels e referências visuais do módulo "Insumos" para "Insumos/Peças", refletindo melhor que o módulo controla tanto insumos (toners, cartuchos) quanto peças de reposição.

#### Contexto Atual
O módulo de Insumos está temporariamente bloqueado (`[BLOQUEIO-TEMPORARIO-INSUMOS]`), mas os labels ainda existem em comentários, placeholders e na sidebar.

#### Arquivos a Alterar
- `src/App.tsx` — Rota e placeholder `BlockedInsumosPage`
- `src/components/Layout.tsx` — Item da sidebar (comentado)
- `src/pages/Insumos.tsx` — Título e descrição da página
- `src/pages/Dashboard.tsx` — Cards e botões relacionados a insumos

#### Próximos Passos
1. [ ] Buscar por "Insumo" e "Insumos" no projeto
2. [ ] Atualizar labels em App.tsx, Layout.tsx, Insumos.tsx, Dashboard.tsx
3. [ ] Verificar se há referências em outros arquivos (hooks, testes, etc.)
4. [ ] Testar visualmente as telas

---

### 3. Botões de Aprovação de Orçamento no Email
**Dificuldade:** 🟢 Fácil-Médio | **Estimativa:** 30-45 min

#### Objetivo
Facilitar a confirmação do orçamento pelo cliente, adicionando botões de ação diretamente no corpo do email de orçamento enviado pelo AutoOS.

#### Funcionalidade
Adicionar dois botões clicáveis no HTML do email de orçamento:
- **Aprovar pelo WhatsApp** — Abre o WhatsApp do cliente com mensagem pré-preenchida
- **Aprovar por Email** — Abre o cliente de email do cliente com assunto e corpo pré-preenchidos

#### Arquivo Principal
`src/lib/email-service.ts`

#### Funções a Alterar
- `gerarCorpoOrcamentoHtml()` — Adicionar botões no final do corpo HTML
- `gerarCorpoOrcamentoTexto()` — Adicionar instruções no final do corpo texto

#### Mensagem Proposta
```
Olá! Eu, [Nome do Cliente], aprovo o orçamento para o equipamento [Marca/Modelo] (Serial: [SN]). Valor: R$ [Valor]. CNPJ: [CNPJ]. Aprovo o início do serviço.
```

#### Comportamento dos Botões

**Botão WhatsApp**
- **Link:** `https://wa.me/?text=[mensagem codificada]`
- **Ação:** Abre o WhatsApp (web ou app) do cliente com a mensagem já escrita
- **Vantagem:** O cliente só precisa clicar "Enviar"

**Botão Email**
- **Link:** `mailto:bmitag@bmitag.com.br?subject=APROVADO - Orçamento [SN]&body=[mensagem]`
- **Ação:** Abre o cliente de email (Gmail, Outlook, etc.) com assunto e corpo pré-preenchidos
- **Vantagem:** Canal oficial, cria trilha de auditoria

#### Design dos Botões (HTML/CSS)
```html
<div style="margin-top:24px; padding:16px; background:#f3f4f6; border-radius:8px;">
  <p style="margin:0 0 12px 0; font-weight:600;">Para aprovar este orçamento, escolha uma das opções:</p>
  <div style="display:flex; gap:12px; flex-wrap:wrap;">
    <a href="https://wa.me/?text=..." style="background:#25D366; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:500;">
      📱 Aprovar pelo WhatsApp
    </a>
    <a href="mailto:..." style="background:#3b82f6; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:500;">
      📧 Aprovar por Email
    </a>
  </div>
  <p style="margin:12px 0 0 0; font-size:12px; color:#6b7280;">
    Você pode editar a mensagem antes de enviar. Ao enviar, confirma a aprovação do orçamento.
  </p>
</div>
```

#### Fluxo do Cliente
1. Recebe o email de orçamento do AutoOS
2. Clica em um dos botões (WhatsApp ou Email)
3. O app dele (WhatsApp ou Gmail) abre com a mensagem pré-preenchida
4. Cliente pode editar se quiser, mas não precisa
5. Clica "Enviar"
6. A mensagem chega na empresa (WhatsApp ou email)

#### Privacidade
- **Não enviamos nada no lugar do cliente.** Apenas geramos um link com texto pré-preenchido.
- O cliente tem **controle total** — lê, edita, e decide se quer enviar.
- É o mesmo mecanismo de "Compartilhar no WhatsApp" usado em e-commerce.

#### Próximos Passos
1. [ ] Implementar botões no `email-service.ts`
2. [ ] Testar envio de email com botões
3. [ ] Verificar se links funcionam em Gmail, Outlook, Apple Mail
4. [ ] Validar com usuário final

---

## 🟡 Médios (Prioridade 2 - Implementar Depois)

### 4. Lembrar o Último Perfil Selecionado
**Dificuldade:** 🟡 Médio | **Estimativa:** 30-45 min

#### Objetivo
Salvar o ID do último perfil selecionado pelo usuário, para que na próxima abertura do app ele não precise selecionar novamente — o app já sugere o último perfil usado.

#### Contexto Atual
Hoje, toda vez que o app inicia, o hook `useSensitiveAccess` abre o dialog de seleção de perfil (`startup` mode). O usuário precisa escolher o perfil e digitar o PIN toda vez.

#### Fluxo Desejado
```
1. Usuário abre o app pela primeira vez
2. Seleciona o perfil "Operador" e digita o PIN
3. Usa o app normalmente
4. Fecha o app
5. Abre o app novamente
6. O app já mostra "Operador" pré-selecionado
7. Usuário só precisa digitar o PIN
8. Se quiser trocar, pode clicar em outro perfil
```

#### O que Mudar

**Arquivo principal:** `src/hooks/useSensitiveAccess.tsx`

#### Alterações

**1. Salvar o perfil no localStorage**
Após o login bem-sucedido:
```typescript
localStorage.setItem("autoos_last_profile_id", String(profileId));
```

**2. Recuperar no startup**
Na função `refreshStatus`, antes de abrir o dialog:
```typescript
const lastProfileId = localStorage.getItem("autoos_last_profile_id");
if (lastProfileId && nextStatus.profiles.length > 0) {
  const lastProfile = nextStatus.profiles.find(p => String(p.id) === lastProfileId);
  if (lastProfile) {
    setSelectedProfileId(lastProfileId);
  }
}
```

**3. Ajustar o fluxo de startup**
Se houver um `lastProfileId` válido:
- **Não abrir o seletor** imediatamente
- **Pré-selecionar** o perfil no dialog
- **Manter o PIN** como única etapa

#### Alternativa: Usar `is_default` do backend
Outra opção é usar o campo `is_default` do banco de dados para marcar o último perfil usado:

**Vantagem:** Funciona em qualquer máquina (se houver múltiplas estações)
**Desvantagem:** Requer mudança no backend

#### Considerações de Segurança
- **Nunca salvar o PIN** no localStorage
- **Só salvar o ID** do perfil (não é informação sensível)
- **Se o perfil foi deletado**, ignorar o localStorage e pedir seleção
- **Se o perfil foi desativado**, pedir seleção de outro

#### Próximos Passos
1. [ ] Adicionar `localStorage.setItem` após login bem-sucedido
2. [ ] Adicionar `localStorage.getItem` no startup
3. [ ] Ajustar o fluxo do `startup` mode para pré-selecionar o perfil
4. [ ] Testar: perfil salvo existe → pré-seleciona
5. [ ] Testar: perfil salvo foi deletado → pede seleção
6. [ ] Testar: primeiro uso → pede seleção normal

---

### 5. Corrigir Perfil Custom com Privilégios de Admin
**Dificuldade:** 🟡 Médio | **Estimativa:** 1-2 horas

#### Objetivo
Investigar e corrigir o bug onde perfis do tipo "Custom" (criados com permissões limitadas) estão recebendo todos os privilégios de Admin.

#### Contexto Atual

##### O que acontece
1. Usuário cria um perfil "Custom" com apenas algumas permissões (ex: só STOCK_CONTROL)
2. O perfil é salvo no banco
3. Quando o usuário faz login com esse perfil, ele consegue acessar áreas de Admin (como gerenciar outros perfis)

##### O que deveria acontecer
- Perfil Custom com permissões limitadas deve ter **apenas** as permissões que foram marcadas

#### Onde pode estar o bug

##### 1. Backend (`auth.rs`)
A função `normalize_permissions()` parece correta:
```rust
fn normalize_permissions(role: &str, permissions: &[String]) -> Result<Vec<String>, String> {
    if role == "ADMIN" {
        return Ok(ALL_PERMISSIONS.iter().map(|p| p.to_string()).collect());
    }
    // ... valida e retorna apenas as permissões passadas
}
```

Mas a função `has_permission()` verifica:
```rust
fn has_permission(profile: &SecurityProfileSummary, permission: &str) -> bool {
    profile.role == "ADMIN" || has_permission_values(&profile.permissions, permission)
}
```

**Se o `role` estiver sendo salvo como "ADMIN" em vez de "CUSTOM", o perfil terá todas as permissões.**

##### 2. Frontend (`Configuracoes.tsx`)
Possíveis problemas:
- O `newProfileRole` pode estar sendo enviado como "ADMIN" por engano
- O `editProfileRole` pode estar sendo sobrescrito
- O payload de `criarPerfil` pode não incluir o `role` correto

##### 3. Banco de dados
Se a migração `0002_schema_hardening.sql` alterou alguma coisa nos profiles, pode ter criado um default de "ADMIN".

#### Plano de Investigação

##### Passo 1: Verificar o payload de criação
Em `Configuracoes.tsx`, adicionar `console.log` antes de chamar a API:
```typescript
console.log("Criando perfil:", { nome: newProfileName, role: newProfileRole, permissions: newProfilePermissions });
```

##### Passo 2: Verificar o que o backend recebe
Em `auth.rs`, logar o input:
```rust
println!("create_profile input: role={:?}, permissions={:?}", input.role, input.permissions);
```

##### Passo 3: Verificar o que é salvo no banco
```sql
SELECT id, nome, role, permissions FROM security_profiles WHERE role = 'CUSTOM';
```

##### Passo 4: Verificar o que é retornado no status
```typescript
console.log("Status:", accessStatus);
```

#### Possíveis Causas

| Causa | Probabilidade | Como confirmar |
|-------|---------------|----------------|
| Frontend envia `role: "ADMIN"` | Alta | Console.log no payload |
| Backend converte `role` para "ADMIN" | Média | Log no Rust |
| `is_default` ou `role` no banco | Baixa | Query SQL direta |
| `has_permission` comparando errado | Média | Verificar o valor exato do `role` |

#### Próximos Passos
1. [ ] Adicionar logs no frontend para verificar payload
2. [ ] Adicionar logs no backend para verificar o que recebe
3. [ ] Consultar o banco para verificar o que foi salvo
4. [ ] Identificar a causa raiz
5. [ ] Corrigir e testar

---

### 6. Entender e Documentar o Processo de Atualização do EXE
**Dificuldade:** 🟡 Médio (Investigativa) | **Estimativa:** 30 min (doc) / 4-6h (auto-updater)

#### Objetivo
Documentar o processo completo de release e atualização do executável AutoOS, desde o desenvolvimento até a distribuição para os usuários finais.

#### Contexto Atual
O AutoOS é um app desktop Tauri. A distribuição atual é manual — o usuário precisa baixar e instalar o novo EXE. Não há mecanismo automático de atualização.

#### O Processo Hoje (Manual)

##### 1. Preparação do Release
Conforme `docs/RELEASE.md`:

1. **Bump de versão** — Alinhar em 3 arquivos:
   - `package.json` (version)
   - `src-tauri/tauri.conf.json` (version)
   - `src-tauri/Cargo.toml` (package.version)

2. **Branch dedicada** — Criar branch `release/X.Y.Z`

3. **QA em camadas**:
   ```bash
   npm run lint
   npm run test:run
   npm run e2e
   npm run qa:integrations
   ```

##### 2. Build do Executável

```bash
npm run tauri build
```

Isso gera:
- Windows: `.msi` e `.exe` em `src-tauri/target/release/bundle/`
- Linux: `.AppImage` e `.deb`

##### 3. Distribuição

Atualmente o processo é **manual**:
- O EXE/MSI é copiado para uma pasta compartilhada
- Ou enviado por email para os usuários
- O usuário baixa e instala por cima

#### O Processo Ideal (Auto-Updater)

##### O que é possível
Tauri tem suporte nativo a **auto-updater** via `tauri-plugin-updater`. Ele permite:

1. Verificar se há nova versão
2. Baixar o update
3. Instalar e reiniciar o app

##### Arquitetura Necessária

```
┌─────────────┐     Verifica     ┌─────────────┐
│   AutoOS    │ ────────────────▶│  Servidor   │
│   (Cliente) │                  │  (JSON)     │
└─────────────┘                  └─────────────┘
                                      │
                                      ▼
                              ┌─────────────┐
                              │  Arquivos   │
                              │  .msi/.exe  │
                              └─────────────┘
```

##### JSON de Versão (exemplo)
```json
{
  "version": "1.1.0",
  "notes": "Novas funcionalidades e correções",
  "pub_date": "2026-06-12T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://seu-servidor.com/AutoOS_1.1.0_x64.msi.zip"
    }
  }
}
```

#### O que Precisamos

##### Mínimo (sem servidor)
- Documentar o processo manual atual
- Adicionar um botão "Verificar atualizações" que abre uma página de download

##### Ideal (com servidor)
- Configurar `tauri-plugin-updater` no backend
- Criar endpoint JSON com versões
- Hospedar arquivos de atualização
- Adicionar botão "Verificar atualizações" na UI

#### Próximos Passos

##### Fase 1: Documentar (agora)
1. [ ] Documentar o passo a passo do release manual
2. [ ] Criar checklist de QA antes do build
3. [ ] Criar script de bump de versão (automatizar os 3 arquivos)

##### Fase 2: Botão de Verificação (futuro)
1. [ ] Adicionar botão "Verificar atualizações" na UI
2. [ ] Implementar `tauri-plugin-updater`
3. [ ] Configurar servidor de atualização
4. [ ] Testar fluxo end-to-end

---

## 📊 Resumo por Prioridade

### 🟢 Fáceis (Fazer Primeiro)
1. **SMTP Gmail** — 5-10 min
2. **Insumos/Peças** — 15-20 min
3. **Orçamento WhatsApp** — 30-45 min

### 🟡 Médios (Fazer Depois)
4. **Lembrar último perfil** — 30-45 min
5. **Perfil Custom bug** — 1-2h
6. **Atualização EXE** — 30 min (doc) / 4-6h (auto-updater)

---

**Recomendação:** Começar pelos 3 itens 🟢 Fáceis. São rápidos, entregam valor imediato e não requerem arquitetura complexa.
