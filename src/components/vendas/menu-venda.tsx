import { FileText, Mail, MessageCircle } from "lucide-react";
import type { PriorityAction } from "@/components/ui/action-priority-row";
import { acoesOrcamentoInsumos } from "@/lib/orcamento-insumos";
import type { AcaoInicialOrcamentoInsumos } from "@/lib/orcamento-insumos";
import type { StatusOrcamentoInsumos } from "@/types";

/**
 * Menu ⋯ de uma venda de insumos, com as seções Enviar, Decidir e Orçamento.
 * Mostra só o que a situação permite; a ação que já é o botão principal não se repete.
 * Usado na lista e na página do orçamento.
 */
export function menuVenda(
  id: number,
  status: StatusOrcamentoInsumos,
  principal: AcaoInicialOrcamentoInsumos | null,
  abrir: (acao: AcaoInicialOrcamentoInsumos) => void,
): PriorityAction[] {
  const acoes = acoesOrcamentoInsumos(status);
  const itens: PriorityAction[] = [];
  const incluir = (acao: AcaoInicialOrcamentoInsumos, item: Omit<PriorityAction, "id" | "onClick">) => {
    if (acao !== principal) itens.push({ ...item, id: `${acao}-${id}`, onClick: () => abrir(acao) });
  };
  if (acoes.gerarPdf) incluir("pdf", { label: "Gerar PDF", icon: <FileText />, group: "Enviar" });
  if (acoes.enviar) {
    incluir("email", { label: "Enviar por e-mail", icon: <Mail />, group: "Enviar" });
    incluir("whatsapp", { label: "Enviar por WhatsApp", icon: <MessageCircle />, group: "Enviar" });
  }
  // Vencido não aprova: a principal vira "Renovar validade" e Aprovar não aparece.
  if (acoes.aprovar && principal !== "renovar") incluir("aprovar", { label: "Aprovar", group: "Decidir" });
  if (acoes.reprovar) incluir("reprovar", { label: "Reprovar", group: "Decidir" });
  if (acoes.entregar) incluir("entregar", { label: "Marcar entregue", group: "Decidir" });
  if (acoes.editar) incluir("editar", { label: "Editar", group: "Orçamento" });
  if (acoes.cancelar) incluir("cancelar", { label: "Cancelar orçamento", className: "text-destructive", group: "Orçamento" });
  if (acoes.excluir) incluir("excluir", { label: "Excluir de vez", className: "text-destructive", group: "Orçamento" });
  return itens;
}
