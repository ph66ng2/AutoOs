import type { SecurityProfile } from "@/types";

/**
 * Técnicos da OS = perfis marcados como "faz atendimento técnico" (migration 0051).
 * Substitui a lista fixa "Ivan/Isaias" e os e-mails fixos por técnico.
 *
 * O registro é alimentado pelo provedor de sessão a cada atualização de perfis; serviços
 * síncronos (e-mail, PDF) consultam o e-mail pelo nome gravado na OS. OS antigas guardam o
 * nome como texto: se ele não bater com um perfil atual, a OS só não leva o e-mail do técnico.
 */
export interface Tecnico {
  id: number;
  nome: string;
  email: string | null;
}

let perfisConhecidos: SecurityProfile[] = [];
const ouvintes = new Set<() => void>();

function normalizar(nome: string) {
  return nome.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function definirPerfisConhecidos(perfis: SecurityProfile[]) {
  perfisConhecidos = perfis;
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function aoMudarPerfis(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Perfis ativos que fazem atendimento técnico, em ordem alfabética. */
export function tecnicosAtivos(): Tecnico[] {
  return perfisConhecidos
    .filter((perfil) => perfil.ativo && perfil.atende_tecnico)
    .map((perfil) => ({ id: perfil.id, nome: perfil.nome, email: perfil.email_profissional ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * E-mail profissional do perfil com esse nome; vazio se não houver.
 * Primeiro o nome igual (só ignorando caixa e espaços); sem acento só quando
 * um único perfil casa, para "José" e "Jose" não trocarem de e-mail.
 */
export function emailDoTecnico(nome?: string | null): string {
  if (!nome) return "";
  const exato = nome.trim().toLocaleLowerCase("pt-BR");
  const igual = perfisConhecidos.find((perfil) => perfil.nome.trim().toLocaleLowerCase("pt-BR") === exato);
  if (igual) return igual.email_profissional ?? "";
  const alvo = normalizar(nome);
  const parecidos = perfisConhecidos.filter((perfil) => normalizar(perfil.nome) === alvo);
  return parecidos.length === 1 ? parecidos[0].email_profissional ?? "" : "";
}

/** Linha "Técnico inicial: <nome> (<e-mail>)" que a entrada grava nas observações da OS; devolve só o nome. */
export function extrairTecnicoInicial(observacoes?: string | null): string {
  return observacoes?.match(/^Técnico inicial:[ \t]*(.+?)(?:[ \t]*\([^)\n]*\))?[ \t]*$/m)?.[1] ?? "";
}
