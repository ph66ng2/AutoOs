/**
 * Ponto de ligação do envio do link de decisão por email ou WhatsApp.
 *
 * O provedor ainda não foi escolhido, então nenhum está registrado e o app só oferece
 * "copiar mensagem". Quando houver um, basta chamar `registrarProvedorEnvioOrcamento`
 * na inicialização: a interface do card passa a habilitar o botão do canal.
 */
import type { MensagemLinkOrcamento } from "@/lib/orcamento-link-message";

export type CanalEnvioOrcamento = "email" | "whatsapp";

export interface ProvedorEnvioOrcamento {
  canal: CanalEnvioOrcamento;
  /** Nome mostrado ao operador, por exemplo o provedor escolhido. */
  nome: string;
  enviar(destino: string, mensagem: MensagemLinkOrcamento): Promise<void>;
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
  destino: string,
  mensagem: MensagemLinkOrcamento,
): Promise<void> {
  const provedor = provedores.get(canal);
  if (!provedor) {
    throw new Error("O envio automático ainda não está configurado. Copie a mensagem e envie manualmente.");
  }
  if (!destino.trim()) throw new Error("Informe o contato de destino.");
  await provedor.enviar(destino.trim(), mensagem);
}
