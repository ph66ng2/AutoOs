# Correções de atualização e fotos — implementação

Complementa o diagnóstico `equipment-update-2026-10-27.md` e as otimizações de carregamento desktop. Destino: master.

## Comportamento aplicado

- Consultas recebem uma geração; respostas/erros/finalizações obsoletos não substituem filtros e resultados atuais. Invalidação acontece no commit de novos parâmetros e no unmount.
- Recargas após escrita e em segundo plano preservam a tabela. Falha na recarga é visível e distinguida de falha no salvamento; a consulta autoritativa mantém filtros, ordenação, paginação e totais.
- Uma edição apenas textual não chama substituição de fotos. A comparação usa os campos persistidos e a ordem por categoria, sem serializar/cópia profunda do Base64. IDs/preview da UI não contam como edição da foto.
- Edição sem snapshot de fotos carregado com sucesso não grava; a ação explícita Recarregar fotos preserva os campos de texto e informa que substitui a seleção local de fotos.
- Quando as fotos mudam, o frontend envia os IDs do snapshot. O backend confere o conjunto de IDs antes de apagar qualquer linha. Conflito mantém o formulário/texto e permite recarga; falha parcial adota o ID/token do equipamento já gravado para não recriar o cadastro.
- Todos os writers de imagens usam uma transação e o mesmo lock de linha do equipamento, incluindo a adição raw usada pelo servidor de fotos. Isso fecha a janela entre conferir o snapshot e substituir as fotos. A contagem do limite ocorre após o lock. Operações IPC de usuário validam a empresa da sessão; a fronteira de autorização do QR/raw é preservada.
- Callbacks de fotos e salvamentos de um formulário antigo não limpam, fecham ou inserem fotos em um formulário aberto depois.

## Cloudflare e compatibilidade

`photo_server.rs`, PhotoUploadDialog, geração de QR, localização/execução do cloudflared e o binário externo não foram alterados. A assinatura da função raw de recebimento continua igual. O parâmetro `expectedImageIds` é obrigatório na substituição de fotos: o frontend envia uma lista vazia na criação e os IDs do snapshot na edição ou entrega.

Nenhuma migration, mudança de formato das fotos, backend SaaS ou realtime geral entre PCs foi adicionada. O formato storage_path/data URL continua igual.

## Ganho e trade-offs

A gravação de fotos inalteradas é eliminada por completo: zero chamadas de substituição e zero payload de fotos nesse caso. Na contagem do diagnóstico, isso retira N+5 operações SQL do caminho de uma edição textual (até 11 com seis fotos). Não é uma medição de tempo real de PostgreSQL.

Fotos realmente alteradas agora têm verificação adicional de concorrência/empresa e podem aguardar uma alteração do mesmo equipamento. É um custo deliberado de consistência, sem lock global de tabela. Não foram removidas validações, proteção de concorrência do equipamento, auditoria ou permissões financeiras para melhorar números.

Não houve atualização local especulativa de linhas antes da confirmação do banco; a recarga autoritativa continua para não inventar resultados de filtro/ordem/total.

## Validação

- TypeScript e build de produção passaram após os ajustes de revisão.
- Testes focados de hook, igualdade de fotos e edição: 42/42 passaram.
- O bin de integração p1_critical_integration inclui snapshot obsoleto e concorrência entre upload raw e substituição.
- Rust/PostgreSQL não estão disponíveis neste host. Compilação e integração nativa dependem do CI do PR; não foram declaradas como executadas localmente.
- A execução completa frontend e o teste de navegador final são registrados no PR conforme terminarem.

QA Windows antes do merge: manter cloudflared.exe na mesma pasta, abrir QR e enviar foto; salvar edição apenas textual; adicionar/remover/reordenar fotos; receber uma foto por outro dispositivo durante uma edição com fotos alteradas e conferir que o conflito preserva a foto recebida e o texto do formulário.
