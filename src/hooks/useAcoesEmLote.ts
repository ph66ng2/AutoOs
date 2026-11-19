import { useCallback, useMemo } from "react";
import { db } from "@/lib/db";
import { PdfService } from "@/lib/pdf-service";
import { WhatsAppService } from "@/lib/whatsapp-service";
import { salvarCsvEquipamentos } from "@/hooks/useExportarEquipamentos";
import { getProximosStatus } from "@/pages/equipamentos/equipamentos-page-utils";
import type { Equipamento } from "@/types";

/** Etapas para onde dá para mover em lote: as mesmas das ações rápidas, sem decisão financeira. */
export const ETAPAS_EM_LOTE = ["EM_VERIFICACAO", "AGUARDANDO_PECA", "EM_MANUTENCAO"] as const;
export type EtapaEmLote = (typeof ETAPAS_EM_LOTE)[number];

export interface ResultadoLote {
  feitos: number;
  /** "OS #12: motivo" de cada uma que não deu. */
  falhas: string[];
  /** OS que não se aplicam à ação (ex.: avisar pronto numa OS que não está pronta). */
  ignoradas: number;
}

const nomeOs = (eq: Equipamento) => `OS #${eq.id}`;
const motivo = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro ?? "erro desconhecido"));

/** Pode ir para a etapa pelo fluxo de status (a mesma regra da tela de mudar status). */
export function podeIrPara(eq: Equipamento, etapa: EtapaEmLote): boolean {
  return getProximosStatus(eq.status).includes(etapa);
}

/** Arquivo da OS em lote: número da OS e cliente, sem colidir quando saem no mesmo segundo. */
export function nomeArquivoOrdem(eq: Equipamento): string {
  const cliente = (eq.cliente_nome || "Cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Cliente";
  return `OrdemServico_${eq.id}_${cliente}.pdf`;
}

/**
 * Ações sobre várias OS da lista de uma vez. Cada OS vai sozinha (uma falha não para as outras)
 * e o resultado diz quantas deram certo e por que as outras não.
 */
export function useAcoesEmLote() {
  const exportar = useCallback((itens: Equipamento[]) => salvarCsvEquipamentos(itens, "-selecionados"), []);

  /** Ordem de serviço em PDF de cada OS, na pasta Documentos › AutoOS › Ordens de Servico. */
  const baixarOrdens = useCallback(async (itens: Equipamento[]): Promise<ResultadoLote> => {
    const resultado: ResultadoLote = { feitos: 0, falhas: [], ignoradas: 0 };
    for (const eq of itens) {
      try {
        const caminho = await PdfService.gerarOrdemServico(eq, nomeArquivoOrdem(eq));
        if (caminho) resultado.feitos += 1;
        else resultado.falhas.push(`${nomeOs(eq)}: PDF não gerado`);
      } catch (erro) {
        resultado.falhas.push(`${nomeOs(eq)}: ${motivo(erro)}`);
      }
    }
    return resultado;
  }, []);

  /**
   * Reenvia o WhatsApp de "pronto para retirada" das OS que estão em Pronto. Envio com resultado
   * incerto não é repetido sozinho: entra nas falhas para a equipe conferir.
   */
  const avisarPronto = useCallback(async (itens: Equipamento[]): Promise<ResultadoLote> => {
    const prontas = itens.filter((eq) => eq.status === "PRONTO");
    const resultado: ResultadoLote = { feitos: 0, falhas: [], ignoradas: itens.length - prontas.length };
    for (const eq of prontas) {
      try {
        const envio = await WhatsAppService.solicitarEnvio(eq.id!, "equipamento_pronto", { reenvioManual: true });
        if (envio.sucesso) resultado.feitos += 1;
        else if (envio.requerConfirmacao || envio.estado === "INCERTA") resultado.falhas.push(`${nomeOs(eq)}: envio anterior incerto, confira antes de reenviar`);
        else resultado.falhas.push(`${nomeOs(eq)}: ${envio.erro || "não enviado"}`);
      } catch (erro) {
        resultado.falhas.push(`${nomeOs(eq)}: ${motivo(erro)}`);
      }
    }
    return resultado;
  }, []);

  /** Move para a etapa as OS que podem ir para ela; as outras ficam como estão. */
  const moverEtapa = useCallback(async (itens: Equipamento[], etapa: EtapaEmLote): Promise<ResultadoLote> => {
    const aptas = itens.filter((eq) => podeIrPara(eq, etapa));
    const resultado: ResultadoLote = { feitos: 0, falhas: [], ignoradas: itens.length - aptas.length };
    for (const eq of aptas) {
      try {
        await db.atualizarStatusEquipamento(eq.id!, etapa, undefined, undefined, undefined, eq.atualizado_em);
        resultado.feitos += 1;
      } catch (erro) {
        resultado.falhas.push(`${nomeOs(eq)}: ${motivo(erro)}`);
      }
    }
    return resultado;
  }, []);

  return useMemo(() => ({ exportar, baixarOrdens, avisarPronto, moverEtapa }), [exportar, baixarOrdens, avisarPronto, moverEtapa]);
}
