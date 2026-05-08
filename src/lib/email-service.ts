/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/email-service.ts — Serviço de Email (SMTP Real)        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Gera corpo de email formatado e envia via SMTP.            ║
 * ║  Também registra o envio na tabela `comunicacoes`.          ║
 * ║                                                              ║
 * ║  IMPLEMENTADO:                                              ║
 * ║  - `enviar_email` no backend (lettre)                        ║
 * ║  - Config SMTP via keyring do SO                             ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (registrarComunicacao) — salva log no banco    ║
 * ║  - types/index.ts (Equipamento, Verificacao, etc.)          ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - hooks/useStatusEquipamento.ts (automação pós-verificação)║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import { PdfService } from "@/lib/pdf-service";
import type {
  EmailAttachment,
  EmailSendRequest,
  Comunicacao,
  Equipamento,
  Verificacao,
  ServicoNecessario,
  PecaNecessaria,
} from "@/types";

function emailTecnicoPorNome(tecnicoNome?: string) {
  const normalizado = (tecnicoNome || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalizado === "ivan") return "ivan@bmicode.com";
  if (normalizado === "isaias") return "isaias@bmicode.com";
  return "";
}

function extrairTecnicoInicialDeObservacoes(observacoes?: string | null) {
  if (!observacoes) return "";
  const match = observacoes.match(/^Técnico inicial:\s*(Ivan|Isaias|Isaías)\b/m);
  return match?.[1] || "";
}

async function registrarComunicacaoSegura(comunicacao: Omit<Comunicacao, "id">) {
  try {
    await db.registrarComunicacao(comunicacao);
  } catch (error) {
    console.error("[EmailService] Falha ao registrar comunicação:", error);
  }
}

export const EmailService = {
  /** Envia email da ordem de entrada (ordem de serviço) via SMTP e registra no banco */
  async enviarOrdemEntrada(equipamento: Equipamento) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const assunto = `Ordem de Entrada - ${equipamento.marca} ${equipamento.modelo} (SN: ${equipamento.serial_number})`;
    const corpoTexto = `Prezado(a) ${equipamento.cliente_nome || "cliente"},

Registramos a entrada do seu equipamento em nosso laboratório técnico.

Equipamento: ${equipamento.marca} ${equipamento.modelo}
Serial Number: ${equipamento.serial_number}
Data de Entrada: ${formatarData(equipamento.data_entrada)}

A Ordem de Entrada segue em anexo.

Atenciosamente,
Equipe Técnica BMITAG`;

    const corpoHtml = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <p>Prezado(a) <strong>${escapeHtml(equipamento.cliente_nome || "cliente")}</strong>,</p>
        <p>Registramos a entrada do seu equipamento em nosso laboratório técnico.</p>
        <p>
          <strong>Equipamento:</strong> ${escapeHtml(`${equipamento.marca} ${equipamento.modelo}`)}<br />
          <strong>Serial Number:</strong> ${escapeHtml(equipamento.serial_number)}<br />
          <strong>Data de Entrada:</strong> ${escapeHtml(formatarData(equipamento.data_entrada))}
        </p>
        <p>A Ordem de Entrada segue em anexo.</p>
        <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
      </div>
    `;

    let anexos: EmailAttachment[] | undefined;
    try {
      const caminhoPdf = await PdfService.gerarOrdemServico(equipamento);
      if (caminhoPdf) {
        const filename = caminhoPdf.split(/[/\\]/).pop() || "ordem_entrada.pdf";
        anexos = [{
          filename,
          content_type: "application/pdf",
          path: caminhoPdf,
        }];
      }
    } catch (error) {
      console.warn("[EmailService] Falha ao gerar PDF de ordem de entrada:", error);
    }

    const emailData: EmailSendRequest = {
      destinatario: equipamento.cliente_nome || "",
      email: equipamento.cliente_email,
      assunto,
      corpo: corpoTexto,
      corpo_texto: corpoTexto,
      corpo_html: corpoHtml,
      anexos,
    };

    try {
      await invoke<void>("enviar_email", { input: emailData });
      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "MANUAL",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        anexos: anexos ? JSON.stringify(anexos.map((a) => a.filename)) : undefined,
        enviado: true,
      });
      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || "Falha ao enviar email");
      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "MANUAL",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        anexos: anexos ? JSON.stringify(anexos.map((a) => a.filename)) : undefined,
        enviado: false,
        erro: erroMsg,
      });
      return { sucesso: false, erro: erroMsg };
    }
  },

  /** Envia email de orçamento via SMTP e registra no banco */
  async enviarOrcamento(equipamento: Equipamento, verificacao: Verificacao) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const corpoTexto = gerarCorpoOrcamentoTexto(equipamento, verificacao);
    const corpoHtml = gerarCorpoOrcamentoHtml(equipamento, verificacao);
    const assunto = `Orçamento - ${equipamento.marca} ${equipamento.modelo} (SN: ${equipamento.serial_number})`;
    const emailTecnico = emailTecnicoPorNome(verificacao.tecnico_nome);
    const cc = emailTecnico ? [emailTecnico] : undefined;

    let anexos: EmailAttachment[] | undefined;
    try {
      const caminhoPdf = await PdfService.gerarOrcamento(equipamento, verificacao);
      if (caminhoPdf) {
        const filename = caminhoPdf.split(/[/\\]/).pop() || "orcamento.pdf";
        anexos = [{
          filename,
          content_type: "application/pdf",
          path: caminhoPdf,
        }];
      }
    } catch (error) {
      console.warn("[EmailService] Falha ao gerar PDF de orçamento:", error);
    }

    const emailData: EmailSendRequest = {
      destinatario: equipamento.cliente_nome || "",
      email: equipamento.cliente_email,
      cc,
      assunto,
      corpo: corpoTexto,
      corpo_texto: corpoTexto,
      corpo_html: corpoHtml,
      anexos,
    };

    try {
      await invoke<void>("enviar_email", { input: emailData });

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "ORCAMENTO",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        anexos: anexos ? JSON.stringify(anexos.map(a => a.filename)) : undefined,
        enviado: true,
        erro: undefined,
      });

      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || "Falha ao enviar email");

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "ORCAMENTO",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        anexos: anexos ? JSON.stringify(anexos.map(a => a.filename)) : undefined,
        enviado: false,
        erro: erroMsg,
      });

      return { sucesso: false, erro: erroMsg };
    }
  },

  /** Envia email de equipamento pronto via SMTP e registra no banco */
  async enviarEquipamentoPronto(equipamento: Equipamento) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const corpoTexto = gerarCorpoEquipamentoProntoTexto(equipamento);
    const corpoHtml = gerarCorpoEquipamentoProntoHtml(equipamento);
    const assunto = `Seu equipamento está pronto! - ${equipamento.marca} ${equipamento.modelo}`;
    const verificacao = equipamento.id
      ? await db.buscarVerificacao(equipamento.id).catch(() => null)
      : null;
    const tecnicoNome = verificacao?.tecnico_nome || extrairTecnicoInicialDeObservacoes(equipamento.observacoes);
    const emailTecnico = emailTecnicoPorNome(tecnicoNome);
    const cc = emailTecnico ? [emailTecnico] : undefined;

    const emailData: EmailSendRequest = {
      destinatario: equipamento.cliente_nome || "",
      email: equipamento.cliente_email,
      cc,
      assunto,
      corpo: corpoTexto,
      corpo_texto: corpoTexto,
      corpo_html: corpoHtml,
    };

    try {
      await invoke<void>("enviar_email", { input: emailData });

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "PRONTO",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        enviado: true,
        erro: undefined,
      });

      return { sucesso: true };
    } catch (error: any) {
      const erroMsg = typeof error === "string" ? error : (error?.message || "Falha ao enviar email");

      await registrarComunicacaoSegura({
        equipamento_id: equipamento.id!,
        tipo: "PRONTO",
        canal: "EMAIL",
        destinatario: equipamento.cliente_nome || "",
        contato: equipamento.cliente_email,
        assunto,
        mensagem: corpoTexto,
        enviado: false,
        erro: erroMsg,
      });

      return { sucesso: false, erro: erroMsg };
    }
  },
};

// ─── Geração de corpo de email ──────────────────────────
function parseJsonList<T>(value?: string): T[] {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value) as T[];
  } catch {
    return [];
  }
}

function formatarMoeda(valor?: number) {
  return `R$ ${(valor || 0).toFixed(2)}`;
}

function formatarData(data?: string) {
  return data ? new Date(data).toLocaleDateString("pt-BR") : "—";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gera corpo de email de orçamento com todos os detalhes da verificação.
 * Inclui: dados do equipamento, diagnóstico, serviços, peças, valores, prazo.
 * Conecta-se a: EmailService.enviarOrcamento()
 */
function gerarCorpoOrcamentoTexto(equipamento: Equipamento, verificacao: Verificacao): string {
  const servicos = parseJsonList<ServicoNecessario>(verificacao.servicos_necessarios);
  const pecas = parseJsonList<PecaNecessaria>(verificacao.pecas_necessarias);

  let detalhes = "";
  if (servicos.length > 0) {
    detalhes += "\nSERVIÇOS:\n" + servicos.map(s => `  • ${s.descricao}: R$ ${s.valor.toFixed(2)}`).join("\n");
  }
  if (pecas.length > 0) {
    detalhes += "\nPEÇAS:\n" + pecas.map(p => `  • ${p.nome} (x${p.quantidade}): R$ ${p.valorTotal.toFixed(2)}`).join("\n");
  }

  return `Prezado(a) ${equipamento.cliente_nome},

Seu equipamento foi verificado por nossa equipe técnica e elaboramos o orçamento para o reparo.

INFORMAÇÕES DO EQUIPAMENTO:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Marca/Modelo: ${equipamento.marca} ${equipamento.modelo}
Serial Number: ${equipamento.serial_number}
Data de Entrada: ${formatarData(equipamento.data_entrada)}

DIAGNÓSTICO:
━━━━━━━━━━━━━━━━━━━━━━━━━━
${verificacao.diagnostico || "Sem diagnóstico registrado"}
${detalhes}

ORÇAMENTO:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Mão de Obra: ${formatarMoeda(verificacao.custo_estimado_mao_obra)}
Peças: ${formatarMoeda(verificacao.custo_estimado_pecas)}
─────────────────────────────
TOTAL: ${formatarMoeda(verificacao.custo_total)}

Tempo Estimado: ${verificacao.tempo_estimado || 0}h
${equipamento.prazo_aprovacao ? `PRAZO PARA APROVAÇÃO: ${formatarData(equipamento.prazo_aprovacao)}` : ""}

Para aprovar este orçamento, responda este email com "APROVADO" ou entre em contato conosco.

Atenciosamente,
Equipe Técnica BMITAG`.trim();
}

function gerarCorpoOrcamentoHtml(equipamento: Equipamento, verificacao: Verificacao): string {
  const servicos = parseJsonList<ServicoNecessario>(verificacao.servicos_necessarios);
  const pecas = parseJsonList<PecaNecessaria>(verificacao.pecas_necessarias);

  const listaServicos = servicos.length > 0
    ? `<h3 style="margin:24px 0 8px;font-size:16px;">Serviços</h3><ul style="margin:0 0 16px 20px;padding:0;">${servicos.map((servico) => `<li style="margin-bottom:6px;">${escapeHtml(servico.descricao)}: ${escapeHtml(formatarMoeda(servico.valor))}</li>`).join("")}</ul>`
    : "";

  const listaPecas = pecas.length > 0
    ? `<h3 style="margin:24px 0 8px;font-size:16px;">Peças</h3><ul style="margin:0 0 16px 20px;padding:0;">${pecas.map((peca) => `<li style="margin-bottom:6px;">${escapeHtml(peca.nome)} (x${peca.quantidade}): ${escapeHtml(formatarMoeda(peca.valorTotal))}</li>`).join("")}</ul>`
    : "";

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.6;max-width:720px;">
      <p>Prezado(a) ${escapeHtml(equipamento.cliente_nome || "cliente")},</p>
      <p>Seu equipamento foi verificado por nossa equipe técnica e elaboramos o orçamento para o reparo.</p>
      <h2 style="margin:24px 0 8px;font-size:18px;">Informações do equipamento</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tbody>
          <tr><td style="padding:6px 0;font-weight:600;">Marca/Modelo</td><td style="padding:6px 0;">${escapeHtml(`${equipamento.marca} ${equipamento.modelo}`)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Serial Number</td><td style="padding:6px 0;">${escapeHtml(equipamento.serial_number)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Data de Entrada</td><td style="padding:6px 0;">${escapeHtml(formatarData(equipamento.data_entrada))}</td></tr>
        </tbody>
      </table>
      <h2 style="margin:24px 0 8px;font-size:18px;">Diagnóstico</h2>
      <p style="white-space:pre-line;">${escapeHtml(verificacao.diagnostico || "Sem diagnóstico registrado")}</p>
      ${listaServicos}
      ${listaPecas}
      <h2 style="margin:24px 0 8px;font-size:18px;">Orçamento</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tbody>
          <tr><td style="padding:6px 0;font-weight:600;">Mão de obra</td><td style="padding:6px 0;">${escapeHtml(formatarMoeda(verificacao.custo_estimado_mao_obra))}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Peças</td><td style="padding:6px 0;">${escapeHtml(formatarMoeda(verificacao.custo_estimado_pecas))}</td></tr>
          <tr><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;">Total</td><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;">${escapeHtml(formatarMoeda(verificacao.custo_total))}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Tempo estimado</td><td style="padding:6px 0;">${escapeHtml(`${verificacao.tempo_estimado || 0}h`)}</td></tr>
          ${equipamento.prazo_aprovacao ? `<tr><td style="padding:6px 0;font-weight:600;">Prazo para aprovação</td><td style="padding:6px 0;">${escapeHtml(formatarData(equipamento.prazo_aprovacao))}</td></tr>` : ""}
        </tbody>
      </table>
      <p>Para aprovar este orçamento, responda este email com <strong>APROVADO</strong> ou entre em contato conosco.</p>
      <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
    </div>
  `.trim();
}

/**
 * Gera corpo de email de "equipamento pronto" com dados de retirada.
 * Inclui: dados do equipamento, horário, valor a pagar.
 * Conecta-se a: EmailService.enviarEquipamentoPronto()
 */
function gerarCorpoEquipamentoProntoTexto(equipamento: Equipamento): string {
  const valor = equipamento.valor_final || equipamento.valor_orcamento;
  return `Prezado(a) ${equipamento.cliente_nome},

Ótimas notícias! Seu equipamento está pronto para retirada!

INFORMAÇÕES DO EQUIPAMENTO:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Marca/Modelo: ${equipamento.marca} ${equipamento.modelo}
Serial Number: ${equipamento.serial_number}

O equipamento foi reparado e testado com sucesso.

PARA RETIRADA:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Horário: Segunda a Sexta, 8h às 18h
         Sábado, 8h às 12h

Por favor, traga um documento com foto para retirada.
${valor ? `\nValor a pagar: ${formatarMoeda(valor)}` : ""}

Aguardamos você!

Atenciosamente,
Equipe Técnica BMITAG`.trim();
}

function gerarCorpoEquipamentoProntoHtml(equipamento: Equipamento): string {
  const valor = equipamento.valor_final || equipamento.valor_orcamento;

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.6;max-width:720px;">
      <p>Prezado(a) ${escapeHtml(equipamento.cliente_nome || "cliente")},</p>
      <p>Ótimas notícias! Seu equipamento está pronto para retirada.</p>
      <h2 style="margin:24px 0 8px;font-size:18px;">Informações do equipamento</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tbody>
          <tr><td style="padding:6px 0;font-weight:600;">Marca/Modelo</td><td style="padding:6px 0;">${escapeHtml(`${equipamento.marca} ${equipamento.modelo}`)}</td></tr>
          <tr><td style="padding:6px 0;font-weight:600;">Serial Number</td><td style="padding:6px 0;">${escapeHtml(equipamento.serial_number)}</td></tr>
          ${valor ? `<tr><td style="padding:6px 0;font-weight:600;">Valor a pagar</td><td style="padding:6px 0;">${escapeHtml(formatarMoeda(valor))}</td></tr>` : ""}
        </tbody>
      </table>
      <p>Horário de retirada: Segunda a Sexta, 8h às 18h, e Sábado, 8h às 12h.</p>
      <p>Por favor, traga um documento com foto para retirada.</p>
      <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
    </div>
  `.trim();
}
