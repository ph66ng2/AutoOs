#!/usr/bin/env node

import {
  cleanupCompanyAdmin,
  provisionCompanyAdmin,
  setCompanyAdminStatus,
} from "./lib/saas-admin-identity.mjs";

const action = process.argv[2];

try {
  if (action === "provision") {
    const result = await provisionCompanyAdmin();
    console.log(`SaaS administrator provisioned: auth_user_id=${result.authUserId}`);
  } else if (action === "suspend" || action === "reactivate") {
    const result = await setCompanyAdminStatus({ action });
    console.log(`SaaS administrator ${result.action}: auth_user_id=${result.authUserId}`);
  } else if (action === "cleanup") {
    const result = await cleanupCompanyAdmin();
    console.log(`Synthetic SaaS administrator removed: auth_user_id=${result.authUserId}`);
  } else {
    throw new Error("Usage: manage-staging-saas-admin.mjs <provision|suspend|reactivate|cleanup>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown provisioning failure");
  process.exitCode = 1;
}
