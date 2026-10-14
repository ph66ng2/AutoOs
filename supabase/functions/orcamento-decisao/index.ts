// Aceite online de orçamento. O token de capacidade chega no corpo de um POST; a função
// só chama as funções SQL `consultar_orcamento_decisao`, `registrar_resposta_orcamento` e
// `registrar_solicitacao_orcamento`, que conferem versão, prazo, etapa e resposta vigente
// numa única operação. Nenhuma tabela é lida ou escrita diretamente.

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_BODY_BYTES = 4_096;
const READ_LIMIT_PER_MINUTE = 30;
const WRITE_LIMIT_PER_MINUTE = 10;
const CLIENT_RATE_LIMIT_PER_MINUTE = 60;

type Action = "consultar" | "responder" | "solicitar";
const ACTIONS = new Set<Action>(["consultar", "responder", "solicitar"]);
const DECISIONS = new Set(["APROVAR", "RECUSAR", "DESFEITA"]);
const REQUEST_KINDS = new Set(["DUVIDA", "MUDANCA"]);

const UNAVAILABLE = { erro: "Orçamento indisponível." };

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), ...extraHeaders },
  });
}

function allowedOrigins() {
  const origins = new Set([Deno.env.get("PUBLIC_STATUS_ORIGIN") ?? "https://status.bmitag.com.br"]);
  if (Deno.env.get("PUBLIC_STATUS_ALLOW_LOCAL_ORIGINS") === "true") {
    origins.add("http://localhost:1420");
    origins.add("http://localhost:5173");
  }
  return origins;
}

function getServerKey(): string | null {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.length > 0) return keys.default;
    } catch {
      console.error("orcamento_decisao_secret_keys_invalid");
      return null;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

function serviceHeaders(key: string): Headers {
  const headers = new Headers({ apikey: key, "Content-Type": "application/json" });
  // Chaves JWT legadas precisam de Authorization; chaves sb_secret ficam só em apikey.
  if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacFingerprint(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function consumeRateLimit(
  supabaseUrl: string,
  serverKey: string,
  fingerprint: string,
  limit: number,
): Promise<boolean | null> {
  const bucketMillis = Math.floor(Date.now() / 60_000) * 60_000;
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/consumir_limite_status_publico`, {
    method: "POST",
    headers: serviceHeaders(serverKey),
    body: JSON.stringify({
      p_fingerprint: fingerprint,
      p_janela_inicio: new Date(bucketMillis).toISOString(),
      p_limite: limit,
    }),
  });
  if (!result.ok) {
    console.error("orcamento_decisao_rate_limit_unavailable", result.status);
    return null;
  }
  try {
    return await result.json() === true;
  } catch {
    console.error("orcamento_decisao_rate_limit_response_invalid");
    return null;
  }
}

async function readBoundedText(request: Request, maximumBytes: number): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

type RpcResult = { ok: true; data: unknown } | { ok: false; code: string; status: number };

async function callRpc(
  supabaseUrl: string,
  serverKey: string,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders(serverKey),
    body: JSON.stringify(args),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Corpo vazio ou inválido: tratado abaixo.
  }
  if (response.ok) return { ok: true, data: payload };
  const message = typeof (payload as { message?: unknown } | null)?.message === "string"
    ? (payload as { message: string }).message
    : "";
  return { ok: false, code: message.trim(), status: response.status };
}

function mapRpcError(error: { code: string; status: number }, origin: string | null) {
  switch (error.code) {
    // Pausa, link vencido/revogado, versão encerrada ou etapa mudada: mesma resposta pública.
    case "ACEITE_PAUSADO":
    case "LINK_INDISPONIVEL":
      return jsonResponse(UNAVAILABLE, 404, origin);
    case "RESPOSTA_DESATUALIZADA":
      return jsonResponse({ erro: "A resposta mudou. Atualize a página e confira antes de continuar.", codigo: "DESATUALIZADA" }, 409, origin);
    case "RESPOSTA_JA_APLICADA":
      return jsonResponse({ erro: "A equipe já registrou a decisão. Use “Pedir mudança”.", codigo: "JA_APLICADA" }, 409, origin);
    case "NADA_A_DESFAZER":
      return jsonResponse({ erro: "Não há resposta para desfazer.", codigo: "NADA_A_DESFAZER" }, 409, origin);
    case "LIMITE_SOLICITACOES":
      return jsonResponse({ erro: "Você já enviou mensagens demais. Aguarde um pouco ou fale com a equipe.", codigo: "LIMITE" }, 429, origin, { "Retry-After": "3600" });
    case "DECISAO_INVALIDA":
    case "TIPO_INVALIDO":
    case "MENSAGEM_INVALIDA":
      return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
    default:
      console.error("orcamento_decisao_rpc_failed", error.status, error.code.slice(0, 80));
      return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as Record<string, unknown> : null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");

  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ erro: "Origem não permitida." }, 403, null);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "600",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ erro: "Método não permitido." }, 405, origin, { Allow: "POST, OPTIONS" });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverKey = getServerKey();
  const rateLimitSecret = Deno.env.get("PUBLIC_STATUS_RATE_LIMIT_SECRET");
  if (!supabaseUrl || !serverKey || !rateLimitSecret || rateLimitSecret.length < 32) {
    console.error("orcamento_decisao_server_configuration_missing");
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }

  const bodyText = await readBoundedText(request, MAX_BODY_BYTES);
  if (bodyText === null) return jsonResponse(UNAVAILABLE, 404, origin);

  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    input = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(UNAVAILABLE, 404, origin);
  }

  const token = input.token;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return jsonResponse(UNAVAILABLE, 404, origin);
  const action = input.acao;
  if (typeof action !== "string" || !ACTIONS.has(action as Action)) {
    return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
  }

  // Validação de parâmetros antes de gastar limite ou consultar o banco.
  let decision = "";
  let currentResponseId = 0;
  let requestKind = "";
  let message = "";
  if (action === "responder") {
    decision = typeof input.decisao === "string" ? input.decisao : "";
    const id = input.respostaVigenteId ?? 0;
    if (!DECISIONS.has(decision) || typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) {
      return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
    }
    currentResponseId = id;
  } else if (action === "solicitar") {
    requestKind = typeof input.tipo === "string" ? input.tipo : "";
    message = typeof input.mensagem === "string" ? input.mensagem.trim() : "";
    if (!REQUEST_KINDS.has(requestKind) || message.length < 1 || message.length > 500) {
      return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
    }
  }

  // O gateway do Supabase define CF-Connecting-IP; X-Forwarded-For e X-Real-IP não são confiáveis.
  const gatewayIp = request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  if (gatewayIp && gatewayIp.length <= 45 && /^[0-9a-f:.]+$/.test(gatewayIp)) {
    const clientOk = await consumeRateLimit(
      supabaseUrl, serverKey, await hmacFingerprint(rateLimitSecret, `orcamento:client:${gatewayIp}`),
      CLIENT_RATE_LIMIT_PER_MINUTE,
    );
    if (clientOk === null) return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
    if (!clientOk) {
      return jsonResponse({ erro: "Aguarde um minuto e tente novamente." }, 429, origin, { "Retry-After": "60" });
    }
  }

  const tokenHash = toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
  const tokenOk = await consumeRateLimit(
    supabaseUrl, serverKey, await hmacFingerprint(rateLimitSecret, `orcamento:token:${action === "consultar" ? "r" : "w"}:${tokenHash}`),
    action === "consultar" ? READ_LIMIT_PER_MINUTE : WRITE_LIMIT_PER_MINUTE,
  );
  if (tokenOk === null) return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  if (!tokenOk) {
    return jsonResponse({ erro: "Aguarde um minuto e tente novamente." }, 429, origin, { "Retry-After": "60" });
  }

  if (action === "consultar") {
    const result = await callRpc(supabaseUrl, serverKey, "consultar_orcamento_decisao", { p_token_hash: tokenHash });
    if (!result.ok) return mapRpcError(result, origin);
    const data = firstRow(result.data);
    if (!data) return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
    return jsonResponse(data, 200, origin);
  }

  if (action === "responder") {
    const result = await callRpc(supabaseUrl, serverKey, "registrar_resposta_orcamento", {
      p_token_hash: tokenHash,
      p_decisao: decision,
      p_resposta_vigente_id: currentResponseId,
    });
    if (!result.ok) return mapRpcError(result, origin);
    const row = firstRow(result.data);
    if (!row) return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
    return jsonResponse({
      respostaId: row.resposta_id,
      decisao: row.decisao,
      registradaEm: row.registrada_em,
      janelaAte: row.janela_ate,
      repetida: row.repetida === true,
    }, 200, origin);
  }

  const result = await callRpc(supabaseUrl, serverKey, "registrar_solicitacao_orcamento", {
    p_token_hash: tokenHash,
    p_tipo: requestKind,
    p_mensagem: message,
  });
  if (!result.ok) return mapRpcError(result, origin);
  const row = firstRow(result.data);
  if (!row) return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  return jsonResponse({ recebidaEm: row.criado_em }, 200, origin);
});

export {};
