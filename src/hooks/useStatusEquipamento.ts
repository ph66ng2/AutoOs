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
import type { Equipamento, ResultadoAutomacao, Verificacao } from "@/types";
import type { DadosVerificacao } from "@/components/equipamentos/VerificacaoTecnica";
import { resolveRecipient } from "@/lib/recipient-resolver";
import { calcularPrazoAprovacao, enviarOrcamentoAoCliente } from "@/lib/envio-orcamento";

/** Resultado de `finalizarVerificacao`: contrato de `ResultadoAutomacao` + avisos do envio. */
export interface ResultadoFinalizarVerificacao extends ResultadoAutomacao {
  avisos?: string[];
  salvo?: { equipamento: Equipamento; verificacao: Verificacao };
}

/**
 * Hook que gerencia transições de status com automação de comunicações.
 *
 * Transições automáticas:
 * 1. Finalizar Verificação  → salva verificação e muda para AGUARDANDO_APROVACAO (uma transação)
 *    → dispara WhatsApp
 * 2. Marcar como Pronto     → muda para PRONTO
 *    → dispara WhatsApp
 */
export function useStatusEquipamento() {
  const [loading, setLoading] = useState(false);

  /**
   * Finaliza verificação e envia orçamento automaticamente.
   * Fluxo: EM_VERIFICACAO → AGUARDANDO_APROVACAO (uma transação no backend) + notificações
   */
  async function finalizarVerificacao(
    _equipamento: Equipamento,
    dadosVerificacao: DadosVerificacao,
    _emailContato?: string,
    _emailDestinatario?: string,
  ): Promise<ResultadoFinalizarVerificacao> {
    setLoading(true);
    try {
      // 1. Uma gravação só: itens da verificação + AGUARDANDO_APROVACAO com valor e prazo (3 dias
      //    úteis). Se algo falha, nada fica pela metade (antes, itens gravados com valor_orcamento 0).
      //    OS só de garantia já sai APROVADO na mesma transação.
      const salvo = await db.salvarVerificacao({
        ...dadosVerificacao,
        enviar_para_aprovacao_prazo: calcularPrazoAprovacao(3),
      });

      const { equipamento: equipamentoAposVerificacao, verificacao } = salvo;

      if (equipamentoAposVerificacao.status === "APROVADO") {
        return {
          sucesso: true,
          salvo,
          canais: {
            whatsapp: { enviado: false },
            email: { enviado: false },
          },
          avisos: ["OS só de garantia: orçamento R$ 0,00 segue aprovado, sem envio para aprovação de valor."],
        };
      }

      // O status já foi salvo; falha no envio não desfaz a mudança.
      try {
        const envio = await enviarOrcamentoAoCliente(equipamentoAposVerificacao, verificacao);
        return {
          sucesso: true,
          salvo,
          canais: envio.canais,
          ...(envio.envioManual ? { envioManual: envio.envioManual } : {}),
          avisos: envio.avisos,
        };
      } catch (error: any) {
        const erro = error?.message || String(error);
        return {
          sucesso: true,
          salvo,
          canais: {
            whatsapp: { enviado: false, erro },
            email: { enviado: false, erro },
          },
          avisos: [`Orçamento salvo. Use a ação de envio no detalhe da OS após conferir o resultado: ${erro}`],
        };
      }
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
    emailContato?: string | null,
    emailDestinatario?: string,
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
        const telefone = resolveRecipient(eqAtualizado, "telefone");
        resultadoWhatsApp = await WhatsAppService.enviarEquipamentoPronto({
          ...eqAtualizado,
          cliente_telefone: telefone.endereco || undefined,
          cliente_nome: telefone.nome,
        });
      } catch (error: any) {
        resultadoWhatsApp = { sucesso: false, erro: error?.message || String(error) };
      }

      let resultadoEmail: { sucesso: boolean; erro?: string };
      try {
        const emailContatoResolvido = emailContato === undefined
          ? (eqAtualizado.cliente_email || "").trim()
          : emailContato?.trim();
        if (emailContato === null) {
          resultadoEmail = { sucesso: false, erro: "pulado" };
        } else if (!emailContatoResolvido) {
          resultadoEmail = { sucesso: false, erro: "Cliente sem email cadastrado" };
        } else {
          resultadoEmail = await EmailService.enviarEquipamentoPronto(
            { ...eqAtualizado, cliente_email: emailContatoResolvido, cliente_nome: emailDestinatario || eqAtualizado.cliente_nome }
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
