import { Download, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";
import { CATEGORIA_IMAGEM_LABELS } from "./equipamentos-page-constants";

export function GaleriaImagensEquipamento({
  imagens,
  mensagemVazia,
  onRemover,
  onLegendaChange,
  onVisualizar,
  onExportar,
}: {
  imagens: EquipamentoImagemDraft[];
  mensagemVazia: string;
  onRemover?: (localId: string) => void;
  onLegendaChange?: (localId: string, value: string) => void;
  onVisualizar?: (imagem: EquipamentoImagemDraft) => void;
  onExportar?: (imagem: EquipamentoImagemDraft) => void;
}) {
  if (imagens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {mensagemVazia}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {imagens.map((imagem) => (
        <div key={imagem.local_id} className="overflow-hidden rounded-lg border bg-background">
          <div className="relative aspect-[4/3] bg-muted">
            <img
              src={imagem.preview_url}
              alt={imagem.filename}
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-2 left-2 flex gap-2">
              {onVisualizar && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => onVisualizar(imagem)}
                  title="Visualizar em tamanho maior"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              )}
              {onExportar && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => onExportar(imagem)}
                  title="Exportar imagem"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {onRemover && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-2 top-2 h-7 w-7"
                onClick={() => onRemover(imagem.local_id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="space-y-2 p-2 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground" title={imagem.filename}>{imagem.filename}</p>
            <p>
              {(imagem.largura || 0)} x {(imagem.altura || 0)} px
            </p>
            {onLegendaChange ? (
              <Textarea
                value={imagem.observacao || ""}
                onChange={(event) => onLegendaChange(imagem.local_id, event.target.value)}
                rows={2}
                placeholder={`Legenda da foto de ${CATEGORIA_IMAGEM_LABELS[imagem.categoria]}`}
                className="min-h-[68px] resize-none text-xs"
              />
            ) : imagem.observacao ? (
              <p className="rounded-md bg-accent/60 p-2 whitespace-pre-wrap text-[11px] text-foreground">
                {imagem.observacao}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
