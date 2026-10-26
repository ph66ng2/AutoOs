/**
 * Envio do orçamento de insumos (OI-<n>) por e-mail e WhatsApp.
 *
 * Reaproveita o SMTP e a API de WhatsApp já configurados (`enviar_email` / `enviar_whatsapp`)
 * e o PDF do `PdfService`. O texto é próprio do orçamento de insumos. O histórico de
 * comunicações (`comunicacoes`) é por equipamento e a venda avulsa não tem equipamento, então
 * o registro do envio fica no próprio orçamento (status ENVIADO, `enviado_em`) e na auditoria.
 *
 * Os serviços de e-mail e WhatsApp existentes não consultam `receber_email`/`receber_whatsapp`
 * do cliente; aqui também não: o envio é uma ação manual da pessoa na tela, que vê o aviso.
 */
import { db } from "@/lib/db";
import { CC_GERENCIA } from "@/lib/email-service";
import {
  assuntoEmailOrcamentoInsumos,
  emailDestinatario,
  montarEmailOrcamentoInsumos,
  montarMensagemWhatsappOrcamentoInsumos,
  nomeDestinatario,
  telefoneDestinatario,
} from "@/lib/orcamento-insumos";
import { PdfService, type PdfArtifact } from "@/lib/pdf-service";
import { formatarTelefone as formatarTelefoneWhatsapp } from "@/lib/whatsapp-service";
import type { EmailSendRequest, OrcamentoInsumosDetalhe } from "@/types";

export interface ResultadoEnvioOrcamentoInsumos {
  sucesso: boolean;
  erro?: string;
}

function mensagemDeErro(error: unknown, padrao: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return padrao;
}

export const OrcamentoInsumosService = {
  /** Envia o PDF por e-mail ao contato escolhido (ou ao e-mail do cliente). */
  async enviarEmail(
    orcamento: OrcamentoInsumosDetalhe,
    artifact?: PdfArtifact,
  ): Promise<ResultadoEnvioOrcamentoInsumos> {
    const email = emailDestinatario(orcamento);
    if (!email) {
      return { sucesso: false, erro: "O cliente e o contato não têm e-mail cadastrado." };
    }
    try {
      const pdf = artifact ?? (await PdfService.construirOrcamentoInsumos(orcamento));
      const { texto, html } = montarEmailOrcamentoInsumos(orcamento);
      const pedido: EmailSendRequest = {
        destinatario: nomeDestinatario(orcamento),
        email,
        cc: [CC_GERENCIA],
        assunto: assuntoEmailOrcamentoInsumos(orcamento),
        corpo: texto,
        corpo_texto: texto,
        corpo_html: html,
        anexos: [{ filename: pdf.filename, content_type: pdf.mimeType, bytes: Array.from(pdf.bytes) }],
      };
      await db.enviarEmail(pedido);
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, erro: mensagemDeErro(error, "Falha ao enviar o orçamento por e-mail.") };
    }
  },

  /** Envia a mensagem de texto por WhatsApp ao telefone do contato (ou do cliente). */
  async enviarWhatsapp(orcamento: OrcamentoInsumosDetalhe): Promise<ResultadoEnvioOrcamentoInsumos> {
    const telefone = telefoneDestinatario(orcamento);
    if (!telefone) {
      return { sucesso: false, erro: "O cliente e o contato não têm telefone cadastrado." };
    }
    try {
      await db.enviarWhatsapp(
        formatarTelefoneWhatsapp(telefone),
        montarMensagemWhatsappOrcamentoInsumos(orcamento),
      );
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, erro: mensagemDeErro(error, "Falha ao enviar o orçamento por WhatsApp.") };
    }
  },
};
