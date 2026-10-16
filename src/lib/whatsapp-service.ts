/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/whatsapp-service.ts — Serviço de WhatsApp por API      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Orçamento, decisão e "pronto" pedem o envio ao backend por  ║
 * ║  `solicitar_envio_whatsapp` (fila com tentativas e histórico);║
 * ║  o texto é montado lá. O link de acompanhamento ainda usa o  ║
 * ║  envio direto, porque o token só existe na tela.             ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (solicitarEnvioWhatsapp, registrarComunicacao)  ║
 * ║  - types/index.ts (Equipamento, Verificacao)                 ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - hooks/useStatusEquipamento.ts (automação pós-verificação)║
 * ║  - pages/Equipamentos.tsx (botões manuais de WhatsApp)      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import type {
  Comunicacao,
  Equipamento,
  EstadoEnvioWhatsapp,
  ResultadoEnvioWhatsapp,
  TipoEnvioWhatsapp,
  Verificacao,
} from "@/types";
import { resolveRecipient } from "@/lib/recipient-resolver";

async function registrarComunicacaoSegura(comunicacao: Omit<Comunicacao, "id">) {
  try {
    await db.registrarComunicacao(comunicacao);
  } catch (error) {
    console.error("[WhatsAppService] Falha ao registrar comunicação:", error);
  }
}

/** Adiciona DDI 55 (Brasil) se não presente. Remove caracteres não-numéricos */
function formatarTelefone(telefone: string): string {
  const numeros = telefone.replace(/\D/g, "");
  // Pelo tamanho, não pelo prefixo: DDD 55 (RS) com 10/11 dígitos ainda precisa do DDI.
  const normalizado = numeros.startsWith("55") && numeros.length >= 12 ? numeros : "55" + numeros;
  if (normalizado.length < 12) {
    throw new Error("Telefone do cliente inválido para envio de WhatsApp");
  }

  return normalizado;
}

export const WhatsAppService = {
  /** Envia o link de acompanhamento e registra apenas o resultado, nunca o token. */
  async enviarLinkStatusPublico(equipamento: Equipamento, url: string) {
    const recipient = resolveRecipient(equipamento, "telefone");
    if (!recipient.endereco) {
      return { sucesso: false, erro: "Não há telefone cadastrado para este atendimento." };
    }

    const mensagem = `Olá, ${recipient.nome}! Acompanhe a etapa atual do atendimento do seu equipamento ${equipamento.marca} ${equipamento.modelo} pelo link seguro: ${url}\n\nEste link permite apenas consultar o andamento e não aprova orçamento nem altera dados.\n\nBMI TAG`;
    const logMessage = "Link público de acompanhamento enviado. O token foi omitido do histórico interno.";
    let telefone = recipient.endereco;

    try {
      telefone = formatarTelefone(recipient.endereco);
      await invoke<void>("enviar_whatsapp", {
        input: { contato: telefone, mensagem },
      });
      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "STATUS_PUBLICO",
        canal: "WHATSAPP",
        destinatario: recipient.nome,
        contato: telefone,
        mensagem: logMessage,
        enviado: true,
        data_envio: new Date().toISOString(),
      });
      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || "Falha ao enviar o link por WhatsApp.");
      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "STATUS_PUBLICO",
        canal: "WHATSAPP",
        destinatario: recipient.nome,
        contato: telefone,
        mensagem: logMessage,
        enviado: false,
        erro: erroMsg,
      });
      return { sucesso: false, erro: erroMsg };
    }
  },

  /**
   * Pede ao backend o envio de um evento. A tela não monta nem transmite o texto: o backend
   * busca os dados atualizados, congela o orçamento, escolhe a mensagem, evita duplicidade e
   * registra cada tentativa. Conecta-se a: db.solicitarEnvioWhatsapp → solicitar_envio_whatsapp.
   */
  async solicitarEnvio(
    equipamentoId: number,
    tipo: TipoEnvioWhatsapp,
    opcoes: OpcoesEnvioWhatsapp = {},
  ): Promise<ResultadoSolicitacaoWhatsapp> {
    try {
      const resultado = await db.solicitarEnvioWhatsapp({
        equipamento_id: equipamentoId,
        tipo,
        reenvio_manual: opcoes.reenvioManual ?? false,
        confirmar_incerto: opcoes.confirmarIncerto ?? false,
      });
      return traduzirResultado(resultado);
    } catch (error: any) {
      const erro = typeof error === "string" ? error : (error?.message || "Falha ao solicitar o envio de WhatsApp");
      return { sucesso: false, estado: "FALHOU", erro };
    }
  },

  /** Orçamento concluído: texto informativo a partir da versão congelada do orçamento. */
  async enviarOrcamento(equipamento: Equipamento, _verificacao?: Verificacao, opcoes?: OpcoesEnvioWhatsapp) {
    return WhatsAppService.solicitarEnvio(equipamento.id!, "orcamento_informativo", opcoes);
  },

  /** Equipamento PRONTO: aviso de retirada. */
  async enviarEquipamentoPronto(equipamento: Equipamento, opcoes?: OpcoesEnvioWhatsapp) {
    return WhatsAppService.solicitarEnvio(equipamento.id!, "equipamento_pronto", opcoes);
  },
};

export interface OpcoesEnvioWhatsapp {
  reenvioManual?: boolean;
  confirmarIncerto?: boolean;
}

export interface ResultadoSolicitacaoWhatsapp {
  /** `true` quando o provedor aceitou o envio ou o evento já havia sido solicitado. */
  sucesso: boolean;
  estado: EstadoEnvioWhatsapp;
  erro?: string;
  /** A mensagem entrou na fila central e será enviada pelo processador em instantes. */
  enfileirada?: boolean;
  /** O pedido já existia e não foi enviado de novo (gatilho automático repetido). */
  jaSolicitado?: boolean;
  /** O envio anterior tem resultado incerto; repetir exige confirmação do operador. */
  requerConfirmacao?: boolean;
  mensagem?: string;
}

function traduzirResultado(resultado: ResultadoEnvioWhatsapp): ResultadoSolicitacaoWhatsapp {
  const mensagem = resultado.mensagem ?? undefined;
  switch (resultado.estado) {
    case "ENVIADA":
      return { sucesso: true, estado: resultado.estado };
    case "ENFILEIRADA":
      return { sucesso: true, estado: resultado.estado, enfileirada: true, mensagem };
    case "JA_SOLICITADO":
      return { sucesso: true, estado: resultado.estado, jaSolicitado: true, mensagem };
    case "REQUER_CONFIRMACAO":
      return { sucesso: false, estado: resultado.estado, requerConfirmacao: true, erro: mensagem, mensagem };
    default:
      return { sucesso: false, estado: resultado.estado, erro: mensagem ?? "Falha ao enviar WhatsApp", mensagem };
  }
}
