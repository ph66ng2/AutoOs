/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  hooks/useStatusEquipamento.ts — Automação de Status        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Hook que gerencia transições de status com automação de    ║
 * ║  comunicações (WhatsApp).                                    ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (salvar verificação, atualizar status, buscar) ║
 * ║  - lib/whatsapp-service.ts (envio via API)                  ║
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
import { WhatsAppService } from "@/lib/whatsapp-service";
import { EmailService } from "@/lib/email-service";
import type { Equipamento, ResultadoAutomacao } from "@/types";
import type { DadosVerificacao } from "@/components/equipamentos/VerificacaoTecnica";

/**
 * Hook que gerencia transições de status com automação de comunicações.
 *
 * Transições automáticas:
 * 1. Finalizar Verificação  → salva verificação + muda para VERIFICADO → AGUARDANDO_APROVACAO
 *    → dispara WhatsApp
 * 2. Marcar como Pronto     → muda para PRONTO
 *    → dispara WhatsApp
 */
export function useStatusEquipamento() {
  const [loading, setLoading] = useState(false);

  /**
   * Finaliza verificação e envia orçamento automaticamente.
   * Fluxo: EM_VERIFICACAO → VERIFICADO → AGUARDANDO_APROVACAO + notificações
   */
  async function finalizarVerificacao(
    equipamento: Equipamento,
    dadosVerificacao: DadosVerificacao,
    emailContatoFallback?: string
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
        return {
          sucesso: true,
          canais: {
            whatsapp: { enviado: false, erro: "Verificação não encontrada para envio de WhatsApp." },
            email: { enviado: false, erro: "Verificação não encontrada para envio de Email." },
          },
        };
      }

      let resultadoWhatsApp: { sucesso: boolean; erro?: string };
      try {
        resultadoWhatsApp = await WhatsAppService.enviarOrcamento(eqAtualizado, verificacao);
      } catch (error: any) {
        resultadoWhatsApp = { sucesso: false, erro: error?.message || String(error) };
      }

      let resultadoEmail: { sucesso: boolean; erro?: string };
      try {
        const emailContato = (eqAtualizado.cliente_email || emailContatoFallback || "").trim();
        if (!emailContato) {
          resultadoEmail = { sucesso: false, erro: "Cliente sem email cadastrado" };
        } else {
          resultadoEmail = await EmailService.enviarOrcamento(
            { ...eqAtualizado, cliente_email: emailContato },
            verificacao
          );
        }
      } catch (error: any) {
        resultadoEmail = { sucesso: false, erro: error?.message || String(error) };
      }

      return {
        sucesso: true,
        canais: {
          whatsapp: { enviado: !!resultadoWhatsApp.sucesso, erro: resultadoWhatsApp.erro },
          email: { enviado: !!resultadoEmail.sucesso, erro: resultadoEmail.erro },
        },
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
    equipamento: Equipamento,
    emailContatoFallback?: string
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

      let resultadoWhatsApp: { sucesso: boolean; erro?: string };
      try {
        resultadoWhatsApp = await WhatsAppService.enviarEquipamentoPronto(eqAtualizado);
      } catch (error: any) {
        resultadoWhatsApp = { sucesso: false, erro: error?.message || String(error) };
      }

      let resultadoEmail: { sucesso: boolean; erro?: string };
      try {
        const emailContato = (eqAtualizado.cliente_email || emailContatoFallback || "").trim();
        if (!emailContato) {
          resultadoEmail = { sucesso: false, erro: "Cliente sem email cadastrado" };
        } else {
          resultadoEmail = await EmailService.enviarEquipamentoPronto(
            { ...eqAtualizado, cliente_email: emailContato }
          );
        }
      } catch (error: any) {
        resultadoEmail = { sucesso: false, erro: error?.message || String(error) };
      }

      return {
        sucesso: true,
        canais: {
          whatsapp: { enviado: !!resultadoWhatsApp.sucesso, erro: resultadoWhatsApp.erro },
          email: { enviado: !!resultadoEmail.sucesso, erro: resultadoEmail.erro },
        },
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
