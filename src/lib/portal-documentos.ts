import { db } from "@/lib/db";
import type { PdfArtifact } from "@/lib/pdf-service";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import type { Equipamento, EquipamentoId } from "@/types";

/** PDF oficial do portal ainda não foi portado para o SaaS: só o build interno (ID numérico) publica. */
function idInterno(equipamento: Equipamento<EquipamentoId>): number | undefined {
  return !IS_SAAS_BUILD && typeof equipamento.id === "number" ? equipamento.id : undefined;
}

export type TipoDocumentoOficial = "ORDEM_SERVICO" | "ORCAMENTO" | "ORCAMENTO_AJUSTADO";
export interface ReferenciaPdfPortal {
  tipo: TipoDocumentoOficial;
  versaoId: number | null;
  atualizadoEm: string;
}

/** Captura a versão ANTES de desenhar o PDF; o servidor recusa uma emissão já desatualizada. */
export async function referenciaPdfPortal(equipamento: Equipamento<EquipamentoId>, tipo: TipoDocumentoOficial): Promise<ReferenciaPdfPortal | undefined> {
  const id = idInterno(equipamento);
  if (!id || !equipamento.atualizado_em) return undefined;
  try {
    const versao = tipo === "ORDEM_SERVICO" ? null : await db.obterVersaoDocumentoPortal(id);
    if (tipo !== "ORDEM_SERVICO" && !versao) return undefined;
    return { tipo, versaoId: versao?.versaoId ?? null, atualizadoEm: equipamento.atualizado_em };
  } catch {
    console.warn("[PortalPDF] Referência indisponível; nova tentativa na próxima emissão.");
    return undefined;
  }
}

const publicados = new WeakSet<PdfArtifact>();
const emAndamento = new WeakMap<PdfArtifact, Promise<void>>();
/** Falhar no portal nunca impede imprimir, salvar ou enviar o mesmo artefato no balcão. */
export function publicarPdfOficial(artifact: PdfArtifact, equipamento: Equipamento<EquipamentoId>): Promise<void> {
  if (publicados.has(artifact)) return Promise.resolve();
  const anterior = emAndamento.get(artifact);
  if (anterior) return anterior;
  const tarefa = (async () => {
    const id = idInterno(equipamento);
    if (!artifact.portal || !id) return;
    try {
      const canonico = await db.publicarDocumentoPortal(id, artifact.bytes, artifact.portal);
      artifact.bytes = new Uint8Array(canonico);
      publicados.add(artifact);
    } catch {
      console.warn("[PortalPDF] Upload não concluído; nova tentativa na próxima emissão/salvamento.");
    }
  })();
  emAndamento.set(artifact, tarefa);
  void tarefa.finally(() => emAndamento.delete(artifact));
  return tarefa;
}

/** Publicação sem e-mail (inclusive lote e WhatsApp) usa o mesmo construtor oficial. */
export async function emitirOrcamentoPublicado(equipamentoId: number): Promise<void> {
  try {
    const equipamento = await db.buscarEquipamento(equipamentoId);
    const verificacao = await db.buscarVerificacao(equipamentoId);
    if (!verificacao) return;
    const { PdfService } = await import("@/lib/pdf-service");
    const artifact = await PdfService.construirOrcamentoAjustado(equipamento, verificacao);
    if (artifact) await publicarPdfOficial(artifact, equipamento);
  } catch {
    console.warn("[PortalPDF] Emissão indisponível; nova tentativa na próxima publicação.");
  }
}
