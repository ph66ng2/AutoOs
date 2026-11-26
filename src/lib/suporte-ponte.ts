import { db } from "@/lib/db";
import { linkPermitido } from "@/lib/suporte-links";

export const EVENTO_CONFIG_SUPORTE = "autoos:config-suporte-alterada";

/**
 * Ponte entre os avisos de erro (fora dos componentes) e a página Suporte. O Layout registra
 * a função de abrir só enquanto o banco está conectado: sem banco o chamado não pode ser
 * gravado, e o erro fica só com "Copiar relatório".
 */
type AbrirSuporte = (relatorioErro: string) => void;

let abrir: AbrirSuporte | null = null;

export function registrarAbrirSuporte(funcao: AbrirSuporte | null) {
  abrir = funcao;
}

export function suporteDisponivel(): boolean {
  return abrir != null;
}

export function enviarErroAoSuporte(relatorioErro: string) {
  abrir?.(relatorioErro);
}

/** Momento do último envio ao suporte: logo depois dele, as respostas são buscadas mais rápido. */
let ultimoEnvio = 0;
const ouvintesEnvio = new Set<() => void>();

export function marcarEnvioAoSuporte(agora = Date.now()) {
  ultimoEnvio = agora;
  ouvintesEnvio.forEach((ouvinte) => ouvinte());
}

export function aoEnviarAoSuporte(ouvinte: () => void): () => void {
  ouvintesEnvio.add(ouvinte);
  return () => ouvintesEnvio.delete(ouvinte);
}

/** 10 s nos 3 minutos depois de um envio (o atendimento automático responde em ~30 s); 60 s fora disso. */
export function intervaloDeBusca(agora = Date.now()): number {
  return agora - ultimoEnvio < 3 * 60_000 ? 10_000 : 60_000;
}

/**
 * Abre um link da resposta do suporte no navegador padrão (`abrir_url`), nunca no app. Confere a
 * allowlist de novo aqui: quem chama não decide sozinho o que pode abrir.
 */
export async function abrirLinkDoSuporte(url: string): Promise<void> {
  if (!linkPermitido(url)) throw new Error("Link fora dos endereços permitidos.");
  await db.abrirUrl(url);
}
