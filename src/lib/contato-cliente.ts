import { resolveRecipient } from "@/lib/recipient-resolver";
import { formatarTelefone } from "@/lib/validations";
import type { Equipamento, SolicitacaoOrcamentoInfo } from "@/types";

function limpar(valor?: string | null) {
  return valor?.trim() || "";
}

/** Telefone brasileiro para o wa.me (DDI 55 + DDD + número); `null` se não for discável. */
export function telefoneParaWhatsapp(telefone?: string | null): string | null {
  const digitos = limpar(telefone).replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}

/** Telefone para exibir: (71) 99123-4567; sem DDI 55. Fora do padrão, devolve como veio. */
export function telefoneParaExibir(telefone?: string | null): string {
  const numero = telefoneParaWhatsapp(telefone);
  return numero ? formatarTelefone(numero.slice(2)) : limpar(telefone);
}

export function montarLinkWhatsapp(telefone: string | null | undefined, texto: string): string | null {
  const numero = telefoneParaWhatsapp(telefone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

export function emailValido(email?: string | null): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(limpar(email));
}

export function montarLinkEmail(email: string | null | undefined, assunto: string, corpo: string): string | null {
  if (!emailValido(email)) return null;
  return `mailto:${limpar(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export function protocoloSolicitacao(solicitacao: Pick<SolicitacaoOrcamentoInfo, "id">) {
  return `S-${solicitacao.id}`;
}

const ASSUNTO_TIPO: Record<SolicitacaoOrcamentoInfo["tipo"], string> = {
  NEGOCIAR: "seu pedido para negociar o orçamento",
  MUDANCA: "seu pedido de ajuste no orçamento",
  DUVIDA: "sua dúvida sobre o orçamento",
};

export function mensagemInicialContato(
  equipamento: Pick<Equipamento, "marca" | "modelo">,
  solicitacao: Pick<SolicitacaoOrcamentoInfo, "id" | "tipo" | "contato">,
): string {
  const nome = limpar(solicitacao.contato).split(/\s+/)[0];
  const aparelho = [limpar(equipamento.marca), limpar(equipamento.modelo)].filter(Boolean).join(" ") || "equipamento";
  return `Olá${nome ? `, ${nome}` : ""}! Recebemos ${ASSUNTO_TIPO[solicitacao.tipo]} da ${aparelho} (protocolo ${protocoloSolicitacao(solicitacao)}). Podemos conversar para ajustar?`;
}

export type ContatoRetorno = {
  telefone: string | null;
  email: string | null;
  /** De onde veio cada dado: o que o cliente informou na solicitação ou o cadastro. */
  telefoneOrigem: "cliente" | "cadastro" | null;
  emailOrigem: "cliente" | "cadastro" | null;
  /** Há telefone discável / e-mail válido para os botões. */
  podeWhatsapp: boolean;
  podeEmail: boolean;
};

/** Telefone/e-mail da solicitação; na falta deles, os do contato responsável ou do cadastro do cliente. */
export function contatoParaRetorno(
  solicitacao: Pick<SolicitacaoOrcamentoInfo, "contatoTelefone" | "contatoEmail">,
  equipamento: Equipamento,
): ContatoRetorno {
  const telCliente = limpar(solicitacao.contatoTelefone);
  const mailCliente = limpar(solicitacao.contatoEmail);
  const telCad = resolveRecipient(equipamento, "telefone");
  const mailCad = resolveRecipient(equipamento, "email");
  const telefone = telCliente || (telCad.origem !== "sem_envio" ? telCad.endereco : "");
  const email = mailCliente || (mailCad.origem !== "sem_envio" ? mailCad.endereco : "");
  return {
    telefone: telefone || null,
    email: email || null,
    telefoneOrigem: telCliente ? "cliente" : telefone ? "cadastro" : null,
    emailOrigem: mailCliente ? "cliente" : email ? "cadastro" : null,
    podeWhatsapp: telefoneParaWhatsapp(telefone) != null,
    podeEmail: emailValido(email),
  };
}
