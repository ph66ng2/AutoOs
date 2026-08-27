import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consultarCnpj,
  CnpjLookupError,
  limparCacheCnpj,
} from "@/lib/cnpj-service";
import { db } from "@/lib/db";

const CNPJ = "57522734000158";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const respostaCompleta = {
  razao_social: "BMITAG TECNOLOGIA LTDA",
  nome_fantasia: "BMITAG",
  ddd_telefone_1: "7133224455",
  email: "contato@exemplo.test",
  cep: "40000000",
  logradouro: "Rua da Tecnologia",
  numero: "123",
  complemento: "Sala 4",
  bairro: "Centro",
  municipio: "Salvador",
  uf: "BA",
  situacao_cadastral: 2,
  descricao_situacao_cadastral: "ATIVA",
};

const respostaCnpjWs = {
  razao_social: "BMITAG TECNOLOGIA LTDA",
  estabelecimento: {
    nome_fantasia: "BMITAG",
    ddd1: "71",
    telefone1: "81986455",
    email: "contato@exemplo.test",
    cep: "40000000",
    logradouro: "Rua da Tecnologia",
    numero: "123",
    complemento: "Sala 4",
    bairro: "Centro",
    cidade: { nome: "Salvador" },
    estado: { sigla: "BA" },
    situacao_cadastral: "Ativa",
  },
};

describe("consultarCnpj", () => {
  beforeEach(() => {
    limparCacheCnpj();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normaliza a resposta completa da BrasilAPI", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(respostaCompleta));

    await expect(consultarCnpj("57.522.734/0001-58", { fetcher })).resolves.toEqual({
      fonte: "BrasilAPI",
      razao_social: "BMITAG TECNOLOGIA LTDA",
      nome_fantasia: "BMITAG",
      telefone: "7133224455",
      email: "contato@exemplo.test",
      cep: "40000000",
      endereco: "Rua da Tecnologia",
      numero: "123",
      complemento: "Sala 4",
      bairro: "Centro",
      cidade: "Salvador",
      uf: "BA",
      situacao_cadastral: "ATIVA",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://brasilapi.com.br/api/cnpj/v1/${CNPJ}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normaliza campos opcionais ausentes como strings vazias", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ razao_social: "Empresa sem detalhes", municipio: "Feira de Santana" }),
    );

    await expect(consultarCnpj(CNPJ, { fetcher })).resolves.toMatchObject({
      razao_social: "Empresa sem detalhes",
      cidade: "Feira de Santana",
      nome_fantasia: "",
      telefone: "",
      cep: "",
      situacao_cadastral: "",
    });
  });

  it("normaliza a resposta alternativa do CNPJ.ws", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(respostaCnpjWs));

    await expect(consultarCnpj(CNPJ, { fetcher })).resolves.toMatchObject({
      razao_social: "BMITAG TECNOLOGIA LTDA",
      fonte: "CNPJ.ws",
      nome_fantasia: "BMITAG",
      telefone: "7181986455",
      cidade: "Salvador",
      uf: "BA",
      situacao_cadastral: "Ativa",
    });
  });

  it("usa o comando Tauri por padrão, evitando bloqueios de CSP do WebView", async () => {
    const consultarNoBackend = vi.spyOn(db, "consultarCnpj").mockResolvedValue(respostaCompleta);

    await expect(consultarCnpj(CNPJ)).resolves.toMatchObject({
      razao_social: "BMITAG TECNOLOGIA LTDA",
      situacao_cadastral: "ATIVA",
    });

    expect(consultarNoBackend).toHaveBeenCalledWith(CNPJ);
  });

  it("rejeita CNPJ inválido sem fazer chamada HTTP", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(consultarCnpj("57.522.734/0001-59", { fetcher })).rejects.toMatchObject({
      code: "invalid",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [400, "invalid"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "unavailable"],
  ] as const)("mapeia HTTP %s para %s", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, status));

    await expect(consultarCnpj(CNPJ, { fetcher })).rejects.toMatchObject({ code });
  });

  it("mapeia timeout e erro de rede", async () => {
    const timeoutFetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    );

    await expect(consultarCnpj(CNPJ, { fetcher: timeoutFetcher, timeoutMs: 5 })).rejects.toMatchObject({
      code: "timeout",
    });

    limparCacheCnpj();
    const offlineFetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(consultarCnpj(CNPJ, { fetcher: offlineFetcher })).rejects.toMatchObject({
      code: "offline",
    });
  });

  it("usa cache e deduplica chamadas simultâneas para o mesmo CNPJ", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const first = consultarCnpj(CNPJ, { fetcher });
    const second = consultarCnpj("57.522.734/0001-58", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveRequest?.(response(respostaCompleta));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await consultarCnpj(CNPJ, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserva erros tipados de um provedor substituível", async () => {
    const provider = {
      buscar: vi.fn().mockRejectedValue(new CnpjLookupError("not_found", "não encontrado")),
    };

    await expect(consultarCnpj(CNPJ, { provider })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(provider.buscar).toHaveBeenCalledWith(CNPJ, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
