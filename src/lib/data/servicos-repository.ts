import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { ITEMS_PER_PAGE, paginateItems } from "@/lib/pagination";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import type { ClienteId, PecaVinculada, ServicoCatalogo } from "@/types";

export type ServicoCatalogoInput = Pick<ServicoCatalogo<ClienteId>, "nome" | "descricao" | "preco_padrao"> & {
  pecas_sugeridas?: PecaVinculada<string>[];
  atualizado_em?: string;
};

export interface ProdutoParaPecaSugerida {
  id: string;
  empresa_id: string;
  nome: string;
  quantidade_estoque: number;
  preco_venda: number;
  ativo: boolean;
}

export interface ServicosPage {
  items: ServicoCatalogo<ClienteId>[];
  total: number;
}

export interface ServicosRepository {
  listar(busca?: string, apenasAtivos?: boolean, page?: number): Promise<ServicosPage>;
  criar(input: ServicoCatalogoInput): Promise<ServicoCatalogo<ClienteId>>;
  atualizar(id: ClienteId, input: ServicoCatalogoInput): Promise<ServicoCatalogo<ClienteId>>;
  desativar(id: ClienteId): Promise<void>;
}

type FetchLike = typeof fetch;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_SELECT = "id,empresa_id,nome,descricao,preco_padrao,pecas_sugeridas,ativo,criado_em,atualizado_em";
const PRODUCTS_PAGE_SIZE = 100;
const productsInFlight = new Map<string, Promise<ProdutoParaPecaSugerida[]>>();

function localSearch(rows: ServicoCatalogo[], busca?: string): ServicoCatalogo[] {
  const term = busca?.trim().toLocaleLowerCase("pt-BR");
  if (!term) return rows;
  return rows.filter((service) => [service.nome, service.descricao]
    .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
}

function localId(id: ClienteId): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new OnlineDataError("INVALID_DATA", "Um serviço SaaS não pode ser encaminhado ao banco local.");
  }
  return id;
}

const tauriRepository: ServicosRepository = {
  async listar(busca, apenasAtivos = true, page = 0) {
    // A tela existente lista o catálogo ativo completo antes de paginar localmente.
    // O comando legado com paginação retorna somente uma página e não informa o total.
    const rows = apenasAtivos
      ? await db.listarServicosCatalogoAtivos()
      : await db.listarServicos(undefined, false);
    const filtered = localSearch(rows, busca).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR") || String(a.id).localeCompare(String(b.id)));
    return { items: paginateItems(filtered, Math.max(page, 0) + 1, ITEMS_PER_PAGE), total: filtered.length };
  },
  criar: ({ pecas_sugeridas: _pecasSugeridas, ...input }) => db.criarServico(input),
  atualizar: (id, { pecas_sugeridas: _pecasSugeridas, ...input }) => db.atualizarServico(localId(id), input),
  desativar: (id) => db.deletarServico(localId(id)),
};

function assertService(row: ServicoCatalogo<string>, session: SupabaseOnlineSession): ServicoCatalogo<string> {
  if (typeof row.id !== "string" || !UUID_PATTERN.test(row.id) || row.empresa_id !== session.companyId) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um serviço fora da empresa autenticada.");
  }
  validatePecasSugeridas(row.pecas_sugeridas ?? []);
  return row;
}

export function validatePecasSugeridas(input: PecaVinculada<ClienteId>[]): PecaVinculada<string>[] {
  if (!Array.isArray(input)) {
    throw new OnlineDataError("INVALID_DATA", "As peças sugeridas do serviço são inválidas.");
  }
  const ids = new Set<string>();
  return input.map((item) => {
    const produtoId = String(item?.produto_id ?? "");
    const nome = typeof item?.nome === "string" ? item.nome.trim() : "";
    const quantidade = Number(item?.quantidade);
    const valorUnitario = Number(item?.valor_unitario);
    if (!UUID_PATTERN.test(produtoId) || !nome || !Number.isSafeInteger(quantidade) || quantidade < 1
      || !Number.isFinite(valorUnitario) || valorUnitario < 0 || ids.has(produtoId)) {
      throw new OnlineDataError("INVALID_DATA", "Cada peça precisa ter produto válido, quantidade inteira positiva e preço válido.");
    }
    ids.add(produtoId);
    return { produto_id: produtoId, nome, quantidade, valor_unitario: Math.round(valorUnitario * 100) / 100 };
  });
}

function assertProduct(row: ProdutoParaPecaSugerida, session: SupabaseOnlineSession): ProdutoParaPecaSugerida {
  if (!row || typeof row.id !== "string" || !UUID_PATTERN.test(row.id) || row.empresa_id !== session.companyId) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um produto fora da empresa autenticada.");
  }
  if (row.ativo !== true || typeof row.nome !== "string" || !row.nome.trim()
    || !Number.isFinite(Number(row.quantidade_estoque)) || !Number.isFinite(Number(row.preco_venda))) {
    throw new OnlineDataError("INVALID_DATA", "O estoque retornou um produto com dados inválidos.");
  }
  return { ...row, quantidade_estoque: Number(row.quantidade_estoque), preco_venda: Number(row.preco_venda) };
}

function searchPattern(value: string): string {
  const escaped = value.replace(/[\\%_*\"]/g, (character) => `\\${character}`);
  return `"%${escaped}%"`;
}

function httpError(status: number, code: string | undefined, method: string | undefined): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403 || code === "42501") return new OnlineDataError("RLS_DENIED", "Seu acesso aos serviços foi negado pela empresa.");
  if (status === 409 || code === "23505") return new OnlineDataError("CONFLICT", "Já existe um serviço ativo com esse nome nesta empresa.");
  if (status === 400 && (code === "22023" || code?.startsWith("23"))) return new OnlineDataError("INVALID_DATA", "Os dados do serviço não atendem às regras do catálogo.");
  if (method === "PATCH" && status === 404) return new OnlineDataError("CONFLICT", "O serviço mudou ou não está mais disponível. Atualize a lista e tente novamente.");
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Seus dados foram mantidos; tente novamente.");
}

function validateInput(input: ServicoCatalogoInput): {
  nome: string;
  descricao: string | null;
  preco_padrao: number;
  pecas_sugeridas?: PecaVinculada<string>[];
} {
  const nome = input.nome.trim();
  const preco = Number(input.preco_padrao);
  if (!nome || !Number.isFinite(preco) || preco < 0) {
    throw new OnlineDataError("INVALID_DATA", "Informe um nome e um preço válido para o serviço.");
  }
  return {
    nome,
    descricao: input.descricao?.trim() || null,
    preco_padrao: preco,
    ...(input.pecas_sugeridas === undefined ? {} : { pecas_sugeridas: validatePecasSugeridas(input.pecas_sugeridas) }),
  };
}

export class SupabaseServicosRepository implements ServicosRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private endpoint(query: URLSearchParams, resource = "servicos_catalogo"): string {
    const serialized = query.toString();
    return `${this.session.supabaseUrl}/rest/v1/${resource}${serialized ? `?${serialized}` : ""}`;
  }

  private async request<T>(query: URLSearchParams, init: RequestInit = {}, resource?: string): Promise<{ rows: T[]; response: Response }> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint(query, resource), {
        ...init,
        headers: {
          apikey: this.session.publishableKey,
          Authorization: `Bearer ${this.session.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Seus dados foram mantidos; tente novamente.");
    }

    if (!response.ok) {
      let code: string | undefined;
      try { code = (await response.json() as { code?: string }).code; } catch { /* resposta sem JSON */ }
      throw httpError(response.status, code, init.method);
    }
    if (response.status === 204) return { rows: [], response };
    try {
      return { rows: await response.json() as T[], response };
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
    }
  }

  async listar(busca?: string, apenasAtivos = true, page = 0): Promise<ServicosPage> {
    const safePage = Math.max(0, Math.floor(page));
    const offset = safePage * ITEMS_PER_PAGE;
    const query = new URLSearchParams({
      select: SERVICE_SELECT,
      empresa_id: `eq.${this.session.companyId}`,
      order: "nome.asc,id.asc",
      limit: String(ITEMS_PER_PAGE),
      offset: String(offset),
    });
    if (apenasAtivos) query.set("ativo", "eq.true");
    const term = busca?.trim();
    if (term) query.set("or", `(nome.ilike.${searchPattern(term)},descricao.ilike.${searchPattern(term)})`);

    const { rows, response } = await this.request<ServicoCatalogo<string>>(query, {
      method: "GET",
      headers: { Prefer: "count=exact" },
    });
    const match = response.headers.get("Content-Range")?.match(/\/(\d+)$/);
    if (!match) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não informou o total do catálogo para a paginação.");
    }
    return { items: rows.map((row) => assertService(row, this.session)), total: Number(match[1]) };
  }

  async listarProdutosParaPecas(): Promise<ProdutoParaPecaSugerida[]> {
    const cacheKey = `${this.session.supabaseUrl}:${this.session.companyId}`;
    const inFlight = productsInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const request = this.buscarProdutosParaPecas();
    productsInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (productsInFlight.get(cacheKey) === request) productsInFlight.delete(cacheKey);
    }
  }

  private async buscarProdutosParaPecas(): Promise<ProdutoParaPecaSugerida[]> {
    const produtos: ProdutoParaPecaSugerida[] = [];
    let total: number | null = null;
    for (let offset = 0; total === null || offset < total; offset += PRODUCTS_PAGE_SIZE) {
      const query = new URLSearchParams({
        select: "id,empresa_id,nome,quantidade_estoque,preco_venda,ativo",
        empresa_id: `eq.${this.session.companyId}`,
        ativo: "eq.true",
        order: "nome.asc,id.asc",
        limit: String(PRODUCTS_PAGE_SIZE),
        offset: String(offset),
      });
      const { rows, response } = await this.request<ProdutoParaPecaSugerida>(query, {
        method: "GET",
        headers: { Prefer: "count=exact" },
      }, "produtos");
      const match = response.headers.get("Content-Range")?.match(/\/(\d+)$/);
      if (!match) {
        throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não informou o total do estoque para a paginação.");
      }
      total = Number(match[1]);
      produtos.push(...rows.map((row) => assertProduct(row, this.session)));
    }
    return produtos;
  }

  async criar(input: ServicoCatalogoInput): Promise<ServicoCatalogo<string>> {
    const query = new URLSearchParams({ select: SERVICE_SELECT });
    const payload = validateInput(input);
    const { rows } = await this.request<ServicoCatalogo<string>>(query, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...payload, pecas_sugeridas: payload.pecas_sugeridas ?? [], empresa_id: this.session.companyId, ativo: true }),
    });
    const row = rows[0];
    if (!row) throw new OnlineDataError("RLS_DENIED", "O serviço não pôde ser criado para sua empresa.");
    return assertService(row, this.session);
  }

  async atualizar(id: ClienteId, input: ServicoCatalogoInput): Promise<ServicoCatalogo<string>> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do serviço Online é inválido.");
    }
    const query = new URLSearchParams({
      select: SERVICE_SELECT,
      id: `eq.${id}`,
      empresa_id: `eq.${this.session.companyId}`,
    });
    if (input.atualizado_em) query.set("atualizado_em", `eq.${input.atualizado_em}`);
    const { rows } = await this.request<ServicoCatalogo<string>>(query, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...validateInput(input), atualizado_em: new Date().toISOString() }),
    });
    const row = rows[0];
    if (!row) throw new OnlineDataError("CONFLICT", "O serviço mudou ou não está mais disponível. Atualize a lista e tente novamente.");
    return assertService(row, this.session);
  }

  async desativar(id: ClienteId): Promise<void> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do serviço Online é inválido.");
    }
    const query = new URLSearchParams({
      select: "id,empresa_id",
      id: `eq.${id}`,
      empresa_id: `eq.${this.session.companyId}`,
      ativo: "eq.true",
    });
    const { rows } = await this.request<ServicoCatalogo<string>>(query, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ativo: false, atualizado_em: new Date().toISOString() }),
    });
    const row = rows[0];
    if (!row) throw new OnlineDataError("RLS_DENIED", "O serviço não foi encontrado ou não está disponível para sua empresa.");
    assertService(row, this.session);
  }
}

export async function carregarRepositorioServicos(): Promise<ServicosRepository> {
  if (!IS_SAAS_BUILD) return tauriRepository;
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseServicosRepository(sessionFromSaasSession(session));
}

export async function carregarProdutosParaPecas(): Promise<ProdutoParaPecaSugerida[]> {
  if (!IS_SAAS_BUILD) {
    throw new OnlineDataError("INVALID_DATA", "A consulta de peças sugeridas só está disponível no catálogo Online.");
  }
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseServicosRepository(sessionFromSaasSession(session)).listarProdutosParaPecas();
}
