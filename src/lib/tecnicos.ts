/**
 * Técnicos da OS = perfis marcados como "faz atendimento técnico" (migration 0051).
 * Substitui a lista fixa "Ivan/Isaias" e os e-mails fixos por técnico.
 *
 * O registro vem de `listar_tecnicos_da_empresa` (só a empresa da sessão, só perfis ativos que
 * atendem), recarregado pelo provedor de sessão; nunca da lista geral de perfis, que traz outras
 * empresas e perfis desativados. Serviços síncronos (e-mail, PDF) consultam o e-mail pelo nome
 * gravado na OS. OS antigas guardam o nome como texto: se ele não bater com exatamente um técnico
 * de hoje, a OS só não leva o e-mail do técnico (nada de cópia para um homônimo).
 */
export interface Tecnico {
  id: number;
  nome: string;
  email: string | null;
}

/** Linha do backend; `ativo`/`atende_tecnico` só aparecem em dados de teste e são conferidos de novo. */
export interface TecnicoDaEmpresa {
  id: number;
  nome: string;
  email_profissional?: string | null;
  ativo?: boolean;
  atende_tecnico?: boolean;
}

let tecnicosDaEmpresa: TecnicoDaEmpresa[] = [];
const ouvintes = new Set<() => void>();

function normalizar(nome: string) {
  return nome.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function definirTecnicosDaEmpresa(lista: readonly TecnicoDaEmpresa[] | null | undefined) {
  tecnicosDaEmpresa = (Array.isArray(lista) ? lista : []).filter((t) => t.ativo !== false && t.atende_tecnico !== false);
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function aoMudarPerfis(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Técnicos ativos da empresa da sessão, em ordem alfabética. */
export function tecnicosAtivos(): Tecnico[] {
  return tecnicosDaEmpresa
    .map((perfil) => ({ id: perfil.id, nome: perfil.nome, email: perfil.email_profissional ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * E-mail profissional do técnico com esse nome; vazio se não houver ou se for ambíguo.
 * Primeiro o nome igual (só ignorando caixa e espaços), e só se um único técnico casar; sem
 * acento só quando um único técnico casa, para "José" e "Jose" não trocarem de e-mail.
 */
export function emailDoTecnico(nome?: string | null): string {
  if (!nome) return "";
  const exato = nome.trim().toLocaleLowerCase("pt-BR");
  const iguais = tecnicosDaEmpresa.filter((perfil) => perfil.nome.trim().toLocaleLowerCase("pt-BR") === exato);
  if (iguais.length > 1) return "";
  if (iguais.length === 1) return iguais[0].email_profissional ?? "";
  const alvo = normalizar(nome);
  const parecidos = tecnicosDaEmpresa.filter((perfil) => normalizar(perfil.nome) === alvo);
  return parecidos.length === 1 ? parecidos[0].email_profissional ?? "" : "";
}

/** Linha "Técnico inicial: <nome> (<e-mail>)" que a entrada grava nas observações da OS; devolve só o nome. */
export function extrairTecnicoInicial(observacoes?: string | null): string {
  return observacoes?.match(/^Técnico inicial:[ \t]*(.+?)(?:[ \t]*\([^)\n]*\))?[ \t]*$/m)?.[1] ?? "";
}
