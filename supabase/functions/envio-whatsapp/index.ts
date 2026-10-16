// Processador central dos envios de WhatsApp.
//
// O desktop só enfileira (`PENDENTE`). Esta função, acionada pelo Supabase Cron, varre
// tentativas abandonadas, reserva uma por vez (`FOR UPDATE SKIP LOCKED`, no banco), envia pelo
// provedor da empresa e conclui. Ela é separada de `portal-cliente`: quem recebe a resposta
// do cliente e quem envia mensagens não compartilham função nem permissões.
//
// Segurança: o token do provedor vem dos segredos desta função (`WHATSAPP_TOKENS`), nunca do
// banco nem do desktop. Resultado de rede ambíguo vira `INCERTA` e nunca é repetido sozinho.

const INSTANCE_PREFIX = "edge";
const SEND_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_RUN = 25;
const RUN_BUDGET_MS = 100_000;
const ERROR_MAX_CHARS = 300;
const DEFAULT_GRAPH_VERSION = "v21.0";

type Estado = "ENVIADA" | "FALHOU" | "INCERTA";

type Reserved = {
  tentativa_id: number;
  empresa_id: number;
  equipamento_id: number;
  tipo: string;
  mensagem_payload: MessagePayload | null;
  valido: boolean;
};

type MessagePayload = {
  template?: string;
  parametros?: unknown[];
  /** Só em pedidos antigos do link de decisão (removido na 0037); nunca são enviados. */
  usaLink?: boolean;
  texto?: string;
  contato?: string;
};

type ProviderConfig = {
  provedor: "EVOLUTION" | "CLOUD_API";
  evolution_api_url: string | null;
  cloud_phone_number_id: string | null;
  cloud_idioma: string | null;
};

type Outcome = { estado: Estado; externalId?: string | null; erro?: string | null; provedor: string };

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function getServerKey(): string | null {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.length > 0) return keys.default;
    } catch {
      console.error("envio_whatsapp_secret_keys_invalid");
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

/** Comparação em tempo constante do segredo compartilhado com o Cron. */
function secretMatches(received: string | null, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

function loadProviderTokens(): Record<string, string> {
  try {
    const parsed = JSON.parse(Deno.env.get("WHATSAPP_TOKENS") ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
    );
  } catch {
    console.error("envio_whatsapp_tokens_invalid");
    return {};
  }
}

type RpcResult = { ok: true; data: unknown } | { ok: false; code: string };

async function callRpc(url: string, key: string, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: serviceHeaders(key),
      body: JSON.stringify(args),
    });
  } catch {
    return { ok: false, code: "REDE" };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Corpo vazio: válido para funções que devolvem void.
  }
  if (response.ok) return { ok: true, data: payload };
  const message = (payload as { message?: unknown } | null)?.message;
  return { ok: false, code: typeof message === "string" ? message.trim() : `HTTP_${response.status}` };
}

/** Remove segredos e URLs do texto de erro e limita o tamanho. */
function scrub(text: string, secrets: string[]): string {
  let clean = text;
  for (const secret of secrets.filter((value) => value.length >= 8)) clean = clean.split(secret).join("[REDACTED]");
  clean = clean.replace(/https?:\/\/\S+/gi, "[url]").replace(/[0-9a-f]{32,}/gi, "[REDACTED]");
  return clean.replace(/\s+/g, " ").trim().slice(0, ERROR_MAX_CHARS);
}

function externalIdFrom(body: unknown): string | null {
  const record = body as { messages?: Array<{ id?: unknown }>; key?: { id?: unknown }; id?: unknown } | null;
  const candidate = record?.messages?.[0]?.id ?? record?.key?.id ?? record?.id;
  return typeof candidate === "string" ? candidate.slice(0, 120) : null;
}

function nonEmpty(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  // A Cloud API recusa parâmetro de modelo vazio.
  return text.length > 0 ? text : "-";
}

function buildCloudRequest(
  config: ProviderConfig,
  payload: MessagePayload,
  phone: string,
) {
  const components: Array<Record<string, unknown>> = [];
  const params = (payload.parametros ?? []).map((value) => ({ type: "text", text: nonEmpty(value) }));
  if (params.length > 0) components.push({ type: "body", parameters: params });
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || DEFAULT_GRAPH_VERSION;
  return {
    url: `https://graph.facebook.com/${version}/${config.cloud_phone_number_id}/messages`,
    body: {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: payload.template,
        language: { code: config.cloud_idioma || "pt_BR" },
        components,
      },
    },
  };
}

function isConnectFailure(error: unknown): boolean {
  const text = `${(error as Error)?.message ?? ""} ${((error as { cause?: Error })?.cause?.message) ?? ""}`;
  // Falha antes de enviar o pedido: DNS, recusa de conexão ou conexão não estabelecida.
  return /client error \(Connect\)|dns error|ECONNREFUSED|ENOTFOUND|connection refused/i.test(text);
}

async function sendToProvider(
  config: ProviderConfig,
  providerToken: string,
  payload: MessagePayload,
  phone: string,
): Promise<Outcome> {
  const secrets = [providerToken];
  const provedor = config.provedor;
  let url: string;
  let body: unknown;
  const headers = new Headers({ "Content-Type": "application/json" });

  if (provedor === "CLOUD_API") {
    if (!payload.template) return { estado: "FALHOU", erro: "Mensagem sem modelo para a Cloud API.", provedor };
    const request = buildCloudRequest(config, payload, phone);
    url = request.url;
    body = request.body;
    headers.set("Authorization", `Bearer ${providerToken}`);
  } else {
    if (!config.evolution_api_url) return { estado: "FALHOU", erro: "URL da Evolution não configurada.", provedor };
    const text = payload.texto ?? "";
    url = config.evolution_api_url;
    body = {
      number: phone,
      text,
      textMessage: { text },
      options: { delay: 1200, presence: "composing", linkPreview: false },
    };
    headers.set("apikey", providerToken);
    headers.set("Authorization", `Bearer ${providerToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    if (isConnectFailure(error)) {
      return { estado: "FALHOU", erro: "Não foi possível conectar ao provedor de WhatsApp.", provedor };
    }
    return {
      estado: "INCERTA",
      erro: "O provedor de WhatsApp não respondeu a tempo. A mensagem pode ter sido enviada.",
      provedor,
    };
  }

  let responseText = "";
  try {
    responseText = await response.text();
  } catch {
    // Sem corpo legível: o status HTTP basta.
  }
  if (response.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Resposta sem JSON: aceita pelo provedor, sem identificador.
    }
    return { estado: "ENVIADA", externalId: externalIdFrom(parsed), provedor };
  }

  const summary = scrub(responseText, secrets);
  const message = `Provedor de WhatsApp retornou status ${response.status}${summary ? `: ${summary}` : ""}`;
  return { estado: response.status >= 500 ? "INCERTA" : "FALHOU", erro: message, provedor };
}

async function processItem(
  item: Reserved,
  instance: string,
  context: { url: string; key: string; tokens: Record<string, string> },
): Promise<Estado> {
  const { url, key } = context;
  const conclude = async (outcome: Outcome): Promise<Estado> => {
    const args = {
      p_tentativa_id: item.tentativa_id,
      p_instancia: instance,
      p_estado: outcome.estado,
      p_provedor: outcome.provedor,
      p_mensagem_externa_id: outcome.externalId ?? null,
      p_erro: outcome.erro ?? null,
    };
    // Uma falha de rede aqui não pode perder o resultado: tenta de novo antes de desistir.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await callRpc(url, key, "concluir_envio_whatsapp", args);
      if (result.ok) {
        if (result.data === false) console.warn("envio_whatsapp_reserva_perdida", item.tentativa_id);
        return outcome.estado;
      }
    }
    // O envio já ocorreu; a varredura marcará a tentativa como INCERTA, sem repetir a mensagem.
    console.error("envio_whatsapp_conclusao_falhou", item.tentativa_id);
    return "INCERTA";
  };

  const payload = item.mensagem_payload;
  const phone = (payload?.contato ?? "").replace(/\D/g, "");
  if (!payload || phone.length < 12) {
    return conclude({ estado: "FALHOU", erro: "Pedido de envio sem conteúdo ou telefone válido.", provedor: "CENTRAL" });
  }
  if (payload.usaLink) {
    // O link de decisão foi substituído pelo Portal do Cliente: o texto teria um marcador vazio.
    return conclude({ estado: "FALHOU", erro: "Link de decisão descontinuado; o cliente responde pelo Portal do Cliente.", provedor: "CENTRAL" });
  }
  if (!item.valido) {
    return conclude({
      estado: "FALHOU",
      erro: "O evento mudou antes do envio (orçamento alterado ou equipamento fora de PRONTO).",
      provedor: "CENTRAL",
    });
  }

  const configResult = await callRpc(url, key, "obter_config_envio_whatsapp", { p_empresa_id: item.empresa_id });
  const config = configResult.ok
    ? (Array.isArray(configResult.data) ? configResult.data[0] : configResult.data) as ProviderConfig | undefined
    : undefined;
  if (!config) {
    return conclude({ estado: "FALHOU", erro: "A empresa não está configurada para o envio central.", provedor: "CENTRAL" });
  }
  const providerToken = context.tokens[String(item.empresa_id)];
  if (!providerToken) {
    return conclude({ estado: "FALHOU", erro: "Token do provedor não configurado no processador.", provedor: config.provedor });
  }

  const outcome = await sendToProvider(config, providerToken, payload, phone);
  return conclude(outcome);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse({ erro: "Método não permitido." }, 405);
  }

  const expectedSecret = Deno.env.get("ENVIO_WHATSAPP_PROCESSOR_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverKey = getServerKey();
  if (!expectedSecret || expectedSecret.length < 32 || !supabaseUrl || !serverKey) {
    console.error("envio_whatsapp_server_configuration_missing");
    return jsonResponse({ erro: "Serviço temporariamente indisponível." }, 503);
  }
  if (!secretMatches(request.headers.get("x-processador-secret"), expectedSecret)) {
    return jsonResponse({ erro: "Não autorizado." }, 401);
  }

  const instance = `${INSTANCE_PREFIX}-${crypto.randomUUID().slice(0, 12)}`;
  const context = { url: supabaseUrl, key: serverKey, tokens: loadProviderTokens() };
  const startedAt = Date.now();
  const summary = { reservadas: 0, enviadas: 0, falhas: 0, incertas: 0, varridasIncertas: 0, expiradas: 0 };

  const sweep = await callRpc(supabaseUrl, serverKey, "varrer_envios_whatsapp", {});
  if (sweep.ok) {
    const row = (Array.isArray(sweep.data) ? sweep.data[0] : sweep.data) as { incertas?: number; expiradas?: number } | undefined;
    summary.varridasIncertas = row?.incertas ?? 0;
    summary.expiradas = row?.expiradas ?? 0;
  } else {
    console.error("envio_whatsapp_varredura_falhou", sweep.code.slice(0, 80));
  }

  // Uma tentativa por vez: nada fica reservado (PREPARANDO) enquanto espera a vez de ser enviada.
  while (summary.reservadas < MAX_ITEMS_PER_RUN && Date.now() - startedAt < RUN_BUDGET_MS) {
    const reserved = await callRpc(supabaseUrl, serverKey, "reservar_envios_whatsapp", {
      p_instancia: instance,
      p_limite: 1,
    });
    if (!reserved.ok) {
      console.error("envio_whatsapp_reserva_falhou", reserved.code.slice(0, 80));
      return jsonResponse({ erro: "Falha ao reservar envios.", ...summary }, 503);
    }
    const item = (Array.isArray(reserved.data) ? reserved.data[0] : null) as Reserved | null;
    if (!item) break;
    summary.reservadas += 1;
    const estado = await processItem(item, instance, context);
    if (estado === "ENVIADA") summary.enviadas += 1;
    else if (estado === "INCERTA") summary.incertas += 1;
    else summary.falhas += 1;
  }

  return jsonResponse(summary, 200);
});

export {};
