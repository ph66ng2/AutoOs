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

/**
 * Técnico já escolhido ao abrir uma entrada: o próprio perfil da sessão, se ele faz atendimento
 * técnico; senão o único técnico da empresa; senão nenhum (a pessoa escolhe). Nunca "o primeiro
 * da lista": a 0051 marcou todo perfil com papel TECNICO, inclusive quem só elabora orçamento.
 */
export function tecnicoPadrao(tecnicos: readonly Tecnico[], perfilDaSessaoId?: number | null): string {
  const proprio = perfilDaSessaoId != null ? tecnicos.find((t) => t.id === perfilDaSessaoId) : undefined;
  if (proprio) return proprio.nome;
  return tecnicos.length === 1 ? tecnicos[0].nome : "";
}

/**
 * Aviso da Nova entrada quando a empresa não tem nenhum técnico marcado (ex.: a 0051 só marcou
 * quem tinha o papel exato TECNICO e quem atende usa perfil administrativo). A entrada não trava:
 * salva sem técnico, e nenhum e-mail é inventado.
 */
export const AVISO_ENTRADA_SEM_TECNICOS =
  "Nenhum perfil desta empresa está marcado como técnico. A OS pode ser salva sem técnico; peça a um administrador para marcar quem faz atendimento técnico em Equipe e acessos.";

/**
 * Erro da Nova entrada sobre o técnico, ou null se pode salvar. Exige a escolha só quando há
 * técnicos para escolher; sem nenhum, salvar sem técnico é a saída de transição.
 */
export function erroTecnicoDaEntrada(escolhido: string | null | undefined, tecnicos: readonly Tecnico[]): string | null {
  if (escolhido?.trim()) return null;
  if (tecnicos.length === 0) return null;
  return "Escolha o técnico da verificação inicial. Marque os técnicos em Equipe e acessos.";
}

/**
 * Quem fica no registro da entrada do Balcão. A verificação exige um nome (`tecnico_nome`), então
 * sem nenhum técnico marcado na empresa ela fica no nome de quem está operando (perfil da sessão),
 * sem a linha "Técnico inicial" e sem e-mail: a entrada não trava e nada é inventado.
 */
export function tecnicoDoBalcao(
  escolhido: string | null | undefined,
  tecnicos: readonly Tecnico[],
  operador: string | null | undefined,
): { nome: string; transicao: boolean; erro: string | null } {
  const nome = escolhido?.trim() ?? "";
  if (nome) return { nome, transicao: false, erro: null };
  if (tecnicos.length > 0) return { nome: "", transicao: false, erro: "Escolha o técnico que está operando." };
  const quemOpera = operador?.trim() ?? "";
  if (quemOpera) return { nome: quemOpera, transicao: true, erro: null };
  return { nome: "", transicao: false, erro: "Nenhum perfil está marcado como técnico. Entre com o seu perfil para registrar a entrada." };
}

/** Aviso do Balcão quando a empresa não tem nenhum técnico marcado. */
export function avisoBalcaoSemTecnicos(operador: string | null | undefined): string {
  const quem = operador?.trim();
  return `Nenhum perfil marcado como técnico. ${quem ? `O registro fica no nome de quem está operando (${quem}); p` : "P"}eça a um administrador para marcar os técnicos em Equipe e acessos.`;
}

/** "Técnico inicial: <nome> (<e-mail>)" para as observações; vazio sem técnico. */
export function linhaTecnicoInicial(nome: string | null | undefined, email: string): string {
  const limpo = nome?.trim() ?? "";
  if (!limpo) return "";
  return `Técnico inicial: ${limpo}${email ? ` (${email})` : ""}`;
}

/** Linha "Técnico inicial: <nome> (<e-mail>)" que a entrada grava nas observações da OS; devolve só o nome. */
export function extrairTecnicoInicial(observacoes?: string | null): string {
  return observacoes?.match(/^Técnico inicial:[ \t]*(.+?)(?:[ \t]*\([^)\n]*\))?[ \t]*$/m)?.[1] ?? "";
}
