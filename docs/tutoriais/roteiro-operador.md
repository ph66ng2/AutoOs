# Roteiro do vídeo: Portal do Cliente, guia do operador

Vídeo: `video-portal-operador.mp4` (53,8 s, 1440x900) e `.webm` (gravação recortada, sem cartões). Dados fictícios (mock `e2e/mocks/tauri-core-portal-video.ts`).
Regravar: `node scripts/tutoriais/gravar-portal-operador.mjs` (Chromium já instalado, ffmpeg).
Tempos no MP4 final (já somados 2,8 s do cartão de abertura). Aceite, 15 min e demais ações do cliente são simulados pelo mock.

| Tempo | Passo | Legenda |
|---|---|---|
| 0:00 | Abertura | Cartão: Portal do Cliente, Guia do operador |
| 0:02 | 1. Configurações → Integrações | Ligue o portal e as respostas: pede PIN e permissão financeira |
| 0:09 | 2. Dar acesso a um contato | Abra o equipamento e clique em 'Portal do Cliente' |
| 0:14 | 2. Dar acesso a um contato | 'Dar acesso a um contato': escolha Marina |
| 0:18 | 3. Liberar acesso e criar senha | Libere o acesso e crie a senha |
| 0:22 | 3. Liberar acesso e criar senha | A senha aparece uma única vez |
| 0:27 | 3. Liberar acesso e criar senha | Envie por WhatsApp ou copie os dados |
| 0:30 | 4. Publicar no Portal do Cliente | Publique o orçamento no Portal do Cliente |
| 0:36 | 5. Aceite recebido | Aceite recebido — confirma às HH:MM |
| 0:39 | 5. Aceite recebido | Não comece o serviço antes do horário |
| 0:44 | 6. Orçamento aprovado pelo cliente | Após 15 min: orçamento aprovado pelo cliente |
| 0:48 | 7. Exceções | Exceções: o que fazer em cada caso |
| fim | Encerramento | Dúvidas? Fale com o responsável pelo AutoOS |

## Observações

- Exceções (negociar, aceite não efetivado, pedido de correção) aparecem só no quadro-resumo final, sem tela clicada.
- O cartão que o operador preenche no app chama-se 'Portal das Impressoras do Cliente'; 'Fale com a equipe' é o que o cliente vê. Essa parte saiu do vídeo curto.
- A tela de PIN não aparece: a sessão da gravação já está desbloqueada.
