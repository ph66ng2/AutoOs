import { describe, expect, it } from "vitest";
import { STATUS_EQUIPAMENTO } from "@/types";
import { canTransition } from "@/lib/status-fsm";
import { acoesPorStatus, type ContextoAcoes } from "./acoes-por-status";

const TUDO: ContextoAcoes = { podeOrcamentoValores: true, podeFinanceiro: true, temTelefone: true, temProximosStatus: true };
const NADA: ContextoAcoes = { podeOrcamentoValores: false, podeFinanceiro: false, temTelefone: false, temProximosStatus: false };

const PRINCIPAL: Record<string, string> = {
  RECEBIDO: "Iniciar Verificação",
  EM_VERIFICACAO: "Abrir Verificação",
  VERIFICADO: "Enviar Orçamento",
  AGUARDANDO_APROVACAO: "Aprovar",
  APROVADO: "Iniciar Manutenção",
  EM_MANUTENCAO: "Marcar Pronto",
  AGUARDANDO_PECA: "Retomar Manutenção",
  PRONTO: "Registrar Entrega",
  REPROVADO: "Reabrir Orçamento",
  ORCAMENTO_VENCIDO: "Renovar orçamento",
  ENTREGUE: "Status",
  ABANDONADO: "Status",
};

describe("acoesPorStatus", () => {
  it.each(Object.keys(PRINCIPAL))("%s tem a ação principal esperada", (status) => {
    expect(acoesPorStatus(status, TUDO).principal.rotulo).toBe(PRINCIPAL[status]);
  });

  it.each(Object.values(STATUS_EQUIPAMENTO))("ações de %s que mudam status seguem transições válidas", (status) => {
    const { principal, secundaria, nesteStatus } = acoesPorStatus(status, TUDO);
    for (const acao of [principal, secundaria, ...nesteStatus]) {
      if (acao?.destino) expect(canTransition(status, acao.destino), `${status} → ${acao.destino}`).toBe(true);
    }
  });

  it("sem permissão de orçamento, a principal vira Status nos status de decisão", () => {
    for (const status of ["VERIFICADO", "AGUARDANDO_APROVACAO", "REPROVADO", "ORCAMENTO_VENCIDO"]) {
      expect(acoesPorStatus(status, NADA).principal.id).toBe("status");
    }
  });

  it("WhatsApp só aparece com telefone, e desfazer aprovação só com financeiro", () => {
    expect(acoesPorStatus("PRONTO", TUDO).nesteStatus.map((a) => a.id)).toEqual(["whatsapp_pronto"]);
    expect(acoesPorStatus("PRONTO", NADA).nesteStatus).toEqual([]);
    expect(acoesPorStatus("APROVADO", TUDO).nesteStatus.map((a) => a.id)).toEqual(["desfazer_aprovacao"]);
    expect(acoesPorStatus("APROVADO", { ...TUDO, podeFinanceiro: false }).nesteStatus).toEqual([]);
  });

  it("Aguardando aprovação com permissão: Aprovar, Reprovar e Status no menu", () => {
    const acoes = acoesPorStatus("AGUARDANDO_APROVACAO", TUDO);
    expect(acoes.secundaria?.id).toBe("reprovar");
    expect(acoes.nesteStatus.map((a) => a.id)).toEqual(["status", "whatsapp_orcamento"]);
  });

  it("status sem ação própria oferece Mudar Status só se houver próximo status", () => {
    expect(acoesPorStatus("ENTREGUE", TUDO).secundaria?.id).toBe("mudar_status");
    expect(acoesPorStatus("ENTREGUE", NADA).secundaria).toBeUndefined();
  });
});
