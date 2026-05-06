# Route Pages

**Path:** `src/pages/`  
**Reason:** 6 files, each 700+ lines, distinct domain per page

## OVERVIEW

Main route pages - each is a full feature module.

## STRUCTURE

```
pages/
├── Clientes.tsx         # Client CRUD (708 lines)
├── Equipamentos.tsx      # Equipment/receipt (1466 lines)
├── Insumos.tsx         # Supply/stock (720 lines)
├── Configuracoes.tsx    # Settings/security (1590 lines)
├── Dashboard.tsx        # Overview (21k)
└── Perfil.tsx         # User profile (4k)
```

## WHERE TO LOOK

| Page | Size | Features |
|------|------|---------|
| Clientes | 708 lines | List, add, edit, delete clients |
| Equipamentos | 1466 lines | Technical receipt, status tracking |
| Insumos | 720 lines | Stock movements, input/output |
| Configuracoes | 1590 lines | Profiles, PIN, backup, restore, schema |
| Dashboard | 21k | Charts, summary |
| Perfil | 4k | Profile settings |

## CONVENTIONS

- Uses React Router page structure
- TanStack Table for lists
- React Hook Form + Zod for forms
- shadcn/ui components throughout
- Zustand only where needed (most is local state)

## ANTI-PATTERNS (THIS PAGES)

- Don't create new Zustand stores (hooks preferred)
- Don't add SQLite anywhere
- Don't bypass PIN for sensitive operations