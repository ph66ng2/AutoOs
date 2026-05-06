/**
 * Injeta Authenticode thumbprint + timestamp em src-tauri/tauri.conf.json a partir do ambiente,
 * antes de `npm run tauri build`. Nunca commite o JSON com thumbprint corporativo —
 * usar secrets de CI/CD ou aplicar apenas no checkout de release.
 *
 * Env:
 *   AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT — SHA1 do certificado (40 hex, sem espaços)
 *   AUTOOS_WINDOWS_CODESIGN_TIMESTAMP_URL   — opcional; default Digicert public timestamp
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "src-tauri", "tauri.conf.json");

const thumb = process.env.AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT?.trim();
const timestampUrl =
  process.env.AUTOOS_WINDOWS_CODESIGN_TIMESTAMP_URL?.trim() ||
  "http://timestamp.digicert.com";

if (!thumb) {
  console.error(
    "[AutoOS] Defina AUTOOS_WINDOWS_CODESIGN_CERT_THUMBPRINT (SHA1 hex do certificado) para gravar thumbprint antes do bundle Windows.",
  );
  process.exit(1);
}

const hexOnly = /^[0-9a-fA-F]{40}$/;
if (!hexOnly.test(thumb)) {
  console.error(
    "[AutoOS] thumbprint inválido: esperado SHA1 em 40 caracteres hex (ex.: fingerprint de certutil / PowerShell Get-PfxCertificate).",
  );
  process.exit(1);
}

let raw = fs.readFileSync(configPath, "utf8");
/** @type {Record<string, unknown>} */
const cfg = JSON.parse(raw);
if (!cfg.bundle || typeof cfg.bundle !== "object") {
  console.error("[AutoOS] tauri.conf.json: bundle ausente ou inválido.");
  process.exit(1);
}
/** @type {Record<string, unknown>} */
const bundle = /** @type {Record<string, unknown>} */ (cfg.bundle);
bundle.windows = typeof bundle.windows === "object" && bundle.windows !== null ? { ...bundle.windows } : {};

/** @type {Record<string, unknown>} */
const win = /** @type {Record<string, unknown>} */ (bundle.windows);
win.certificateThumbprint = thumb.toUpperCase();
win.timestampUrl = timestampUrl;
win.digestAlgorithm = win.digestAlgorithm || "sha256";

const out = JSON.stringify(cfg, null, 2) + "\n";
fs.writeFileSync(configPath, out, "utf8");
console.log("[AutoOS] bundle.windows atualizado (thumbprint + timestampUrl). Lembre-se de revertê-lo após o build.");
