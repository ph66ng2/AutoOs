// Portal das Impressoras do Cliente (status.bmitag.com.br).
//
// Entrada: CPF/CNPJ + senha que a equipe cria para cada contato → sessão. Antes de responder a um
// orçamento, a senha é pedida de novo se a última conferência tiver mais de alguns minutos. Não
// há login por código (removido na 0038). O navegador nunca recebe chave do Supabase; esta função
// chega ao banco só pelas funções `portal_*` (SECURITY DEFINER, 0035/0036/0038).
// Não funciona como o link individual `#/c/<token>`, que continua na função `public-status`.

import { STATUS_COPY, STATUS_COPY_FALLBACK } from "../_shared/status-copy.ts";

const MAX_BODY_BYTES = 4_096;
const CLIENT_LIMIT_PER_MINUTE = 60;
const PASSWORD_WINDOW_MS = 15 * 60_000;
const VERIFY_LIMIT_PER_MINUTE = 20;
const PASSWORD_ATTEMPTS_PER_DOCUMENT = 8;
const MAX_PASSWORD_BYTES = 72;
const SESSION_PATTERN = /^[a-f0-9]{64}$/;

type Json = Record<string, unknown>;
type RpcResult = { ok: true; data: unknown } | { ok: false; status: number; code: string };

/** Erros do banco que viram resposta ao cliente. O resto é 503 genérico (nunca o texto do banco). */
const DB_ERRORS: Record<string, { status: number; erro: string }> = {
  PORTAL_PAUSADO: { status: 503, erro: "O portal está temporariamente indisponível. Fale com a equipe BMI TAG." },
  SESSAO_INVALIDA: { status: 401, erro: "Sua sessão terminou. Entre novamente." },
  ATENDIMENTO_INDISPONIVEL: { status: 404, erro: "Este atendimento não está disponível para o seu acesso." },
  SEM_PERMISSAO_DECISAO: { status: 403, erro: "Seu contato pode acompanhar, mas não responder a orçamentos. Fale com a equipe para liberar." },
  ACEITE_PAUSADO: { status: 409, erro: "As respostas pelo portal estão pausadas. Use o contato da equipe." },
  VERIFICACAO_NECESSARIA: { status: 428, erro: "Por segurança, digite sua senha de novo antes de responder." },
  PROPOSTA_ALTERADA: { status: 409, erro: "A proposta mudou enquanto a página estava aberta. Releia a versão atual antes de responder." },
  PROPOSTA_VENCIDA: { status: 409, erro: "O prazo desta proposta terminou. Fale com a equipe para renovar." },
  RESPOSTA_DESATUALIZADA: { status: 409, erro: "A resposta deste orçamento mudou em outra tela. Atualizamos a página para você conferir." },
  RESPOSTA_DE_OUTRO_CONTATO: { status: 409, erro: "Outro contato já respondeu. Só quem respondeu pode mudar de ideia no prazo; use “Quero negociar” ou fale com a equipe." },
  RESPOSTA_JA_REGISTRADA: { status: 409, erro: "Já existe uma resposta registrada por outro canal. Fale com a equipe para alterá-la." },
  RESPOSTA_JA_EFETIVADA: { status: 409, erro: "A resposta já foi efetivada. Use “Solicitar correção”." },
  PRAZO_CORRECAO_ENCERRADO: { status: 409, erro: "O prazo para mudar de ideia terminou. Use “Solicitar correção”." },
  NADA_A_DESFAZER: { status: 409, erro: "Não há resposta para cancelar." },
  LIMITE_RESPOSTAS: { status: 429, erro: "Muitas alterações nesta proposta. Fale com a equipe." },
  LIMITE_SOLICITACOES: { status: 429, erro: "Muitas mensagens em pouco tempo. Aguarde ou fale com a equipe." },
  SOLICITACAO_INDISPONIVEL: { status: 409, erro: "Esta solicitação não está disponível agora." },
  DECISAO_INVALIDA: { status: 400, erro: "Requisição inválida." },
  TIPO_INVALIDO: { status: 400, erro: "Requisição inválida." },
  MENSAGEM_INVALIDA: { status: 400, erro: "Escreva uma mensagem de até 500 caracteres." },
};

const SERVICE_UNAVAILABLE = "Serviço temporariamente indisponível. Tente novamente em instantes.";

function responseHeaders(origin: string | null): Record<string, string> {
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

function json(body: Json, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...responseHeaders(origin), ...extra } });
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
      console.error("portal_cliente_secret_keys_invalid");
      return null;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

function serviceHeaders(key: string): Headers {
  const headers = new Headers({ apikey: key, "Content-Type": "application/json" });
  if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function callRpc(url: string, key: string, name: string, args: Json): Promise<RpcResult> {
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify(args),
    });
  } catch {
    console.error("portal_cliente_rpc_unreachable", name);
    return { ok: false, status: 503, code: "INDISPONIVEL" };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.ok) return { ok: true, data: payload };
  const message = (payload as { message?: unknown } | null)?.message;
  const code = typeof message === "string" && /^[A-Z_]+$/.test(message) ? message : "INDISPONIVEL";
  if (code === "INDISPONIVEL") console.error("portal_cliente_rpc_failed", name, response.status);
  return { ok: false, status: response.status, code };
}

function errorResponse(code: string, origin: string | null) {
  const mapped = DB_ERRORS[code];
  if (!mapped) return json({ erro: SERVICE_UNAVAILABLE }, 503, origin);
  return json({ erro: mapped.erro, codigo: code }, mapped.status, origin);
}

async function consumeLimit(url: string, key: string, fingerprint: string, windowStart: number, limit: number) {
  const result = await callRpc(url, key, "consumir_limite_status_publico", {
    p_fingerprint: fingerprint,
    p_janela_inicio: new Date(windowStart).toISOString(),
    p_limite: limit,
  });
  if (!result.ok) return null;
  return result.data === true;
}

async function readBoundedText(request: Request, maximumBytes: number): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
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

function digits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

type Context = { url: string; key: string; secret: string; origin: string | null; verifyFingerprint: string | null };

async function passwordLogin(context: Context, body: Json) {
  const documento = digits(body.documento);
  const senha = typeof body.senha === "string" ? body.senha : "";
  if (![11, 14].includes(documento.length) || senha.length === 0 || new TextEncoder().encode(senha).length > MAX_PASSWORD_BYTES) {
    return json({ erro: "CPF/CNPJ ou senha incorretos.", codigo: "SENHA_INVALIDA" }, 400, context.origin);
  }
  const windowStart = Math.floor(Date.now() / PASSWORD_WINDOW_MS) * PASSWORD_WINDOW_MS;
  const docFingerprint = await hmac(context.secret, `portal-cliente:senha:${documento}`);
  const underLimit = await consumeLimit(context.url, context.key, docFingerprint, windowStart, PASSWORD_ATTEMPTS_PER_DOCUMENT);
  if (underLimit === null) return json({ erro: SERVICE_UNAVAILABLE }, 503, context.origin);
  if (!underLimit) {
    return json({ erro: "Muitas tentativas para este CPF/CNPJ. Aguarde 15 minutos.", codigo: "LIMITE_SENHA" }, 429, context.origin, { "Retry-After": "900" });
  }
  const newSession = randomToken();
  const result = await callRpc(context.url, context.key, "portal_entrar_senha", {
    p_documento: documento,
    p_senha: senha,
    p_nova_sessao_hash: await sha256(newSession),
  });
  if (!result.ok) return errorResponse(result.code, context.origin);
  const data = result.data as Json;
  if (data.resultado !== "OK") {
    return json({ erro: "CPF/CNPJ ou senha incorretos.", codigo: "SENHA_INVALIDA" }, 400, context.origin);
  }
  return json({ sessao: newSession, contato: data.contato, acesso: data.acesso, expiraEm: data.expiraEm }, 200, context.origin);
}

async function confirmPassword(context: Context, body: Json, sessionHash: string) {
  const senha = typeof body.senha === "string" ? body.senha : "";
  if (senha.length === 0 || new TextEncoder().encode(senha).length > MAX_PASSWORD_BYTES) {
    return json({ erro: "Senha incorreta.", codigo: "SENHA_INVALIDA" }, 400, context.origin);
  }
  if (context.verifyFingerprint) {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    const ok = await consumeLimit(context.url, context.key, context.verifyFingerprint, minute, VERIFY_LIMIT_PER_MINUTE);
    if (ok === null) return json({ erro: SERVICE_UNAVAILABLE }, 503, context.origin);
    if (!ok) return json({ erro: "Muitas tentativas. Aguarde um minuto." }, 429, context.origin, { "Retry-After": "60" });
  }
  const result = await callRpc(context.url, context.key, "portal_reverificar_senha", { p_sessao_hash: sessionHash, p_senha: senha });
  if (!result.ok) return errorResponse(result.code, context.origin);
  if (result.data !== true) return json({ erro: "Senha incorreta.", codigo: "SENHA_INVALIDA" }, 400, context.origin);
  return json({ ok: true }, 200, context.origin);
}

const ORIENTACAO_ORCAMENTO: Record<string, string> = {
  ABERTA: "Confira a proposta e responda por aqui. Para negociar valores ou itens, use “Quero negociar”.",
  RESPONDIDA: "Sua resposta ao orçamento foi registrada. O andamento dela aparece no quadro do orçamento.",
  EM_REVISAO: "A equipe está revisando a proposta. A nova versão aparece aqui quando for publicada.",
  VENCIDA: "O prazo desta proposta terminou. Fale com a equipe BMI TAG para renová-la.",
};

function publicDetail(data: Json): Json {
  const status = typeof data.status === "string" ? data.status : "";
  const copy = STATUS_COPY[status] ?? STATUS_COPY_FALLBACK;
  const orcamento = data.orcamento as Json | null;
  // O texto do link individual manda falar com a equipe; aqui a resposta é pelo portal.
  const orientation = status === "AGUARDANDO_APROVACAO" && orcamento
    ? ORIENTACAO_ORCAMENTO[String(orcamento.estado)] ?? copy.orientation
    : copy.orientation;
  return { ...data, titulo: copy.title, orientacao: orientation };
}

function publicList(data: Json): Json {
  const items = Array.isArray(data.atendimentos) ? data.atendimentos as Json[] : [];
  return {
    ...data,
    atendimentos: items.map((item) => ({
      ...item,
      titulo: (STATUS_COPY[String(item.status ?? "")] ?? STATUS_COPY_FALLBACK).title,
    })),
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) return json({ erro: "Origem não permitida." }, 403, null);
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
  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405, origin, { Allow: "POST, OPTIONS" });
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" || Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ erro: "Requisição inválida." }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = getServerKey();
  const secret = Deno.env.get("PORTAL_CLIENTE_SECRET");
  const rateSecret = Deno.env.get("PUBLIC_STATUS_RATE_LIMIT_SECRET");
  if (!url || !key || !secret || secret.length < 32 || !rateSecret || rateSecret.length < 32) {
    console.error("portal_cliente_server_configuration_missing");
    return json({ erro: SERVICE_UNAVAILABLE }, 503, origin);
  }

  const text = await readBoundedText(request, MAX_BODY_BYTES);
  let body: Json;
  try {
    body = JSON.parse(text ?? "") as Json;
  } catch {
    return json({ erro: "Requisição inválida." }, 400, origin);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ erro: "Requisição inválida." }, 400, origin);

  // Mesmo critério do link individual: só o IP definido pelo gateway do Supabase.
  const gatewayIp = request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  let verifyFingerprint: string | null = null;
  if (gatewayIp && gatewayIp.length <= 45 && /^[0-9a-f:.]+$/.test(gatewayIp)) {
    const clientFingerprint = await hmac(rateSecret, `portal-cliente:client:${gatewayIp}`);
    verifyFingerprint = await hmac(rateSecret, `portal-cliente:verify:${gatewayIp}`);
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    const ok = await consumeLimit(url, key, clientFingerprint, minute, CLIENT_LIMIT_PER_MINUTE);
    if (ok === null) return json({ erro: SERVICE_UNAVAILABLE }, 503, origin);
    if (!ok) return json({ erro: "Aguarde um minuto e tente novamente." }, 429, origin, { "Retry-After": "60" });
  }

  const context: Context = { url, key, secret, origin, verifyFingerprint };
  const acao = body.acao;
  if (acao === "entrarSenha") return await passwordLogin(context, body);

  const sessionToken = typeof body.sessao === "string" ? body.sessao.toLowerCase() : null;
  if (sessionToken !== null && !SESSION_PATTERN.test(sessionToken)) return errorResponse("SESSAO_INVALIDA", origin);
  const sessionHash = sessionToken ? await sha256(sessionToken) : null;

  if (!sessionHash) return errorResponse("SESSAO_INVALIDA", origin);

  if (acao === "confirmarSenha") return await confirmPassword(context, body, sessionHash);

  if (acao === "sair") {
    await callRpc(url, key, "portal_encerrar_sessao", { p_sessao_hash: sessionHash });
    return json({ ok: true }, 200, origin);
  }

  if (acao === "listar") {
    const result = await callRpc(url, key, "portal_listar_atendimentos", { p_sessao_hash: sessionHash });
    return result.ok ? json(publicList(result.data as Json), 200, origin) : errorResponse(result.code, origin);
  }

  const equipamentoId = positiveInt(body.equipamentoId);
  if (!equipamentoId) return json({ erro: "Requisição inválida." }, 400, origin);

  if (acao === "detalhe") {
    const result = await callRpc(url, key, "portal_detalhe_atendimento", {
      p_sessao_hash: sessionHash, p_equipamento_id: equipamentoId,
    });
    return result.ok ? json(publicDetail(result.data as Json), 200, origin) : errorResponse(result.code, origin);
  }

  const versaoId = positiveInt(body.versaoId);
  if (!versaoId) return json({ erro: "Requisição inválida." }, 400, origin);

  if (acao === "responder") {
    const decisao = body.decisao;
    if (decisao !== "APROVAR" && decisao !== "RECUSAR" && decisao !== "DESFEITA") {
      return json({ erro: "Requisição inválida." }, 400, origin);
    }
    const vigente = body.respostaVigenteId === null || body.respostaVigenteId === undefined || body.respostaVigenteId === 0
      ? 0
      : positiveInt(body.respostaVigenteId);
    if (vigente === null) return json({ erro: "Requisição inválida." }, 400, origin);
    const result = await callRpc(url, key, "portal_registrar_resposta", {
      p_sessao_hash: sessionHash,
      p_equipamento_id: equipamentoId,
      p_versao_id: versaoId,
      p_decisao: decisao,
      p_resposta_vigente_id: vigente,
    });
    return result.ok ? json({ comprovante: result.data }, 200, origin) : errorResponse(result.code, origin);
  }

  if (acao === "solicitar") {
    const tipo = body.tipo;
    if (tipo !== "NEGOCIAR" && tipo !== "DUVIDA" && tipo !== "MUDANCA") return json({ erro: "Requisição inválida." }, 400, origin);
    const mensagem = typeof body.mensagem === "string" ? body.mensagem.slice(0, 500) : "";
    const result = await callRpc(url, key, "portal_registrar_solicitacao", {
      p_sessao_hash: sessionHash,
      p_equipamento_id: equipamentoId,
      p_versao_id: versaoId,
      p_tipo: tipo,
      p_mensagem: mensagem,
    });
    return result.ok ? json({ solicitacao: result.data }, 200, origin) : errorResponse(result.code, origin);
  }

  return json({ erro: "Requisição inválida." }, 400, origin);
});
