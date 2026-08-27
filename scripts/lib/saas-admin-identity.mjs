import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATIONS_DIRECTORY = fileURLToPath(
  new URL("../../supabase/operations/", import.meta.url),
);

export function requireEnvironment(env, names) {
  const values = {};
  for (const name of names) {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    values[name] = value;
  }
  return values;
}

export function validateUuid(value, label) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a canonical UUID`);
  }
  return value.toLowerCase();
}

export function validateAdminKey(value) {
  if (value.startsWith("sb_publishable_") || value.startsWith("anon")) {
    throw new Error("A publishable/anon key cannot provision Auth users");
  }
  if (value.startsWith("sb_secret_")) return value;

  const segments = value.split(".");
  if (segments.length !== 3) {
    throw new Error("SUPABASE_STAGING_ADMIN_KEY must be a secret key or service_role JWT");
  }
  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (payload.role !== "service_role") throw new Error("not service_role");
    return value;
  } catch {
    throw new Error("SUPABASE_STAGING_ADMIN_KEY JWT must carry the service_role role");
  }
}

function authAdminHeaders(adminKey) {
  return {
    apikey: adminKey,
    Authorization: `Bearer ${adminKey}`,
    "Content-Type": "application/json",
  };
}

function authAdminUrl(supabaseUrl, authUserId = undefined) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return authUserId
    ? `${base}/auth/v1/admin/users/${authUserId}`
    : `${base}/auth/v1/admin/users`;
}

export async function createAuthAdminUser({
  fetchImpl,
  supabaseUrl,
  adminKey,
  email,
  password,
  empresaId,
  profileId,
}) {
  if (!email.includes("@")) {
    throw new Error("AUTOOS_ADMIN_EMAIL must be a valid email address");
  }
  if (password.length < 12) {
    throw new Error("AUTOOS_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const response = await fetchImpl(authAdminUrl(supabaseUrl), {
    method: "POST",
    headers: authAdminHeaders(adminKey),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        company_id: empresaId,
        profile_id: profileId,
        profile_role: "ADMIN",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase Auth user creation failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const authUserId = payload.id ?? payload.user?.id;
  return validateUuid(authUserId ?? "", "Supabase Auth user id");
}

export async function deleteAuthAdminUser({
  fetchImpl,
  supabaseUrl,
  adminKey,
  authUserId,
}) {
  const response = await fetchImpl(authAdminUrl(supabaseUrl, authUserId), {
    method: "DELETE",
    headers: authAdminHeaders(adminKey),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase Auth user deletion failed with HTTP ${response.status}`);
  }
}

export function runSqlFile({ databaseUrl, operationFile, variables = {} }) {
  const args = [
    "--set",
    "ON_ERROR_STOP=on",
    "--file",
    `${OPERATIONS_DIRECTORY}${operationFile}`,
  ];

  for (const [name, value] of Object.entries(variables)) {
    args.push("--set", `${name}=${value}`);
  }

  const result = spawnSync("psql", args, {
    env: { ...process.env, PGDATABASE: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Could not execute psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Database operation failed (psql exit ${result.status})`);
  }
}

function requireStagingConfirmation(env) {
  if (env.AUTOOS_CONFIRM_STAGING !== "AutoOS Staging") {
    throw new Error(
      'Set AUTOOS_CONFIRM_STAGING exactly to "AutoOS Staging" before changing identities',
    );
  }
}

export async function provisionCompanyAdmin({
  env = process.env,
  fetchImpl = globalThis.fetch,
  runSql = runSqlFile,
} = {}) {
  requireStagingConfirmation(env);
  const values = requireEnvironment(env, [
    "SUPABASE_STAGING_URL",
    "SUPABASE_STAGING_ADMIN_KEY",
    "SUPABASE_STAGING_DATABASE_URL",
    "AUTOOS_ADMIN_EMAIL",
    "AUTOOS_ADMIN_PASSWORD",
    "AUTOOS_EMPRESA_ID",
    "AUTOOS_PROFILE_ID",
  ]);
  const adminKey = validateAdminKey(values.SUPABASE_STAGING_ADMIN_KEY);
  const empresaId = validateUuid(values.AUTOOS_EMPRESA_ID, "AUTOOS_EMPRESA_ID");
  const profileId = validateUuid(values.AUTOOS_PROFILE_ID, "AUTOOS_PROFILE_ID");

  const authUserId = await createAuthAdminUser({
    fetchImpl,
    supabaseUrl: values.SUPABASE_STAGING_URL,
    adminKey,
    email: values.AUTOOS_ADMIN_EMAIL,
    password: values.AUTOOS_ADMIN_PASSWORD,
    empresaId,
    profileId,
  });

  try {
    runSql({
      databaseUrl: values.SUPABASE_STAGING_DATABASE_URL,
      operationFile: "provision-company-admin.sql",
      variables: { auth_user_id: authUserId, empresa_id: empresaId, profile_id: profileId },
    });
  } catch (databaseError) {
    try {
      await deleteAuthAdminUser({
        fetchImpl,
        supabaseUrl: values.SUPABASE_STAGING_URL,
        adminKey,
        authUserId,
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [databaseError, cleanupError],
        `Provisioning failed; manually remove Auth user ${authUserId}`,
      );
    }
    throw databaseError;
  }

  return { authUserId, empresaId, profileId };
}

export async function setCompanyAdminStatus({
  action,
  env = process.env,
  runSql = runSqlFile,
} = {}) {
  requireStagingConfirmation(env);
  if (action !== "suspend" && action !== "reactivate") {
    throw new Error("Status action must be suspend or reactivate");
  }
  const values = requireEnvironment(env, [
    "SUPABASE_STAGING_DATABASE_URL",
    "AUTOOS_AUTH_USER_ID",
  ]);
  const authUserId = validateUuid(values.AUTOOS_AUTH_USER_ID, "AUTOOS_AUTH_USER_ID");
  runSql({
    databaseUrl: values.SUPABASE_STAGING_DATABASE_URL,
    operationFile: `${action}-company-admin.sql`,
    variables: { auth_user_id: authUserId },
  });
  return { authUserId, action };
}

export async function cleanupCompanyAdmin({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireStagingConfirmation(env);
  const values = requireEnvironment(env, [
    "SUPABASE_STAGING_URL",
    "SUPABASE_STAGING_ADMIN_KEY",
    "AUTOOS_AUTH_USER_ID",
  ]);
  const adminKey = validateAdminKey(values.SUPABASE_STAGING_ADMIN_KEY);
  const authUserId = validateUuid(values.AUTOOS_AUTH_USER_ID, "AUTOOS_AUTH_USER_ID");
  await deleteAuthAdminUser({
    fetchImpl,
    supabaseUrl: values.SUPABASE_STAGING_URL,
    adminKey,
    authUserId,
  });
  return { authUserId };
}
