# AutoOS 0.6.0 — rascunho de notas e changelog

> Rascunho para o Release Manager revisar. Não commitado.
> Base: `master` em `bbb9efb` (desde a tag da 0.5.6, `cd2a8be`) + PRs abertos #156 a #159.
> **#156, #157, #158 e #159 ainda não estão na master.** Cada item marcado `[PR]` só entra se o PR for mergeado antes da tag. #159 está em rascunho.

## Resumo (para o usuário)

- Portal do Cliente: fotos, PDF do orçamento e comprovante de entrega; endereço e mapa na retirada; ordem de compra no aceite; negociação antes de recusar.
- Orçamento de venda avulsa de insumos (OI).
- Primeiro acesso por código do administrador; cada pessoa cria o próprio PIN, escolhe nome, ícone, cor e tema; tour por permissão.
- Nova permissão "Elaborar e enviar orçamentos", com prazo de aprovação e envio do orçamento com acesso ao portal.
- Abertura do app mais rápida `[PR #159]`.

## Changelog

### Novidades

- **Portal do Cliente**: Portal das Impressoras do Cliente, fila de WhatsApp e notificações (#136); rodada de ajustes do portal (#139); portal público de status com migration 0029 (#122).
- **Orçamento de venda avulsa de insumos (OI)** em Insumos/Peças → Orçamentos (#139).
- **Equipe e acessos**: cadastro guiado e gestão de equipe com sessões locais (#135); primeiro acesso por código, personalização e tour por permissão (#142); wizard de primeiro acesso com Voltar, tema fiel e acesso a Configurações (#152).
- **Permissão "Elaborar e enviar orçamentos"**, prazo de aprovação e envio do orçamento com acesso ao portal (#153).
- **Envio operacional** por WhatsApp e e-mail sem acesso à configuração de SMTP (#151).
- **Boot**: carimbo BMITAG na primeira abertura do dia (#133).
- **Estoque**: inventário de etiquetas e ribbons, peças vinculadas à aprovação de serviços, paginação nas listas principais.
- **Clientes/equipamentos**: busca de clientes por documento e ordenação por alteração recente; orientação em caso de CPF/CNPJ duplicado (#112).

### Correções

- Layout: "Configurações" permanece visível com a sessão bloqueada (#154).
- Leituras do keyring falham fechadas, fora do worker e com uma consulta por status (#148).
- Lista de clientes quando `telefone` é NULL (#141).
- Erros operacionais separados de erros SQL (#132).
- Catálogo de serviços isolado por empresa (#96); mínimo de insumos pela categoria (#97).
- Fotos: modal do QR sem barra de rolagem e com "Fotos recebidas" (#91, #92); câmera envia JPEG na hora (#87).
- Perfis simplificados para quem não gerencia equipe (#138).
- `[PR #156]` Diálogo "Quem recebe o orçamento?" atualiza o contato ativo sem WhatsApp em vez de criar um duplicado.
- `[PR #157]` Troca de PIN fica só em Equipe e acessos (`/perfil`); Configurações > Segurança passa a ter o card "Meu PIN" com link para lá.
- `[PR #158]` Trava de compatibilidade com a 0.5.6 (perfis sem permissão ou com permissões novas são recusados, para a 0.5.6 não perder o login no mesmo banco); prazo de aprovação sem erro de fuso depois das 21h; celular do contato com 11 dígitos; mensagem do orçamento com "R$ 150,00"; entrada de valores decimais pt-BR; correções de gastos e de contato obrigatório em cliente PJ. Detalhes no PR.

### Desempenho

- `[PR #159]` Telas e PDFs carregam sob demanda. JS inicial gzip de 668,5 KB para 194,7 KB (medido no build, não em Rust/PostgreSQL reais). Edição só de texto deixa de regravar as fotos.
- `[PR #159]` Consultas antigas não sobrescrevem mais o filtro mais recente; substituição de fotos obsoleta é bloqueada por comparação de IDs.

### Compatibilidade e atenção na atualização

- Enquanto houver PC na 0.5.6, `[PR #158]` esconde as permissões novas para perfis comuns e deixa o modelo **Recepção** indisponível. Desligar `COMPATIBILIDADE_056_ATIVA` só depois de todos os PCs estarem na 0.6.0.
- Migrations 0024–0029 e as da 0.6.0 precisam estar aplicadas antes do build (`docs/PRODUCTION_MIGRATIONS.md`). O desktop não aplica migrations.
- `[PR #159]` Sem migration. Fotos alteradas durante a edição podem pedir "Recarregar fotos" se outra foto chegar pelo celular no meio.

## Texto sugerido para `updater-notes.txt`

O arquivo atual já descreve o Portal, o OI e o primeiro acesso por código. Faltam só os itens abaixo, em tom de usuário. Confira o limite de tamanho com quem fez o #145 antes de colar, porque a tela de atualização é curta.

> Também na 0.6.0: permissão "Elaborar e enviar orçamentos" com prazo de aprovação; troca de PIN concentrada em Equipe e acessos; abertura do app mais rápida.

## Pendências para o Release Manager

1. Confirmar quais dos PRs #156 a #159 entram. As marcas `[PR]` acima dependem disso.
2. Os itens de Estoque e Clientes vêm dos títulos de commit do intervalo `cd2a8be..bbb9efb`. Não li os diffs de cada um; vale conferir antes de publicar.
3. Instalador `.exe`: ainda não foi testado. Precisa de Windows.
4. Versão 0.6.0 já está em `package.json`; conferir `Cargo.toml` e `tauri.conf.json` (checklist de `docs/RELEASE.md`).
