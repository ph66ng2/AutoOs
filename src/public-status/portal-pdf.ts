import { dateTime, money, shortDate, type DetalheAtendimento } from "./portal-api";

/**
 * Documentos do portal gerados no navegador a partir do detalhe do atendimento.
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

type OrcamentoDetalhe = NonNullable<DetalheAtendimento["orcamento"]>;

function blocosServicosEPecas(orc: OrcamentoDetalhe): Bloco[] {
  const blocos: Bloco[] = [];
  for (const servico of orc.servicos) {
    blocos.push({
      tipo: "linha",
      esquerda: servico.descricao,
      direita: money(servico.valor),
      detalhes: servico.pecas.map((p) => `${p.quantidade} x ${p.nome} - ${money(p.valorUnitario)} cada`),
    });
  }
  for (const peca of orc.pecas) {
    blocos.push({ tipo: "linha", esquerda: `${peca.quantidade} x ${peca.nome}`, direita: money(peca.valorTotal) });
  }
  return blocos;
}

export function modeloOrcamento(detalhe: DetalheAtendimento): ModeloDocumento | null {
  const orc = detalhe.orcamento;
  if (!orc) return null;
  const blocos: Bloco[] = [
    ...blocosEquipamento(detalhe),
    { tipo: "secao", texto: "Defeito relatado" },
    { tipo: "nota", texto: detalhe.defeitoRelatado?.trim() || "Não informado." },
    { tipo: "secao", texto: `Orçamento, versão ${orc.versao}` },
    { tipo: "campo", rotulo: "Publicado em", valor: shortDate(orc.publicadaEm) },
  ];
  if (orc.validoAte) {
    blocos.push({ tipo: "campo", rotulo: "Válido até", valor: shortDate(new Date(new Date(orc.validoAte).getTime() - 1).toISOString()) });
  }
  blocos.push({ tipo: "secao", texto: "Serviços e peças" });
  blocos.push(...blocosServicosEPecas(orc));
  blocos.push({ tipo: "total", rotulo: "Total do orçamento", valor: money(orc.valorTotal) });

  const final = detalhe.valores?.final ?? null;
  if (final != null && valoresDiferem(final, orc.valorTotal)) {
    blocos.push({ tipo: "total", rotulo: "Valor final", valor: money(final) });
    blocos.push({ tipo: "nota", texto: `Valor orçado: ${money(orc.valorTotal)}. O valor final foi ajustado pela equipe.` });
  }

  const resposta = orc.resposta && orc.resposta.decisao !== "DESFEITA" ? orc.resposta : null;
  if (resposta) {
    blocos.push({ tipo: "secao", texto: "Resposta do cliente" });
    blocos.push({ tipo: "campo", rotulo: "Decisão", valor: resposta.decisao === "APROVAR" ? "Orçamento aceito" : "Orçamento recusado" });
    blocos.push({ tipo: "campo", rotulo: "Registrada em", valor: dateTime(resposta.registradaEm) });
    blocos.push({ tipo: "campo", rotulo: "Protocolo", valor: resposta.protocolo });
    if (resposta.contato) blocos.push({ tipo: "campo", rotulo: "Contato", valor: resposta.contato });
    if (resposta.ordemCompra) blocos.push({ tipo: "campo", rotulo: "Ordem de compra", valor: resposta.ordemCompra });
  }
  return { titulo: "Orçamento", arquivo: `orcamento-${detalhe.id}-v${orc.versao}.pdf`, blocos };
}

const STATUS_COM_SERVICOS_APROVADOS = new Set(["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"]);

const ETAPA_ROTULO: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_VERIFICACAO: "Em verificação",
  VERIFICADO: "Verificado",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  EM_MANUTENCAO: "Em manutenção",
  AGUARDANDO_PECA: "Aguardando peça",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
};

/**
 * ENTREGUE também é alcançável a partir de REPROVADO (devolução sem conserto), então lá a aprovação
 * precisa constar nas etapas e não pode ser anterior a uma reprovação.
 */
function houveAprovacao(detalhe: DetalheAtendimento): boolean {
  if (!STATUS_COM_SERVICOS_APROVADOS.has(detalhe.status)) return false;
  if (detalhe.status !== "ENTREGUE") return true;
  const em = (status: string) => detalhe.etapas?.find((etapa) => etapa.status === status)?.em ?? null;
  const aprovado = em("APROVADO");
  const reprovado = em("REPROVADO");
  if (!aprovado) return false;
  return !reprovado || new Date(aprovado).getTime() >= new Date(reprovado).getTime();
}

/** Ordem de serviço: sempre gera um modelo; os serviços aprovados aparecem só quando já há aprovação. */
export function modeloOrdemServico(detalhe: DetalheAtendimento): ModeloDocumento {
  const orc = detalhe.orcamento;
  const blocos: Bloco[] = [
    { tipo: "secao", texto: "Ordem de serviço" },
    { tipo: "campo", rotulo: "Número", valor: `OS-${String(detalhe.id).padStart(5, "0")}` },
    { tipo: "campo", rotulo: "Situação", valor: detalhe.titulo },
    ...blocosEquipamento(detalhe),
    { tipo: "secao", texto: "Defeito relatado" },
    { tipo: "nota", texto: detalhe.defeitoRelatado?.trim() || "Não informado." },
  ];
  if (orc && houveAprovacao(detalhe)) {
    blocos.push({ tipo: "secao", texto: "Serviços aprovados" });
    blocos.push(...blocosServicosEPecas(orc));
    blocos.push({ tipo: "total", rotulo: "Valor do atendimento", valor: money(detalhe.valores?.atual ?? orc.valorTotal) });
  }
  blocos.push({ tipo: "secao", texto: "Andamento" });
  for (const etapa of detalhe.etapas ?? []) {
    blocos.push({ tipo: "campo", rotulo: ETAPA_ROTULO[etapa.status] ?? etapa.status, valor: dateTime(etapa.em) });
  }
  return { titulo: "Ordem de serviço", arquivo: `ordem-servico-${detalhe.id}.pdf`, blocos };
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
  return { titulo: "Comprovante de entrega", arquivo: `comprovante-entrega-${detalhe.id}.pdf`, blocos };
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
