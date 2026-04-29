/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  hooks/useStatusEquipamento.ts — Automação de Status        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Hook que gerencia transições de status com automação de    ║
 * ║  comunicações (WhatsApp e Email).                            ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (salvar verificação, atualizar status, buscar) ║
 * ║  - lib/whatsapp-service.ts (envio via API)                  ║
 * ║  - lib/email-service.ts (envio SMTP real)                   ║
 * ║  - types/index.ts (Equipamento)                              ║
 * ║  - components/VerificacaoTecnica.tsx (DadosVerificacao)     ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (finalizarVerificacao,            ║
 * ║    marcarComoPronto)                                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { useState } from "react";
import { db } from "@/lib/db";
import { EmailService } from "@/lib/email-service";
import { WhatsAppService } from "@/lib/whatsapp-service";
import type { Equipamento } from "@/types";
import type { DadosVerificacao } from "@/components/equipamentos/VerificacaoTecnica";

/** Resultado da automação com status de cada canal de comunicação */
interface ResultadoAutomacao {
  sucesso: boolean;
  erro?: string;
  email?: { sucesso: boolean; erro?: string };
  whatsapp?: { sucesso: boolean; erro?: string };
}

/**
 * Hook que gerencia transições de status com automação de comunicações.
 *
 * Transições automáticas:
 * 1. Finalizar Verificação  → salva verificação + muda para VERIFICADO → AGUARDANDO_APROVACAO
 *    → dispara WhatsApp + Email
 * 2. Marcar como Pronto     → muda para PRONTO
 *    → dispara WhatsApp + Email
 */
export function useStatusEquipamento() {
  const [loading, setLoading] = useState(false);

  /**
   * Finaliza verificação e envia orçamento automaticamente.
   * Fluxo: EM_VERIFICACAO → VERIFICADO → AGUARDANDO_APROVACAO + notificações
   */
  async function finalizarVerificacao(
    equipamento: Equipamento,
    dadosVerificacao: DadosVerificacao
  ): Promise<ResultadoAutomacao> {
    setLoading(true);
    try {
      // 1. Salvar verificação no banco
      await db.salvarVerificacao(dadosVerificacao);

      // 2. Atualizar para VERIFICADO
      await db.atualizarStatusEquipamento(
        equipamento.id!,
        "VERIFICADO",
        undefined,
        undefined,
        undefined,
        equipamento.atualizado_em
      );

      const equipamentoVerificado = await db.buscarEquipamento(equipamento.id!);

      // 3. Calcular prazo (3 dias úteis)
      const prazo = calcularPrazoAprovacao(3);

      // 4. Atualizar para AGUARDANDO_APROVACAO com valor e prazo
      await db.atualizarStatusEquipamento(
        equipamento.id!,
        "AGUARDANDO_APROVACAO",
        dadosVerificacao.custo_total || undefined,
        prazo.toISOString().split("T")[0],
        undefined,
        equipamentoVerificado.atualizado_em
      );

      // 5. Buscar dados atualizados
      const eqAtualizado = await db.buscarEquipamento(equipamento.id!);
      const verificacao = await db.buscarVerificacao(equipamento.id!);

      if (!verificacao) {
        return { sucesso: true };
      }

      const [resultadoWhatsAppSettled, resultadoEmailSettled] = await Promise.allSettled([
        WhatsAppService.enviarOrcamento(eqAtualizado, verificacao),
        EmailService.enviarOrcamento(eqAtualizado, verificacao),
      ]);

      const resultadoWhatsApp = resultadoWhatsAppSettled.status === "fulfilled"
        ? resultadoWhatsAppSettled.value
        : { sucesso: false, erro: resultadoWhatsAppSettled.reason?.message || String(resultadoWhatsAppSettled.reason) };
      const resultadoEmail = resultadoEmailSettled.status === "fulfilled"
        ? resultadoEmailSettled.value
        : { sucesso: false, erro: resultadoEmailSettled.reason?.message || String(resultadoEmailSettled.reason) };

      return {
        sucesso: true,
        email: resultadoEmail,
        whatsapp: resultadoWhatsApp,
      };
    } catch (error: any) {
      console.error("Erro ao finalizar verificação:", error);
      return { sucesso: false, erro: error?.message || String(error) };
    } finally {
      setLoading(false);
    }
  }

  /**
   * Marca equipamento como PRONTO e notifica cliente automaticamente.
   */
  async function marcarComoPronto(
    equipamento: Equipamento
  ): Promise<ResultadoAutomacao> {
    setLoading(true);
    try {
      // 1. Atualizar status para PRONTO
      await db.atualizarStatusEquipamento(
        equipamento.id!,
        "PRONTO",
        undefined,
        undefined,
        undefined,
        equipamento.atualizado_em
      );

      // 2. Buscar dados atualizados
      const eqAtualizado = await db.buscarEquipamento(equipamento.id!);

      const [resultadoWhatsAppSettled, resultadoEmailSettled] = await Promise.allSettled([
        WhatsAppService.enviarEquipamentoPronto(eqAtualizado),
        EmailService.enviarEquipamentoPronto(eqAtualizado),
      ]);

      const resultadoWhatsApp = resultadoWhatsAppSettled.status === "fulfilled"
        ? resultadoWhatsAppSettled.value
        : { sucesso: false, erro: resultadoWhatsAppSettled.reason?.message || String(resultadoWhatsAppSettled.reason) };
      const resultadoEmail = resultadoEmailSettled.status === "fulfilled"
        ? resultadoEmailSettled.value
        : { sucesso: false, erro: resultadoEmailSettled.reason?.message || String(resultadoEmailSettled.reason) };

      return {
        sucesso: true,
        email: resultadoEmail,
        whatsapp: resultadoWhatsApp,
      };
    } catch (error: any) {
      console.error("Erro ao marcar como pronto:", error);
      return { sucesso: false, erro: error?.message || String(error) };
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    finalizarVerificacao,
    marcarComoPronto,
  };
}

// ─── Utilitário ─────────────────────────────────────────

/** Calcula data futura pulando fins de semana */
function calcularPrazoAprovacao(diasUteis: number): Date {
  const data = new Date();
  let adicionados = 0;
  while (adicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const dia = data.getDay();
    if (dia !== 0 && dia !== 6) adicionados++;
  }
  return data;
}
