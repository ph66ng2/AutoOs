import { useState } from "react";
import { FileText, FileDown, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { PdfService, PRAZO_EXECUCAO_PADRAO, type PdfArtifact } from "@/lib/pdf-service";
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { STATUS_COM_ORCAMENTO } from "@/pages/equipamentos/equipamentos-page-constants";
import type { Equipamento, Verificacao } from "@/types";

interface DocumentosEquipamentoProps {
  equipamento: Equipamento;
}

function buildDocumentName(tipo: string, equipamento: Equipamento): string {
  const sn = (equipamento.serial_number || "SN").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `${tipo}_${equipamento.id}_${sn}.pdf`;
}

interface DocumentoItem {
  id: string;
  nome: string;
  tipo: "OrdemServico" | "Orcamento";
  disponivel: boolean;
}

export function DocumentosEquipamento({ equipamento }: DocumentosEquipamentoProps) {
  const [gerando, setGerando] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    artifact: PdfArtifact;
    documento: DocumentoItem;
    verificacao?: Verificacao;
    prazoMin?: number;
    prazoMax?: number;
  } | null>(null);
  const [prazoUpdating, setPrazoUpdating] = useState(false);

  const documentos: DocumentoItem[] = [
    {
      id: "os",
      nome: "Ordem de Serviço",
      tipo: "OrdemServico",
      disponivel: true,
    },
  ];

  const deveMostrarOrcamento =
    (equipamento.valor_orcamento != null && equipamento.valor_orcamento > 0) ||
    STATUS_COM_ORCAMENTO.includes(equipamento.status);

  if (deveMostrarOrcamento) {
    documentos.push({
      id: "orcamento",
      nome: "Orçamento",
      tipo: "Orcamento",
      disponivel: true,
    });
  }

  async function handleAcaoDocumento(doc: DocumentoItem) {
    const nomeArquivo = buildDocumentName(doc.tipo, equipamento);
    setGerando(doc.id);

    try {
      if (doc.tipo === "OrdemServico") {
        setPreview({ artifact: await PdfService.construirOrdemServico(equipamento, nomeArquivo), documento: doc });
      } else if (doc.tipo === "Orcamento") {
        const verificacao = await db.buscarVerificacao(equipamento.id!);
        if (!verificacao) {
          console.warn("[DocumentosEquipamento] Nenhuma verificação encontrada para gerar orçamento.");
          return;
        }
        setPreview({
          artifact: await PdfService.construirOrcamento(equipamento, verificacao, nomeArquivo),
          documento: doc,
          verificacao,
          prazoMin: PRAZO_EXECUCAO_PADRAO.minDiasUteis,
          prazoMax: PRAZO_EXECUCAO_PADRAO.maxDiasUteis,
        });
      }
    } catch (err) {
      console.error(`[DocumentosEquipamento] Erro ao processar documento ${doc.nome}:`, err);
    } finally {
      setGerando(null);
    }
  }

  return (
    <>
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-1">
          <FileText className="h-4 w-4" />
          Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documentos.map((doc) => {
          const estaGerando = gerando === doc.id;

          return (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <FileDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{doc.nome}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs"
                disabled={estaGerando}
                onClick={() => void handleAcaoDocumento(doc)}
              >
                {estaGerando ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <FileDown className="h-3 w-3" />
                    Visualizar PDF
                  </>
                )}
              </Button>
            </div>
          );
        })}
        {documentos.length === 0 && (
          <p className="text-center py-4 text-sm text-muted-foreground">
            Nenhum documento disponível
          </p>
        )}
      </CardContent>
    </Card>
    <PdfPreviewDialog
      artifact={preview?.artifact || null}
      onOpenChange={(open) => {
        if (!open) {
          setPreview(null);
          setPrazoUpdating(false);
        }
      }}
      prazoExecucao={preview?.documento.tipo === "Orcamento" && preview.verificacao ? {
        minDiasUteis: preview.prazoMin ?? PRAZO_EXECUCAO_PADRAO.minDiasUteis,
        maxDiasUteis: preview.prazoMax ?? PRAZO_EXECUCAO_PADRAO.maxDiasUteis,
        updating: prazoUpdating,
        onChange: async (minDiasUteis, maxDiasUteis) => {
          if (!preview.verificacao) return;
          setPrazoUpdating(true);
          try {
            const nomeArquivo = buildDocumentName(preview.documento.tipo, equipamento);
            const artifact = await PdfService.construirOrcamento(
              equipamento,
              preview.verificacao,
              nomeArquivo,
              { minDiasUteis, maxDiasUteis },
            );
            setPreview((atual) => atual ? { ...atual, artifact, prazoMin: minDiasUteis, prazoMax: maxDiasUteis } : atual);
            return artifact;
          } finally {
            setPrazoUpdating(false);
          }
        },
      } : undefined}
      onDownload={async (artifact) => {
        if (!preview) return;
        const nomeArquivo = buildDocumentName(preview.documento.tipo, equipamento);
        if (preview.documento.tipo === "OrdemServico") {
          await PdfService.salvarOrdemServico(artifact, equipamento, nomeArquivo);
        } else {
          await PdfService.salvarOrcamento(artifact, equipamento, nomeArquivo);
        }
      }}
    />
    </>
  );
}
