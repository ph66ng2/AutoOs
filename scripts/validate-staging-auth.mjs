#!/usr/bin/env node

import {
  cleanupCompanyAdmin,
  provisionCompanyAdmin,
  requireEnvironment,
  runSqlFile,
  setCompanyAdminStatus,
} from "./lib/saas-admin-identity.mjs";

const TENANT_A = {
  empresaId: "a0000000-0000-4000-8000-000000000001",
  profileId: "a0000000-0000-4000-8000-000000000011",
};
const TENANT_B = {
  empresaId: "b0000000-0000-4000-8000-000000000001",
  profileId: "b0000000-0000-4000-8000-000000000011",
};

function decodeJwtPayload(token) {
  const segments = token.split(".");
  if (segments.length !== 3) throw new Error("Auth returned an invalid access token");
  return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
}

async function signIn({ supabaseUrl, publishableKey, email, password }) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!response.ok) throw new Error(`Synthetic login failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Synthetic login did not return an access token");
  return payload.access_token;
}

async function expectLoginDenied(options) {
  try {
    await signIn(options);
  } catch (error) {
    if (error instanceof Error && /HTTP (401|403|422)/.test(error.message)) return;
    throw error;
  }
  throw new Error("Suspended synthetic administrator could still sign in");
}

async function visibleCompanyIds({ supabaseUrl, publishableKey, accessToken, empresaId }) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/empresas?select=id&id=eq.${empresaId}`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) throw new Error(`RLS probe failed with HTTP ${response.status}`);
  return response.json();
}

function assertClaims(token, tenant) {
  const claims = decodeJwtPayload(token);
  if (
    claims.app_metadata?.company_id !== tenant.empresaId ||
    claims.app_metadata?.profile_id !== tenant.profileId ||
    claims.app_metadata?.profile_role !== "ADMIN"
  ) {
    throw new Error("Auth hook returned non-authoritative tenant/profile claims");
  }
}

const env = process.env;
const values = requireEnvironment(env, [
  "SUPABASE_STAGING_URL",
  "SUPABASE_STAGING_PUBLISHABLE_KEY",
  "SUPABASE_STAGING_ADMIN_KEY",
  "SUPABASE_STAGING_DATABASE_URL",
  "AUTOOS_TEST_ADMIN_A_EMAIL",
  "AUTOOS_TEST_ADMIN_A_PASSWORD",
  "AUTOOS_TEST_ADMIN_B_EMAIL",
  "AUTOOS_TEST_ADMIN_B_PASSWORD",
]);
if (env.AUTOOS_CONFIRM_STAGING !== "AutoOS Staging") {
  throw new Error('Set AUTOOS_CONFIRM_STAGING exactly to "AutoOS Staging"');
}

const baseEnvironment = {
  ...env,
  AUTOOS_CONFIRM_STAGING: "AutoOS Staging",
};
const createdUsers = [];
const cleanupErrors = [];

try {
  runSqlFile({
    databaseUrl: values.SUPABASE_STAGING_DATABASE_URL,
    operationFile: "bootstrap-auth-test-tenants.sql",
  });

  for (const [tenant, email, password] of [
    [TENANT_A, values.AUTOOS_TEST_ADMIN_A_EMAIL, values.AUTOOS_TEST_ADMIN_A_PASSWORD],
    [TENANT_B, values.AUTOOS_TEST_ADMIN_B_EMAIL, values.AUTOOS_TEST_ADMIN_B_PASSWORD],
  ]) {
    const provisioned = await provisionCompanyAdmin({
      env: {
        ...baseEnvironment,
        AUTOOS_ADMIN_EMAIL: email,
        AUTOOS_ADMIN_PASSWORD: password,
        AUTOOS_EMPRESA_ID: tenant.empresaId,
        AUTOOS_PROFILE_ID: tenant.profileId,
      },
    });
    createdUsers.push(provisioned.authUserId);
  }

  const loginA = {
    supabaseUrl: values.SUPABASE_STAGING_URL,
    publishableKey: values.SUPABASE_STAGING_PUBLISHABLE_KEY,
    email: values.AUTOOS_TEST_ADMIN_A_EMAIL,
    password: values.AUTOOS_TEST_ADMIN_A_PASSWORD,
  };
  const loginB = {
    supabaseUrl: values.SUPABASE_STAGING_URL,
    publishableKey: values.SUPABASE_STAGING_PUBLISHABLE_KEY,
    email: values.AUTOOS_TEST_ADMIN_B_EMAIL,
    password: values.AUTOOS_TEST_ADMIN_B_PASSWORD,
  };

  const tokenA = await signIn(loginA);
  const tokenB = await signIn(loginB);
  assertClaims(tokenA, TENANT_A);
  assertClaims(tokenB, TENANT_B);

  runSqlFile({
    databaseUrl: values.SUPABASE_STAGING_DATABASE_URL,
    operationFile: "validate-auth-admin-identity.sql",
  });

  const visibleBeforeSuspension = await visibleCompanyIds({
    ...loginA,
    accessToken: tokenA,
    empresaId: TENANT_A.empresaId,
  });
  if (visibleBeforeSuspension.length !== 1) {
    throw new Error("Tenant A could not read its own company before suspension");
  }

  await setCompanyAdminStatus({
    action: "suspend",
    env: { ...baseEnvironment, AUTOOS_AUTH_USER_ID: createdUsers[0] },
  });
  const visibleAfterSuspension = await visibleCompanyIds({
    ...loginA,
    accessToken: tokenA,
    empresaId: TENANT_A.empresaId,
  });
  if (visibleAfterSuspension.length !== 0) {
    throw new Error("A stale JWT retained tenant access after suspension");
  }
  await expectLoginDenied(loginA);

  await setCompanyAdminStatus({
    action: "reactivate",
    env: { ...baseEnvironment, AUTOOS_AUTH_USER_ID: createdUsers[0] },
  });
  assertClaims(await signIn(loginA), TENANT_A);

  console.log("Staging SaaS Auth validation passed for two synthetic tenants.");
} finally {
  for (const authUserId of createdUsers.reverse()) {
    try {
      await cleanupCompanyAdmin({
        env: { ...baseEnvironment, AUTOOS_AUTH_USER_ID: authUserId },
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    runSqlFile({
      databaseUrl: values.SUPABASE_STAGING_DATABASE_URL,
      operationFile: "delete-auth-test-tenants.sql",
    });
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Staging Auth validation cleanup failed");
  }
}
