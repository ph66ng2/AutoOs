# AutoOS - Copilot Instructions

## Projeto Concluído ✅

- [x] Verificado que o arquivo copilot-instructions.md existe
- [x] Requisitos do projeto clarificados
- [x] Projeto scaffolded com Tauri 2.x + React 18 + TypeScript
- [x] Projeto customizado com dependências necessárias
- [x] Extensões instaladas (nenhuma adicional requerida)
- [x] Projeto compilado sem erros
- [x] Tasks criadas
- [x] Projeto pronto para launch
- [x] Documentação completa

## Sobre o Projeto

**AutoOS** é um sistema desktop de gestão de impressoras e controle de estoque de insumos.

### Stack Tecnológica

- Frontend: React 18 + TypeScript
- Desktop: Tauri 2.x (Rust backend)
- UI: shadcn/ui + Tailwind CSS
- Banco: SQLite
- Forms: React Hook Form + Zod
- Tables: TanStack Table
- State: Zustand
- Router: React Router v6

### Estrutura do Projeto

```
autoos/
├── src/                    # Frontend React
│   ├── components/ui/      # Componentes shadcn/ui
│   ├── types/              # TypeScript types
│   ├── lib/                # Utilitários
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Backend Rust
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── db.rs           # SQLite database
│   │   ├── commands.rs     # Tauri commands (CRUD)
│   │   └── printer.rs      # QR code & printer integration
│   └── Cargo.toml
├── package.json
└── README.md
```

### Como Executar

```bash
# Desenvolvimento
npm run tauri dev

# Build de produção
npm run tauri build

# Verificar TypeScript
npx tsc --noEmit

# Verificar Rust
cd src-tauri && cargo check
```

### Próximos Passos

Consulte o arquivo [NEXT_STEPS.md](../NEXT_STEPS.md) para ver o roadmap de funcionalidades a implementar.

## Regras de Desenvolvimento

- Use '.' como diretório de trabalho
- Mantenha comunicação concisa
- Siga boas práticas de desenvolvimento
- Documente mudanças complexas
- Teste antes de fazer commit
