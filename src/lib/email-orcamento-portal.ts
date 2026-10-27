/**
 * E-mail do orçamento com acesso ao Portal das Impressoras (mesma lógica do WhatsApp).
 * A senha em claro vai só no e-mail do cliente; a cópia interna e o histórico usam senha mascarada.
 */

import { db } from "@/lib/db";
import { PdfService } from "@/lib/pdf-service";
import { formatDatePtBr } from "@/lib/date-utils";
import { PORTAL_URL } from "@/components/clientes/SenhaPortalDialog";
import { emailTecnicoPorNome, montarCcs, prepararAnexoTemporario } from "@/lib/email-service";
import type {
  EmailAttachment,
  EmailSendRequest,
  Equipamento,
  PreparoAcessoPortal,
  ServicoNecessario,
  Verificacao,
} from "@/types";

export const SENHA_MASCARADA = "••••-••••-••••";

const AVISO_TROCA_PECAS = "Atenção: em caso de troca de peças, o prazo de execução do serviço pode ser estendido.";

export interface OpcoesCorpoPortal {
  mascarar: boolean;
}

export interface ResultadoEnvioParte {
  enviado: boolean;
  erro?: string;
}

export interface ResultadoEmailOrcamentoPortal {
  cliente: ResultadoEnvioParte;
  copia: ResultadoEnvioParte;
}

function parseLista<T>(value?: string): T[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as T[];
  } catch {
    return [];
  }
}

function moeda(valor?: number) {
  return `R$ ${(valor || 0).toFixed(2)}`;
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ModoPortal = "DECIDIR" | "ACOMPANHAR" | "SEM_PORTAL";

function modoPortal(preparo: PreparoAcessoPortal): ModoPortal {
  if (!preparo.portalAtivo) return "SEM_PORTAL";
  const acesso = preparo.destinatario.portalAcesso;
  if (acesso === "DECIDIR") return "DECIDIR";
  if (acesso === "ACOMPANHAR") return "ACOMPANHAR";
  return "SEM_PORTAL";
}

function dadosOrcamento(equip: Equipamento, verificacao: Verificacao) {
  const servicos = parseLista<ServicoNecessario>(verificacao.servicos_necessarios);
  const total = verificacao.custo_total ?? servicos.reduce((acc, s) => acc + (Number(s.valor) || 0), 0);
  return { servicos, total, prazo: equip.prazo_aprovacao ? formatDatePtBr(equip.prazo_aprovacao) : "" };
}

function linhasAcessoTexto(preparo: PreparoAcessoPortal, mascarar: boolean): string[] {
  const modo = modoPortal(preparo);
  if (modo === "SEM_PORTAL") return [];
  const linhas: string[] = [];
  if (modo === "DECIDIR") {
    linhas.push("Para aceitar, recusar ou negociar, entre no Portal das Impressoras:");
  } else {
    linhas.push("Você pode acompanhar o orçamento no Portal das Impressoras:");
  }
  linhas.push(PORTAL_URL);
  if (preparo.credenciais) {
    linhas.push(`Usuário: ${preparo.credenciais.usuario}`);
    linhas.push(`Senha: ${mascarar ? SENHA_MASCARADA : preparo.credenciais.senha}`);
  } else if (preparo.senhaExistente) {
    linhas.push("Use a senha que você já tem. Se esqueceu, fale com a nossa equipe.");
  }
  if (modo === "ACOMPANHAR") {
    linhas.push("Para aprovar, responda este e-mail ou fale com a nossa equipe.");
  }
  return linhas;
}

export function gerarCorpoOrcamentoPortalTexto(
  equip: Equipamento,
  verificacao: Verificacao,
  preparo: PreparoAcessoPortal,
  { mascarar }: OpcoesCorpoPortal,
): string {
  const { servicos, total, prazo } = dadosOrcamento(equip, verificacao);
  const dest = preparo.destinatario;
  const linhasServicos =
    servicos.length > 0
      ? servicos
          .map((s) => {
            const pecas = (s.pecas ?? [])
              .map((p) => `      - ${p.quantidade}x ${p.nome}`)
              .join("\n");
            return `  • ${s.descricao}: ${moeda(s.valor)}${pecas ? `\n${pecas}` : ""}`;
          })
          .join("\n")
      : "  • Nenhum serviço registrado";

  const acesso =
    modoPortal(preparo) === "SEM_PORTAL"
      ? [
          "Para aprovar este orçamento, responda este e-mail com \"APROVADO\" no assunto ou fale com a nossa equipe.",
          "Ao enviar, você confirma a aprovação do orçamento.",
        ]
      : linhasAcessoTexto(preparo, mascarar);

  return [
    `Olá, ${dest.nome || "cliente"}.`,
    "",
    `Empresa: ${dest.clienteNome} — CNPJ/CPF ${dest.clienteDocumento}`,
    "",
    "Seu equipamento foi verificado por nossa equipe técnica e elaboramos o orçamento para o reparo.",
    "",
    `Equipamento: ${equip.marca} ${equip.modelo} (SN: ${equip.serial_number || "N/A"})`,
    "",
    "SERVIÇOS:",
    linhasServicos,
    `TOTAL: ${moeda(total)}`,
    ...(prazo ? [`PRAZO PARA APROVAÇÃO: ${prazo}`] : []),
    "",
    AVISO_TROCA_PECAS,
    "",
    ...acesso,
    "",
    "Atenciosamente,",
    "Equipe técnica",
  ].join("\n");
}

export function gerarCorpoOrcamentoPortalHtml(
  equip: Equipamento,
  verificacao: Verificacao,
  preparo: PreparoAcessoPortal,
  { mascarar }: OpcoesCorpoPortal,
): string {
  const { servicos, total, prazo } = dadosOrcamento(equip, verificacao);
  const dest = preparo.destinatario;
  const modo = modoPortal(preparo);

  const linhasServicos =
    servicos.length > 0
      ? servicos
          .map((s) => {
            const pecas = (s.pecas ?? [])
              .map((p) => `<div style="font-size:12px;color:#6b7280;">${esc(`${p.quantidade}x ${p.nome}`)}</div>`)
              .join("");
            return `<tr><td style="padding:6px 0;">${esc(s.descricao)}${pecas}</td><td style="padding:6px 0;text-align:right;">${esc(moeda(s.valor))}</td></tr>`;
          })
          .join("")
      : `<tr><td style="padding:6px 0;color:#6b7280;" colspan="2">Nenhum serviço registrado.</td></tr>`;

  let blocoAcesso: string;
  if (modo === "SEM_PORTAL") {
    blocoAcesso = `<p>Para aprovar este orçamento, responda este e-mail com "APROVADO" no assunto ou fale com a nossa equipe.</p><p>Ao enviar, você confirma a aprovação do orçamento.</p>`;
  } else {
    const intro =
      modo === "DECIDIR"
        ? "Para aceitar, recusar ou negociar, entre no Portal das Impressoras:"
        : "Você pode acompanhar o orçamento no Portal das Impressoras:";
    const partes = [`<p style="margin:0 0 8px 0;font-weight:600;">${esc(intro)}</p>`];
    partes.push(`<p style="margin:0 0 8px 0;"><a href="${esc(PORTAL_URL)}">${esc(PORTAL_URL)}</a></p>`);
    if (preparo.credenciais) {
      const senha = mascarar ? SENHA_MASCARADA : preparo.credenciais.senha;
      partes.push(`<p style="margin:0;">Usuário: <strong>${esc(preparo.credenciais.usuario)}</strong><br />Senha: <strong>${esc(senha)}</strong></p>`);
    } else if (preparo.senhaExistente) {
      partes.push(`<p style="margin:0;">Use a senha que você já tem. Se esqueceu, fale com a nossa equipe.</p>`);
    }
    if (modo === "ACOMPANHAR") {
      partes.push(`<p style="margin:8px 0 0 0;">Para aprovar, responda este e-mail ou fale com a nossa equipe.</p>`);
    }
    blocoAcesso = `<div style="margin-top:16px;padding:16px;background:#f3f4f6;border-radius:8px;border:1px solid #e5e7eb;">${partes.join("")}</div>`;
  }

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.6;max-width:720px;">
      <p>Olá, ${esc(dest.nome || "cliente")}.</p>
      <p>Empresa: ${esc(dest.clienteNome)} — CNPJ/CPF ${esc(dest.clienteDocumento)}</p>
      <p>Seu equipamento foi verificado por nossa equipe técnica e elaboramos o orçamento para o reparo.</p>
      <p><strong>Equipamento:</strong> ${esc(`${equip.marca} ${equip.modelo}`)} (SN: ${esc(equip.serial_number || "N/A")})</p>
      <h2 style="margin:24px 0 8px;font-size:18px;">Serviços</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tbody>
          ${linhasServicos}
          <tr><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;">Total</td><td style="padding:12px 0 6px;font-weight:700;border-top:1px solid #d1d5db;text-align:right;">${esc(moeda(total))}</td></tr>
          ${prazo ? `<tr><td style="padding:6px 0;font-weight:600;">Prazo para aprovação</td><td style="padding:6px 0;text-align:right;">${esc(prazo)}</td></tr>` : ""}
        </tbody>
      </table>
      <p><strong>Atenção:</strong> em caso de troca de peças, o prazo de execução do serviço pode ser estendido.</p>
      ${blocoAcesso}
      <p>Atenciosamente,<br />Equipe técnica</p>
    </div>
  `.trim();
}

function mensagemErro(error: unknown, padrao: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return padrao;
}

export async function enviarEmailOrcamentoPortal(
  equip: Equipamento,
  verificacao: Verificacao,
  preparo: PreparoAcessoPortal,
): Promise<ResultadoEmailOrcamentoPortal> {
  const emailCliente = preparo.destinatario.email?.trim();
  if (!emailCliente) {
    return { cliente: { enviado: false, erro: "Contato sem e-mail." }, copia: { enviado: false } };
  }

  const assunto = `Orçamento - ${equip.marca} ${equip.modelo} (SN: ${equip.serial_number})`;
  const nomeContato = preparo.destinatario.nome || "";
  const corpoClienteTexto = gerarCorpoOrcamentoPortalTexto(equip, verificacao, preparo, { mascarar: false });
  const corpoClienteHtml = gerarCorpoOrcamentoPortalHtml(equip, verificacao, preparo, { mascarar: false });
  const corpoMascTexto = gerarCorpoOrcamentoPortalTexto(equip, verificacao, preparo, { mascarar: true });
  const corpoMascHtml = gerarCorpoOrcamentoPortalHtml(equip, verificacao, preparo, { mascarar: true });

  let anexos: EmailAttachment[] | undefined;
  let limparAnexoTemp: (() => Promise<void>) | undefined;
  try {
    const caminhoPdf = await PdfService.gerarOrcamento(equip, verificacao);
    if (caminhoPdf) {
      const preparado = await prepararAnexoTemporario(caminhoPdf, "orcamento.pdf");
      if (preparado) {
        anexos = [preparado.anexo];
        limparAnexoTemp = preparado.cleanup;
      }
    }
  } catch (error) {
    console.warn("[EmailOrcamentoPortal] Falha ao gerar PDF de orçamento:", error);
  }

  const registrar = async (enviado: boolean, erro?: string) => {
    try {
      await db.registrarComunicacao({
        equipamento_id: equip.id!,
        tipo: "ORCAMENTO",
        canal: "EMAIL",
        destinatario: nomeContato,
        contato: emailCliente,
        assunto,
        mensagem: corpoMascTexto,
        anexos: anexos ? JSON.stringify(anexos.map((a) => a.filename)) : undefined,
        enviado,
        erro,
      });
    } catch (error) {
      console.error("[EmailOrcamentoPortal] Falha ao registrar comunicação:", error);
    }
  };

  const resultado: ResultadoEmailOrcamentoPortal = { cliente: { enviado: false }, copia: { enviado: false } };

  try {
    const emailCliente1: EmailSendRequest = {
      destinatario: nomeContato,
      email: emailCliente,
      cc: [],
      assunto,
      corpo: corpoClienteTexto,
      corpo_texto: corpoClienteTexto,
      corpo_html: corpoClienteHtml,
      anexos,
    };
    try {
      await db.enviarEmail(emailCliente1);
      resultado.cliente = { enviado: true };
      await registrar(true);
    } catch (error) {
      const erro = mensagemErro(error, "Falha ao enviar email");
      resultado.cliente = { enviado: false, erro };
      await registrar(false, erro);
      return resultado;
    }

    const [principal, ...restoCc] = montarCcs(emailTecnicoPorNome(verificacao.tecnico_nome));
    try {
      const copia: EmailSendRequest = {
        destinatario: principal,
        email: principal,
        cc: restoCc,
        assunto: `[Cópia] ${assunto}`,
        corpo: corpoMascTexto,
        corpo_texto: corpoMascTexto,
        corpo_html: corpoMascHtml,
        anexos,
      };
      await db.enviarEmail(copia);
      resultado.copia = { enviado: true };
    } catch (error) {
      resultado.copia = { enviado: false, erro: mensagemErro(error, "Falha ao enviar a cópia interna") };
    }
    return resultado;
  } finally {
    if (limparAnexoTemp) await limparAnexoTemp();
  }
}
