# Tauri Command Handlers

**Path:** `src-tauri/src/commands/`  
**Reason:** 12 files, 18+ exports, high complexity

## OVERVIEW

IPC command handlers for Tauri backend. All exported as `#[tauri::command]`.

## STRUCTURE

```
commands/
├── auth.rs           # Profiles, PIN, permissions, audit (977 lines)
├── clientes.rs       # Client CRUD (377 lines)
├── equipamentos.rs   # Equipment/receipt management (559 lines)
├── produtos.rs     # Supply/warehouse (540 lines)
├── comunicacoes.rs # Email/WhatsApp history (90 lines)
├── verificacoes.rs # Technical checks (191 lines)
├── smtp.rs        # Email sending (358 lines)
├── whatsapp.rs    # WhatsApp integration (190 lines)
├── types.rs      # Shared type definitions (16495 bytes)
└── mod.rs       # Module exports
```

## WHERE TO LOOK

| Command | Handler | Notes |
|---------|--------|-------|
| Profile auth | `auth.rs` | `create_profile`, `validate_pin`, `list_profiles` |
| Client CRUD | `clientes.rs` | `list_clientes`, `create_cliente`, `update_cliente` |
| Equipment | `equipamentos.rs` | `list_equipamentos`, `create_recebimento`, `update_status` |
| Products | `produtos.rs` | `estoque_movimentacao`, `list_produtos` |
| Backup/Restore | `util.rs` | `backup_database`, `restore_database` |
| Schema check | `util.rs` | ` schema_status` |

## CONVENTIONS

- All commands use `Result<T, String>` for error handling
- DB pool passed as state `State<DbPool>`
- Sensitive commands need `profile_id` + `action` with PIN verification
- Audit trail via `audit_log` table

## ANTI-PATTERNS (THIS COMMAND LAYER)

- No direct DB connection creation in commands
- Don't bypass profile/PIN for "internal" actions
- No SQL injection - use parameterized queries