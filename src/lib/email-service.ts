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
} from "@/types";

/**
 * Email da gerência que deve sempre receber cópia (CC) de toda comunicação
 * automática enviada ao cliente, independentemente do técnico responsável.
 */
const CC_GERENCIA = "medeiros@bmitag.com.br";

/** Frase padrão sobre extensão de prazo em caso de troca de peças. */
const AVISO_TROCA_PECAS_TEXTO =
  "Atenção: em caso de troca de peças, o prazo de execução do serviço pode ser estendido.";
const AVISO_TROCA_PECAS_HTML =
  "<strong>Atenção:</strong> em caso de troca de peças, o prazo de execução do serviço pode ser estendido.";

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

/**
 * Monta a lista de cópias (CC) de um email automático.
 * - Sempre inclui {@link CC_GERENCIA}.
 * - Inclui o email do técnico responsável quando conhecido.
 * - Remove vazios e duplicados (case-insensitive).
 */
function montarCcs(emailTecnico?: string): string[] {
  const candidatos = [CC_GERENCIA, emailTecnico].filter(
    (email): email is string => !!email && email.trim().length > 0,
  );
  const vistos = new Set<string>();
  const ccs: string[] = [];
  for (const email of candidatos) {
    const chave = email.trim().toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    ccs.push(email.trim());
  }
  return ccs;
}

/**
 * Frase para orientar o cliente sobre o canal mais ágil para tirar dúvidas.
 * Quando o técnico responsável é conhecido, sugere contato direto com ele.
 */
function fraseContatoTecnicoTexto(emailTecnico?: string): string {
  if (emailTecnico) {
    return `Em caso de dúvidas, para uma resolução mais rápida, entre em contato diretamente com o técnico responsável: ${emailTecnico}.`;
  }
  return "Em caso de dúvidas, para uma resolução mais rápida, responda este email para falar diretamente com nossa equipe técnica.";
}

function fraseContatoTecnicoHtml(emailTecnico?: string): string {
  if (emailTecnico) {
    const escapedEmail = escapeHtml(emailTecnico);
    return `Em caso de dúvidas, para uma resolução mais rápida, entre em contato diretamente com o técnico responsável: <a href="mailto:${escapedEmail}">${escapedEmail}</a>.`;
  }
  return "Em caso de dúvidas, para uma resolução mais rápida, responda este email para falar diretamente com nossa equipe técnica.";
}

async function registrarComunicacaoSegura(comunicacao: Omit<Comunicacao, "id">) {
  try {
    await db.registrarComunicacao(comunicacao);
  } catch (error) {
    console.error("[EmailService] Falha ao registrar comunicação:", error);
  }
}

/**
 * Prepara um anexo de email a partir de um arquivo já salvo pelo app: copia o
 * arquivo para o diretório temporário do AutoOS (único local aceito pelo
 * backend SMTP) e devolve o `EmailAttachment` apontando para o caminho
 * temporário, junto da função para apagar o arquivo após o envio.
 */
async function prepararAnexoTemporario(
  caminhoOrigem: string,
  fallbackFilename: string,
): Promise<{ anexo: EmailAttachment; cleanup: () => Promise<void> } | null> {
  const filename = caminhoOrigem.split(/[/\\]/).pop() || fallbackFilename;
  try {
    const caminhoTemp = await db.copiarAnexoEmailParaTemp(caminhoOrigem, filename);
    const cleanup = async () => {
      try {
        await db.removerAnexoEmailTemp(caminhoTemp);
      } catch (error) {
        console.warn("[EmailService] Falha ao remover anexo temporário:", error);
      }
    };
    return {
      anexo: { filename, content_type: "application/pdf", path: caminhoTemp },
      cleanup,
    };
  } catch (error) {
    console.warn("[EmailService] Falha ao copiar PDF para diretório temporário:", error);
    return null;
  }
}

export const EmailService = {
  /** Envia email da ordem de entrada (ordem de serviço) via SMTP e registra no banco */
  async enviarOrdemEntrada(equipamento: Equipamento) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const assunto = `Ordem de Entrada - ${equipamento.marca} ${equipamento.modelo} (SN: ${equipamento.serial_number})`;
    const tecnicoNome = extrairTecnicoInicialDeObservacoes(equipamento.observacoes);
    const emailTecnico = emailTecnicoPorNome(tecnicoNome);
    const cc = montarCcs(emailTecnico);
    const corpoTexto = `Prezado(a) ${equipamento.cliente_nome || "cliente"},

Registramos a entrada do seu equipamento em nosso laboratório técnico.

Equipamento: ${equipamento.marca} ${equipamento.modelo}
Serial Number: ${equipamento.serial_number}
Data de Entrada: ${formatarData(equipamento.data_entrada)}

A Ordem de Entrada segue em anexo.

${AVISO_TROCA_PECAS_TEXTO}

${fraseContatoTecnicoTexto(emailTecnico)}

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
        <p>${AVISO_TROCA_PECAS_HTML}</p>
        <p>${fraseContatoTecnicoHtml(emailTecnico)}</p>
        <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
      </div>
    `;

    let anexos: EmailAttachment[] | undefined;
    let limparAnexoTemp: (() => Promise<void>) | undefined;
    try {
      const caminhoPdf = await PdfService.gerarOrdemServico(equipamento);
      if (caminhoPdf) {
        const preparado = await prepararAnexoTemporario(caminhoPdf, "ordem_entrada.pdf");
        if (preparado) {
          anexos = [preparado.anexo];
          limparAnexoTemp = preparado.cleanup;
        }
      }
    } catch (error) {
      console.warn("[EmailService] Falha ao gerar PDF de ordem de entrada:", error);
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
    } finally {
      if (limparAnexoTemp) {
        await limparAnexoTemp();
      }
    }
  },

  /** Envia email de orçamento via SMTP e registra no banco */
  async enviarOrcamento(equipamento: Equipamento, verificacao: Verificacao) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const assunto = `Orçamento - ${equipamento.marca} ${equipamento.modelo} (SN: ${equipamento.serial_number})`;
    const emailTecnico = emailTecnicoPorNome(verificacao.tecnico_nome);
    const cc = montarCcs(emailTecnico);
    const corpoTexto = gerarCorpoOrcamentoTexto(equipamento, verificacao, emailTecnico);
    const corpoHtml = gerarCorpoOrcamentoHtml(equipamento, verificacao, emailTecnico);

    let anexos: EmailAttachment[] | undefined;
    let limparAnexoTemp: (() => Promise<void>) | undefined;
    try {
      const caminhoPdf = await PdfService.gerarOrcamento(equipamento, verificacao);
      if (caminhoPdf) {
        const preparado = await prepararAnexoTemporario(caminhoPdf, "orcamento.pdf");
        if (preparado) {
          anexos = [preparado.anexo];
          limparAnexoTemp = preparado.cleanup;
        }
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
    } finally {
      if (limparAnexoTemp) {
        await limparAnexoTemp();
      }
    }
  },

  /** Envia email de equipamento pronto via SMTP e registra no banco */
  async enviarEquipamentoPronto(equipamento: Equipamento) {
    if (!equipamento.cliente_email) {
      return { sucesso: false, erro: "Cliente não possui email cadastrado" };
    }

    const assunto = `Seu equipamento está pronto! - ${equipamento.marca} ${equipamento.modelo}`;
    const verificacao = equipamento.id
      ? await db.buscarVerificacao(equipamento.id).catch(() => null)
      : null;
    const tecnicoNome = verificacao?.tecnico_nome || extrairTecnicoInicialDeObservacoes(equipamento.observacoes);
    const emailTecnico = emailTecnicoPorNome(tecnicoNome);
    const cc = montarCcs(emailTecnico);
    const corpoTexto = gerarCorpoEquipamentoProntoTexto(equipamento, emailTecnico);
    const corpoHtml = gerarCorpoEquipamentoProntoHtml(equipamento, emailTecnico);

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
 * Gera corpo de email de orçamento com os detalhes da verificação técnica.
 * O orçamento atual é composto exclusivamente por uma lista de serviços
 * (cada um com descrição e valor); o total é a soma desses serviços.
 * Conecta-se a: EmailService.enviarOrcamento()
 */
function gerarCorpoOrcamentoTexto(
  equipamento: Equipamento,
  verificacao: Verificacao,
  emailTecnico?: string,
): string {
  const servicos = parseJsonList<ServicoNecessario>(verificacao.servicos_necessarios);
  const total = verificacao.custo_total ?? servicos.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

  const linhasServicos = servicos.length > 0
    ? servicos.map((s) => `  • ${s.descricao}: ${formatarMoeda(s.valor)}`).join("\n")
    : "  • Nenhum serviço registrado";

  const prazoLinha = equipamento.prazo_aprovacao
    ? `\nPRAZO PARA APROVAÇÃO: ${formatarData(equipamento.prazo_aprovacao)}`
    : "";

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

SERVIÇOS:
━━━━━━━━━━━━━━━━━━━━━━━━━━
${linhasServicos}
─────────────────────────────
TOTAL: ${formatarMoeda(total)}${prazoLinha}

${AVISO_TROCA_PECAS_TEXTO}

Para aprovar este orçamento, responda este email com "APROVADO" ou entre em contato conosco.

${fraseContatoTecnicoTexto(emailTecnico)}

Atenciosamente,
Equipe Técnica BMITAG`.trim();
}

function gerarCorpoOrcamentoHtml(
  equipamento: Equipamento,
  verificacao: Verificacao,
  emailTecnico?: string,
): string {
  const servicos = parseJsonList<ServicoNecessario>(verificacao.servicos_necessarios);
  const total = verificacao.custo_total ?? servicos.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);

  const linhasServicosHtml = servicos.length > 0
    ? servicos
        .map(
          (servico) =>
            `<tr><td style="padding:6px 0;">${escapeHtml(servico.descricao)}</td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatarMoeda(servico.valor))}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:6px 0;color:#6b7280;" colspan="2">Nenhum serviço registrado.</td></tr>`;

  const linhaPrazoHtml = equipamento.prazo_aprovacao
    ? `<tr><td style="padding:6px 0;font-weight:600;">Prazo para aprovação</td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatarData(equipamento.prazo_aprovacao))}</td></tr>`
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
      <h2 style="margin:24px 0 8px;font-size:18px;">Serviços</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tbody>
          ${linhasServicosHtml}
          <tr><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;">Total</td><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;text-align:right;">${escapeHtml(formatarMoeda(total))}</td></tr>
          ${linhaPrazoHtml}
        </tbody>
      </table>
      <p>${AVISO_TROCA_PECAS_HTML}</p>
      <p>Para aprovar este orçamento, responda este email com <strong>APROVADO</strong> ou entre em contato conosco.</p>
      <p>${fraseContatoTecnicoHtml(emailTecnico)}</p>
      <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
    </div>
  `.trim();
}

/**
 * Gera corpo de email de "equipamento pronto" com dados de retirada.
 * Inclui: dados do equipamento, horário, valor a pagar.
 * Conecta-se a: EmailService.enviarEquipamentoPronto()
 */
function gerarCorpoEquipamentoProntoTexto(equipamento: Equipamento, emailTecnico?: string): string {
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

Por favor, traga a OS do seu equipamento para retirada.
${valor ? `\nValor a pagar: ${formatarMoeda(valor)}` : ""}

${fraseContatoTecnicoTexto(emailTecnico)}

Aguardamos você!

Atenciosamente,
Equipe Técnica BMITAG`.trim();
}

function gerarCorpoEquipamentoProntoHtml(equipamento: Equipamento, emailTecnico?: string): string {
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
      <p>${fraseContatoTecnicoHtml(emailTecnico)}</p>
      <p>Atenciosamente,<br />Equipe Técnica BMITAG</p>
    </div>
  `.trim();
}
