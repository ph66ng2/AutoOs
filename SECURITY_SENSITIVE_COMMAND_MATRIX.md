# Matriz de Comandos Sensíveis

Esta matriz fecha o inventário do passo 1.1 do NEXT_STEPS para o backend Rust atual.

## Grupos

| Grupo | Permissão | Escopo |
| --- | --- | --- |
| Financeiro | `FINANCIAL_ACTIONS` | Campos financeiros em equipamentos, mudanças de status com impacto financeiro e custos de verificação técnica |
| Estoque | `STOCK_CONTROL` | CRUD de produtos e movimentações de estoque |
| Exclusão | `DELETE_RECORDS` | Deletes físicos ou lógicos |
| Administrativo | `MANAGE_PROFILES`, `CONFIG_SMTP`, `CONFIG_WHATSAPP` | Perfis locais, backup/restore e configurações sensíveis |

## Matriz Atual

| Comando | Arquivo | Escrita sensível | Grupo | Contrato de permissão |
| --- | --- | --- | --- | --- |
| `criar_equipamento` | `src-tauri/src/commands/equipamentos.rs` | `INSERT` com `preco_compra`, `preco_venda`, `valor_orcamento`, `prazo_aprovacao` | Financeiro | Exigir `FINANCIAL_ACTIONS` quando houver payload financeiro |
| `atualizar_equipamento` | `src-tauri/src/commands/equipamentos.rs` | `UPDATE` dos mesmos campos financeiros | Financeiro | Exigir `FINANCIAL_ACTIONS` quando houver payload financeiro |
| `atualizar_status_equipamento` | `src-tauri/src/commands/equipamentos.rs` | `UPDATE` de status com `valor_orcamento`, `prazo_aprovacao`, `valor_final` ou status financeiro | Financeiro | Exigir `FINANCIAL_ACTIONS` antes da mutação sensível |
| `salvar_verificacao_tecnica` | `src-tauri/src/commands/verificacoes.rs` | `INSERT/UPDATE` com `custo_estimado_mao_obra`, `custo_estimado_pecas`, `custo_total` | Financeiro | Exigir `FINANCIAL_ACTIONS` quando houver custos |
| `criar_produto` | `src-tauri/src/commands/produtos.rs` | `INSERT` em produtos | Estoque | Exigir `STOCK_CONTROL` |
| `atualizar_produto` | `src-tauri/src/commands/produtos.rs` | `UPDATE` em produtos | Estoque | Exigir `STOCK_CONTROL` |
| `registrar_movimentacao_estoque` | `src-tauri/src/commands/produtos.rs` | `UPDATE` de saldo + `INSERT` em movimentações | Estoque | Exigir `STOCK_CONTROL` |
| `deletar_equipamento` | `src-tauri/src/commands/equipamentos.rs` | `DELETE` físico | Exclusão | Exigir `DELETE_RECORDS` |
| `deletar_produto` | `src-tauri/src/commands/produtos.rs` | Soft delete (`ativo = false`) | Exclusão | Exigir `DELETE_RECORDS` |
| `deletar_cliente` | `src-tauri/src/commands/clientes.rs` | Soft delete (`ativo = false`) | Exclusão | Exigir `DELETE_RECORDS` |
| `create_security_profile` | `src-tauri/src/commands/auth.rs` | `INSERT` em perfis | Administrativo | Exigir `MANAGE_PROFILES` |
| `update_security_profile` | `src-tauri/src/commands/auth.rs` | `UPDATE` em perfis | Administrativo | Exigir `MANAGE_PROFILES` |
| `reset_security_profile_pin` | `src-tauri/src/commands/auth.rs` | Mutação de PIN por perfil | Administrativo | Exigir `MANAGE_PROFILES` |
| `deactivate_security_profile` | `src-tauri/src/commands/auth.rs` | `UPDATE` em perfis | Administrativo | Exigir `MANAGE_PROFILES` |
| `reactivate_security_profile` | `src-tauri/src/commands/auth.rs` | `UPDATE` em perfis | Administrativo | Exigir `MANAGE_PROFILES` |
| `salvar_config_smtp` | `src-tauri/src/commands/smtp.rs` | Gravação segura no keyring | Administrativo | Exigir `CONFIG_SMTP` |
| `salvar_config_whatsapp` | `src-tauri/src/commands/whatsapp.rs` | Gravação segura no keyring | Administrativo | Exigir `CONFIG_WHATSAPP` |
| `gerar_backup_postgres` | `src-tauri/src/commands/util.rs` | Execução de backup real | Administrativo | Exigir `MANAGE_PROFILES` |
| `restaurar_backup_postgres` | `src-tauri/src/commands/util.rs` | Restore destrutivo | Administrativo | Exigir `MANAGE_PROFILES` |

## Observações de Escopo

- `criar_cliente` e `atualizar_cliente` persistem dados, mas não entram no escopo mínimo do P0.1 porque não se enquadram em financeiro, estoque, exclusão ou restore.
- `enviar_email` e `enviar_whatsapp` fazem saída externa e continuam fora desta matriz porque não persistem estado local; qualquer revisão semântica de permissão deve ser tratada separadamente.
- `set_active_security_profile` altera o perfil padrão ativo para a próxima sessão e mantém trilha de auditoria própria; a exigência principal desta etapa é garantir rastreabilidade e proteção nas mutações administrativas destrutivas ou privilegiadas.