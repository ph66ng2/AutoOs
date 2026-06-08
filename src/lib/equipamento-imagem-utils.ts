import type {
  EquipamentoImagem,
  EquipamentoImagemCategoria,
  EquipamentoImagemInput,
} from "@/types";

export const LIMITE_IMAGENS_POR_EQUIPAMENTO = 6;
const LARGURA_MAXIMA_IMAGEM = 1600;
const QUALIDADE_JPEG = 0.82;

export type EquipamentoImagemDraft = EquipamentoImagemInput & {
  local_id: string;
  preview_url: string;
};

function gerarIdLocalImagem() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `imagem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizarOrdemPorCategoria(
  imagens: EquipamentoImagemDraft[]
): EquipamentoImagemDraft[] {
  const proximaOrdem: Record<EquipamentoImagemCategoria, number> = {
    ENTRADA: 0,
    SAIDA: 0,
    VERIFICACAO: 0,
  };

  return imagens.map((imagem) => ({
    ...imagem,
    ordem: proximaOrdem[imagem.categoria]++,
  }));
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada"));
    reader.readAsDataURL(blob);
  });
}

function carregarImagem(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível processar a imagem selecionada"));
    image.src = dataUrl;
  });
}

function normalizarNomeArquivo(name: string): string {
  const semExtensao = name.replace(/\.[^/.]+$/, "").trim();
  const base = semExtensao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${base || "imagem_equipamento"}.jpg`;
}

function calcularDimensoesProporcionais(largura: number, altura: number) {
  if (largura <= LARGURA_MAXIMA_IMAGEM && altura <= LARGURA_MAXIMA_IMAGEM) {
    return { largura, altura };
  }

  if (largura >= altura) {
    const proporcao = LARGURA_MAXIMA_IMAGEM / largura;
    return {
      largura: Math.round(largura * proporcao),
      altura: Math.round(altura * proporcao),
    };
  }

  const proporcao = LARGURA_MAXIMA_IMAGEM / altura;
  return {
    largura: Math.round(largura * proporcao),
    altura: Math.round(altura * proporcao),
  };
}

export async function bytesParaDataUrl(bytes: number[], mimeType: string): Promise<string> {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
  return blobParaDataUrl(blob);
}

export async function imagemPersistidaParaDraft(
  imagem: EquipamentoImagem
): Promise<EquipamentoImagemDraft> {
  return {
    local_id: gerarIdLocalImagem(),
    categoria: imagem.categoria,
    filename: imagem.filename,
    mime_type: imagem.mime_type,
    tamanho_bytes: imagem.tamanho_bytes,
    largura: imagem.largura,
    altura: imagem.altura,
    ordem: imagem.ordem,
    observacao: imagem.observacao,
    bytes: imagem.bytes,
    preview_url: await bytesParaDataUrl(imagem.bytes, imagem.mime_type),
  };
}

export async function arquivoParaImagemEquipamento(
  file: File,
  ordem: number,
  categoria: EquipamentoImagemCategoria = "ENTRADA"
): Promise<EquipamentoImagemDraft> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`O arquivo ${file.name} não é uma imagem válida.`);
  }

  const originalDataUrl = await blobParaDataUrl(file);
  const imagem = await carregarImagem(originalDataUrl);
  const dimensoes = calcularDimensoesProporcionais(imagem.width, imagem.height);

  const canvas = document.createElement("canvas");
  canvas.width = dimensoes.largura;
  canvas.height = dimensoes.altura;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível para preparar a imagem do equipamento.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);

  const previewUrl = canvas.toDataURL("image/jpeg", QUALIDADE_JPEG);
  const buffer = await fetch(previewUrl).then((response) => response.arrayBuffer());
  const bytes = Array.from(new Uint8Array(buffer));

  return {
    local_id: gerarIdLocalImagem(),
    categoria,
    filename: normalizarNomeArquivo(file.name),
    mime_type: "image/jpeg",
    tamanho_bytes: bytes.length,
    largura: canvas.width,
    altura: canvas.height,
    ordem,
    observacao: undefined,
    bytes,
    preview_url: previewUrl,
  };
}