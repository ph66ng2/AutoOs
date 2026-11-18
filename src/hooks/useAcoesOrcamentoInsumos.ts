/**
 * Ações de escrita do orçamento de insumos (OI-n): PDF, envio, aprovar, reprovar, cancelar,
 * entregar e excluir. Usadas pelo editor (janela e páginas de edição) e pelos modais de ação
 * da lista e da página /vendas/:id (V.5). O PIN continua com ensureSensitiveAccess.
 */
import { useState } from "react";
import { useNotification } from "@/hooks/useNotification";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import { OrcamentoInsumosService } from "@/lib/orcamento-insumos-service";
import { PdfService, type PdfArtifact } from "@/lib/pdf-service";
import { SENSITIVE_PERMISSIONS, type FormaPagamento, type OrcamentoInsumosDetalhe } from "@/types";

export interface ParametrosAcoesOrcamentoInsumos {
  detalhe: OrcamentoInsumosDetalhe | null;
  /** Recebe o orçamento devolvido pelo backend depois de cada ação. */
  aplicarDetalhe: (novo: OrcamentoInsumosDetalhe) => void;
  onChanged?: () => void;
  /** Depois de excluir de vez. */
  onExcluido?: (numero: string) => void;
  /** Edição não salva: PDF, envio e aprovação esperam o salvar. */
  bloqueadoPorEdicao?: boolean;
}

export function textoDoErro(causa: unknown): string {
  return typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
}

export function useAcoesOrcamentoInsumos({
  detalhe,
  aplicarDetalhe,
  onChanged,
  onExcluido,
  bloqueadoPorEdicao = false,
}: ParametrosAcoesOrcamentoInsumos) {
  const { success, warning, error: showError } = useNotification();
  const { ensureSensitiveAccess, hasPermission } = useSensitiveAccess();
  // Decisão 23 (1A): sem Ações financeiras, a prévia do PDF abre, mas não há "Baixar",
  // porque salvar o PDF de um rascunho o marca como enviado.
  const podeSalvarPdf = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfArtifact | null>(null);

  async function liberar(titulo: string, descricao: string): Promise<boolean> {
    return ensureSensitiveAccess({
      title: titulo,
      description: descricao,
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
  }

  /** Roda uma ação do backend, aplica o orçamento devolvido e avisa a lista. Devolve a mensagem de erro, se houver. */
  async function executar(
    acao: () => Promise<OrcamentoInsumosDetalhe>,
    mensagem: string,
    contexto: string,
  ): Promise<string | null> {
    setOcupado(true);
    setErro(null);
    try {
      const novo = await acao();
      aplicarDetalhe(novo);
      onChanged?.();
      success("Orçamento de insumos", mensagem);
      return null;
    } catch (causa) {
      const texto = textoDoErro(causa);
      setErro(texto);
      showError("Orçamento de insumos", contexto, causa);
      return texto;
    } finally {
      setOcupado(false);
    }
  }

  async function gerarPdf() {
    if (!detalhe || bloqueadoPorEdicao) return;
    try {
      setPdf(await PdfService.construirOrcamentoInsumos(detalhe));
    } catch (causa) {
      showError("Orçamento de insumos", "Gerar PDF", causa);
    }
  }

  /** Baixar/salvar o PDF é o momento em que o orçamento sai da empresa: marca como enviado. */
  async function salvarPdf(artifact: PdfArtifact) {
    if (!detalhe) return;
    await PdfService.salvarOrcamentoInsumos(artifact, detalhe);
    if (detalhe.status === "RASCUNHO" && (await liberar("Marcar como enviado", "Informe o PIN para marcar o orçamento como enviado."))) {
      await executar(
        () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, "PDF"),
        "PDF salvo e orçamento marcado como enviado.",
        "Marcar como enviado",
      );
    }
  }

  /** Pede o PIN, envia e marca como enviado. Devolve true quando a mensagem saiu. */
  async function enviar(canal: "EMAIL" | "WHATSAPP"): Promise<boolean> {
    if (!detalhe || bloqueadoPorEdicao) return false;
    if (!(await liberar("Enviar orçamento", "Informe o PIN para enviar o orçamento ao cliente."))) return false;
    setOcupado(true);
    setErro(null);
    const resultado =
      canal === "EMAIL"
        ? await OrcamentoInsumosService.enviarEmail(detalhe)
        : await OrcamentoInsumosService.enviarWhatsapp(detalhe);
    setOcupado(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro ?? "Não foi possível enviar o orçamento.");
      return false;
    }
    const falha = await executar(
      () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, canal),
      canal === "EMAIL" ? "Orçamento enviado por e-mail." : "Orçamento enviado por WhatsApp.",
      "Marcar como enviado",
    );
    if (falha) {
      warning("Orçamento de insumos", "A mensagem foi enviada, mas o status não foi atualizado. Recarregue o orçamento.");
    }
    return true;
  }

  /** Aprova com a forma de pagamento (o PIN é pedido antes, ao abrir a aprovação). Devolve o erro, se houver. */
  async function aprovar(pagamento: FormaPagamento): Promise<string | null> {
    if (!detalhe) return "Orçamento não carregado.";
    return executar(
      () => db.aprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, pagamento),
      "Orçamento aprovado e estoque baixado.",
      "Aprovar orçamento",
    );
  }

  async function reprovar() {
    if (!detalhe) return "Orçamento não carregado.";
    return executar(() => db.reprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em), "Orçamento reprovado.", "Reprovar orçamento");
  }

  async function cancelar(devolveEstoque: boolean) {
    if (!detalhe) return "Orçamento não carregado.";
    return executar(
      () => db.cancelarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, devolveEstoque),
      devolveEstoque ? "Orçamento cancelado e estoque devolvido." : "Orçamento cancelado.",
      "Cancelar orçamento",
    );
  }

  async function entregar() {
    if (!detalhe) return "Orçamento não carregado.";
    return executar(() => db.marcarOrcamentoInsumosEntregue(detalhe.id, detalhe.atualizado_em), "Entrega registrada.", "Marcar como entregue");
  }

  async function excluir(): Promise<string | null> {
    if (!detalhe) return "Orçamento não carregado.";
    setOcupado(true);
    setErro(null);
    try {
      await db.excluirOrcamentoInsumos(detalhe.id, detalhe.atualizado_em);
      onChanged?.();
      success("Orçamento de insumos", `Orçamento ${detalhe.numero_exibicao} excluído.`);
      onExcluido?.(detalhe.numero_exibicao);
      return null;
    } catch (causa) {
      const texto = textoDoErro(causa);
      setErro(texto);
      showError("Orçamento de insumos", "Excluir orçamento", causa);
      return texto;
    } finally {
      setOcupado(false);
    }
  }

  return {
    podeSalvarPdf,
    ocupado,
    setOcupado,
    erro,
    setErro,
    pdf,
    setPdf,
    liberar,
    executar,
    gerarPdf,
    salvarPdf,
    enviar,
    aprovar,
    reprovar,
    cancelar,
    entregar,
    excluir,
  };
}
