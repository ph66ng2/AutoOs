/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/whatsapp-service.ts — Serviço de WhatsApp por API      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Gera mensagens formatadas e envia pelo backend Tauri.      ║
 * ║  Registra cada envio na tabela `comunicacoes` para          ║
 * ║  tabela `comunicacoes` para rastreabilidade.                 ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - @tauri-apps/api/core (invoke) — aciona envio no backend  ║
 * ║  - lib/db.ts (registrarComunicacao) — salva log no banco    ║
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
  PecaNecessaria,
  ServicoNecessario,
  Verificacao,
  WhatsappSendRequest,
} from "@/types";

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
  const normalizado = numeros.startsWith("55") ? numeros : "55" + numeros;
  if (normalizado.length < 12) {
    throw new Error("Telefone do cliente inválido para envio de WhatsApp");
  }

  return normalizado;
}

function parseJsonList<T>(value?: string): T[] {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as T[];
  } catch {
    return [];
  }
}

export const WhatsAppService = {
  /**
   * Envia orçamento via WhatsApp API.
   * Monta mensagem com: dados do equipamento, serviços, peças, valor total, prazo.
   * Registra comunicação tipo=ORCAMENTO canal=WHATSAPP no banco.
   * Conecta-se a: db.registrarComunicacao, backend enviar_whatsapp
   */
  async enviarOrcamento(equipamento: Equipamento, verificacao: Verificacao) {
    if (!equipamento.cliente_telefone) {
      return { sucesso: false, erro: "Cliente não possui telefone cadastrado" };
    }

    const servicos = parseJsonList<ServicoNecessario>(verificacao.servicos_necessarios);
    const pecas = parseJsonList<PecaNecessaria>(verificacao.pecas_necessarias);

    let detalhesServicos = "";
    if (servicos.length > 0) {
      detalhesServicos = "\n*SERVIÇOS:*\n" +
        servicos.map((s: any) => `• ${s.descricao}: R$ ${s.valor.toFixed(2)}`).join("\n");
    }

    let detalhesPecas = "";
    if (pecas.length > 0) {
      detalhesPecas = "\n*PEÇAS:*\n" +
        pecas.map((p: any) => `• ${p.nome} (x${p.quantidade}): R$ ${p.valorTotal.toFixed(2)}`).join("\n");
    }

    const mensagem = `🔧 *Olá, ${equipamento.cliente_nome}!*

Seu equipamento foi verificado e elaboramos o orçamento:

*EQUIPAMENTO:*
${equipamento.marca} ${equipamento.modelo}
SN: ${equipamento.serial_number}
${detalhesServicos}${detalhesPecas}

*ORÇAMENTO:*
Mão de Obra: R$ ${(verificacao.custo_estimado_mao_obra || 0).toFixed(2)}
Peças: R$ ${(verificacao.custo_estimado_pecas || 0).toFixed(2)}
━━━━━━━━━━━━━━━━━━━━
*TOTAL: R$ ${(verificacao.custo_total || 0).toFixed(2)}*

⏱️ Tempo estimado: ${verificacao.tempo_estimado || 0}h
${equipamento.prazo_aprovacao ? `📅 Prazo para aprovação: ${new Date(equipamento.prazo_aprovacao).toLocaleDateString("pt-BR")}` : ""}

Para aprovar, responda *APROVADO*.
Para dúvidas, estamos à disposição! 😊`;

    let telefone = equipamento.cliente_telefone;

    try {
      telefone = formatarTelefone(equipamento.cliente_telefone);

      const request: WhatsappSendRequest = {
        contato: telefone,
        mensagem,
      };
      await invoke<void>("enviar_whatsapp", { input: request });

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "ORCAMENTO",
        canal: "WHATSAPP",
        destinatario: equipamento.cliente_nome || "",
        contato: telefone,
        mensagem,
        enviado: true,
        data_envio: new Date().toISOString(),
      });

      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || error?.toString() || "Falha ao enviar WhatsApp");

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "ORCAMENTO",
        canal: "WHATSAPP",
        destinatario: equipamento.cliente_nome || "",
        contato: telefone,
        mensagem,
        enviado: false,
        erro: erroMsg,
      });

      return { sucesso: false, erro: erroMsg };
    }
  },

  /**
   * Notifica cliente que equipamento está PRONTO via WhatsApp API.
   * Monta mensagem com: dados do equipamento, valor a pagar.
   * Registra comunicação tipo=PRONTO canal=WHATSAPP no banco.
   * Conecta-se a: db.registrarComunicacao, backend enviar_whatsapp
   */
  async enviarEquipamentoPronto(equipamento: Equipamento) {
    if (!equipamento.cliente_telefone) {
      return { sucesso: false, erro: "Cliente não possui telefone cadastrado" };
    }

    const valor = equipamento.valor_final || equipamento.valor_orcamento;

    const mensagem = `🎉 *Ótimas notícias, ${equipamento.cliente_nome}!*

Seu equipamento está *PRONTO* para retirada! ✅

*EQUIPAMENTO:*
${equipamento.marca} ${equipamento.modelo}
SN: ${equipamento.serial_number}

${valor ? `💰 Valor a pagar: R$ ${valor.toFixed(2)}\n` : ""}
Traga documento com foto para retirada.

Aguardamos você! 😊`;

    let telefone = equipamento.cliente_telefone;

    try {
      telefone = formatarTelefone(equipamento.cliente_telefone);

      const request: WhatsappSendRequest = {
        contato: telefone,
        mensagem,
      };
      await invoke<void>("enviar_whatsapp", { input: request });

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "PRONTO",
        canal: "WHATSAPP",
        destinatario: equipamento.cliente_nome || "",
        contato: telefone,
        mensagem,
        enviado: true,
        data_envio: new Date().toISOString(),
      });

      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || error?.toString() || "Falha ao enviar WhatsApp");

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "PRONTO",
        canal: "WHATSAPP",
        destinatario: equipamento.cliente_nome || "",
        contato: telefone,
        mensagem,
        enviado: false,
        erro: erroMsg,
      });

      return { sucesso: false, erro: erroMsg };
    }
  },
};
