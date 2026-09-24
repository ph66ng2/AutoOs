const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 16 * 1024;

class RequestFailure extends Error {
  constructor(status, message, code = "request_failed", details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(body, status, origin, allowedOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && allowedOrigin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedRequestOrigin(origin, configuredOrigins) {
  if (!origin) return true;
  const allowed = new Set([
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
    ...String(configuredOrigins ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
  return allowed.has(origin);
}

async function parseRequestBody(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new RequestFailure(413, "Solicitação muito grande.", "body_too_large");
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new RequestFailure(400, "Solicitação inválida.", "invalid_json");
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new RequestFailure(400, "Solicitação inválida.", "invalid_body");
  }
  return body;
}

function assertAllowedKeys(body, keys) {
  if (Object.keys(body).some((key) => !keys.has(key))) {
    throw new RequestFailure(400, "A solicitação contém campos não permitidos.", "unexpected_fields");
  }
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new RequestFailure(400, `Campo ${field} inválido.`, "invalid_identifier");
  }
  return value;
}

export function normalizeEmail(value) {
  if (typeof value !== "string") throw new RequestFailure(400, "Informe um email válido.", "invalid_email");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new RequestFailure(400, "Informe um email válido.", "invalid_email");
  }
  return email;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function publicFailure(error) {
  if (error instanceof RequestFailure) return error;
  const code = error?.code ?? error?.status ?? "";
  if (String(code) === "42501" || String(code) === "403") {
    return new RequestFailure(403, "Você não tem autorização para esta operação.", "forbidden");
  }
  if (["23505", "23514", "40001", "email_exists", "user_already_exists"].includes(String(code))) {
    return new RequestFailure(409, "A operação conflita com o estado atual da conta.", "conflict");
  }
  if (["22023", "400"].includes(String(code))) {
    return new RequestFailure(400, "Não foi possível validar os dados da operação.", "invalid_operation");
  }
  return new RequestFailure(500, "Não foi possível concluir a operação agora.", "internal_error");
}

async function rpc(deps, name, args) {
  const result = await deps.rpc(name, args);
  if (result?.error) throw result.error;
  return result?.data;
}

async function sendInvitation(deps, email, authUserId) {
  const actionLink = await deps.generateInviteLink(email);
  if (typeof actionLink !== "string" || !/^https?:\/\//i.test(actionLink)) {
    throw new RequestFailure(502, "O link de convite não pôde ser gerado.", "invite_link_failed");
  }
  await deps.sendInviteEmail({
    to: email,
    actionLink,
    idempotencyKey: crypto.randomUUID(),
  });
  return authUserId;
}

async function handleAction(body, actorId, deps) {
  switch (body.action) {
    case "list_users": {
      assertAllowedKeys(body, new Set(["action"]));
      const users = await rpc(deps, "saas_admin_list_company_users", {
        p_actor_auth_user_id: actorId,
      });
      return { users: Array.isArray(users) ? users : [] };
    }

    case "invite": {
      assertAllowedKeys(body, new Set(["action", "email", "profileId"]));
      const email = normalizeEmail(body.email);
      const profileId = requireUuid(body.profileId, "profileId");
      await rpc(deps, "saas_admin_prepare_invite", {
        p_actor_auth_user_id: actorId,
        p_email: email,
        p_profile_id: profileId,
      });

      const created = await deps.createAuthUser(email);
      const targetId = created?.id;
      requireUuid(targetId, "authUserId");
      try {
        await rpc(deps, "saas_admin_bind_invited_user", {
          p_actor_auth_user_id: actorId,
          p_target_auth_user_id: targetId,
          p_email: email,
          p_profile_id: profileId,
        });
      } catch (error) {
        await deps.deleteAuthUser(targetId).catch(() => undefined);
        throw error;
      }

      try {
        await sendInvitation(deps, email, targetId);
      } catch {
        throw new RequestFailure(
          502,
          "A conta pendente foi criada, mas o email não pôde ser enviado. Tente reenviar o convite.",
          "invite_delivery_failed",
          { userId: targetId },
        );
      }
      try {
        await rpc(deps, "saas_admin_record_invite_delivery", {
          p_actor_auth_user_id: actorId,
          p_target_auth_user_id: targetId,
          p_event_type: "SAAS_INVITE_SENT",
        });
      } catch {
        throw new RequestFailure(503, "O email foi enviado, mas o registro de auditoria não foi confirmado. Não reenvie até verificar o estado.", "invite_audit_failed", { userId: targetId });
      }
      return { status: "pending", userId: targetId };
    }

    case "resend_invite": {
      assertAllowedKeys(body, new Set(["action", "targetUserId"]));
      const targetId = requireUuid(body.targetUserId, "targetUserId");
      const invite = await rpc(deps, "saas_admin_get_pending_invite", {
        p_actor_auth_user_id: actorId,
        p_target_auth_user_id: targetId,
      });
      if (!invite || invite.auth_user_id !== targetId) {
        throw new RequestFailure(403, "Convite pendente não encontrado.", "invite_not_found");
      }
      const email = normalizeEmail(invite.email);
      try {
        await sendInvitation(deps, email, targetId);
      } catch {
        throw new RequestFailure(502, "O convite não pôde ser enviado. Tente novamente.", "invite_delivery_failed");
      }
      try {
        await rpc(deps, "saas_admin_record_invite_delivery", {
          p_actor_auth_user_id: actorId,
          p_target_auth_user_id: targetId,
          p_event_type: "SAAS_INVITE_RESENT",
        });
      } catch {
        throw new RequestFailure(503, "O email foi enviado, mas o registro de auditoria não foi confirmado. Não reenvie até verificar o estado.", "invite_audit_failed", { userId: targetId });
      }
      return { status: "pending", userId: targetId, resent: true };
    }

    case "change_profile": {
      assertAllowedKeys(body, new Set(["action", "targetUserId", "profileId"]));
      const targetId = requireUuid(body.targetUserId, "targetUserId");
      const profileId = requireUuid(body.profileId, "profileId");
      return await rpc(deps, "saas_admin_update_company_user", {
        p_actor_auth_user_id: actorId,
        p_target_auth_user_id: targetId,
        p_action: "change_profile",
        p_profile_id: profileId,
      });
    }

    case "deactivate": {
      assertAllowedKeys(body, new Set(["action", "targetUserId"]));
      const targetId = requireUuid(body.targetUserId, "targetUserId");
      const result = await rpc(deps, "saas_admin_update_company_user", {
        p_actor_auth_user_id: actorId,
        p_target_auth_user_id: targetId,
        p_action: "deactivate",
        p_profile_id: null,
      });
      await deps.banAuthUser(targetId);
      await rpc(deps, "saas_admin_record_session_revocation", {
        p_actor_auth_user_id: actorId,
        p_target_auth_user_id: targetId,
      });
      return result;
    }

    case "reactivate": {
      assertAllowedKeys(body, new Set(["action", "targetUserId"]));
      const targetId = requireUuid(body.targetUserId, "targetUserId");
      const result = await rpc(deps, "saas_admin_update_company_user", {
        p_actor_auth_user_id: actorId,
        p_target_auth_user_id: targetId,
        p_action: "reactivate",
        p_profile_id: null,
      });
      await deps.unbanAuthUser(targetId);
      return result;
    }

    case "accept_invite": {
      assertAllowedKeys(body, new Set(["action"]));
      const result = await deps.acceptInvitation();
      if (result?.error) throw result.error;
      return { status: result?.data?.status ?? "active", refreshSession: true };
    }

    default:
      throw new RequestFailure(400, "Ação desconhecida.", "unknown_action");
  }
}

export async function handleSaasUserAdminRequest(request, deps) {
  const origin = request.headers.get("Origin");
  const originAllowed = allowedRequestOrigin(origin, deps.allowedOrigins);
  if (!originAllowed) return jsonResponse({ error: "Origem não autorizada." }, 403, origin, false);

  if (request.method === "OPTIONS") {
    const headers = {
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST para esta operação." }, 405, origin, originAllowed);
  }

  let action = "unknown";
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) throw new RequestFailure(401, "Sessão ausente ou inválida.", "missing_bearer");
    const actor = await deps.verifyAccessToken(bearer);
    if (!actor || !UUID_PATTERN.test(actor.id ?? "")) {
      throw new RequestFailure(401, "Sessão ausente ou inválida.", "invalid_session");
    }

    const body = await parseRequestBody(request);
    action = typeof body.action === "string" ? body.action : "unknown";
    const result = await handleAction(body, actor.id, deps);
    return jsonResponse(result, 200, origin, originAllowed);
  } catch (error) {
    const failure = publicFailure(error);
    if (failure.status >= 500 && !(error instanceof RequestFailure)) {
      console.error("SaaS user lifecycle operation failed", { action, code: error?.code ?? "unknown" });
    }
    return jsonResponse({ error: failure.message, code: failure.code, ...failure.details }, failure.status, origin, originAllowed);
  }
}
