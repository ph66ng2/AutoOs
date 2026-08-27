import { validarCNPJ } from "@/lib/validations";
import { db } from "@/lib/db";

const BRASIL_API_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1";
const DEFAULT_TIMEOUT_MS = 8_000;

export type CnpjLookupErrorCode =
  | "invalid"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "offline";

export interface CnpjLookupResult {
  fonte: "BrasilAPI" | "CNPJ.ws";
  razao_social: string;
  nome_fantasia: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  situacao_cadastral: string;
}

export class CnpjLookupError extends Error {
  readonly code: CnpjLookupErrorCode;

  constructor(code: CnpjLookupErrorCode, message: string) {
    super(message);
    this.name = "CnpjLookupError";
    this.code = code;
  }
}

/**
 * Interface do provedor para manter o formulário independente da BrasilAPI.
 * O DTO bruto permanece privado ao serviço; um provedor alternativo só precisa
 * entregar um objeto que possa ser normalizado por `normalizarResposta`.
 */
export interface CnpjLookupProvider {
  buscar(cnpj: string, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface CnpjLookupOptions {
  timeoutMs?: number;
  provider?: CnpjLookupProvider;
  /** Injeção usada apenas pelos testes do adaptador HTTP legado. */
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

interface BrasilApiCnpjResponse {
  razao_social?: unknown;
  nome_fantasia?: unknown;
  ddd_telefone_1?: unknown;
  ddd_telefone_2?: unknown;
  telefone?: unknown;
  email?: unknown;
  cep?: unknown;
  logradouro?: unknown;
  endereco?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  municipio?: unknown;
  cidade?: unknown;
  uf?: unknown;
  situacao_cadastral?: unknown;
  descricao_situacao_cadastral?: unknown;
  estabelecimento?: {
    nome_fantasia?: unknown;
    ddd1?: unknown;
    telefone1?: unknown;
    email?: unknown;
    cep?: unknown;
    logradouro?: unknown;
    numero?: unknown;
    complemento?: unknown;
    bairro?: unknown;
    cidade?: { nome?: unknown } | null;
    estado?: { sigla?: unknown } | null;
    situacao_cadastral?: unknown;
  } | null;
}

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`BrasilAPI respondeu com HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

const cache = new Map<string, CnpjLookupResult>();
const inFlight = new Map<string, Promise<CnpjLookupResult>>();

function somenteDigitos(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function texto(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function normalizarResposta(payload: unknown): CnpjLookupResult {
  const data = (payload && typeof payload === "object" ? payload : {}) as BrasilApiCnpjResponse;
  const estabelecimento = data.estabelecimento;
  const telefoneAlternativo = estabelecimento
    ? `${texto(estabelecimento.ddd1)}${texto(estabelecimento.telefone1)}`
    : "";

  return {
    fonte: estabelecimento ? "CNPJ.ws" : "BrasilAPI",
    razao_social: texto(data.razao_social),
    nome_fantasia: texto(data.nome_fantasia) || texto(estabelecimento?.nome_fantasia),
    telefone: texto(data.ddd_telefone_1 || data.ddd_telefone_2 || data.telefone) || telefoneAlternativo,
    email: texto(data.email) || texto(estabelecimento?.email),
    cep: texto(data.cep) || texto(estabelecimento?.cep),
    endereco: texto(data.logradouro || data.endereco) || texto(estabelecimento?.logradouro),
    numero: texto(data.numero) || texto(estabelecimento?.numero),
    complemento: texto(data.complemento) || texto(estabelecimento?.complemento),
    bairro: texto(data.bairro) || texto(estabelecimento?.bairro),
    cidade: texto(data.municipio || data.cidade) || texto(estabelecimento?.cidade?.nome),
    uf: texto(data.uf) || texto(estabelecimento?.estado?.sigla),
    situacao_cadastral: texto(data.descricao_situacao_cadastral || data.situacao_cadastral) || texto(estabelecimento?.situacao_cadastral),
  };
}

function erroHttp(status: number): CnpjLookupError {
  if (status === 400) {
    return new CnpjLookupError("invalid", "O CNPJ informado foi rejeitado pela consulta.");
  }
  if (status === 404) {
    return new CnpjLookupError("not_found", "CNPJ não encontrado na base consultada.");
  }
  if (status === 429) {
    return new CnpjLookupError("rate_limited", "O limite de consultas foi atingido. Tente novamente mais tarde.");
  }
  return new CnpjLookupError("unavailable", "O serviço de consulta está indisponível no momento.");
}

class BrasilApiProvider implements CnpjLookupProvider {
  constructor(private readonly fetcher: typeof fetch) {}

  async buscar(cnpj: string, options?: { signal?: AbortSignal }): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${BRASIL_API_CNPJ_URL}/${cnpj}`, {
        method: "GET",
        signal: options?.signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      throw error;
    }

    if (!response.ok) {
      throw new HttpStatusError(response.status);
    }

    try {
      return await response.json();
    } catch {
      throw new CnpjLookupError("unavailable", "A resposta da consulta não pôde ser interpretada.");
    }
  }
}

/**
 * A consulta passa pelo processo Rust para não depender do CSP/CORS do WebView.
 * O backend já aplica timeout e traduz erros HTTP em códigos consumidos abaixo.
 */
class TauriCnpjProvider implements CnpjLookupProvider {
  async buscar(cnpj: string): Promise<unknown> {
    return db.consultarCnpj(cnpj);
  }
}

function erroDoBackend(error: unknown): CnpjLookupError | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /^CNPJ_LOOKUP\|(invalid|not_found|rate_limited|unavailable|timeout|offline)\|(.+)$/s.exec(message);
  if (!match) return null;

  return new CnpjLookupError(match[1] as CnpjLookupErrorCode, match[2]);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function isTimeoutError(error: unknown, timedOut: boolean): boolean {
  return timedOut && isAbortError(error);
}

function isLikelyNetworkError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof DOMException || error instanceof Error;
}

function mensagemErroGenerica(code: CnpjLookupErrorCode): string {
  switch (code) {
    case "invalid":
      return "Informe um CNPJ válido para consultar.";
    case "not_found":
      return "CNPJ não encontrado na base consultada.";
    case "rate_limited":
      return "O limite de consultas foi atingido. Tente novamente mais tarde.";
    case "timeout":
      return "A consulta demorou mais que o esperado. O preenchimento manual continua disponível.";
    case "offline":
      return "Não foi possível conectar à consulta. Verifique a internet; o preenchimento manual continua disponível.";
    case "unavailable":
      return "A consulta está indisponível no momento. O preenchimento manual continua disponível.";
  }
}

async function consultarSemCache(
  cnpj: string,
  options: CnpjLookupOptions,
): Promise<CnpjLookupResult> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let removeExternalAbortListener: (() => void) | undefined;

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      const abortExternalRequest = () => controller.abort();
      options.signal.addEventListener("abort", abortExternalRequest, { once: true });
      removeExternalAbortListener = () => options.signal?.removeEventListener("abort", abortExternalRequest);
    }
  }

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const provider = options.provider
      ?? (options.fetcher ? new BrasilApiProvider(options.fetcher) : new TauriCnpjProvider());
    const payload = await provider.buscar(cnpj, { signal: controller.signal });
    const result = normalizarResposta(payload);
    cache.set(cnpj, result);
    return result;
  } catch (error) {
    if (error instanceof CnpjLookupError) {
      throw error;
    }
    if (error instanceof HttpStatusError) {
      throw erroHttp(error.status);
    }
    const backendError = erroDoBackend(error);
    if (backendError) {
      throw backendError;
    }
    if (isTimeoutError(error, timedOut)) {
      throw new CnpjLookupError("timeout", mensagemErroGenerica("timeout"));
    }
    if (isAbortError(error) && options.signal?.aborted) {
      throw new CnpjLookupError("offline", mensagemErroGenerica("offline"));
    }
    if (isLikelyNetworkError(error)) {
      throw new CnpjLookupError("offline", mensagemErroGenerica("offline"));
    }
    throw new CnpjLookupError("unavailable", mensagemErroGenerica("unavailable"));
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    removeExternalAbortListener?.();
  }
}

/**
 * Consulta manualmente um CNPJ e devolve somente o modelo usado pelo formulário.
 * O cache e a deduplicação ficam no módulo para durar durante a sessão do app.
 */
export function consultarCnpj(
  cnpj: string,
  options: CnpjLookupOptions = {},
): Promise<CnpjLookupResult> {
  const numeros = somenteDigitos(cnpj);
  if (!validarCNPJ(numeros)) {
    return Promise.reject(new CnpjLookupError("invalid", mensagemErroGenerica("invalid")));
  }

  const cached = cache.get(numeros);
  if (cached) return Promise.resolve(cached);

  const running = inFlight.get(numeros);
  if (running) return running;

  const request = consultarSemCache(numeros, options);
  inFlight.set(numeros, request);
  void request.then(
    () => {
      if (inFlight.get(numeros) === request) inFlight.delete(numeros);
    },
    () => {
      if (inFlight.get(numeros) === request) inFlight.delete(numeros);
    },
  );
  return request;
}

/** Limpa o cache da sessão; útil para logout e para isolamento dos testes. */
export function limparCacheCnpj(): void {
  cache.clear();
}
