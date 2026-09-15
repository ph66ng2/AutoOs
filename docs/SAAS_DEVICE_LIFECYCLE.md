# Ciclo de vida de dispositivos SaaS

Cada instalação SaaS cria um UUID aleatório e o mantém em um marcador local
não secreto. O UUID não é fingerprint de hardware e não contém token, senha,
PIN, empresa ou usuário. A associação autoritativa é criada no servidor pela
RPC `register_autoos_device`: empresa, usuário e `session_id` são obtidos do
JWT validado, nunca de dados enviados pelo desktop.

## Efeitos das ações

| Ação | Sessão no cofre | Marcador / PINs / cache | Registro server-side |
| --- | --- | --- | --- |
| Bloquear | preservado | preservados | ativo |
| Sair | removido | preservados | dispositivo continua ativo; a próxima sessão será registrada |
| Remover esta máquina | removido após revogação confirmada | marcador removido; PIN/cache SaaS serão incluídos quando existirem nos tickets dependentes | revogado |

`Remover esta máquina` não limpa o estado local se a revogação remota falhar
ou estiver offline. Assim o operador pode tentar novamente sem perder a única
evidência necessária para revogar o dispositivo.

## Reinstalação

No boot, uma sessão presente no cofre sem marcador local de dispositivo é
considerada residual. O AutoOS a remove e exige email e senha de administrador.
O novo login cria um novo UUID de instalação e o registra com a nova sessão.

## Gates cloud e revogação

Todo endpoint que emitir entitlement, token PowerSync ou sessão de fotos deve
chamar `assert_active_autoos_device(device_id)` antes de conceder capacidade.
Esse gate valida `empresa_id`, `auth_user_id`, `session_id` e estado ativo no
registro server-side.

Um access token JWT já emitido pode continuar criptograficamente válido até seu
`exp`. Por isso operações sensíveis não podem depender apenas da validação do
JWT: elas precisam do gate de dispositivo/sessão acima. A revogação do
dispositivo bloqueia imediatamente as capacidades que usam esse gate; a
expiração do JWT cobre consumidores legados que ainda validem somente a
assinatura do token.

## Operação no staging

Aplicar a migração, usar apenas empresa/administrador sintéticos e registrar
duas instalações isoladas. Ao encerrar a homologação, revogar os dispositivos
sintéticos primeiro e só então limpar marcador, cofre e cache de cada VM.
