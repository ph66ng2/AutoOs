# Frontend Services & Utilities

**Path:** `src/lib/`  
**Reason:** 12 files, 18+ exports, distinct domain (external integrations)

## OVERVIEW

Services for DB, email, WhatsApp, PDF, plus validations and utilities.

## STRUCTURE

```
lib/
├── db.ts                   # Tauri invoke wrappers (11k)
├── email-service.ts        # SMTP email (15k)
├── pdf-service.ts       # jsPDF generation (23k)
├── whatsapp-service.ts # WhatsApp API (7.6k)
├── validations.ts      # Zod schemas (11k)
├── sensitive-access.ts # PIN/auth UI (2.6k)
├── smtp-config.ts   # SMTP settings (1.8k)
├── whatsapp-config.ts # WhatsApp config (413 bytes)
├── utils.ts         # General utils (2.4k)
└── utils.test.ts    # Unit tests
```

## WHERE TO LOOK

| Service | File | Notes |
|---------|------|-------|
| DB calls | `db.ts` | `invoke()` wrappers |
| PDF generation | `pdf-service.ts` | jsPDF + autotable |
| Email sending | `email-service.ts` | SMTP via Rust backend |
| WhatsApp | `whatsapp-service.ts` | External WhatsApp API |
| Form validation | `validations.ts` | Zod schemas for all entities |
| Sensitive dialog | `sensitive-access.tsx` | PIN entry modal |

## CONVENTIONS

- All Tauri calls via `db.ts` wrapper functions
- Export types in `src/types/index.ts`
- Zod schemas for form validation
- PDF uses logo from `logo-base64.ts` (281k!)

## ANTI-PATTERNS (THIS LIB)

- Don't use fetch/axios for Tauri commands (use invoke)
- Don't hardcode credentials (use Configuracoes)
- Don't bundle large assets (logo is 281k base64)