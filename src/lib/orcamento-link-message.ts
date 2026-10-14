/**
 * Texto do link de decisão do orçamento, pronto para copiar ou para um provedor de envio.
 * Nada aqui envia mensagem: o envio automático depende de um provedor ainda não definido
 * (ver `orcamento-link-envio.ts`).
 */

export interface DadosMensagemLinkOrcamento {
  clienteNome?: string | null;
  equipamento: string;
  valorTotal: number;
  url: string;
  /** ISO 8601; quando ausente, a mensagem não cita validade. */
  validoAte?: string | null;
}

export interface MensagemLinkOrcamento {
  assunto: string;
  /** Texto simples, usado no WhatsApp e como alternativa do email. */
  texto: string;
  html: string;
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const formatarData = (iso: string) => {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? null
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(data);
};

const escaparHtml = (valor: string) =>
  valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function montarMensagemLinkOrcamento(dados: DadosMensagemLinkOrcamento): MensagemLinkOrcamento {
  const saudacao = dados.clienteNome?.trim() ? `Olá, ${dados.clienteNome.trim()}!` : "Olá!";
  const valor = formatarMoeda(dados.valorTotal);
  const validade = dados.validoAte ? formatarData(dados.validoAte) : null;

  const linhas = [
    saudacao,
    "",
    `O orçamento do equipamento ${dados.equipamento} está pronto: ${valor}.`,
    "Para aprovar ou recusar, ou tirar uma dúvida, abra o link abaixo. Nada é decidido até você confirmar, e você pode corrigir sua resposta enquanto a equipe não a aplicar.",
    "",
    dados.url,
    ...(validade ? ["", `O link vale até ${validade}.`] : []),
    "",
    "Equipe BMI TAG",
  ];
  const texto = linhas.join("\n");

  const html = [
    `<p>${escaparHtml(saudacao)}</p>`,
    `<p>O orçamento do equipamento <strong>${escaparHtml(dados.equipamento)}</strong> está pronto: <strong>${escaparHtml(valor)}</strong>.</p>`,
    "<p>Para aprovar ou recusar, ou tirar uma dúvida, use o botão abaixo. Nada é decidido até você confirmar, e você pode corrigir sua resposta enquanto a equipe não a aplicar.</p>",
    `<p><a href="${escaparHtml(dados.url)}">Abrir o orçamento</a></p>`,
    ...(validade ? [`<p>O link vale até ${escaparHtml(validade)}.</p>`] : []),
    "<p>Equipe BMI TAG</p>",
  ].join("");

  return { assunto: `Orçamento do seu equipamento (${valor})`, texto, html };
}
