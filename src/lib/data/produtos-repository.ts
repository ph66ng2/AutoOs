import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { ITEMS_PER_PAGE, paginateItems } from "@/lib/pagination";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import type { ClienteId, Produto } from "@/types";

export interface ProdutoInput {
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria: string;
  quantidade_estoque: number;
  quantidade_minima: number;
  preco_custo: number;
  preco_venda: number;
  localizacao?: string | null;
  atualizado_em?: string;
}

export interface ProdutosFilters {
  busca?: string;
  categoria?: string;
  apenasEstoqueBaixo?: boolean;
}

export interface ProdutosPage {
  items: Produto<ClienteId>[];
  total: number;
  insumosAbaixoMinimo: number;
}

export interface ProdutosRepository {
  listar(filters: ProdutosFilters, page: number): Promise<ProdutosPage>;
  criar(input: ProdutoInput): Promise<Produto<ClienteId>>;
  atualizar(id: ClienteId, input: ProdutoInput): Promise<Produto<ClienteId>>;
  desativar(id: ClienteId, atualizadoEm?: string): Promise<void>;
  registrarMovimentacao(
    produtoId: ClienteId,
    tipo: "ENTRADA" | "SAIDA",
    quantidade: number,
    origem: string,
    referencia?: string,
  ): Promise<void>;
}

type FetchLike = typeof fetch;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_SELECT = "id,empresa_id,codigo,nome,descricao,categoria,quantidade_estoque,quantidade_minima,preco_custo,preco_venda,localizacao,ativo,criado_em,atualizado_em";
const MAX_INTEGER = 2_147_483_647;

function localId(id: ClienteId): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new OnlineDataError("INVALID_DATA", "Um identificador SaaS não pode ser encaminhado ao banco local.");
  }
  return id;
}

function localInput(input: ProdutoInput): Omit<Produto, "id"> {
  return {
    codigo: input.codigo,
    nome: input.nome,
    descricao: input.descricao || undefined,
    categoria: input.categoria,
    quantidade_estoque: input.quantidade_estoque,
    quantidade_minima: input.quantidade_minima,
    preco_custo: input.preco_custo,
    preco_venda: input.preco_venda,
    localizacao: input.localizacao || undefined,
    atualizado_em: input.atualizado_em,
  };
}

function localSearch(rows: Produto[], busca?: string): Produto[] {
  const term = busca?.trim().toLocaleLowerCase("pt-BR");
  if (!term) return rows;
  return rows.filter((product) => [product.nome, product.codigo, product.descricao]
    .some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
}

const tauriRepository: ProdutosRepository = {
  async listar(filters, page) {
    const rows = await db.listarProdutos(
      filters.busca,
      filters.categoria,
      filters.apenasEstoqueBaixo,
    );
    const filtered = localSearch(rows, filters.busca).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR") || String(a.id).localeCompare(String(b.id)));
    return {
      items: paginateItems(filtered, page, ITEMS_PER_PAGE),
      total: filtered.length,
      insumosAbaixoMinimo: filtered.filter((product) => product.quantidade_estoque < product.quantidade_minima).length,
    };
  },
  async criar(input) {
    return db.criarProduto(localInput(input));
  },
  async atualizar(id, input) {
    return db.atualizarProduto(localId(id), localInput(input));
  },
  desativar: (id) => db.deletarProduto(localId(id)),
  registrarMovimentacao: (produtoId, tipo, quantidade, origem, referencia) =>
    db.registrarMovimentacao(localId(produtoId), tipo, quantidade, origem, referencia),
};

function searchPattern(value: string): string {
  const escaped = value.replace(/[\\%_*\"]/g, (character) => `\\${character}`);
  return `"%${escaped}%"`;
}

function addProductFilters(query: URLSearchParams, filters: ProdutosFilters): void {
  query.set("ativo", "eq.true");
  const term = filters.busca?.trim();
  if (term) {
    const pattern = searchPattern(term);
    query.set("or", `(nome.ilike.${pattern},codigo.ilike.${pattern},descricao.ilike.${pattern})`);
  }
  if (filters.categoria && filters.categoria !== "TODOS") {
    query.set("categoria", `eq.${filters.categoria}`);
  }
}

function parseTotal(response: Response): number {
  const match = response.headers.get("Content-Range")?.match(/\/(\d+)$/);
  if (!match) {
    throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não informou o total de produtos para a paginação.");
  }
  return Number(match[1]);
}

function mapHttpError(status: number, code: string | undefined, operation: string): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403 || code === "42501") return new OnlineDataError("RLS_DENIED", "Seu perfil não tem acesso a esta operação de estoque.");
  if (code === "P0001") return new OnlineDataError("INVALID_DATA", "A quantidade de saída é maior que o estoque disponível.");
  if (code === "P0002") return new OnlineDataError("CONFLICT", "O produto não está mais disponível para esta empresa.");
  if (status === 409 || code === "23505") return new OnlineDataError("CONFLICT", "Já existe um produto com estes dados nesta empresa.");
  if (operation === "PATCH" && status === 404) return new OnlineDataError("CONFLICT", "O produto mudou ou não está mais disponível. Atualize a lista e tente novamente.");
  if (status === 400 && (code === "22023" || code === "23514" || code?.startsWith("23"))) {
    return new OnlineDataError("INVALID_DATA", "Os dados do produto ou da movimentação não atendem às regras do estoque.");
  }
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Seus dados foram mantidos; tente novamente.");
}

function validateInput(input: ProdutoInput): ProdutoInput {
  const codigo = input.codigo.trim();
  const nome = input.nome.trim();
  const categoria = input.categoria.trim();
  const estoque = Number(input.quantidade_estoque);
  const minimo = Number(input.quantidade_minima);
  const custo = Number(input.preco_custo);
  const venda = Number(input.preco_venda);
  if (!codigo || !nome || !categoria
    || !Number.isSafeInteger(estoque) || estoque < 0 || estoque > MAX_INTEGER
    || !Number.isSafeInteger(minimo) || minimo < 0 || minimo > MAX_INTEGER
    || !Number.isFinite(custo) || custo < 0
    || !Number.isFinite(venda) || venda < 0) {
    throw new OnlineDataError("INVALID_DATA", "Informe código, nome, categoria, quantidades inteiras e preços válidos.");
  }
  return {
    ...input,
    codigo,
    nome,
    categoria,
    quantidade_estoque: estoque,
    quantidade_minima: minimo,
    preco_custo: custo,
    preco_venda: venda,
    descricao: input.descricao?.trim() || null,
    localizacao: input.localizacao?.trim() || null,
  };
}

function assertProduct(row: Produto<string>, session: SupabaseOnlineSession): Produto<string> {
  if (!row || typeof row.id !== "string" || !UUID_PATTERN.test(row.id) || row.empresa_id !== session.companyId) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um produto fora da empresa autenticada.");
  }
  const stock = Number(row.quantidade_estoque);
  const minimum = Number(row.quantidade_minima);
  const cost = Number(row.preco_custo);
  const price = Number(row.preco_venda);
  if (typeof row.codigo !== "string" || typeof row.nome !== "string" || typeof row.categoria !== "string"
    || !Number.isSafeInteger(stock) || stock < 0
    || !Number.isSafeInteger(minimum) || minimum < 0
    || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0
    || typeof row.ativo !== "boolean") {
    throw new OnlineDataError("INVALID_DATA", "O estoque Online retornou um produto com dados inválidos.");
  }
  return { ...row, quantidade_estoque: stock, quantidade_minima: minimum, preco_custo: cost, preco_venda: price };
}

export class SupabaseProdutosRepository implements ProdutosRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private endpoint(resource: string, query?: URLSearchParams): string {
    const serialized = query?.toString();
    return `${this.session.supabaseUrl}/rest/v1/${resource}${serialized ? `?${serialized}` : ""}`;
  }

  private async request<T>(
    resource: string,
    query: URLSearchParams | undefined,
    init: RequestInit = {},
  ): Promise<{ rows: T[]; response: Response }> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint(resource, query), {
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
      throw mapHttpError(response.status, code, init.method ?? "GET");
    }
    if (response.status === 204) return { rows: [], response };
    try {
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Expected a row array");
      return { rows: payload as T[], response };
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
    }
  }

  private filteredQuery(filters: ProdutosFilters, select: string): URLSearchParams {
    const query = new URLSearchParams({ select });
    addProductFilters(query, filters);
    query.set("empresa_id", `eq.${this.session.companyId}`);
    return query;
  }

  async listar(filters: ProdutosFilters, page: number): Promise<ProdutosPage> {
    const safePage = Math.max(1, Math.floor(page));
    const offset = (safePage - 1) * ITEMS_PER_PAGE;
    const resource = filters.apenasEstoqueBaixo ? "produtos_estoque_baixo" : "produtos";
    const query = this.filteredQuery(filters, PRODUCT_SELECT);
    query.set("order", "nome.asc,id.asc");
    query.set("limit", String(ITEMS_PER_PAGE));
    query.set("offset", String(offset));
    const { rows, response } = await this.request<Produto<string>>(resource, query, {
      method: "GET",
      headers: { Prefer: "count=exact" },
    });
    const total = parseTotal(response);
    const items = rows.map((row) => assertProduct(row, this.session));
    const insumosAbaixoMinimo = filters.apenasEstoqueBaixo
      ? total
      : await this.contarAbaixoMinimo(filters);
    return { items, total, insumosAbaixoMinimo };
  }

  private async contarAbaixoMinimo(filters: ProdutosFilters): Promise<number> {
    const query = this.filteredQuery(filters, "id");
    query.set("limit", "1");
    const { response } = await this.request<Pick<Produto<string>, "id">>("produtos_estoque_baixo", query, {
      method: "GET",
      headers: { Prefer: "count=exact" },
    });
    return parseTotal(response);
  }

  async criar(input: ProdutoInput): Promise<Produto<string>> {
    const query = new URLSearchParams({ select: PRODUCT_SELECT });
    const safe = validateInput(input);
    const { rows } = await this.request<Produto<string>>("produtos", query, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...safe,
        empresa_id: this.session.companyId,
        ativo: true,
      }),
    });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O produto não pôde ser criado para sua empresa.");
    return assertProduct(rows[0], this.session);
  }

  async atualizar(id: ClienteId, input: ProdutoInput): Promise<Produto<string>> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do produto Online é inválido.");
    }
    const safe = validateInput(input);
    const query = new URLSearchParams({
      select: PRODUCT_SELECT,
      id: `eq.${id}`,
      empresa_id: `eq.${this.session.companyId}`,
      ativo: "eq.true",
    });
    if (safe.atualizado_em) query.set("atualizado_em", `eq.${safe.atualizado_em}`);
    const { rows } = await this.request<Produto<string>>("produtos", query, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        codigo: safe.codigo,
        nome: safe.nome,
        descricao: safe.descricao,
        categoria: safe.categoria,
        quantidade_minima: safe.quantidade_minima,
        preco_custo: safe.preco_custo,
        preco_venda: safe.preco_venda,
        localizacao: safe.localizacao,
        atualizado_em: new Date().toISOString(),
      }),
    });
    if (!rows[0]) throw new OnlineDataError("CONFLICT", "O produto mudou ou não está mais disponível. Atualize a lista e tente novamente.");
    return assertProduct(rows[0], this.session);
  }

  async desativar(id: ClienteId, atualizadoEm?: string): Promise<void> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do produto Online é inválido.");
    }
    const query = new URLSearchParams({
      select: "id,empresa_id,ativo",
      id: `eq.${id}`,
      empresa_id: `eq.${this.session.companyId}`,
      ativo: "eq.true",
    });
    if (atualizadoEm) query.set("atualizado_em", `eq.${atualizadoEm}`);
    const { rows } = await this.request<Pick<Produto<string>, "id" | "empresa_id" | "ativo">>("produtos", query, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ativo: false, atualizado_em: new Date().toISOString() }),
    });
    const row = rows[0];
    if (!row) throw new OnlineDataError("CONFLICT", "O produto mudou ou não está mais disponível. Atualize a lista e tente novamente.");
    if (row.empresa_id !== this.session.companyId || row.ativo !== false) {
      throw new OnlineDataError("RLS_DENIED", "O produto não está disponível para sua empresa.");
    }
  }

  async registrarMovimentacao(
    produtoId: ClienteId,
    tipo: "ENTRADA" | "SAIDA",
    quantidade: number,
    origem: string,
    referencia?: string,
  ): Promise<void> {
    if (typeof produtoId !== "string" || !UUID_PATTERN.test(produtoId)
      || !["ENTRADA", "SAIDA"].includes(tipo)
      || !Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > MAX_INTEGER
      || !origem.trim()) {
      throw new OnlineDataError("INVALID_DATA", "Informe um produto, tipo, origem e quantidade válida para movimentar o estoque.");
    }
    const { rows } = await this.request<{ movimentacao_id: string; produto_id: string; quantidade_estoque: number }>(
      "rpc/registrar_movimentacao_estoque",
      undefined,
      {
        method: "POST",
        body: JSON.stringify({
          p_produto_id: produtoId,
          p_tipo: tipo,
          p_quantidade: quantidade,
          p_origem: origem.trim(),
          p_referencia: referencia?.trim() || null,
        }),
      },
    );
    if (!rows[0] || rows[0].produto_id !== produtoId || !UUID_PATTERN.test(rows[0].movimentacao_id)
      || !Number.isSafeInteger(Number(rows[0].quantidade_estoque)) || Number(rows[0].quantidade_estoque) < 0) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não confirmou a movimentação do estoque. Atualize a lista antes de tentar novamente.");
    }
  }
}

export async function carregarRepositorioProdutos(): Promise<ProdutosRepository> {
  if (!IS_SAAS_BUILD) return tauriRepository;
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseProdutosRepository(sessionFromSaasSession(session));
}
