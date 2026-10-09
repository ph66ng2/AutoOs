const STATUS_COPY: Record<string, { title: string; orientation: string }> = {
  RECEBIDO: {
    title: "Recebemos seu equipamento",
    orientation: "Seu equipamento foi registrado e está sob os cuidados da equipe BMI TAG.",
  },
  EM_VERIFICACAO: {
    title: "Estamos analisando seu equipamento",
    orientation: "A equipe técnica está verificando o que precisa ser feito.",
  },
  VERIFICADO: {
    title: "Análise concluída",
    orientation: "Estamos preparando as informações do serviço.",
  },
  AGUARDANDO_APROVACAO: {
    title: "O orçamento aguarda sua resposta",
    orientation: "Para responder ou esclarecer dúvidas, fale com a equipe BMI TAG pelo canal em que recebeu o orçamento.",
  },
  APROVADO: {
    title: "Orçamento aprovado",
    orientation: "Nossa equipe está organizando os próximos passos do serviço.",
  },
  REPROVADO: {
    title: "Orçamento não aprovado",
    orientation: "Fale com a equipe BMI TAG para combinar os próximos passos.",
  },
  EM_MANUTENCAO: {
    title: "Serviço em andamento",
    orientation: "Nossa equipe está trabalhando no equipamento.",
  },
  AGUARDANDO_PECA: {
    title: "Aguardando peça",
    orientation: "O serviço depende da chegada de uma peça. Avisaremos quando houver atualização.",
  },
  PRONTO: {
    title: "Pronto para retirada",
    orientation: "Seu equipamento está pronto. Fale com a equipe BMI TAG para combinar a retirada.",
  },
  ENTREGUE: {
    title: "Equipamento entregue",
    orientation: "Este atendimento foi concluído.",
  },
  ORCAMENTO_VENCIDO: {
    title: "O prazo do orçamento terminou",
    orientation: "Fale com a equipe BMI TAG para verificar as opções de atendimento.",
  },
  ABANDONADO: {
    title: "Atendimento encerrado",
    orientation: "Fale com a equipe BMI TAG se precisar de esclarecimentos.",
  },
};

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_BODY_BYTES = 2_048;
const RATE_LIMIT_PER_MINUTE = 30;
const GLOBAL_RATE_LIMIT_PER_MINUTE = 300;
const DELIVERY_VALIDITY_MS = 30 * 24 * 60 * 60 * 1_000;

type LinkRow = {
  id: number;
  equipamento_id: number;
  empresa_id: number;
  criado_em: string;
  expira_em: string;
  revogado_em: string | null;
};

type EquipmentRow = {
  id: number;
  empresa_id: number;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  status: string | null;
  status_alterado_em: string | null;
};

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
      console.error("public_status_secret_keys_invalid");
      return null;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

function serviceHeaders(key: string, extra: Record<string, string> = {}): Headers {
  const headers = new Headers({ apikey: key, "Content-Type": "application/json", ...extra });
  // Legacy JWT service keys need Authorization. New sb_secret keys must stay in apikey.
  if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

async function hmacFingerprint(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeRateLimit(
  supabaseUrl: string,
  serverKey: string,
  fingerprint: string,
  limit = RATE_LIMIT_PER_MINUTE,
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
    console.error("public_status_rate_limit_unavailable", result.status);
    return null;
  }
  try {
    return await result.json() === true;
  } catch {
    console.error("public_status_rate_limit_response_invalid");
    return null;
  }
}

function cleanLabel(value: string | null, fallback: string): string {
  const cleaned = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || fallback;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
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

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const origins = allowedOrigins();

  if (origin && !origins.has(origin)) {
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
  if (contentType !== "application/json") {
    return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ erro: "Requisição inválida." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverKey = getServerKey();
  const rateLimitSecret = Deno.env.get("PUBLIC_STATUS_RATE_LIMIT_SECRET");
  if (!supabaseUrl || !serverKey || !rateLimitSecret || rateLimitSecret.length < 32) {
    console.error("public_status_server_configuration_missing");
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }

  // Headers de IP podem ser enviados pelo próprio cliente. O limite global
  // impede varrer tokens; o limite por token protege cada link válido.
  const globalFingerprint = await hmacFingerprint(rateLimitSecret, "portal:global");
  const underLimit = await consumeRateLimit(supabaseUrl, serverKey, globalFingerprint, GLOBAL_RATE_LIMIT_PER_MINUTE);
  if (underLimit === null) {
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  if (!underLimit) {
    console.warn("public_status_rate_limited");
    return jsonResponse({ erro: "Aguarde um minuto e tente novamente." }, 429, origin, { "Retry-After": "60" });
  }

  const configUrl = new URL(`${supabaseUrl}/rest/v1/status_portal_config`);
  configUrl.search = new URLSearchParams({ select: "public_enabled", singleton: "eq.true", limit: "1" }).toString();
  const configResponse = await fetch(configUrl, { headers: serviceHeaders(serverKey) });
  if (!configResponse.ok) {
    console.error("public_status_config_lookup_failed", configResponse.status);
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  const configRows = await readJson<Array<{ public_enabled: boolean }>>(configResponse);
  if (!configRows?.[0]?.public_enabled) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  const bodyText = await readBoundedText(request, MAX_BODY_BYTES);
  if (bodyText === null) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  let token: unknown;
  try {
    token = (JSON.parse(bodyText) as { token?: unknown }).token;
  } catch {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  const tokenHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const tokenFingerprint = await hmacFingerprint(rateLimitSecret, `portal:token:${tokenHash}`);
  const tokenUnderLimit = await consumeRateLimit(supabaseUrl, serverKey, tokenFingerprint);
  if (tokenUnderLimit === null) {
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  if (!tokenUnderLimit) {
    return jsonResponse({ erro: "Aguarde um minuto e tente novamente." }, 429, origin, { "Retry-After": "60" });
  }
  const linksUrl = new URL(`${supabaseUrl}/rest/v1/links_status_publico`);
  linksUrl.search = new URLSearchParams({
    select: "id,equipamento_id,empresa_id,criado_em,expira_em,revogado_em",
    token_hash: `eq.${tokenHash}`,
    revogado_em: "is.null",
    limit: "1",
  }).toString();

  const linkResponse = await fetch(linksUrl, { headers: serviceHeaders(serverKey) });
  if (!linkResponse.ok) {
    console.error("public_status_link_lookup_failed", linkResponse.status);
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  const links = await readJson<LinkRow[]>(linkResponse);
  const link = links?.[0];
  if (!link || Date.now() >= new Date(link.expira_em).getTime()) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  const equipmentUrl = new URL(`${supabaseUrl}/rest/v1/equipamentos`);
  equipmentUrl.search = new URLSearchParams({
    select: "id,empresa_id,tipo,marca,modelo,status,status_alterado_em",
    id: `eq.${link.equipamento_id}`,
    empresa_id: `eq.${link.empresa_id}`,
    limit: "1",
  }).toString();
  const equipmentResponse = await fetch(equipmentUrl, { headers: serviceHeaders(serverKey) });
  if (!equipmentResponse.ok) {
    console.error("public_status_equipment_lookup_failed", equipmentResponse.status);
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  const equipmentRows = await readJson<EquipmentRow[]>(equipmentResponse);
  const equipment = equipmentRows?.[0];
  if (!equipment || equipment.empresa_id !== link.empresa_id) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  if (equipment.status === "ENTREGUE") {
    if (!equipment.status_alterado_em) {
      return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
    }
    const deliveredAt = new Date(equipment.status_alterado_em).getTime();
    if (!Number.isFinite(deliveredAt) || Date.now() >= deliveredAt + DELIVERY_VALIDITY_MS) {
      return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
    }
  }

  const accessResponse = await fetch(
    `${supabaseUrl}/rest/v1/links_status_publico?${new URLSearchParams({
      id: `eq.${link.id}`,
      token_hash: `eq.${tokenHash}`,
      revogado_em: "is.null",
      expira_em: `gt.${new Date().toISOString()}`,
      select: "id",
    }).toString()}`,
    {
      method: "PATCH",
      headers: serviceHeaders(serverKey, { Prefer: "return=representation" }),
      body: JSON.stringify({ ultimo_acesso_em: new Date().toISOString() }),
    },
  );
  if (!accessResponse.ok) {
    console.error("public_status_access_stamp_failed", accessResponse.status);
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503, origin);
  }
  const activeLinks = await readJson<Array<{ id: number }>>(accessResponse);
  if (!activeLinks || activeLinks.length === 0) {
    return jsonResponse({ erro: "Acompanhamento indisponível." }, 404, origin);
  }

  const copy = STATUS_COPY[equipment.status ?? ""] ?? {
    title: "Acompanhe o atendimento",
    orientation: "Fale com a equipe BMI TAG para receber mais informações.",
  };
  const equipmentName = [
    cleanLabel(equipment.tipo, "Equipamento"),
    cleanLabel(equipment.marca, ""),
    cleanLabel(equipment.modelo, ""),
  ].filter(Boolean).join(" ").slice(0, 180);

  return jsonResponse({
    equipamento: equipmentName || "Equipamento",
    titulo: copy.title,
    orientacao: copy.orientation,
    statusAlteradoEm: equipment.status_alterado_em,
  }, 200, origin);
});

export {};
