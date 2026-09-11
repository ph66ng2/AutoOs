/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/pdf-service.ts — Serviço de Geração de PDFs do AutoOS ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Gera documentos PDF de orçamento preenchidos com dados     ║
 * ║  reais do equipamento, verificação e cliente.                ║
 * ║  Layout monocromático inspirado no modelo visual da BMITAG. ║
 * ║                                                              ║
 * ║  FLUXO:                                                      ║
 * ║  1. Coleta dados do equipamento + verificação                ║
 * ║  2. Gera PDF com jsPDF + jspdf-autotable                   ║
 * ║  3. Envia bytes para Rust salvar em Documents/Orcamentos    ║
 * ║  4. Rust abre a pasta com o arquivo selecionado             ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - jspdf + jspdf-autotable (npm packages)                   ║
 * ║  - @tauri-apps/api/core (invoke para comando Rust)          ║
 * ║  - types/index.ts (Equipamento, Verificacao, etc.)          ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx → botão "Gerar Orçamento PDF"    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { invoke } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import { STATUS_LABELS } from "@/types";
import type {
  Equipamento,
  EquipamentoImagem,
  Verificacao,
  ServicoNecessario,
  PecaNecessaria,
} from "@/types";
import { LOGO_BMITAG_MONOCHROME_PNG_BASE64 } from "./logo-monochrome-base64";

// ─── Constantes de layout ───────────────────────────────

/** Largura útil da página A4 em mm (210 - margens) */
const PAGE_WIDTH = 210;
const MARGIN_LEFT = 15;
const MARGIN_RIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

type CorPdf = [number, number, number];

/** Documento construído em memória. A persistência é intencionalmente separada para permitir prévia no balcão. */
export interface PdfArtifact {
  filename: string;
  bytes: Uint8Array;
  mimeType: "application/pdf";
}

/** Paleta única dos quatro PDFs: branco, preto e cinzas econômicos. */
const CORES_PDF = {
  preto: [0, 0, 0] as CorPdf,
  texto: [35, 35, 35] as CorPdf,
  textoSecundario: [85, 85, 85] as CorPdf,
  borda: [185, 185, 185] as CorPdf,
  bordaForte: [95, 95, 95] as CorPdf,
  branco: [255, 255, 255] as CorPdf,
};
const CABECALHO_EMPRESA = {
  nome: "BMITAG TECNOLOGIA QRCODE E RFID",
  descricao: "Vendas e Manutenções de Equipamentos ZEBRA",
  telefone: "Tel: +55 71 98223-5050 / +55 71 98165-0801",
  contato: "E-mail: bmitag@bmitag.com.br | bmitag.com.br",
  cnpj: "CNPJ: 57.522.734/0001-58",
};
const LOGO_MONOCHROME_DATA_URL =
  `data:image/png;base64,${LOGO_BMITAG_MONOCHROME_PNG_BASE64}`;

// ─── Utilitários de formatação ──────────────────────────

/** Nomes dos meses em português */
const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Formata data por extenso.
 * Ex: "11 de fevereiro de 2026"
 */
function formatarDataExtenso(data: Date): string {
  if (Number.isNaN(data.getTime())) {
    return "—";
  }
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = MESES_PT[data.getMonth()];
  const ano = data.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

function converterDataDocumento(data?: string): Date {
  if (!data) {
    return new Date();
  }

  // Datas sem horário devem ser interpretadas no meio do dia local para não
  // retroceder um dia em fusos negativos, como o de Salvador.
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new Date(`${data}T12:00:00`);
  }

  return new Date(data);
}

/**
 * Formata valor monetário brasileiro.
 * Ex: 1500.50 → "R$ 1.500,50"
 */
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Gera número da OS a partir do ID do equipamento.
 * Ex: ID 42 → "OS-00042"
 */
function gerarNumeroOS(equipamentoId: number | undefined): string {
  const id = equipamentoId ?? 0;
  return `OS-${String(id).padStart(5, "0")}`;
}

function calcularDimensoesAjustadas(
  larguraOriginal: number,
  alturaOriginal: number,
  larguraMaxima: number,
  alturaMaxima: number
) {
  const escala = Math.min(
    larguraMaxima / larguraOriginal,
    alturaMaxima / alturaOriginal,
    1,
  );

  return {
    largura: larguraOriginal * escala,
    altura: alturaOriginal * escala,
  };
}

function formatoImagemPdf(mimeType: string): "PNG" | "JPEG" {
  return mimeType === "image/png" ? "PNG" : "JPEG";
}

function emailTecnicoPorNome(tecnicoNome?: string) {
  if (tecnicoNome === "Ivan") return "ivan@bmitag.com.br";
  if (tecnicoNome === "Isaias") return "isaias@bmitag.com.br";
  return "";
}

function extrairTecnicoInicialDeObservacoes(observacoes?: string | null) {
  if (!observacoes) return "";
  const match = observacoes.match(/^Técnico inicial:\s*(Ivan|Isaias)\b/m);
  return match?.[1] || "";
}

function limparObservacoesParaDocumento(observacoes?: string | null) {
  if (!observacoes) return "";
  return observacoes
    .replace(/^Técnico inicial:.*(?:\r?\n)?/m, "")
    .replace(/^Laudo técnico:.*(?:\r?\n)?/m, "")
    .trim();
}

interface CabecalhoPdf {
  titulo: string;
  numeroOS: string;
  rotuloData: "Emissão" | "Entrada";
  dataFormatada: string;
}

function aplicarCabecalhoPadrao(doc: jsPDF, y: number, cabecalho: CabecalhoPdf) {
  const alturaHeader = 43;
  const larguraLogo = 45;
  const larguraDocumento = 47;
  const separadorLogo = MARGIN_LEFT + larguraLogo;
  const separadorDocumento = PAGE_WIDTH - MARGIN_RIGHT - larguraDocumento;
  const centroEmpresa = (separadorLogo + separadorDocumento) / 2;
  const centroDocumento = separadorDocumento + larguraDocumento / 2;

  doc.setDrawColor(...CORES_PDF.bordaForte);
  doc.setLineWidth(0.45);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, alturaHeader, "S");
  doc.setLineWidth(0.3);
  doc.line(separadorLogo, y, separadorLogo, y + alturaHeader);
  doc.line(separadorDocumento, y, separadorDocumento, y + alturaHeader);

  try {
    const logoSize = 34;
    doc.addImage(
      LOGO_MONOCHROME_DATA_URL,
      "PNG",
      MARGIN_LEFT + (larguraLogo - logoSize) / 2,
      y + (alturaHeader - logoSize) / 2,
      logoSize,
      logoSize,
    );
  } catch (err) {
    console.error("Falha ao adicionar logo no cabeçalho PDF:", err);
  }

  doc.setTextColor(...CORES_PDF.preto);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(CABECALHO_EMPRESA.nome, centroEmpresa, y + 9, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(CABECALHO_EMPRESA.descricao, centroEmpresa, y + 15, { align: "center" });
  doc.text(CABECALHO_EMPRESA.telefone, centroEmpresa, y + 21, { align: "center" });
  doc.text(CABECALHO_EMPRESA.contato, centroEmpresa, y + 27, { align: "center" });
  doc.text(CABECALHO_EMPRESA.cnpj, centroEmpresa, y + 33, { align: "center" });

  doc.setTextColor(...CORES_PDF.preto);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(cabecalho.titulo, centroDocumento, y + 9, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("Número da OS", centroDocumento, y + 17, { align: "center" });
  doc.setFontSize(9);
  doc.text(cabecalho.numeroOS, centroDocumento, y + 24, { align: "center" });
  doc.setFontSize(6.5);
  doc.text(cabecalho.rotuloData, centroDocumento, y + 31, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const dataLinhas = doc.splitTextToSize(cabecalho.dataFormatada, larguraDocumento - 5);
  doc.text(dataLinhas.slice(0, 2), centroDocumento, y + 37, { align: "center" });

  return y + alturaHeader + 8;
}

function aplicarRodape(
  doc: jsPDF,
  numeroOS: string,
  pagina: number,
  totalPaginas: number,
  dataGeracao: Date,
  linhaSecundaria?: string,
) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const rodapeY = pageHeight - 9;
  doc.setDrawColor(...CORES_PDF.borda);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, pageHeight - 17, PAGE_WIDTH - MARGIN_RIGHT, pageHeight - 17);
  doc.setFontSize(7);
  doc.setTextColor(...CORES_PDF.textoSecundario);
  doc.setFont("helvetica", "normal");
  if (linhaSecundaria) {
    doc.text(linhaSecundaria, PAGE_WIDTH / 2, pageHeight - 13, { align: "center" });
  }
  doc.text(
    `AutoOS | ${dataGeracao.toLocaleString("pt-BR")} | ${numeroOS} | Página ${pagina}/${totalPaginas}`,
    PAGE_WIDTH / 2,
    rodapeY,
    { align: "center" }
  );
}

function opcoesTabelaMonocromatica() {
  return {
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
    theme: "grid" as const,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: CORES_PDF.borda,
      lineWidth: 0.3,
      textColor: CORES_PDF.texto,
      fillColor: CORES_PDF.branco,
    },
    headStyles: {
      fillColor: CORES_PDF.branco,
      textColor: CORES_PDF.preto,
      fontStyle: "bold" as const,
    },
  };
}

function renderizarTabelaFormulario(
  doc: jsPDF,
  y: number,
  cabecalho: string[],
  corpo: string[][],
  larguras?: number[],
): number {
  const opcoes = opcoesTabelaMonocromatica();
  const columnStyles = larguras?.reduce<Record<number, { cellWidth: number }>>(
    (estilos, largura, indice) => {
      estilos[indice] = { cellWidth: largura };
      return estilos;
    },
    {},
  );

  autoTable(doc, {
    ...opcoes,
    startY: y,
    styles: {
      ...opcoes.styles,
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.2,
      fontStyle: "bold",
      valign: "top",
    },
    headStyles: {
      ...opcoes.headStyles,
      font: "courier",
      fontSize: 7,
      halign: "left",
    },
    ...(columnStyles ? { columnStyles } : {}),
    head: [cabecalho],
    body: corpo,
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
}

function renderizarTituloSecao(doc: jsPDF, y: number, titulo: string): number {
  doc.setTextColor(...CORES_PDF.preto);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, PAGE_WIDTH / 2, y + 4, { align: "center" });
  doc.setDrawColor(...CORES_PDF.borda);
  doc.setLineWidth(0.35);
  doc.line(MARGIN_LEFT, y + 7, PAGE_WIDTH - MARGIN_RIGHT, y + 7);
  return y + 10;
}

function renderizarParagrafo(
  doc: jsPDF,
  texto: string,
  x: number,
  y: number,
  largura: number,
  alturaLinha = 4,
): number {
  const linhas = doc.splitTextToSize(texto, largura) as string[];
  let indice = 0;
  let cursorY = y;
  const margemInferior = 22;

  while (indice < linhas.length) {
    const alturaDisponivel = doc.internal.pageSize.getHeight() - margemInferior - cursorY;
    if (alturaDisponivel < alturaLinha) {
      doc.addPage();
      cursorY = 20;
      continue;
    }

    const linhasNaPagina = Math.max(1, Math.floor(alturaDisponivel / alturaLinha));
    const lote = linhas.slice(indice, indice + linhasNaPagina);
    doc.text(lote, x, cursorY);
    indice += lote.length;
    cursorY += lote.length * alturaLinha;

    if (indice < linhas.length) {
      doc.addPage();
      cursorY = 20;
    }
  }

  return cursorY + 5;
}

async function adicionarRegistroFotografico(
  doc: jsPDF,
  imagens: EquipamentoImagem[],
  titulo: string,
  descricao: string,
) {
  if (imagens.length === 0) {
    return;
  }

  const imagensPreparadas = imagens.map((imagem) => ({
    ...imagem,
    dataUrl: imagem.storage_path,
  }));

  for (let inicio = 0; inicio < imagensPreparadas.length; inicio += 2) {
    const lote = imagensPreparadas.slice(inicio, inicio + 2);
    doc.addPage();

    let pageY = 18;
    doc.setTextColor(...CORES_PDF.preto);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(titulo, PAGE_WIDTH / 2, pageY, { align: "center" });
    pageY += 7;

    doc.setTextColor(...CORES_PDF.textoSecundario);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(descricao, PAGE_WIDTH / 2, pageY, { align: "center" });
    pageY += 8;

    lote.forEach((imagem, offset) => {
      const indiceImagem = inicio + offset + 1;
      const cardX = MARGIN_LEFT;
      const cardY = pageY;
      const cardWidth = CONTENT_WIDTH;
      const cardHeight = 118;

      doc.setDrawColor(...CORES_PDF.borda);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...CORES_PDF.preto);
      doc.text(`Imagem ${indiceImagem}`, cardX + 4, cardY + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...CORES_PDF.textoSecundario);
      const nomeArquivo = doc.splitTextToSize(imagem.filename, cardWidth - 8);
      doc.text(nomeArquivo[0], cardX + 4, cardY + 12);

      const legenda = imagem.observacao?.trim()
        ? doc.splitTextToSize(imagem.observacao.trim(), cardWidth - 8)
        : ["Sem legenda registrada."];
      doc.text(legenda.slice(0, 2), cardX + 4, cardY + 17);

      const frameX = cardX + 4;
      const frameY = cardY + 24;
      const frameWidth = cardWidth - 8;
      const frameHeight = cardHeight - 28;

      doc.rect(frameX, frameY, frameWidth, frameHeight);

      const dimensoes = calcularDimensoesAjustadas(
        imagem.largura || frameWidth,
        imagem.altura || frameHeight,
        frameWidth,
        frameHeight,
      );

      const imagemX = frameX + (frameWidth - dimensoes.largura) / 2;
      const imagemY = frameY + (frameHeight - dimensoes.altura) / 2;

      try {
        doc.addImage(
          imagem.dataUrl,
          formatoImagemPdf(imagem.mime_type),
          imagemX,
          imagemY,
          dimensoes.largura,
          dimensoes.altura,
        );
      } catch (err) {
        console.error(`Falha ao adicionar imagem "${imagem.filename}" no PDF:`, err);
      }

      pageY += cardHeight + 8;
    });
  }
}

/**
 * Verifica se é necessário adicionar uma nova página antes de renderizar
 * um bloco de texto. Se o conteúdo estimado não couber, insere page break.
 */
function garantirEspacoVertical(doc: jsPDF, y: number, alturaEstimada: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemInferior = 20;
  if (y + alturaEstimada > pageHeight - margemInferior) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Renderiza os termos comerciais no padrão da imagem anexada ao orçamento.
 * Inclui prazo, faturamento, garantia, validade, taxa de diagnóstico e assinatura.
 */
function renderizarCondicoesComerciais(
  doc: jsPDF,
  y: number,
  tecnicoNome: string,
  emailTecnico: string
): number {
  const centerX = PAGE_WIDTH / 2;
  const espacoTitulo = 6;
  const espacoParagrafo = 5;
  const espacoSecao = 10;

  // ─── Prazo de Execução ────────────────────────────────────
  y = garantirEspacoVertical(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Prazo de Execução:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const prazoLinhas = doc.splitTextToSize(
    "Após a aprovação da proposta, o prazo estimado para a realização do serviço é de 02 a 04 dias úteis (Podendo aumentar caso seja necessário troca de peças).",
    CONTENT_WIDTH
  );
  prazoLinhas.forEach((linha: string) => {
    doc.text(linha, centerX, y, { align: "center" });
    y += espacoParagrafo;
  });
  y += 3;

  // ─── Faturamento ──────────────────────────────────────────
  y = garantirEspacoVertical(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Faturamento:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "O faturamento será realizado somente após a aprovação do orçamento.",
    centerX,
    y,
    { align: "center" }
  );
  y += espacoSecao;

  // ─── Garantia ─────────────────────────────────────────────
  y = garantirEspacoVertical(doc, y, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Garantia:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const garantiaItens = [
    "O equipamento terá garantia em bancada na nossa assistência técnica.",
    "Caso seja necessário o envio, os custos de frete (ida e volta) serão de responsabilidade do cliente.",
    "Os serviços aprovados terão garantia de 90 dias, contados a partir da disponibilidade do equipamento para retirada em nosso laboratório.",
  ];
  const bulletIndent = MARGIN_LEFT + 4;
  const textIndent = bulletIndent + 4;
  garantiaItens.forEach((item) => {
    const linhas = doc.splitTextToSize(item, CONTENT_WIDTH - (textIndent - MARGIN_LEFT) - 4);
    doc.text("•", bulletIndent, y);
    linhas.forEach((linha: string, idx: number) => {
      doc.text(linha, textIndent, y + idx * espacoParagrafo);
    });
    y += linhas.length * espacoParagrafo + 2;
  });
  y += 3;

  // ─── Validade do Orçamento ────────────────────────────────
  y = garantirEspacoVertical(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Validade do Orçamento:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("05 dias a partir da data de emissão.", centerX, y, { align: "center" });
  y += espacoSecao;

  // ─── Taxa de Diagnóstico Técnico ──────────────────────────
  y = garantirEspacoVertical(doc, y, 75);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Taxa de Diagnóstico Técnico (em caso de reprovação do orçamento)", centerX, y, {
    align: "center",
  });
  y += espacoTitulo + 2;

  // Caixa delimitadora
  const boxPadding = 5;
  const boxX = MARGIN_LEFT;
  const boxWidth = CONTENT_WIDTH;
  const introText =
    "Caso o orçamento não seja aprovado, será cobrada uma taxa de diagnóstico técnico conforme a categoria do equipamento:";
  const introLinhas = doc.splitTextToSize(introText, boxWidth - boxPadding * 2);

  const categorias = [
    "Impressoras de etiquetas de pequeno porte (TLP2844, GC420t, ZD Series, GT800, GK420, HC100, ZD510, Argox): R$ 130,00",
    "Impressoras de médio ou grande porte (ZT230, ZT410, ZT411, ZT420, ZT231, ZT500, ZT600, XI3, XI4, ZM400, S4M, Z4M) e leitores e coletores de qualquer marca: R$ 180,00",
    "Impressoras de cartão PVC (P330, ZXP3, ZXPI, ZC100, ZC300 e Datacard): R$ 200,00",
  ];

  let boxHeight = boxPadding * 2 + introLinhas.length * espacoParagrafo + 6;
  categorias.forEach((cat) => {
    const linhas = doc.splitTextToSize(cat, boxWidth - boxPadding * 2 - (textIndent - boxX) - 2);
    boxHeight += linhas.length * espacoParagrafo + 2;
  });
  boxHeight += 4;

  doc.setDrawColor(...CORES_PDF.borda);
  doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, "S");

  let boxY = y + boxPadding + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CORES_PDF.preto);
  introLinhas.forEach((linha: string) => {
    doc.text(linha, boxX + boxPadding, boxY);
    boxY += espacoParagrafo;
  });
  boxY += 3;

  categorias.forEach((cat) => {
    const linhas = doc.splitTextToSize(cat, boxWidth - boxPadding * 2 - (textIndent - boxX) - 2);
    doc.text("•", boxX + boxPadding + 4, boxY);
    linhas.forEach((linha: string, idx: number) => {
      doc.text(linha, textIndent, boxY + idx * espacoParagrafo);
    });
    boxY += linhas.length * espacoParagrafo + 2;
  });

  y += boxHeight + espacoSecao;

  // ─── Assinatura ───────────────────────────────────────────
  y = garantirEspacoVertical(doc, y, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text("Atenciosamente;", MARGIN_LEFT, y);
  y += espacoParagrafo + 2;

  doc.setFont("helvetica", "bold");
  doc.text(tecnicoNome || "—", MARGIN_LEFT, y);
  y += espacoParagrafo;

  doc.setFont("helvetica", "normal");
  const emailLabel = "E-mail: ";
  doc.text(emailLabel, MARGIN_LEFT, y);
  const emailOffset = doc.getTextWidth(emailLabel);
  doc.setTextColor(...CORES_PDF.preto);
  doc.text(emailTecnico || "—", MARGIN_LEFT + emailOffset, y);
  doc.setTextColor(...CORES_PDF.preto);
  y += espacoSecao;

  return y;
}

// ─── Serviço principal ──────────────────────────────────

export const PdfService = {
  /**
   * Gera PDF de orçamento profissional no padrão BMITAG.
   *
   * Layout do documento:
   * 1. Cabeçalho monocromático com empresa, tipo, OS e emissão
   * 2. Dados do cliente (Empresa, Responsável, Tipo de Orçamento)
   * 4. Planilha de valores (tabela com serviços e peças)
   * 5. Número de série do equipamento
   * 5. Condições comerciais atuais (faturamento, prazo, garantia, validade)
   * 7. Valor total
   *
   * @param equipamento - Dados do equipamento (marca, modelo, serial, cliente)
   * @param verificacao - Verificação técnica com serviços, peças e custos
   * @returns Documento em memória para prévia ou persistência explícita
   */
  async construirOrcamento(
    equipamento: Equipamento,
    verificacao: Verificacao,
    nomeArquivo?: string
  ): Promise<PdfArtifact> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15; // posição vertical atual

      // ═══════════════════════════════════════════════════
      // 1. CABEÇALHO DA EMPRESA (com logo à esquerda)
      // ═══════════════════════════════════════════════════

      const numeroOS = gerarNumeroOS(equipamento.id);
      const dataGeracao = new Date();
      y = aplicarCabecalhoPadrao(doc, y, {
        titulo: "ORÇAMENTO TÉCNICO",
        numeroOS,
        rotuloData: "Emissão",
        dataFormatada: formatarDataExtenso(dataGeracao),
      });

      // ═══════════════════════════════════════════════════
      // 3. DADOS DO CLIENTE
      // ═══════════════════════════════════════════════════

      const tecnicoResponsavelOrcamento =
        verificacao.tecnico_nome?.trim() ||
        extrairTecnicoInicialDeObservacoes(equipamento.observacoes) ||
        "—";
      const emailTecnicoOrcamento = emailTecnicoPorNome(tecnicoResponsavelOrcamento);
      const responsavelCabecalho = emailTecnicoOrcamento
        ? `${tecnicoResponsavelOrcamento} (${emailTecnicoOrcamento})`
        : tecnicoResponsavelOrcamento;

      autoTable(doc, {
        ...opcoesTabelaMonocromatica(),
        startY: y,
        headStyles: {
          ...opcoesTabelaMonocromatica().headStyles,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 55 },
          2: { cellWidth: 60 },
        },
        head: [["EMPRESA", "RESPONSÁVEL", "TIPO DE ORÇAMENTO"]],
        body: [[
          equipamento.cliente_nome || "—",
          responsavelCabecalho,
          "Serviços",
        ]],
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

      // ═══════════════════════════════════════════════════
      // 4. PLANILHA DE VALORES (somente quando houver valores)
      // ═══════════════════════════════════════════════════

      // Parsear serviços e peças da verificação
      const servicos: ServicoNecessario[] = verificacao.servicos_necessarios
        ? JSON.parse(verificacao.servicos_necessarios)
        : [];
      const pecas: PecaNecessaria[] = verificacao.pecas_necessarias
        ? JSON.parse(verificacao.pecas_necessarias)
        : [];

      // Montar linhas da tabela
      const linhasTabela: string[][] = [];

      // Serviços
      servicos.forEach((s) => {
        linhasTabela.push([
          s.descricao,
          `${equipamento.marca} ${equipamento.modelo}`,
          "01",
          formatarMoeda(s.valor),
          formatarMoeda(s.valor),
        ]);
      });

      // Peças
      pecas.forEach((p) => {
        linhasTabela.push([
          p.nome,
          `${equipamento.marca} ${equipamento.modelo}`,
          String(p.quantidade).padStart(2, "0"),
          formatarMoeda(p.valorUnitario),
          formatarMoeda(p.valorTotal),
        ]);
      });

      // Calcular totais
      const totalServicos = servicos.reduce((acc, s) => acc + s.valor, 0);
      const totalPecas = pecas.reduce((acc, p) => acc + p.valorTotal, 0);
      const custoTotal = verificacao.custo_total ?? (totalServicos + totalPecas);
      const exibirBlocosFinanceiros = custoTotal > 0 || totalServicos > 0 || totalPecas > 0;

      if (exibirBlocosFinanceiros) {
        // Se não houver itens detalhados mas houver custo agregado, adicionar linha única
        if (linhasTabela.length === 0) {
          linhasTabela.push(["Serviços técnicos", `${equipamento.marca} ${equipamento.modelo}`, "01", formatarMoeda(custoTotal), formatarMoeda(custoTotal)]);
        }

        // Título da seção sem faixa preenchida.
        y = renderizarTituloSecao(doc, y, "PLANILHA DE VALORES");

        // Tabela de valores
        autoTable(doc, {
          ...opcoesTabelaMonocromatica(),
          startY: y,
          styles: {
            ...opcoesTabelaMonocromatica().styles,
            halign: "center",
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 50 },  // Descrição
            1: { halign: "center", cellWidth: 28 }, // Modelo
            2: { halign: "center", cellWidth: 14 }, // Qtd
            3: { halign: "right", cellWidth: 35 },  // Valor Unitário
            4: { halign: "right", cellWidth: 35 },  // Valor Total
          },
          head: [["Descrição", "Modelo", "Qtd", "Valor Unitário", "Valor Total"]],
          body: linhasTabela,
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

        // Linha de total
        autoTable(doc, {
          ...opcoesTabelaMonocromatica(),
          startY: y,
          styles: {
            ...opcoesTabelaMonocromatica().styles,
            fontSize: 10,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { halign: "right", cellWidth: CONTENT_WIDTH * 0.6 },
            1: { halign: "right", cellWidth: CONTENT_WIDTH * 0.4 },
          },
          body: [["VALOR TOTAL:", formatarMoeda(custoTotal)]],
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ═══════════════════════════════════════════════════
      // 5. NÚMERO DE SÉRIE
      // ═══════════════════════════════════════════════════

      doc.setTextColor(...CORES_PDF.textoSecundario);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Número de Série do Equipamento: ", MARGIN_LEFT, y);
      doc.setFont("helvetica", "normal");
      doc.text(equipamento.serial_number, MARGIN_LEFT + 55, y);
      y += 8;

      // ═══════════════════════════════════════════════════
      // 6. CONDIÇÕES COMERCIAIS
      // ═══════════════════════════════════════════════════
      if (exibirBlocosFinanceiros) {
        y = renderizarCondicoesComerciais(
          doc,
          y,
          tecnicoResponsavelOrcamento,
          emailTecnicoOrcamento
        );
      }

      // ═══════════════════════════════════════════════════
      // 7. DIAGNÓSTICO (extra)
      // ═══════════════════════════════════════════════════

      if (verificacao.diagnostico) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...CORES_PDF.textoSecundario);
        y = garantirEspacoVertical(doc, y, 9);
        doc.text("Diagnóstico:", MARGIN_LEFT, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        y = renderizarParagrafo(doc, verificacao.diagnostico, MARGIN_LEFT, y, CONTENT_WIDTH);
      }

      const imagensEquipamento = equipamento.id
        ? await db.listarImagensEquipamento(equipamento.id)
        : [];
      const imagensEntrada = imagensEquipamento.filter((imagem) => imagem.categoria === "ENTRADA");
      const imagensSaida = imagensEquipamento.filter((imagem) => imagem.categoria === "SAIDA");
      const imagensVerificacao = imagensEquipamento.filter((imagem) => imagem.categoria === "VERIFICACAO");
      await adicionarRegistroFotografico(
        doc,
        imagensEntrada,
        "Registro Fotográfico de Entrada",
        "Imagens anexadas para documentar o estado do equipamento no recebimento.",
      );
      await adicionarRegistroFotografico(
        doc,
        imagensVerificacao,
        "Registro Fotográfico de Verificação",
        "Imagens anexadas durante a verificação técnica do equipamento.",
      );
      await adicionarRegistroFotografico(
        doc,
        imagensSaida,
        "Registro Fotográfico de Saída",
        "Imagens anexadas para comparar o estado final do equipamento após o serviço.",
      );

      // ═══════════════════════════════════════════════════
      // 8. RODAPÉ
      // ═══════════════════════════════════════════════════

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        aplicarRodape(doc, numeroOS, page, totalPages, dataGeracao);
      }

      return {
        filename: nomeArquivo || `Orcamento_${equipamento.id || "novo"}.pdf`,
        bytes: new Uint8Array(doc.output("arraybuffer")),
        mimeType: "application/pdf",
      };
    } catch (error) {
      console.error("[PdfService] Erro ao gerar orçamento PDF:", error);
      throw error;
    }
  },

  /** Mantém o fluxo legado para anexos e automações que precisam de um arquivo persistido. */
  async gerarOrcamento(
    equipamento: Equipamento,
    verificacao: Verificacao,
    nomeArquivo?: string
  ): Promise<string | null> {
    const artifact = await PdfService.construirOrcamento(equipamento, verificacao, nomeArquivo);
    return PdfService.salvarOrcamento(artifact, equipamento, nomeArquivo);
  },

  async construirOrcamentoAjustado(
    equipamento: Equipamento,
    verificacao: Verificacao,
    nomeArquivo?: string
  ): Promise<PdfArtifact | null> {
    if (!verificacao.adjusted_at) {
      return PdfService.construirOrcamento(equipamento, verificacao, nomeArquivo);
    }

    const servicos: ServicoNecessario[] = verificacao.servicos_necessarios
      ? JSON.parse(verificacao.servicos_necessarios)
      : [];
    const pecas: PecaNecessaria[] = verificacao.pecas_necessarias
      ? JSON.parse(verificacao.pecas_necessarias)
      : [];

    const totalServicos = servicos.reduce((acc, s) => acc + s.valor, 0);
    const totalPecas = pecas.reduce((acc, p) => acc + p.valorTotal, 0);
    const custoTotal = verificacao.custo_total ?? (totalServicos + totalPecas);

    if (totalServicos + totalPecas !== custoTotal) {
      alert(
        `Divergência detectada: soma dos itens (${formatarMoeda(totalServicos + totalPecas)}) difere do custo total (${formatarMoeda(custoTotal)}).`
      );
      return null;
    }

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15;

      const numeroOS = gerarNumeroOS(equipamento.id);
      const dataGeracao = new Date();
      y = aplicarCabecalhoPadrao(doc, y, {
        titulo: "ORÇAMENTO AJUSTADO",
        numeroOS,
        rotuloData: "Emissão",
        dataFormatada: formatarDataExtenso(dataGeracao),
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...CORES_PDF.preto);
      doc.text("VERSÃO AJUSTADA", PAGE_WIDTH / 2, y, { align: "center" });
      y += 7;

      const tecnicoResponsavelOrcamento =
        verificacao.tecnico_nome?.trim() ||
        extrairTecnicoInicialDeObservacoes(equipamento.observacoes) ||
        "—";
      const emailTecnicoOrcamento = emailTecnicoPorNome(tecnicoResponsavelOrcamento);
      const responsavelCabecalho = emailTecnicoOrcamento
        ? `${tecnicoResponsavelOrcamento} (${emailTecnicoOrcamento})`
        : tecnicoResponsavelOrcamento;

      autoTable(doc, {
        ...opcoesTabelaMonocromatica(),
        startY: y,
        headStyles: {
          ...opcoesTabelaMonocromatica().headStyles,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 55 },
          2: { cellWidth: 60 },
        },
        head: [["EMPRESA", "RESPONSÁVEL", "TIPO DE ORÇAMENTO"]],
        body: [[
          equipamento.cliente_nome || "—",
          responsavelCabecalho,
          "Serviços",
        ]],
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

      const linhasTabela: string[][] = [];

      servicos.forEach((s) => {
        linhasTabela.push([
          s.descricao,
          `${equipamento.marca} ${equipamento.modelo}`,
          "01",
          formatarMoeda(s.valor),
          formatarMoeda(s.valor),
        ]);
      });

      pecas.forEach((p) => {
        linhasTabela.push([
          p.nome,
          `${equipamento.marca} ${equipamento.modelo}`,
          String(p.quantidade).padStart(2, "0"),
          formatarMoeda(p.valorUnitario),
          formatarMoeda(p.valorTotal),
        ]);
      });

      const exibirBlocosFinanceiros = custoTotal > 0 || totalServicos > 0 || totalPecas > 0;

      if (exibirBlocosFinanceiros) {
        if (linhasTabela.length === 0) {
          linhasTabela.push(["Serviços técnicos", `${equipamento.marca} ${equipamento.modelo}`, "01", formatarMoeda(custoTotal), formatarMoeda(custoTotal)]);
        }

        y = renderizarTituloSecao(doc, y, "PLANILHA DE VALORES");

        autoTable(doc, {
          ...opcoesTabelaMonocromatica(),
          startY: y,
          styles: {
            ...opcoesTabelaMonocromatica().styles,
            halign: "center",
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 50 },
            1: { halign: "center", cellWidth: 28 },
            2: { halign: "center", cellWidth: 14 },
            3: { halign: "right", cellWidth: 35 },
            4: { halign: "right", cellWidth: 35 },
          },
          head: [["Descrição", "Modelo", "Qtd", "Valor Unitário", "Valor Total"]],
          body: linhasTabela,
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

        autoTable(doc, {
          ...opcoesTabelaMonocromatica(),
          startY: y,
          styles: {
            ...opcoesTabelaMonocromatica().styles,
            fontSize: 10,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { halign: "right", cellWidth: CONTENT_WIDTH * 0.6 },
            1: { halign: "right", cellWidth: CONTENT_WIDTH * 0.4 },
          },
          body: [["VALOR TOTAL:", formatarMoeda(custoTotal)]],
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      doc.setTextColor(...CORES_PDF.textoSecundario);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Número de Série do Equipamento: ", MARGIN_LEFT, y);
      doc.setFont("helvetica", "normal");
      doc.text(equipamento.serial_number, MARGIN_LEFT + 55, y);
      y += 8;

      if (exibirBlocosFinanceiros) {
        y = renderizarCondicoesComerciais(
          doc,
          y,
          tecnicoResponsavelOrcamento,
          emailTecnicoOrcamento
        );
      }

      if (verificacao.diagnostico) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...CORES_PDF.textoSecundario);
        y = garantirEspacoVertical(doc, y, 9);
        doc.text("Diagnóstico:", MARGIN_LEFT, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        y = renderizarParagrafo(doc, verificacao.diagnostico, MARGIN_LEFT, y, CONTENT_WIDTH);
      }

      const imagensEquipamento = equipamento.id
        ? await db.listarImagensEquipamento(equipamento.id)
        : [];
      const imagensEntrada = imagensEquipamento.filter((imagem) => imagem.categoria === "ENTRADA");
      const imagensSaida = imagensEquipamento.filter((imagem) => imagem.categoria === "SAIDA");
      const imagensVerificacao = imagensEquipamento.filter((imagem) => imagem.categoria === "VERIFICACAO");
      await adicionarRegistroFotografico(
        doc,
        imagensEntrada,
        "Registro Fotográfico de Entrada",
        "Imagens anexadas para documentar o estado do equipamento no recebimento.",
      );
      await adicionarRegistroFotografico(
        doc,
        imagensVerificacao,
        "Registro Fotográfico de Verificação",
        "Imagens anexadas durante a verificação técnica do equipamento.",
      );
      await adicionarRegistroFotografico(
        doc,
        imagensSaida,
        "Registro Fotográfico de Saída",
        "Imagens anexadas para comparar o estado final do equipamento após o serviço.",
      );

      const dataAjuste = converterDataDocumento(verificacao.adjusted_at);
      const dia = String(dataAjuste.getDate()).padStart(2, "0");
      const mes = String(dataAjuste.getMonth() + 1).padStart(2, "0");
      const ano = dataAjuste.getFullYear();
      const hora = String(dataAjuste.getHours()).padStart(2, "0");
      const minuto = String(dataAjuste.getMinutes()).padStart(2, "0");
      const dataAjusteFormatada = `${dia}/${mes}/${ano} ${hora}:${minuto}`;

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        aplicarRodape(
          doc,
          numeroOS,
          page,
          totalPages,
          dataGeracao,
          `Versão Ajustada em ${dataAjusteFormatada}`,
        );
      }

      return {
        filename: nomeArquivo || `OrcamentoAjustado_${equipamento.id || "novo"}.pdf`,
        bytes: new Uint8Array(doc.output("arraybuffer")),
        mimeType: "application/pdf",
      };
    } catch (error) {
      console.error("[PdfService] Erro ao gerar orçamento ajustado PDF:", error);
      throw error;
    }
  },

  async gerarOrcamentoAjustado(
    equipamento: Equipamento,
    verificacao: Verificacao,
    nomeArquivo?: string
  ): Promise<string | null> {
    const artifact = await PdfService.construirOrcamentoAjustado(equipamento, verificacao, nomeArquivo);
    if (!artifact) return null;
    return PdfService.salvarOrcamento(artifact, equipamento, nomeArquivo);
  },

  /**
   * Gera PDF de ordem de serviço para recebimento técnico.
   * Lista os campos preenchidos na seção "Dados do Equipamento".
   */
  async construirOrdemServico(equipamento: Equipamento, nomeArquivo?: string): Promise<PdfArtifact> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15;

      const numeroOS = gerarNumeroOS(equipamento.id);
      const dataRegistro = converterDataDocumento(equipamento.data_entrada);
      const dataGeracao = new Date();
      y = aplicarCabecalhoPadrao(doc, y, {
        titulo: "ORDEM DE SERVIÇO",
        numeroOS,
        rotuloData: "Entrada",
        dataFormatada: formatarDataExtenso(dataRegistro),
      });

      let verificacao = null;
      if (equipamento.id) {
        try {
          verificacao = await db.buscarVerificacao(equipamento.id);
        } catch (error) {
          console.warn("[PdfService] Verificação não encontrada para a OS, seguindo sem dados de técnico.", error);
        }
      }
      const tecnicoInicial = extrairTecnicoInicialDeObservacoes(equipamento.observacoes);
      const tecnicoResponsavel = verificacao?.tecnico_nome?.trim() || tecnicoInicial || "";
      const emailTecnico = emailTecnicoPorNome(tecnicoResponsavel);
      const observacoesDocumento = limparObservacoesParaDocumento(equipamento.observacoes);

      const statusAtual = STATUS_LABELS[equipamento.status as keyof typeof STATUS_LABELS] || equipamento.status;
      const defeitoInformado = equipamento.defeito_relatado || verificacao?.problema_relatado || "—";
      const diagnosticoTecnico = verificacao?.diagnostico || "—";
      const especificacoes = [
        equipamento.tecnologia ? `Tecnologia: ${equipamento.tecnologia}` : "",
        equipamento.conectividade ? `Conectividade: ${equipamento.conectividade}` : "",
        typeof equipamento.paginas_impressas === "number" && Number.isFinite(equipamento.paginas_impressas)
          ? `Páginas impressas: ${equipamento.paginas_impressas}`
          : "",
      ].filter(Boolean).join("; ") || "—";

      // Corpo em formato de ficha: os rótulos permanecem visíveis, mas todos
      // os preenchimentos são brancos para manter a impressão econômica.
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["STATUS ATUAL", "TÉCNICO RESPONSÁVEL"],
        [[statusAtual, tecnicoResponsavel || "—"]],
        [90, 90],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["CLIENTE"],
        [[equipamento.cliente_nome || equipamento.proprietario || "—"]],
        [CONTENT_WIDTH],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["TELEFONE", "E-MAIL"],
        [[equipamento.cliente_telefone || "—", equipamento.cliente_email || "—"]],
        [90, 90],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["EQUIPAMENTO", "TIPO"],
        [[`${equipamento.marca || "—"} ${equipamento.modelo || ""}`.trim(), equipamento.tipo || "—"]],
        [110, 70],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["Nº DE SÉRIE", "PATRIMÔNIO", "E-MAIL DO TÉCNICO"],
        [[equipamento.serial_number || "—", equipamento.patrimonio || "—", emailTecnico || "—"]],
        [65, 45, 70],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["ESPECIFICAÇÕES"],
        [[especificacoes]],
        [CONTENT_WIDTH],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["DEFEITO INFORMADO"],
        [[defeitoInformado]],
        [CONTENT_WIDTH],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["LAUDO TÉCNICO"],
        [[diagnosticoTecnico]],
        [CONTENT_WIDTH],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["ACESSÓRIOS", "OUTROS ACESSÓRIOS"],
        [[equipamento.acessorios || "—", equipamento.acessorios_outros || "—"]],
        [90, 90],
      );
      y = renderizarTabelaFormulario(
        doc,
        y,
        ["OBSERVAÇÕES"],
        [[observacoesDocumento || "—"]],
        [CONTENT_WIDTH],
      );

      const imagensEquipamento = equipamento.id
        ? await db.listarImagensEquipamento(equipamento.id)
        : [];
      const imagensEntrada = imagensEquipamento.filter((imagem) => imagem.categoria === "ENTRADA");
      const imagensVerificacao = imagensEquipamento.filter((imagem) => imagem.categoria === "VERIFICACAO");
      await adicionarRegistroFotografico(
        doc,
        imagensEntrada,
        "Registro Fotográfico de Entrada",
        "Imagens anexadas para documentar o estado do equipamento no recebimento.",
      );
      await adicionarRegistroFotografico(
        doc,
        imagensVerificacao,
        "Registro Fotográfico de Verificação",
        "Imagens anexadas durante a verificação técnica do equipamento.",
      );

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        aplicarRodape(doc, numeroOS, page, totalPages, dataGeracao);
      }

      return {
        filename: nomeArquivo || `OrdemServico_${equipamento.id || "novo"}.pdf`,
        bytes: new Uint8Array(doc.output("arraybuffer")),
        mimeType: "application/pdf",
      };
    } catch (error) {
      console.error("[PdfService] Erro ao construir ordem de serviço PDF:", error);
      throw error;
    }
  },

  /** Mantém o comportamento existente: constrói em memória e persiste no backend. */
  async gerarOrdemServico(equipamento: Equipamento, nomeArquivo?: string): Promise<string | null> {
    const artifact = await PdfService.construirOrdemServico(equipamento, nomeArquivo);
    return PdfService.salvarOrdemServico(artifact, equipamento, nomeArquivo);
  },

  async salvarOrcamento(artifact: PdfArtifact, equipamento: Equipamento, nomeArquivo?: string): Promise<string> {
    const caminho = await invoke<string>("salvar_orcamento_pdf", {
      bytes: Array.from(artifact.bytes),
      empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Cliente",
      nomeArquivo: nomeArquivo || null,
    });
    console.info(`[PdfService] Orçamento PDF salvo: ${caminho}`);
    return caminho;
  },

  async salvarOrdemServico(artifact: PdfArtifact, equipamento: Equipamento, nomeArquivo?: string): Promise<string> {
    const caminho = await invoke<string>("salvar_ordem_servico_pdf", {
      bytes: Array.from(artifact.bytes),
      empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Empresa",
      nomeArquivo: nomeArquivo || null,
    });
    console.info(`[PdfService] Ordem de serviço PDF gerada: ${caminho}`);
    return caminho;
  },

  /**
   * Gera PDF com histórico/status completo do equipamento.
   */
  async construirRelatorioStatus(equipamento: Equipamento): Promise<PdfArtifact> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15;

      const numeroOS = gerarNumeroOS(equipamento.id);
      const dataRegistro = converterDataDocumento(equipamento.data_entrada);
      const dataGeracao = new Date();
      y = aplicarCabecalhoPadrao(doc, y, {
        titulo: "RELATÓRIO DE STATUS",
        numeroOS,
        rotuloData: "Entrada",
        dataFormatada: formatarDataExtenso(dataRegistro),
      });

      autoTable(doc, {
        ...opcoesTabelaMonocromatica(),
        startY: y,
        body: [
          ["Equipamento", `${equipamento.marca || "—"} ${equipamento.modelo || ""}`.trim()],
          ["Nº de Série", equipamento.serial_number || "—"],
          ["Cliente", equipamento.cliente_nome || "—"],
          ["Status atual", STATUS_LABELS[equipamento.status as keyof typeof STATUS_LABELS] || equipamento.status],
        ],
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

      const eventos: { label: string; data: string; status: string }[] = [];
      if (equipamento.data_entrada) eventos.push({ label: "Recebido", data: equipamento.data_entrada, status: "RECEBIDO" });
      if (equipamento.data_verificacao) eventos.push({ label: "Verificado", data: equipamento.data_verificacao, status: "VERIFICADO" });
      if (equipamento.data_aprovacao) eventos.push({ label: "Aprovado", data: equipamento.data_aprovacao, status: "APROVADO" });
      if (equipamento.data_reprovacao) eventos.push({ label: "Reprovado", data: equipamento.data_reprovacao, status: "REPROVADO" });
      if (equipamento.data_pronto) eventos.push({ label: "Pronto", data: equipamento.data_pronto, status: "PRONTO" });
      if (equipamento.data_saida) eventos.push({ label: "Entregue", data: equipamento.data_saida, status: "ENTREGUE" });
      eventos.sort((a, b) => converterDataDocumento(a.data).getTime() - converterDataDocumento(b.data).getTime());

      if (eventos.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(...CORES_PDF.textoSecundario);
        doc.text("Não há eventos de histórico registrados para este equipamento.", MARGIN_LEFT, y);
      } else {
        autoTable(doc, {
          ...opcoesTabelaMonocromatica(),
          startY: y,
          head: [["Etapa", "Status", "Data"]],
          body: eventos.map((evento) => [
            evento.label,
            STATUS_LABELS[evento.status as keyof typeof STATUS_LABELS] || evento.status,
            converterDataDocumento(evento.data).toLocaleDateString("pt-BR"),
          ]),
        });
      }

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        aplicarRodape(doc, numeroOS, page, totalPages, dataGeracao);
      }

      return {
        filename: `RelatorioStatus_${equipamento.id || "novo"}.pdf`,
        bytes: new Uint8Array(doc.output("arraybuffer")),
        mimeType: "application/pdf",
      };
    } catch (error) {
      console.error("[PdfService] Erro ao gerar relatório de status PDF:", error);
      throw error;
    }
  },

  async gerarRelatorioStatus(equipamento: Equipamento): Promise<string | null> {
    const artifact = await PdfService.construirRelatorioStatus(equipamento);
    return PdfService.salvarRelatorioStatus(artifact, equipamento);
  },

  async salvarRelatorioStatus(artifact: PdfArtifact, equipamento: Equipamento): Promise<string> {
    const caminho = await invoke<string>("salvar_relatorio_status_pdf", {
      bytes: Array.from(artifact.bytes),
      empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Cliente",
    });
    console.info(`[PdfService] Relatório de status PDF salvo: ${caminho}`);
    return caminho;
  },

  /** Verifica se o serviço de geração PDF está disponível */
  isDisponivel(): boolean {
    return true;
  },
};
