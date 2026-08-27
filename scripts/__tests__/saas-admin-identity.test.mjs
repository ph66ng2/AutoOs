import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupCompanyAdmin,
  provisionCompanyAdmin,
  setCompanyAdminStatus,
  validateAdminKey,
} from "../lib/saas-admin-identity.mjs";

const AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_KEY = "sb_secret_test-only-not-a-real-secret";

function provisioningEnvironment(overrides = {}) {
  return {
    AUTOOS_CONFIRM_STAGING: "AutoOS Staging",
    SUPABASE_STAGING_URL: "https://test-project.supabase.co",
    SUPABASE_STAGING_ADMIN_KEY: ADMIN_KEY,
    SUPABASE_STAGING_DATABASE_URL: "postgresql://staging.invalid/postgres",
    AUTOOS_ADMIN_EMAIL: "synthetic-admin@example.invalid",
    AUTOOS_ADMIN_PASSWORD: "test-password-only-123",
    AUTOOS_EMPRESA_ID: EMPRESA_ID,
    AUTOOS_PROFILE_ID: PROFILE_ID,
    ...overrides,
  };
}

test("provision creates the Auth user with server-selected claims then binds it", async () => {
  const requests = [];
  const sqlCalls = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: AUTH_USER_ID }),
    };
  };

  const result = await provisionCompanyAdmin({
    env: provisioningEnvironment(),
    fetchImpl,
    runSql: (call) => sqlCalls.push(call),
  });

  assert.deepEqual(result, {
    authUserId: AUTH_USER_ID,
    empresaId: EMPRESA_ID,
    profileId: PROFILE_ID,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://test-project.supabase.co/auth/v1/admin/users");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.email_confirm, true);
  assert.deepEqual(body.app_metadata, {
    company_id: EMPRESA_ID,
    profile_id: PROFILE_ID,
    profile_role: "ADMIN",
  });
  assert.equal(sqlCalls[0].operationFile, "provision-company-admin.sql");
  assert.deepEqual(sqlCalls[0].variables, {
    auth_user_id: AUTH_USER_ID,
    empresa_id: EMPRESA_ID,
    profile_id: PROFILE_ID,
  });
});

test("provision removes the Auth user when the database binding fails", async () => {
  const methods = [];
  const fetchImpl = async (_url, options) => {
    methods.push(options.method);
    if (options.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ id: AUTH_USER_ID }) };
    }
    return { ok: true, status: 204 };
  };

  await assert.rejects(
    provisionCompanyAdmin({
      env: provisioningEnvironment(),
      fetchImpl,
      runSql: () => {
        throw new Error("synthetic database failure");
      },
    }),
    /synthetic database failure/,
  );
  assert.deepEqual(methods, ["POST", "DELETE"]);
});

test("provision refuses client-side keys and a missing staging confirmation", async () => {
  assert.throws(
    () => validateAdminKey("sb_publishable_test"),
    /cannot provision Auth users/,
  );
  const anonPayload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
  assert.throws(
    () => validateAdminKey(`header.${anonPayload}.signature`),
    /service_role/,
  );
  await assert.rejects(
    provisionCompanyAdmin({
      env: provisioningEnvironment({ AUTOOS_CONFIRM_STAGING: "wrong" }),
      fetchImpl: async () => assert.fail("fetch must not run"),
      runSql: () => assert.fail("psql must not run"),
    }),
    /AutoOS Staging/,
  );
});

test("suspend and reactivate use UUID-only server-side SQL operations", async () => {
  const calls = [];
  const env = {
    AUTOOS_CONFIRM_STAGING: "AutoOS Staging",
    SUPABASE_STAGING_DATABASE_URL: "postgresql://staging.invalid/postgres",
    AUTOOS_AUTH_USER_ID: AUTH_USER_ID,
  };

  await setCompanyAdminStatus({ action: "suspend", env, runSql: (call) => calls.push(call) });
  await setCompanyAdminStatus({ action: "reactivate", env, runSql: (call) => calls.push(call) });

  assert.deepEqual(
    calls.map((call) => call.operationFile),
    ["suspend-company-admin.sql", "reactivate-company-admin.sql"],
  );
  assert.deepEqual(calls[0].variables, { auth_user_id: AUTH_USER_ID });
});

test("cleanup removes the synthetic Auth user and relies on the cascade for the binding", async () => {
  const requests = [];
  const result = await cleanupCompanyAdmin({
    env: {
      AUTOOS_CONFIRM_STAGING: "AutoOS Staging",
      SUPABASE_STAGING_URL: "https://test-project.supabase.co",
      SUPABASE_STAGING_ADMIN_KEY: ADMIN_KEY,
      AUTOOS_AUTH_USER_ID: AUTH_USER_ID,
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(result, { authUserId: AUTH_USER_ID });
  assert.equal(requests[0].options.method, "DELETE");
  assert.match(requests[0].url, new RegExp(`${AUTH_USER_ID}$`));
});
