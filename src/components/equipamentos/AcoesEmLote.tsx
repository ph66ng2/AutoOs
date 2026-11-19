import { useState } from "react";
import { Download, FileDown, MessageCircle, MoveRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useAcoesEmLote, ETAPAS_EM_LOTE, podeIrPara, type EtapaEmLote, type ResultadoLote } from "@/hooks/useAcoesEmLote";
import { useNotification } from "@/hooks/useNotification";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { STATUS_LABELS, type Equipamento } from "@/types";

type Pendente =
  | { tipo: "avisar"; prontas: number }
  | { tipo: "mover"; etapa: EtapaEmLote; aptas: number };

/**
 * Barra que aparece quando há OS marcadas na lista: exportar, baixar as ordens em PDF, avisar
 * "pronto" e mover de etapa (só entre etapas sem decisão financeira). Avisar e mover pedem confirmação.
 */
export function AcoesEmLote({ selecionados, onLimpar, onConcluido }: { selecionados: Equipamento[]; onLimpar: () => void; onConcluido: () => Promise<void> | void }) {
  const lote = useAcoesEmLote();
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { success, warning, error: showError } = useNotification();
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const total = selecionados.length;
  const prontas = selecionados.filter((eq) => eq.status === "PRONTO").length;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  function relatar(acao: string, resultado: ResultadoLote, feito: (n: number) => string) {
    const partes = [resultado.feitos > 0 ? feito(resultado.feitos) : null, resultado.ignoradas > 0 ? `${plural(resultado.ignoradas, "OS não se aplica", "OS não se aplicam")}` : null].filter(Boolean);
    if (resultado.falhas.length === 0) {
      success("Equipamentos", partes.join(" · ") || "Nada a fazer nas selecionadas.", acao);
      return;
    }
    const lista = resultado.falhas.slice(0, 5).join("\n") + (resultado.falhas.length > 5 ? `\n… e mais ${resultado.falhas.length - 5}` : "");
    warning("Equipamentos", [partes.join(" · "), lista].filter(Boolean).join("\n"));
  }

  async function executar<T>(acao: string, tarefa: () => Promise<T>, depois: (valor: T) => void, recarregar = true) {
    setOcupado(true);
    try {
      depois(await tarefa());
      if (recarregar) await onConcluido();
    } catch (erro) {
      showError("Equipamentos", acao, erro);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(atual: Pendente) {
    setPendente(null);
    if (atual.tipo === "avisar") {
      const liberado = await ensureSensitiveAccess({
        title: "Enviar aviso de equipamento pronto",
        description: "Informe o PIN para disparar a mensagem de retirada aos clientes das OS selecionadas.",
      });
      if (!liberado) return;
      await executar("Avisar pronto", () => lote.avisarPronto(selecionados), (r) => relatar("Avisar pronto", r, (n) => plural(n, "aviso enviado", "avisos enviados")), false);
      return;
    }
    await executar(`Mover para ${STATUS_LABELS[atual.etapa]}`, () => lote.moverEtapa(selecionados, atual.etapa), (r) => relatar(`Mover para ${STATUS_LABELS[atual.etapa]}`, r, (n) => plural(n, "OS movida", "OS movidas")));
  }

  return (
    <div role="region" aria-label="Ações nas OS selecionadas" className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2">
      <span className="mr-1 text-sm font-semibold">{plural(total, "selecionada", "selecionadas")}</span>
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void executar("Exportar selecionadas", () => lote.exportar(selecionados), (nome) => success("Equipamentos", `Planilha salva: ${nome}`, "Exportar selecionadas"), false)}>
        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> Exportar
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void executar("Baixar ordens de serviço", () => lote.baixarOrdens(selecionados), (r) => relatar("Baixar ordens de serviço", r, (n) => `${plural(n, "PDF salvo", "PDFs salvos")} em Documentos › AutoOS › Ordens de Servico`), false)}>
        <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" /> Baixar OS (PDF)
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={ocupado || prontas === 0} title={prontas === 0 ? "Nenhuma das selecionadas está em Pronto" : undefined} onClick={() => setPendente({ tipo: "avisar", prontas })}>
        <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" /> Avisar pronto{prontas > 0 ? ` (${prontas})` : ""}
      </Button>
      <Select value="" onValueChange={(etapa) => setPendente({ tipo: "mover", etapa: etapa as EtapaEmLote, aptas: selecionados.filter((eq) => podeIrPara(eq, etapa as EtapaEmLote)).length })} disabled={ocupado}>
        <SelectTrigger aria-label="Mover as selecionadas para a etapa" className="h-9 w-auto gap-1.5 bg-card text-sm">
          <MoveRight className="h-4 w-4" aria-hidden="true" /> Mover para…
        </SelectTrigger>
        <SelectContent>
          {ETAPAS_EM_LOTE.map((etapa) => {
            const aptas = selecionados.filter((eq) => podeIrPara(eq, etapa)).length;
            return (
              <SelectItem key={etapa} value={etapa} disabled={aptas === 0}>
                {STATUS_LABELS[etapa]} <span className="ml-1 text-muted-foreground tabular-nums">({aptas})</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onLimpar} disabled={ocupado}>
        <X className="mr-1 h-4 w-4" aria-hidden="true" /> Limpar seleção
      </Button>

      <ConfirmDialog
        open={pendente !== null}
        onOpenChange={(aberto) => { if (!aberto) setPendente(null); }}
        title={pendente?.tipo === "avisar" ? "Avisar os clientes?" : `Mover para ${pendente?.tipo === "mover" ? STATUS_LABELS[pendente.etapa] : ""}?`}
        description={
          pendente?.tipo === "avisar"
            ? `${plural(pendente.prontas, "cliente recebe", "clientes recebem")} o WhatsApp de equipamento pronto para retirada.${total > pendente.prontas ? ` ${plural(total - pendente.prontas, "OS selecionada não está", "OS selecionadas não estão")} em Pronto e fica${total - pendente.prontas === 1 ? "" : "m"} de fora.` : ""}`
            : pendente?.tipo === "mover"
              ? `${plural(pendente.aptas, "OS muda", "OS mudam")} de etapa.${total > pendente.aptas ? ` ${plural(total - pendente.aptas, "não pode", "não podem")} ir para essa etapa agora e fica${total - pendente.aptas === 1 ? "" : "m"} como está.` : ""}`
              : ""
        }
        confirmLabel={pendente?.tipo === "avisar" ? "Enviar avisos" : "Mover"}
        cancelLabel="Cancelar"
        onConfirm={() => { if (pendente) void confirmar(pendente); }}
      />
    </div>
  );
}
