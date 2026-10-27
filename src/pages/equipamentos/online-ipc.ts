import type { AnaliseAjusteOrcamento, Equipamento, Verificacao } from "@/types";

/** Desktop-only Tauri commands that the SaaS invoke_handler does not register. */
export const DESKTOP_ONLY_EQUIPMENT_COMMANDS = [
  "analisar_ajuste_orcamento",
  "analisar_correcao_decisao",
  "corrigir_decisao_orcamento",
  "prorrogar_prazo_orcamento",
  "buscar_verificacao_tecnica",
  "solicitar_envio_whatsapp",
  "preparar_acesso_portal",
  "obter_destinatario_orcamento",
  "definir_acesso_portal_contato",
  "publicar_orcamento_portal",
] as const;

export function usaIpcDesktopDeEquipamento(isSaasBuild: boolean): boolean {
  return !isSaasBuild;
}

export async function analisarAjusteDoEquipamento(
  isSaasBuild: boolean,
  equipmentId: string | number,
  desktop: (id: number) => Promise<AnaliseAjusteOrcamento>,
  online: (id: string) => Promise<AnaliseAjusteOrcamento>,
): Promise<AnaliseAjusteOrcamento> {
  if (isSaasBuild) return online(String(equipmentId));
  return desktop(Number(equipmentId));
}

export async function carregarVerificacaoDoEquipamento(
  isSaasBuild: boolean,
  equipmentId: string | number,
  desktop: (id: number) => Promise<Verificacao | null>,
  online: (id: string) => Promise<Verificacao | null>,
): Promise<Verificacao | null> {
  if (isSaasBuild) return online(String(equipmentId));
  return desktop(Number(equipmentId));
}

export async function enviarWhatsAppOrcamentoOnline(
  equipamento: Equipamento,
  deps: {
    getVerification: (id: string) => Promise<Verificacao | null>;
    enviarOrcamento: (
      equipamento: Equipamento,
      verificacao: Verificacao,
    ) => Promise<{ sucesso: boolean; erro?: string }>;
  },
): Promise<{ sucesso: boolean; erro?: string }> {
  const verificacao = await deps.getVerification(String(equipamento.id));
  if (!verificacao) {
    return { sucesso: false, erro: "Verificação não encontrada; o orçamento não foi enviado." };
  }
  return deps.enviarOrcamento(equipamento, verificacao);
}
