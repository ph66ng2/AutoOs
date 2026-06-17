# Decisions - Error Modal Cohesion

## Architecture Decisions
1. Sonner para toasts (shadcn-recommended, CSS variables aware)
2. AlertDialog para confirmações (replaces window.confirm)
3. InputDialog customizado para window.prompt
4. ErrorAlert unifica 5 padrões visuais
5. useNotification hook centraliza formato de mensagens

## Format
- Mensagens: `"[Contexto] — Ação"` como título + `description` como corpo
- Erros: `"Copiar detalhes"` button com clipboard API
- Auto-dismiss: success=3s, warning=5s, info=4s, error=manual
- Max visible toasts: 3

## Color System
- Error: destructive (red)
- Warning: amber/orange (--warning)
- Info: blue (--info)
- Success: green/emerald
