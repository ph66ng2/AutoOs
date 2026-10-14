/**
 * Envio do link de decisão do orçamento.
 *
 * WhatsApp passa pela fila do backend (`solicitar_envio_whatsapp`): o backend congela o orçamento,
 * gera o token, monta o texto e registra cada tentativa; a tela não vê nem transmite o link.
 * Email ainda não tem provedor registrado e fica desabilitado. Quando houver um, registre-o aqui
 * com `registrarProvedorEnvioOrcamento` e o card passa a habilitar o botão.
 */
import { WhatsAppService, type OpcoesEnvioWhatsapp } from "@/lib/whatsapp-service";
import type { MensagemLinkOrcamento } from "@/lib/orcamento-link-message";

export type CanalEnvioOrcamento = "email" | "whatsapp";

export interface ContextoEnvioOrcamento {
  equipamentoId: number;
  /** Texto montado na tela, para canais que ainda enviam pelo frontend (email). */
  mensagem?: MensagemLinkOrcamento;
}

export interface ResultadoEnvioOrcamento {
  sucesso: boolean;
  erro?: string;
  /** A mensagem entrou na fila central; o envio acontece em instantes. */
  enfileirada?: boolean;
  /** O orçamento desta versão já foi solicitado; reenviar exige gesto explícito. */
  jaSolicitado?: boolean;
  /** O envio anterior tem resultado incerto; repetir exige confirmação. */
  requerConfirmacao?: boolean;
  mensagem?: string;
}

export interface ProvedorEnvioOrcamento {
  canal: CanalEnvioOrcamento;
  /** Nome mostrado ao operador. */
  nome: string;
  enviar(contexto: ContextoEnvioOrcamento, opcoes: OpcoesEnvioWhatsapp): Promise<ResultadoEnvioOrcamento>;
}

const provedores = new Map<CanalEnvioOrcamento, ProvedorEnvioOrcamento>();

export function registrarProvedorEnvioOrcamento(provedor: ProvedorEnvioOrcamento): () => void {
  provedores.set(provedor.canal, provedor);
  return () => {
    if (provedores.get(provedor.canal) === provedor) provedores.delete(provedor.canal);
  };
}

export function obterProvedorEnvioOrcamento(canal: CanalEnvioOrcamento): ProvedorEnvioOrcamento | null {
  return provedores.get(canal) ?? null;
}

export function envioOrcamentoDisponivel(canal: CanalEnvioOrcamento): boolean {
  return provedores.has(canal);
}

export async function enviarLinkOrcamento(
  canal: CanalEnvioOrcamento,
  contexto: ContextoEnvioOrcamento,
  opcoes: OpcoesEnvioWhatsapp = {},
): Promise<ResultadoEnvioOrcamento> {
  const provedor = provedores.get(canal);
  if (!provedor) {
    throw new Error("O envio automático por este canal ainda não está configurado. Copie a mensagem e envie manualmente.");
  }
  return provedor.enviar(contexto, opcoes);
}

registrarProvedorEnvioOrcamento({
  canal: "whatsapp",
  nome: "Fila de WhatsApp",
  enviar: (contexto, opcoes) => WhatsAppService.enviarLinkDecisaoOrcamento(contexto.equipamentoId, opcoes),
});
