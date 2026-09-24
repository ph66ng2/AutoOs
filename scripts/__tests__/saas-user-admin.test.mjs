import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import {
  escapeHtml,
  handleSaasUserAdminRequest,
  normalizeEmail,
} from "../../supabase/functions/saas-user-admin/core.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROFILE_ID = "a0000000-0000-4000-8000-000000000013";

function createDeps(overrides = {}) {
  const calls = [];
  const deps = {
    allowedOrigins: "https://app.example.test",
    verifyAccessToken: async (token) => token === "verified-token" ? { id: ADMIN_ID } : null,
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      if (name === "saas_admin_prepare_invite") return { data: { operation: "create" }, error: null };
      if (name === "saas_admin_get_pending_invite") return { data: { auth_user_id: TARGET_ID, email: "Employee@Example.test" }, error: null };
      if (name === "saas_admin_update_company_user") return { data: { auth_user_id: TARGET_ID, status: args.p_action === "deactivate" ? "inactive" : "active" }, error: null };
      return { data: null, error: null };
    },
    createAuthUser: async (email) => { calls.push(["createAuthUser", email]); return { id: TARGET_ID }; },
    deleteAuthUser: async (id) => { calls.push(["deleteAuthUser", id]); },
    generateInviteLink: async (email) => { calls.push(["generateInviteLink", email]); return "https://auth.example.test/verify?token=one-time-secret"; },
    sendInviteEmail: async (message) => { calls.push(["sendInviteEmail", message]); },
    banAuthUser: async (id) => { calls.push(["banAuthUser", id]); },
    unbanAuthUser: async (id) => { calls.push(["unbanAuthUser", id]); },
    acceptInvitation: async () => { calls.push(["acceptInvitation"]); return { data: { status: "active" }, error: null }; },
    ...overrides,
  };
  return { deps, calls };
}

function request(body, { authorization = "Bearer verified-token", origin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  if (origin) headers.Origin = origin;
  return new Request("https://functions.example.test/saas-user-admin", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function responseJson(response) {
  return await response.json();
}

test("requires a verified bearer session before processing a body", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({ action: "invite" }, { authorization: "" }), deps);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects caller-selected tenant/profile-role fields and unlisted payload keys", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({
    action: "invite",
    email: "employee@example.test",
    profileId: PROFILE_ID,
    empresa_id: "b0000000-0000-4000-8000-000000000001",
    profile_role: "ADMIN",
  }), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("lists team members through the admin-scoped server RPC without accepting a tenant", async () => {
  const member = { user_id: TARGET_ID, email: "employee@example.test", status: "pending", legacy_admin: false };
  const { deps, calls } = createDeps({
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      return name === "saas_admin_list_company_users" ? { data: [member], error: null } : { data: null, error: null };
    },
  });
  const response = await handleSaasUserAdminRequest(request({ action: "list_users" }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { users: [member] });
  assert.deepEqual(calls[0], ["rpc", "saas_admin_list_company_users", { p_actor_auth_user_id: ADMIN_ID }]);
});

test("creates one unconfirmed Auth identity, binds it server-side, and sends a private Resend invite", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({
    action: "invite",
    email: " Employee@Example.test ",
    profileId: PROFILE_ID,
  }, { origin: "https://app.example.test" }), deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { status: "pending", userId: TARGET_ID });
  assert.equal(calls.find(([name]) => name === "createAuthUser")[1], "employee@example.test");
  const bindCall = calls.find((call) => call[0] === "rpc" && call[1] === "saas_admin_bind_invited_user");
  assert.deepEqual(bindCall[2], {
    p_actor_auth_user_id: ADMIN_ID,
    p_target_auth_user_id: TARGET_ID,
    p_email: "employee@example.test",
    p_profile_id: PROFILE_ID,
  });
  const sent = calls.find(([name]) => name === "sendInviteEmail")[1];
  assert.equal(sent.to, "employee@example.test");
  assert.match(sent.actionLink, /one-time-secret/);
  assert.match(sent.idempotencyKey, /^[0-9a-f-]{36}$/i);
  assert.ok(calls.some((call) => call[0] === "rpc" && call[1] === "saas_admin_record_invite_delivery" && call[2].p_event_type === "SAAS_INVITE_SENT"));
});

test("does not create a second Auth account for a duplicate/pending email", async () => {
  const { deps, calls } = createDeps({
    rpc: async (name, args) => name === "saas_admin_prepare_invite"
      ? { data: null, error: { code: "23505" } }
      : { data: null, error: null },
  });
  const response = await handleSaasUserAdminRequest(request({ action: "invite", email: "used@example.test", profileId: PROFILE_ID }), deps);
  assert.equal(response.status, 409);
  assert.equal(calls.some(([name]) => name === "createAuthUser"), false);
  assert.equal(calls.some(([name]) => name === "sendInviteEmail"), false);
});

test("maps a concurrent duplicate Auth email to a safe conflict instead of an internal error", async () => {
  const { deps, calls } = createDeps({
    createAuthUser: async () => { throw Object.assign(new Error("duplicate address details"), { code: "email_exists" }); },
  });
  const response = await handleSaasUserAdminRequest(request({
    action: "invite",
    email: "racing@example.test",
    profileId: PROFILE_ID,
  }), deps);
  const body = await responseJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.code, "conflict");
  assert.equal(JSON.stringify(body).includes("duplicate address details"), false);
  assert.equal(calls.some(([name]) => name === "sendInviteEmail"), false);
});

test("re-sends only to the server-resolved pending identity, retaining its UUID", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({ action: "resend_invite", targetUserId: TARGET_ID }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { status: "pending", userId: TARGET_ID, resent: true });
  assert.equal(calls.find(([name]) => name === "generateInviteLink")[1], "employee@example.test");
  assert.equal(calls.some(([name]) => name === "createAuthUser" || name === "deleteAuthUser"), false);
  assert.equal(calls.find(([name]) => name === "sendInviteEmail")[1].to, "employee@example.test");
});

test("does not disclose or use a caller-supplied resend address", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({
    action: "resend_invite",
    targetUserId: TARGET_ID,
    email: "attacker@example.test",
  }), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("tenant denial from the database prevents resend delivery", async () => {
  const { deps, calls } = createDeps({
    rpc: async (name) => name === "saas_admin_get_pending_invite"
      ? { data: null, error: { code: "42501" } }
      : { data: null, error: null },
  });
  const response = await handleSaasUserAdminRequest(request({ action: "resend_invite", targetUserId: TARGET_ID }), deps);
  assert.equal(response.status, 403);
  assert.equal(calls.some(([name]) => name === "sendInviteEmail"), false);
});

test("deactivation updates live access, bans Auth, and records revocation in order", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({ action: "deactivate", targetUserId: TARGET_ID }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.filter(([name]) => name === "banAuthUser" || name === "rpc").map((call) => call[0] === "rpc" ? call[1] : call[0]), [
    "saas_admin_update_company_user",
    "banAuthUser",
    "saas_admin_record_session_revocation",
  ]);
});

test("reactivation unbans only after the server validates and activates the target", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({ action: "reactivate", targetUserId: TARGET_ID }), deps);
  assert.equal(response.status, 200);
  const mutationIndex = calls.findIndex((call) => call[0] === "rpc" && call[1] === "saas_admin_update_company_user");
  const unbanIndex = calls.findIndex((call) => call[0] === "unbanAuthUser");
  assert.ok(mutationIndex >= 0 && unbanIndex > mutationIndex);
});

test("invite acceptance derives identity from the verified session, not the request body", async () => {
  const { deps, calls } = createDeps();
  const response = await handleSaasUserAdminRequest(request({ action: "accept_invite" }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { status: "active", refreshSession: true });
  assert.deepEqual(calls, [["acceptInvitation"]]);
});

test("email provider failures do not leak provider responses, keys, or action links", async () => {
  const secret = "re_test_secret";
  const oneTimeLink = "https://auth.example.test/verify?token=private-one-time-token";
  const { deps } = createDeps({
    generateInviteLink: async () => oneTimeLink,
    sendInviteEmail: async () => { throw Object.assign(new Error(`${secret} ${oneTimeLink}`), { code: "resend_500" }); },
  });
  const response = await handleSaasUserAdminRequest(request({ action: "invite", email: "new@example.test", profileId: PROFILE_ID }), deps);
  const body = await responseJson(response);
  assert.equal(response.status, 502);
  assert.equal(body.userId, TARGET_ID);
  assert.equal(JSON.stringify(body).includes(secret), false);
  assert.equal(JSON.stringify(body).includes("private-one-time-token"), false);
});

test("validates email normalization and escapes HTML inserted in invite templates", () => {
  assert.equal(normalizeEmail("  USER@Example.test "), "user@example.test");
  assert.equal(escapeHtml('<script a="b">&\'x\'</script>'), "&lt;script a=&quot;b&quot;&gt;&amp;&#39;x&#39;&lt;/script&gt;");
  assert.throws(() => normalizeEmail("not-an-email"), /email válido/);
});
