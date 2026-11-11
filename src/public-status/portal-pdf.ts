import { dateTime, money, shortDate, type DetalheAtendimento } from "./portal-api";

/**
 * Comprovante de entrega gerado no portal. OS e orçamento vêm dos arquivos oficiais.
 * O modelo (blocos) é puro e testável; o `jspdf` só é carregado quando o cliente pede o PDF.
 */
export type Bloco =
  | { tipo: "secao"; texto: string }
  | { tipo: "campo"; rotulo: string; valor: string }
  | { tipo: "linha"; esquerda: string; direita: string; detalhes?: string[] }
  | { tipo: "total"; rotulo: string; valor: string }
  | { tipo: "nota"; texto: string };

export interface ModeloDocumento {
  titulo: string;
  arquivo: string;
  blocos: Bloco[];
}

export function formatarDocumento(documento: string | null | undefined): string | null {
  if (!documento) return null;
  if (/^\d{11}$/.test(documento)) return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^\d{14}$/.test(documento)) return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return null;
}

export const valoresDiferem = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && Math.abs(a - b) >= 0.005;

/** Valor final da entrega e, se ele difere do orçado, o valor orçado. */
export function valoresDeEntrega(detalhe: DetalheAtendimento) {
  const final = detalhe.valores?.final ?? detalhe.valores?.atual ?? null;
  const orcado = detalhe.orcamento?.valorTotal ?? detalhe.valores?.orcamento ?? null;
  return { final, orcado, ajustado: valoresDiferem(final, orcado) };
}

function blocosEquipamento(detalhe: DetalheAtendimento): Bloco[] {
  const blocos: Bloco[] = [{ tipo: "secao", texto: "Equipamento" }, { tipo: "campo", rotulo: "Equipamento", valor: detalhe.equipamento }];
  if (detalhe.serie) blocos.push({ tipo: "campo", rotulo: "Número de série", valor: detalhe.serie });
  if (detalhe.patrimonio) blocos.push({ tipo: "campo", rotulo: "Patrimônio", valor: detalhe.patrimonio });
  if (detalhe.entradaEm) blocos.push({ tipo: "campo", rotulo: "Entrada em", valor: shortDate(detalhe.entradaEm) });
  if (detalhe.cliente) {
    blocos.push({ tipo: "secao", texto: "Cliente" });
    blocos.push({ tipo: "campo", rotulo: "Cliente", valor: detalhe.cliente.nome });
    const doc = formatarDocumento(detalhe.cliente.documento);
    if (doc) blocos.push({ tipo: "campo", rotulo: detalhe.cliente.documento!.length === 14 ? "CNPJ" : "CPF", valor: doc });
  }
  return blocos;
}

export function modeloComprovanteEntrega(detalhe: DetalheAtendimento): ModeloDocumento | null {
  if (detalhe.status !== "ENTREGUE") return null;
  const { final, orcado, ajustado } = valoresDeEntrega(detalhe);
  const entregueEm = detalhe.etapas?.find((e) => e.status === "ENTREGUE")?.em ?? detalhe.statusAlteradoEm;
  const blocos: Bloco[] = [...blocosEquipamento(detalhe)];
  blocos.push({ tipo: "secao", texto: "Entrega" });
  if (entregueEm) blocos.push({ tipo: "campo", rotulo: "Entregue em", valor: dateTime(entregueEm) });
  if (final != null) blocos.push({ tipo: "total", rotulo: "Valor final", valor: money(final) });
  if (ajustado && orcado != null) {
    blocos.push({ tipo: "nota", texto: `Valor orçado: ${money(orcado)}. Valor final ajustado na entrega.` });
  }
  const resposta = detalhe.orcamento?.resposta;
  if (resposta && resposta.decisao === "APROVAR") {
    blocos.push({ tipo: "campo", rotulo: "Protocolo do aceite", valor: resposta.protocolo });
    if (resposta.ordemCompra) blocos.push({ tipo: "campo", rotulo: "Ordem de compra", valor: resposta.ordemCompra });
  }
  return { titulo: "Comprovante de entrega — gerado no portal", arquivo: `comprovante-entrega-${detalhe.id}.pdf`, blocos };
}

/** Desenha o modelo num PDF A4 simples e salva o arquivo. `jspdf` entra por import dinâmico. */
export async function gerarPdf(modelo: ModeloDocumento): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 18;
  const util = largura - margem * 2;
  let y = margem;

  const garantir = (necessario: number) => {
    if (y + necessario > altura - margem) {
      doc.addPage();
      y = margem;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(82, 107, 137);
  doc.text("BMI TAG - Portal das Impressoras", margem, y);
  y += 8;
  doc.setFontSize(18);
  doc.setTextColor(16, 46, 80);
  doc.text(modelo.titulo, margem, y);
  y += 4;
  doc.setDrawColor(220, 229, 240);
  doc.line(margem, y, largura - margem, y);
  y += 7;

  for (const bloco of modelo.blocos) {
    if (bloco.tipo === "secao") {
      garantir(14);
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(18, 97, 156);
      doc.text(bloco.texto, margem, y);
      y += 6;
    } else if (bloco.tipo === "campo") {
      const linhas = doc.splitTextToSize(bloco.valor, util - 42) as string[];
      garantir(linhas.length * 5 + 1);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(82, 107, 137);
      doc.text(bloco.rotulo, margem, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(23, 43, 77);
      doc.text(linhas, margem + 42, y);
      y += linhas.length * 5 + 1;
    } else if (bloco.tipo === "linha") {
      const esquerda = doc.splitTextToSize(bloco.esquerda, util - 40) as string[];
      garantir(esquerda.length * 5 + (bloco.detalhes?.length ?? 0) * 4.5 + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(23, 43, 77);
      doc.text(esquerda, margem, y);
      doc.text(bloco.direita, largura - margem, y, { align: "right" });
      y += esquerda.length * 5;
      doc.setFontSize(9);
      doc.setTextColor(102, 120, 140);
      for (const detalhe of bloco.detalhes ?? []) {
        doc.text(doc.splitTextToSize(detalhe, util - 6) as string[], margem + 4, y);
        y += 4.5;
      }
      y += 2;
    } else if (bloco.tipo === "total") {
      garantir(12);
      y += 1;
      doc.setDrawColor(220, 229, 240);
      doc.line(margem, y, largura - margem, y);
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(16, 46, 80);
      doc.text(bloco.rotulo, margem, y);
      doc.text(bloco.valor, largura - margem, y, { align: "right" });
      y += 6;
    } else {
      const linhas = doc.splitTextToSize(bloco.texto, util) as string[];
      garantir(linhas.length * 5 + 1);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(67, 91, 118);
      doc.text(linhas, margem, y);
      y += linhas.length * 5 + 1;
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(102, 120, 140);
  doc.text(`Gerado em ${dateTime(new Date().toISOString())} pelo Portal das Impressoras BMI TAG.`, margem, altura - 10);
  doc.save(modelo.arquivo);
}
