# Modo Balcão — baseline de produção

- Referência: `origin/master`
- SHA utilizado: `cf8a26bd5c6f5f4c6af3e4a1ca8d8c841c249423`
- Data: 2026-09-01

Esta branch (`counter-mode`) foi criada diretamente desse commit. Nenhuma mudança da
branch `feature` ou de worktrees de agentes foi incorporada.

## Caracterização inicial

- O bootstrap exige a seleção de perfil e PIN em `SensitiveAccessProvider`.
- As rotas administrativas permanecem sob `Layout`.
- Equipamentos, clientes e transições de status passam por `db`, hooks e pela FSM
  existente; a transição para `ENTREGUE` exige a permissão financeira e o PIN.
- A geração atual de PDF persiste e abre documentos pelo serviço `PdfService`.

Os testes do modo balcão devem preservar estes comportamentos antes de alterar os
fluxos administrativos existentes.
