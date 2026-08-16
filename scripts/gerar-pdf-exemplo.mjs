import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_WIDTH = 210;
const MARGIN_LEFT = 15;
const MARGIN_RIGHT = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const COR_PRETA = [0, 0, 0];
const COR_CINZA_ESCURO = [51, 51, 51];
const COR_CINZA_CLARO = [200, 200, 200];
const COR_FUNDO_HEADER = [30, 30, 30];
const COR_TEXTO_BRANCO = [255, 255, 255];
const COR_CINZA_MEDIO = [80, 80, 80];
const COR_FUNDO_TOTAL = [240, 240, 240];
const COR_VERMELHA = [180, 0, 0];

const CABECALHO_EMPRESA = {
  nome: "BMITAG TECNOLOGIA QRCODE E RFID",
  descricao: "Vendas e Manutenções de Equipamentos ZEBRA",
  telefone: "Tel: +55 71 98223-5050 / +55 71 98165-0801",
  contato: "E-mail: bmitag@bmitag.com.br | bmitag.com.br",
  cnpj: "CNPJ: 57.522.734/0001-58",
};

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pngParaDataUrl(caminho) {
  const bytes = readFileSync(caminho);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const LOGO_TOPO_DATA_URL = pngParaDataUrl(resolve(process.cwd(), "public", "logo-bmitag.png"));
const ICONE_RODAPE_DATA_URL = pngParaDataUrl(resolve(process.cwd(), "src-tauri", "icons", "icon.png"));

function formatarDataExtenso(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = MESES_PT[data.getMonth()];
  const ano = data.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function gerarNumeroOS(id) {
  return `OS-${String(id ?? 0).padStart(5, "0")}`;
}

function garantirEspacoVertical(doc, y, alturaEstimada) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemInferior = 20;
  if (y + alturaEstimada > pageHeight - margemInferior) {
    doc.addPage();
    return 20;
  }
  return y;
}

function emailTecnicoPorNome(tecnicoNome) {
  if (tecnicoNome === "Ivan") return "ivan@bmicode.com";
  if (tecnicoNome === "Isaias") return "isaias@bmicode.com";
  return "";
}

function aplicarCabecalhoPadrao(doc, y, subtitulo) {
  const alturaHeader = 35;
  doc.setFillColor(...COR_FUNDO_HEADER);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, alturaHeader, "F");

  const logoSize = 25;
  const logoX = MARGIN_LEFT + 5;
  const logoY = y + (alturaHeader - logoSize) / 2;
  try {
    doc.addImage(LOGO_TOPO_DATA_URL, "PNG", logoX, logoY, logoSize, logoSize);
  } catch (err) {
    console.error("Falha ao adicionar logo no cabeçalho PDF:", err);
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

function aplicarRodape(doc, numeroOS) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const iconSize = 6;
  const iconY = pageHeight - 13;
  try {
    doc.addImage(ICONE_RODAPE_DATA_URL, "PNG", MARGIN_LEFT, iconY, iconSize, iconSize);
  } catch (err) {
    console.error("Falha ao adicionar ícone no rodapé PDF:", err);
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

function renderizarCondicoesComerciais(doc, y, tecnicoNome, emailTecnico) {
  const centerX = PAGE_WIDTH / 2;
  const espacoTitulo = 6;
  const espacoParagrafo = 5;
  const espacoSecao = 10;

  y = garantirEspacoVertical(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_VERMELHA);
  doc.text("Prazo de Execução:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const prazoLinhas = doc.splitTextToSize(
    "Após a aprovação da proposta, o prazo estimado para a realização do serviço é de 02 a 04 dias úteis (Podendo aumentar caso seja necessário troca de peças).",
    CONTENT_WIDTH
  );
  prazoLinhas.forEach((linha) => {
    doc.text(linha, centerX, y, { align: "center" });
    y += espacoParagrafo;
  });
  y += 3;

  y = garantirEspacoVertical(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_PRETA);
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

  y = garantirEspacoVertical(doc, y, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_PRETA);
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
    linhas.forEach((linha, idx) => {
      doc.text(linha, textIndent, y + idx * espacoParagrafo);
    });
    y += linhas.length * espacoParagrafo + 2;
  });
  y += 3;

  y = garantirEspacoVertical(doc, y, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_VERMELHA);
  doc.text("Validade do Orçamento:", centerX, y, { align: "center" });
  y += espacoTitulo;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COR_VERMELHA);
  doc.text("05 dias a partir da data de emissão.", centerX, y, { align: "center" });
  y += espacoSecao;

  y = garantirEspacoVertical(doc, y, 75);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COR_PRETA);
  doc.text("Taxa de Diagnóstico Técnico (em caso de reprovação do orçamento)", centerX, y, {
    align: "center",
  });
  y += espacoTitulo + 2;

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

  doc.setDrawColor(...COR_CINZA_CLARO);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, "FD");

  let boxY = y + boxPadding + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COR_PRETA);
  introLinhas.forEach((linha) => {
    doc.text(linha, boxX + boxPadding, boxY, { align: "left" });
    boxY += espacoParagrafo;
  });
  boxY += 2;

  categorias.forEach((cat) => {
    const linhas = doc.splitTextToSize(cat, boxWidth - boxPadding * 2 - (textIndent - boxX) - 2);
    doc.text("•", bulletIndent, boxY);
    linhas.forEach((linha, idx) => {
      doc.text(linha, textIndent, boxY + idx * espacoParagrafo);
    });
    boxY += linhas.length * espacoParagrafo + 2;
  });

  y += boxHeight + 6;

  y = garantirEspacoVertical(doc, y, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COR_PRETA);
  doc.text("Atenciosamente;", MARGIN_LEFT, y);
  y += espacoParagrafo + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(tecnicoNome || "—", MARGIN_LEFT, y);
  y += espacoParagrafo + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const emailLabel = "E-mail: ";
  doc.text(emailLabel, MARGIN_LEFT, y);
  const emailOffset = doc.getTextWidth(emailLabel);
  doc.setTextColor(0, 0, 255);
  doc.text(emailTecnico || "—", MARGIN_LEFT + emailOffset, y);
  doc.setTextColor(...COR_PRETA);
  y += espacoSecao;

  return y;
}

async function main() {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15;

  const equipamento = {
    id: 12345,
    serial_number: "S/N ZT410-99887766",
    marca: "Zebra",
    modelo: "ZT410",
    tipo: "Impressora de etiquetas",
    cliente_nome: "ACME Indústria Ltda.",
    data_entrada: "2026-08-01",
    observacoes: "",
  };

  const verificacao = {
    equipamento_id: 12345,
    tecnico_nome: "Ivan",
    problema_relatado: "Impressão falhando e led piscando.",
    diagnostico: "Desgaste da cabeça de impressão e sujeira no rolete.",
    servicos_necessarios: JSON.stringify([
      { id: "1", descricao: "Limpeza geral e ajuste de calibragem", valor: 180 },
      { id: "2", descricao: "Troca da cabeça de impressão", valor: 320 },
    ]),
    pecas_necessarias: JSON.stringify([
      { id: "p1", nome: "Cabeça de impressão ZT410", quantidade: 1, valorUnitario: 850, valorTotal: 850 },
    ]),
    custo_total: 1350,
  };

  const numeroOS = gerarNumeroOS(equipamento.id);
  const tecnicoNome = verificacao.tecnico_nome || "—";
  const emailTecnico = emailTecnicoPorNome(tecnicoNome);
  const responsavelCabecalho = emailTecnico
    ? `${tecnicoNome} (${emailTecnico})`
    : tecnicoNome;

  y = aplicarCabecalhoPadrao(doc, y, "ORÇAMENTO TÉCNICO");

  doc.setTextColor(...COR_PRETA);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Nº ${numeroOS}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Salvador, ${formatarDataExtenso(new Date())}`, PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
  y += 10;

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
    body: [[equipamento.cliente_nome, responsavelCabecalho, "Serviços"]],
  });

  y = doc.lastAutoTable.finalY + 5;

  const servicos = JSON.parse(verificacao.servicos_necessarios || "[]");
  const pecas = JSON.parse(verificacao.pecas_necessarias || "[]");
  const bodyRows = [];

  servicos.forEach((s) => {
    bodyRows.push([s.descricao, "1", formatarMoeda(s.valor), formatarMoeda(s.valor)]);
  });
  pecas.forEach((p) => {
    bodyRows.push([p.nome, String(p.quantidade), formatarMoeda(p.valorUnitario), formatarMoeda(p.valorTotal)]);
  });

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
    head: [["DESCRIÇÃO", "QTD", "UNITÁRIO", "TOTAL"]],
    body: bodyRows,
  });

  y = doc.lastAutoTable.finalY + 5;

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
    body: [["VALOR TOTAL:", formatarMoeda(verificacao.custo_total)]],
  });

  y = doc.lastAutoTable.finalY + 8;

  doc.setTextColor(...COR_CINZA_ESCURO);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Número de Série do Equipamento: ", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(equipamento.serial_number, MARGIN_LEFT + 55, y);
  y += 8;

  y = renderizarCondicoesComerciais(doc, y, tecnicoNome, emailTecnico);

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

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    aplicarRodape(doc, numeroOS);
  }

  const pdfBytes = doc.output("arraybuffer");
  const uint8 = new Uint8Array(pdfBytes);
  const outputPath = resolve(process.cwd(), "documents", "Orcamento-exemplo-v2.pdf");
  writeFileSync(outputPath, uint8);
  console.log(`PDF gerado em: ${outputPath}`);
}

main();
