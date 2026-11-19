import { useState } from "react";
import { Download, FileDown, MessageCircle, MoveRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useAcoesEmLote, ETAPAS_EM_LOTE, podeIrPara, type EtapaEmLote, type ResultadoLote } from "@/hooks/useAcoesEmLote";
import { useNotification } from "@/hooks/useNotification";
import { BotaoCopiar } from "@/components/ui/botao-copiar";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { STATUS_LABELS, type Equipamento } from "@/types";

type Pendente =
  | { tipo: "avisar"; prontas: number }
  | { tipo: "mover"; etapa: EtapaEmLote; aptas: number };

/**
 * Barra que aparece quando há OS marcadas na lista: exportar, baixar as ordens em PDF, avisar
 * "pronto" e mover de etapa (só entre etapas sem decisão financeira). Avisar e mover pedem confirmação.
 */
/** Relatório da última ação em lote com falhas: fica na tela até a pessoa fechar. */
export interface RelatorioLote {
  acao: string;
  resumo: string;
  falhas: string[];
}

export function AcoesEmLote({
  selecionados,
  ocupado,
  onOcupadoChange,
  relatorio,
  onRelatorioChange,
  onLimpar,
  onConcluido,
}: {
  selecionados: Equipamento[];
  /** Fica na página (sobrevive a recarregar a lista): impede disparar o mesmo lote duas vezes. */
  ocupado: boolean;
  onOcupadoChange: (ocupado: boolean) => void;
  relatorio: RelatorioLote | null;
  onRelatorioChange: (relatorio: RelatorioLote | null) => void;
  onLimpar: () => void;
  /** Depois da ação: `idsComFalha` continuam selecionadas, as demais saem da seleção. */
  onConcluido: (idsComFalha: number[], recarregar: boolean) => Promise<void> | void;
}) {
  const lote = useAcoesEmLote();
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { success, error: showError } = useNotification();
  const setOcupado = onOcupadoChange;
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const total = selecionados.length;
  const prontas = selecionados.filter((eq) => eq.status === "PRONTO").length;
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  function relatar(acao: string, resultado: ResultadoLote, feito: (n: number) => string) {
    const partes = [
      resultado.feitos > 0 ? feito(resultado.feitos) : null,
      resultado.naFila ? `${plural(resultado.naFila, "aviso na fila de envio", "avisos na fila de envio")} (o resultado aparece no histórico de comunicações)` : null,
      resultado.ignoradas > 0 ? plural(resultado.ignoradas, "OS não se aplica", "OS não se aplicam") : null,
    ].filter(Boolean);
    const resumo = partes.join(" · ") || "Nada a fazer nas selecionadas.";
    if (resultado.falhas.length === 0) {
      onRelatorioChange(null);
      success("Equipamentos", resumo, acao);
      return;
    }
    // Falhas nunca vão só para um aviso que some: a lista inteira fica na tela, com copiar.
    onRelatorioChange({ acao, resumo, falhas: resultado.falhas });
  }

  async function executar(acao: string, tarefa: () => Promise<ResultadoLote>, feito: (n: number) => string, recarregar: boolean) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const resultado = await tarefa();
      relatar(acao, resultado, feito);
      await onConcluido(resultado.idsComFalha, recarregar);
    } catch (erro) {
      showError("Equipamentos", acao, erro);
    } finally {
      setOcupado(false);
    }
  }

  async function exportar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const nome = await lote.exportar(selecionados);
      success("Equipamentos", `Planilha salva: ${nome}`, "Exportar selecionadas");
    } catch (erro) {
      showError("Equipamentos", "Exportar selecionadas", erro);
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
      await executar("Avisar pronto", () => lote.avisarPronto(selecionados), (n) => plural(n, "aviso aceito pelo provedor", "avisos aceitos pelo provedor"), false);
      return;
    }
    await executar(`Mover para ${STATUS_LABELS[atual.etapa]}`, () => lote.moverEtapa(selecionados, atual.etapa), (n) => plural(n, "OS movida", "OS movidas"), true);
  }

  return (
    <div className="space-y-2">
    {relatorio && (
      <section role="alert" aria-label={`Resultado: ${relatorio.acao}`} className="space-y-2 rounded-xl border border-status-wait bg-status-wait-bg p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-status-wait">{relatorio.acao}: {plural(relatorio.falhas.length, "OS não deu certo", "OS não deram certo")}</p>
          <BotaoCopiar valor={relatorio.falhas.join("\n")} rotulo="lista de falhas" />
          <Button type="button" size="sm" variant="ghost" className="ml-auto h-7" onClick={() => onRelatorioChange(null)}>Fechar</Button>
        </div>
        {relatorio.resumo && <p className="text-muted-foreground">{relatorio.resumo}</p>}
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {relatorio.falhas.map((falha) => <li key={falha} className="tabular-nums">{falha}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">As OS com falha continuam selecionadas.</p>
      </section>
    )}
    {total > 0 && (
    <div role="region" aria-label="Ações nas OS selecionadas" className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2">
      <span className="mr-1 text-sm font-semibold">{ocupado ? "Processando…" : plural(total, "selecionada", "selecionadas")}</span>
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void exportar()}>
        <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> Exportar
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void executar("Baixar ordens de serviço", () => lote.baixarOrdens(selecionados), (n) => `${plural(n, "PDF salvo", "PDFs salvos")} em Documentos › AutoOS › Ordens de Servico`, false)}>
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
    )}
    </div>
  );
}
