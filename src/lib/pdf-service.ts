/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/pdf-service.ts — Serviço de Geração de Orçamento PDF   ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Gera documentos PDF de orçamento preenchidos com dados     ║
 * ║  reais do equipamento, verificação e cliente.                ║
 * ║  Layout replica o modelo "Orçamento Editável TAG" da BMITAG.║
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
import { bytesParaDataUrl } from "./equipamento-imagem-utils";
import { LOGO_BMITAG_BASE64 } from "./logo-base64";

// ─── Constantes de layout ───────────────────────────────

/** Largura útil da página A4 em mm (210 - margens) */
const PAGE_WIDTH = 210;
const MARGIN_LEFT = 15;
const MARGIN_RIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

/** Cores da identidade visual BMITAG (tuplas RGB) */
const COR_PRETA: [number, number, number] = [0, 0, 0];
const COR_CINZA_ESCURO: [number, number, number] = [51, 51, 51];
const COR_CINZA_CLARO: [number, number, number] = [200, 200, 200];
const COR_FUNDO_HEADER: [number, number, number] = [30, 30, 30];
const COR_TEXTO_BRANCO: [number, number, number] = [255, 255, 255];
const COR_CINZA_MEDIO: [number, number, number] = [80, 80, 80];
const COR_FUNDO_TOTAL: [number, number, number] = [240, 240, 240];
const CABECALHO_EMPRESA = {
  nome: "BMITAG TECNOLOGIA QRCODE E RFID",
  descricao: "Vendas e Manutenções de Equipamentos ZEBRA",
  telefone: "Tel: +55 71 98223-5050 / +55 71 98165-0801",
  contato: "E-mail: bmitag@bmitag.com.br | bmitag.com.br",
  cnpj: "CNPJ: 57.522.734/0001-58",
};
const LOGO_TOPO_URL = "/logo-bmitag.png";
const ICONE_RODAPE_URL = "/src-tauri/icons/icon.png";
let logoTopoCache: Promise<string | null> | null = null;
let iconeRodapeCache: Promise<string | null> | null = null;

// ─── Utilitários de formatação ──────────────────────────

/**
 * Converte SVG base64 para PNG base64 usando canvas
 */
async function svgToPng(svgBase64: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const pngBase64 = canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
      resolve(pngBase64);
    };
    img.onerror = () => reject(new Error("Failed to load SVG"));
    img.src = `data:image/svg+xml;base64,${svgBase64}`;
  });
}

function urlImagemParaDataUrl(url: string): Promise<string> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Falha ao carregar imagem: ${url}`);
      }
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error(`Falha ao converter imagem para data URL: ${url}`));
          reader.readAsDataURL(blob);
        })
    );
}

async function obterLogoTopoDataUrl(): Promise<string | null> {
  if (!logoTopoCache) {
    logoTopoCache = (async () => {
      // Primary: SVG→PNG (embedded, always available)
      try {
        const logoPngBase64 = await svgToPng(LOGO_BMITAG_BASE64, 200, 200);
        return `data:image/png;base64,${logoPngBase64}`;
      } catch {
        // Fallback: fetch PNG file (works on Vite dev, may fail on Tauri EXE)
        try {
          return await urlImagemParaDataUrl(LOGO_TOPO_URL);
        } catch {
          return null;
        }
      }
    })();
  }
  return logoTopoCache;
}

async function obterIconeRodapeDataUrl(): Promise<string | null> {
  if (!iconeRodapeCache) {
    iconeRodapeCache = (async () => {
      try {
        return await urlImagemParaDataUrl(ICONE_RODAPE_URL);
      } catch {
        return null;
      }
    })();
  }
  return iconeRodapeCache;
}

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
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = MESES_PT[data.getMonth()];
  const ano = data.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
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
  if (tecnicoNome === "Ivan") return "ivan@bmicode.com";
  if (tecnicoNome === "Isaias") return "isaias@bmicode.com";
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
    .trim();
}

async function aplicarCabecalhoPadrao(doc: jsPDF, y: number, subtitulo: string) {
  const alturaHeader = 35;
  doc.setFillColor(...COR_FUNDO_HEADER);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, alturaHeader, "F");

  const logoSize = 25;
  const logoX = MARGIN_LEFT + 5;
  const logoY = y + (alturaHeader - logoSize) / 2;
  const logoTopoDataUrl = await obterLogoTopoDataUrl();
  if (logoTopoDataUrl) {
    try {
      doc.addImage(logoTopoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
    } catch (err) {
      console.error("Falha ao adicionar logo no cabeçalho PDF:", err);
    }
  }

  const textoInicioX = MARGIN_LEFT + logoSize + 10;
  const textoLargura = CONTENT_WIDTH - logoSize - 15;
  const centroTexto = textoInicioX + textoLargura / 2;
  doc.setTextColor(...COR_TEXTO_BRANCO);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(CABECALHO_EMPRESA.nome, centroTexto, y + 8, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(CABECALHO_EMPRESA.descricao, centroTexto, y + 13, { align: "center" });
  doc.text(CABECALHO_EMPRESA.telefone, centroTexto, y + 18, { align: "center" });
  doc.text(CABECALHO_EMPRESA.contato, centroTexto, y + 23, { align: "center" });
  doc.text(CABECALHO_EMPRESA.cnpj, centroTexto, y + 28, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(subtitulo, centroTexto, y + 33, { align: "center" });

  return y + alturaHeader + 7;
}

async function aplicarRodape(doc: jsPDF, numeroOS: string) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const iconeRodapeDataUrl = await obterIconeRodapeDataUrl();
  if (iconeRodapeDataUrl) {
    const iconSize = 6;
    const iconY = pageHeight - 13;
    try {
      doc.addImage(iconeRodapeDataUrl, "PNG", MARGIN_LEFT, iconY, iconSize, iconSize);
    } catch (err) {
      console.error("Falha ao adicionar ícone no rodapé PDF:", err);
    }
  }
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `AutoOS — Gerado em ${new Date().toLocaleString("pt-BR")} — ${numeroOS}`,
    PAGE_WIDTH / 2,
    pageHeight - 10,
    { align: "center" }
  );
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

  const imagensPreparadas = await Promise.all(
    imagens.map(async (imagem) => ({
      ...imagem,
      dataUrl: await bytesParaDataUrl(imagem.bytes, imagem.mime_type),
    }))
  );

  for (let inicio = 0; inicio < imagensPreparadas.length; inicio += 2) {
    const lote = imagensPreparadas.slice(inicio, inicio + 2);
    doc.addPage();

    let pageY = 18;
    doc.setTextColor(...COR_PRETA);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(titulo, PAGE_WIDTH / 2, pageY, { align: "center" });
    pageY += 7;

    doc.setTextColor(...COR_CINZA_MEDIO);
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

      doc.setDrawColor(...COR_CINZA_CLARO);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COR_PRETA);
      doc.text(`Imagem ${indiceImagem}`, cardX + 4, cardY + 7);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...COR_CINZA_MEDIO);
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

// ─── Serviço principal ──────────────────────────────────

export const PdfService = {
  /**
   * Gera PDF de orçamento profissional no padrão BMITAG.
   *
   * Layout do documento:
   * 1. Cabeçalho com dados da empresa (BMITAG, telefone, email, CNPJ)
   * 2. Número da OS e data
   * 3. Dados do cliente (Empresa, Responsável, Tipo de Orçamento)
   * 4. Planilha de valores (tabela com serviços e peças)
   * 5. Número de série do equipamento
   * 6. Condições (pagamento, prazo, garantia, validade)
   * 7. Valor total
   *
   * @param equipamento - Dados do equipamento (marca, modelo, serial, cliente)
   * @param verificacao - Verificação técnica com serviços, peças e custos
   * @returns Caminho do arquivo PDF salvo, ou null em caso de erro
   */
  async gerarOrcamento(
    equipamento: Equipamento,
    verificacao: Verificacao,
    nomeArquivo?: string
  ): Promise<string | null> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15; // posição vertical atual

      // ═══════════════════════════════════════════════════
      // 1. CABEÇALHO DA EMPRESA (com logo à esquerda)
      // ═══════════════════════════════════════════════════

      y = await aplicarCabecalhoPadrao(doc, y, "ORÇAMENTO TÉCNICO");

      // ═══════════════════════════════════════════════════
      // 2. NÚMERO DA OS E DATA
      // ═══════════════════════════════════════════════════

      doc.setTextColor(...COR_PRETA);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const numeroOS = gerarNumeroOS(equipamento.id);
      doc.text(`Nº ${numeroOS}`, PAGE_WIDTH / 2, y, { align: "center" });
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const dataExtenso = formatarDataExtenso(new Date());
      doc.text(`Salvador, ${dataExtenso}`, PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
      y += 10;

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
        startY: y,
        margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 3,
          lineColor: COR_CINZA_CLARO,
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: COR_FUNDO_HEADER,
          textColor: COR_TEXTO_BRANCO,
          fontStyle: "bold",
          halign: "center",
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

        // Título da seção
        doc.setFillColor(...COR_FUNDO_HEADER);
        doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 7, "F");
        doc.setTextColor(...COR_TEXTO_BRANCO);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("PLANILHA DE VALORES", PAGE_WIDTH / 2, y + 5, { align: "center" });
        y += 7;

        // Tabela de valores
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
          theme: "grid",
          styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: COR_CINZA_CLARO,
            lineWidth: 0.3,
            halign: "center",
          },
          headStyles: {
            fillColor: COR_CINZA_MEDIO,
            textColor: COR_TEXTO_BRANCO,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 55 },  // Descrição
            1: { halign: "center", cellWidth: 35 }, // Modelo
            2: { halign: "center", cellWidth: 15 }, // Qtd
            3: { halign: "right", cellWidth: 35 },  // Valor Unitário
            4: { halign: "right", cellWidth: 35 },  // Valor Total
          },
          head: [["Descrição", "Modelo", "Qtd", "Valor Unitário", "Valor Total"]],
          body: linhasTabela,
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

        // Linha de total
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
          theme: "grid",
          styles: {
            fontSize: 10,
            cellPadding: 3,
            lineColor: COR_CINZA_CLARO,
            lineWidth: 0.3,
            fontStyle: "bold",
          },
          columnStyles: {
            0: { halign: "right", cellWidth: CONTENT_WIDTH * 0.6 },
            1: { halign: "right", cellWidth: CONTENT_WIDTH * 0.4, fillColor: COR_FUNDO_TOTAL },
          },
          body: [["VALOR TOTAL:", formatarMoeda(custoTotal)]],
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ═══════════════════════════════════════════════════
      // 5. NÚMERO DE SÉRIE
      // ═══════════════════════════════════════════════════

      doc.setTextColor(...COR_CINZA_ESCURO);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Número de Série do Equipamento: ", MARGIN_LEFT, y);
      doc.setFont("helvetica", "normal");
      doc.text(equipamento.serial_number, MARGIN_LEFT + 55, y);
      y += 8;

      // ═══════════════════════════════════════════════════
      // 6. CONDIÇÕES COMERCIAIS (somente com bloco financeiro)
      // ═══════════════════════════════════════════════════
      if (exibirBlocosFinanceiros) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_PRETA);

        const condicoes = [
          "• Forma de Pagamento: 5% desconto Pix",
          "• Obs.: A opção de boleto bancário está sujeita à aprovação do sistema.",
        ];

        condicoes.forEach((linha) => {
          doc.text(linha, MARGIN_LEFT, y);
          y += 5;
        });

        y += 3;

        // Prazos e garantias
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Prazo de Execução:", MARGIN_LEFT, y);
        doc.setFont("helvetica", "normal");
        doc.text(
          verificacao.tempo_estimado
            ? `${verificacao.tempo_estimado} horas (após aprovação)`
            : "10 dias úteis (após aprovação)",
          MARGIN_LEFT + 40, y
        );
        y += 6;

        doc.setFont("helvetica", "bold");
        doc.text("Garantia:", MARGIN_LEFT, y);
        doc.setFont("helvetica", "normal");
        doc.text("90 dias para serviços executados", MARGIN_LEFT + 40, y);
        y += 6;

        doc.setFont("helvetica", "bold");
        doc.text("Validade:", MARGIN_LEFT, y);
        doc.setFont("helvetica", "normal");
        doc.text("05 dias úteis", MARGIN_LEFT + 40, y);
        y += 10;
      }

      // ═══════════════════════════════════════════════════
      // 7. DIAGNÓSTICO (extra)
      // ═══════════════════════════════════════════════════

      if (verificacao.diagnostico) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_CINZA_ESCURO);
        doc.text("Diagnóstico:", MARGIN_LEFT, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        const linhasDiag = doc.splitTextToSize(verificacao.diagnostico, CONTENT_WIDTH);
        doc.text(linhasDiag, MARGIN_LEFT, y);
        y += linhasDiag.length * 4 + 5;
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
        await aplicarRodape(doc, numeroOS);
      }

      // ═══════════════════════════════════════════════════
      // 9. SALVAR E ABRIR
      // ═══════════════════════════════════════════════════

      // Gerar bytes do PDF
      const pdfBytes = doc.output("arraybuffer");
      const uint8 = new Uint8Array(pdfBytes);

      // Enviar para Rust salvar em Documents/Orcamentos e revelar o arquivo
      const caminho = await invoke<string>("salvar_orcamento_pdf", {
        bytes: Array.from(uint8),
        empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Cliente",
        nomeArquivo: nomeArquivo || null,
      });

      console.info(`[PdfService] Orçamento PDF gerado: ${caminho}`);
      return caminho;
    } catch (error) {
      console.error("[PdfService] Erro ao gerar orçamento PDF:", error);
      throw error;
    }
  },

  /**
   * Gera PDF de ordem de serviço para recebimento técnico.
   * Lista os campos preenchidos na seção "Dados do Equipamento".
   */
  async gerarOrdemServico(equipamento: Equipamento, nomeArquivo?: string): Promise<string | null> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15;

      y = await aplicarCabecalhoPadrao(doc, y, "ORDEM DE SERVIÇO");

      const numeroOS = `OS-${String(equipamento.id ?? 0).padStart(5, "0")}`;
      const dataRegistro = equipamento.data_entrada
        ? new Date(equipamento.data_entrada)
        : new Date();

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, lineColor: COR_CINZA_CLARO, lineWidth: 0.3 },
        headStyles: { fillColor: COR_CINZA_MEDIO, textColor: COR_TEXTO_BRANCO, fontStyle: "bold" },
        body: [
          ["Ordem", numeroOS],
          ["Data de entrada", dataRegistro.toLocaleDateString("pt-BR")],
          ["Status atual", STATUS_LABELS[equipamento.status as keyof typeof STATUS_LABELS] || equipamento.status],
        ],
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

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

      const linhasDados: string[][] = [
        ["Nº de Série", equipamento.serial_number || "—"],
        ["Patrimônio", equipamento.patrimonio || "—"],
        ["Marca", equipamento.marca || "—"],
        ["Modelo", equipamento.modelo || "—"],
        ["Tipo", equipamento.tipo || "—"],
        ["Técnico responsável", tecnicoResponsavel || "—"],
        ["E-mail técnico", emailTecnico || "—"],
        ["Defeito relatado", equipamento.defeito_relatado || "—"],
        ["Acessórios", equipamento.acessorios || "—"],
        ["Outros acessórios", equipamento.acessorios_outros || "—"],
        ["Observações", observacoesDocumento || "—"],
      ];

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, lineColor: COR_CINZA_CLARO, lineWidth: 0.3 },
        headStyles: { fillColor: COR_CINZA_MEDIO, textColor: COR_TEXTO_BRANCO, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 48, fontStyle: "bold" },
          1: { cellWidth: CONTENT_WIDTH - 48 },
        },
        head: [["Campo", "Valor informado"]],
        body: linhasDados,
      });

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
        await aplicarRodape(doc, numeroOS);
      }

      const pdfBytes = doc.output("arraybuffer");
      const uint8 = new Uint8Array(pdfBytes);
      const caminho = await invoke<string>("salvar_ordem_servico_pdf", {
        bytes: Array.from(uint8),
        empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Empresa",
        nomeArquivo: nomeArquivo || null,
      });

      console.info(`[PdfService] Ordem de serviço PDF gerada: ${caminho}`);
      return caminho;
    } catch (error) {
      console.error("[PdfService] Erro ao gerar ordem de serviço PDF:", error);
      throw error;
    }
  },

  /**
   * Gera PDF com histórico/status completo do equipamento.
   */
  async gerarRelatorioStatus(equipamento: Equipamento): Promise<string | null> {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let y = 15;

      y = await aplicarCabecalhoPadrao(doc, y, "RELATÓRIO DE STATUS");
      const numeroOS = gerarNumeroOS(equipamento.id);
      const dataRegistro = equipamento.data_entrada
        ? new Date(equipamento.data_entrada)
        : new Date();

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3, lineColor: COR_CINZA_CLARO, lineWidth: 0.3 },
        headStyles: { fillColor: COR_CINZA_MEDIO, textColor: COR_TEXTO_BRANCO, fontStyle: "bold" },
        body: [
          ["Ordem", numeroOS],
          ["Equipamento", `${equipamento.marca || "—"} ${equipamento.modelo || ""}`.trim()],
          ["Nº de Série", equipamento.serial_number || "—"],
          ["Cliente", equipamento.cliente_nome || "—"],
          ["Data de entrada", dataRegistro.toLocaleDateString("pt-BR")],
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
      eventos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

      if (eventos.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(...COR_CINZA_MEDIO);
        doc.text("Não há eventos de histórico registrados para este equipamento.", MARGIN_LEFT, y);
      } else {
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 3, lineColor: COR_CINZA_CLARO, lineWidth: 0.3 },
          headStyles: { fillColor: COR_FUNDO_HEADER, textColor: COR_TEXTO_BRANCO, fontStyle: "bold" },
          head: [["Etapa", "Status", "Data"]],
          body: eventos.map((evento) => [
            evento.label,
            STATUS_LABELS[evento.status as keyof typeof STATUS_LABELS] || evento.status,
            new Date(evento.data).toLocaleDateString("pt-BR"),
          ]),
        });
      }

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        await aplicarRodape(doc, numeroOS);
      }

      const pdfBytes = doc.output("arraybuffer");
      const uint8 = new Uint8Array(pdfBytes);
      const caminho = await invoke<string>("salvar_relatorio_status_pdf", {
        bytes: Array.from(uint8),
        empresaNome: equipamento.cliente_nome || equipamento.proprietario || "Cliente",
      });

      console.info(`[PdfService] Relatório de status PDF gerado: ${caminho}`);
      return caminho;
    } catch (error) {
      console.error("[PdfService] Erro ao gerar relatório de status PDF:", error);
      throw error;
    }
  },

  /** Verifica se o serviço de geração PDF está disponível */
  isDisponivel(): boolean {
    return true;
  },
};
