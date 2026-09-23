import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REPOSITORY = "ph66ng2/AutoOs";
export const UPDATER_PLATFORM = "windows-x86_64";
export const HOMOLOG_RELEASE_TAG = "updater-homolog";
export const PRODUCTION_LATEST_ENDPOINT = `https://github.com/${DEFAULT_REPOSITORY}/releases/latest/download/latest.json`;
export const HOMOLOG_ENDPOINT = `https://github.com/${DEFAULT_REPOSITORY}/releases/download/${HOMOLOG_RELEASE_TAG}/latest.json`;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const DATABASE_ENV_KEYS = ["AUTOOS_DATABASE_URL", "DATABASE_URL", "COMPILE_TIME_DATABASE_URL"];

export function normalizeVersion(raw) {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "");
}

export function assertSemVer(version, label = "versão") {
  if (!version || version === "0.0.0") {
    throw new Error(
      `${label} inválida: ${JSON.stringify(version) || "(vazia)"}. Informe uma SemVer explícita (ex: 0.5.5); 0.0.0 não é permitido.`,
    );
  }
  if (!SEMVER.test(version)) {
    throw new Error(`${label} não é SemVer X.Y.Z: ${version}`);
  }
  return version;
}

export function resolveReleaseVersion({
  refName = "",
  refType = "",
  explicitVersion = "",
} = {}) {
  const fromInput = normalizeVersion(explicitVersion);
  if (fromInput) {
    return assertSemVer(fromInput, "versão informada");
  }

  if (String(refType).toLowerCase() === "tag") {
    return assertSemVer(normalizeVersion(refName), "tag");
  }

  throw new Error(
    "Execução sem tag SemVer e sem versão explícita recusada. " +
      "workflow_dispatch precisa do input version (X.Y.Z) e não publica 0.0.0 nem altera latest.",
  );
}

export function readPackageVersion(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  return assertSemVer(packageJson.version, "package.json");
}

export function readTauriVersion(root) {
  const tauriConf = JSON.parse(
    readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  return {
    version: assertSemVer(tauriConf.version, "tauri.conf.json"),
    pubkey: String(tauriConf.plugins?.updater?.pubkey || "").trim(),
    createUpdaterArtifacts: Boolean(tauriConf.bundle?.createUpdaterArtifacts),
  };
}

export function readCargoVersion(root) {
  const cargoToml = readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
  const packageBlock = cargoToml.match(/\[package\][\s\S]*?(?=\n\[|$)/);
  const version = packageBlock?.[0].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  return assertSemVer(version, "Cargo.toml");
}

export function assertAlignedVersions({ releaseVersion, packageVersion, cargoVersion, tauriVersion }) {
  const versions = {
    release: releaseVersion,
    packageJson: packageVersion,
    cargoToml: cargoVersion,
    tauriConf: tauriVersion,
  };
  const unique = new Set(Object.values(versions));
  if (unique.size !== 1) {
    throw new Error(
      `Versões desalinhadas: ${JSON.stringify(versions)}. Tag, package.json, Cargo.toml e tauri.conf.json devem coincidir.`,
    );
  }
  return releaseVersion;
}

export function assertUpdaterPublicKey(pubkey) {
  if (!pubkey) {
    throw new Error(
      "plugins.updater.pubkey está vazio. A chave pública embarcada precisa corresponder à chave privada dos GitHub Secrets.",
    );
  }
  return pubkey;
}

export function resolveUpdaterChannel(env = process.env) {
  const channel = String(env.AUTOOS_UPDATER_CHANNEL || "production").trim().toLowerCase();
  if (channel !== "production" && channel !== "homolog") {
    throw new Error(`Canal de updater desconhecido: ${channel}. Use production ou homolog.`);
  }
  return channel;
}

export function releaseTagFor(version, channel) {
  return channel === "homolog" ? HOMOLOG_RELEASE_TAG : `v${version}`;
}

export function assertHomologIsolation(env = process.env) {
  if (resolveUpdaterChannel(env) !== "homolog") {
    throw new Error("A trava de isolamento só vale para o canal homolog.");
  }
  if (String(env.AUTOOS_HOMOLOG_CONFIRMATION || "") !== "HOMOLOG") {
    throw new Error("Confirmação inválida. Digite HOMOLOG para publicar no canal isolado.");
  }
  const present = DATABASE_ENV_KEYS.filter((key) => String(env[key] || "").trim());
  if (present.length > 0) {
    throw new Error(
      `O canal de homologação recusou variável de banco (${present.join(", ")}). O instalador não pode sair conectado a um banco.`,
    );
  }
}

export function assertPublishTarget({ channel, tag, makeLatest, prerelease }) {
  if (channel === "homolog") {
    if (tag !== HOMOLOG_RELEASE_TAG) {
      throw new Error("Homologação só publica na tag updater-homolog.");
    }
    if (String(makeLatest) !== "false") {
      throw new Error("Homologação recusou make_latest diferente de false.");
    }
    if (String(prerelease) !== "true") {
      throw new Error("Homologação precisa ser prerelease para não ocupar o latest de produção.");
    }
    return;
  }
  if (tag === HOMOLOG_RELEASE_TAG) {
    throw new Error("O canal production não pode publicar na tag updater-homolog.");
  }
}

export function assertHomologWorkflow(source) {
  const text = String(source || "");
  if (/^\s*(push|pull_request|release):/m.test(text)) {
    throw new Error("O workflow de homologação só pode ser workflow_dispatch.");
  }
  if (!text.includes("workflow_dispatch:")) {
    throw new Error("O workflow de homologação precisa de workflow_dispatch.");
  }
  if (!text.includes(HOMOLOG_RELEASE_TAG) || !text.includes("src-tauri/tauri.homolog.conf.json")) {
    throw new Error("O workflow de homologação precisa da tag isolada e do config de endpoint.");
  }
  if (!/make_latest:\s*false/.test(text) || /make_latest:\s*true/.test(text)) {
    throw new Error("O workflow de homologação precisa de make_latest: false.");
  }
  if (!/prerelease:\s*true/.test(text)) {
    throw new Error("O workflow de homologação precisa ser prerelease.");
  }
  if (/releases\/latest/.test(text) || DATABASE_ENV_KEYS.some((key) => text.includes(key))) {
    throw new Error("O workflow de homologação não pode apontar para latest nem para banco.");
  }
  if (!text.includes("HOMOLOG")) {
    throw new Error("O workflow de homologação precisa da confirmação HOMOLOG.");
  }
  return true;
}

export function assertSigningSecrets(env = process.env) {
  const privateKey = String(
    env.TAURI_SIGNING_PRIVATE_KEY || env.TAURI_SIGNING_KEY || "",
  ).trim();
  const password = String(env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || "").trim();
  if (!privateKey) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY (ou TAURI_SIGNING_KEY) ausente. Use somente GitHub Secrets; não grave a chave no repositório.",
    );
  }
  if (!password) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD ausente. Use somente GitHub Secrets.",
    );
  }
}

export function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function isNsisInstaller(filePath) {
  return /x64-setup\.exe$/i.test(filePath) && !filePath.endsWith(".sig");
}

function isMsiInstaller(filePath) {
  return filePath.toLowerCase().endsWith(".msi");
}

export function findWindowsUpdaterArtifact(files, { stat = statSync } = {}) {
  const installers = files.filter((file) => isMsiInstaller(file) || isNsisInstaller(file));
  const ranked = [
    ...installers.filter(isMsiInstaller),
    ...installers.filter(isNsisInstaller),
  ];

  for (const installerPath of ranked) {
    const signaturePath = `${installerPath}.sig`;
    if (!files.includes(signaturePath)) {
      continue;
    }
    const installerStat = stat(installerPath);
    const signatureStat = stat(signaturePath);
    if (!installerStat.size) {
      throw new Error(`Instalador vazio: ${path.basename(installerPath)}`);
    }
    if (!signatureStat.size) {
      throw new Error(`Assinatura vazia: ${path.basename(signaturePath)}`);
    }
    return { installerPath, signaturePath };
  }

  throw new Error(
    "Nenhum instalador Windows com assinatura .sig foi encontrado. " +
      "Confirme TAURI_SIGNING_PRIVATE_KEY, createUpdaterArtifacts e o bundle MSI/NSIS.",
  );
}

export function buildManifest({
  version,
  tag,
  repository,
  artifactName,
  signature,
  notes = "Veja as notas de release no GitHub.",
  now = new Date(),
}) {
  const trimmedSignature = String(signature || "").trim();
  if (!trimmedSignature) {
    throw new Error("Assinatura do updater está vazia.");
  }

  return {
    version,
    notes,
    pub_date: now.toISOString(),
    platforms: {
      [UPDATER_PLATFORM]: {
        signature: trimmedSignature,
        url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(artifactName)}`,
      },
    },
  };
}

export function validateManifest(manifest, {
  expectedVersion,
  expectedRepository,
  expectedTag,
  expectedArtifactName,
  expectedSignature,
} = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("latest.json inválido: manifesto ausente.");
  }
  assertSemVer(manifest.version, "manifesto.version");
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(`latest.json version ${manifest.version} != ${expectedVersion}`);
  }
  if (!manifest.pub_date || Number.isNaN(Date.parse(manifest.pub_date))) {
    throw new Error("latest.json sem pub_date ISO válida.");
  }
  const platform = manifest.platforms?.[UPDATER_PLATFORM];
  if (!platform) {
    throw new Error(`latest.json sem plataforma ${UPDATER_PLATFORM}.`);
  }
  if (!String(platform.signature || "").trim()) {
    throw new Error("latest.json sem assinatura.");
  }
  if (expectedSignature && platform.signature !== expectedSignature.trim()) {
    throw new Error("latest.json não contém exatamente a assinatura do .sig gerado.");
  }
  const expectedUrl = expectedArtifactName
    ? `https://github.com/${expectedRepository}/releases/download/${expectedTag}/${encodeURIComponent(expectedArtifactName)}`
    : null;
  if (expectedUrl && platform.url !== expectedUrl) {
    throw new Error(`URL do manifesto inesperada: ${platform.url}`);
  }
  if (!String(platform.url || "").startsWith(`https://github.com/${expectedRepository || DEFAULT_REPOSITORY}/releases/download/`)) {
    throw new Error("URL do manifesto não aponta para o GitHub Release do repositório.");
  }
  if (/\.sig$/i.test(platform.url)) {
    throw new Error("URL do manifesto aponta para o arquivo .sig em vez do instalador.");
  }
  if (String(platform.url).includes("/releases/latest/")) {
    throw new Error("URL do manifesto não pode usar /releases/latest/.");
  }
  if (expectedTag === HOMOLOG_RELEASE_TAG && !String(platform.url).includes(`/releases/download/${HOMOLOG_RELEASE_TAG}/`)) {
    throw new Error("Manifesto de homologação precisa apontar para a tag updater-homolog.");
  }
  if (expectedTag && expectedTag !== HOMOLOG_RELEASE_TAG && String(platform.url).includes(`/releases/download/${HOMOLOG_RELEASE_TAG}/`)) {
    throw new Error("O canal production não pode publicar na tag updater-homolog.");
  }
  return manifest;
}

export function checkReleaseVersions({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const releaseVersion = resolveReleaseVersion({
    refName: env.GITHUB_REF_NAME,
    refType: env.GITHUB_REF_TYPE,
    explicitVersion: env.AUTOOS_RELEASE_VERSION || env.INPUT_VERSION,
  });
  const packageVersion = readPackageVersion(cwd);
  const cargoVersion = readCargoVersion(cwd);
  const tauri = readTauriVersion(cwd);
  assertAlignedVersions({
    releaseVersion,
    packageVersion,
    cargoVersion,
    tauriVersion: tauri.version,
  });
  assertUpdaterPublicKey(tauri.pubkey);
  if (!tauri.createUpdaterArtifacts) {
    throw new Error("bundle.createUpdaterArtifacts precisa estar ativo para gerar .sig.");
  }
  const channel = resolveUpdaterChannel(env);
  if (channel === "homolog") {
    assertHomologIsolation(env);
  }
  return {
    version: releaseVersion,
    tag: releaseTagFor(releaseVersion, channel),
    channel,
    pubkeyConfigured: true,
  };
}

export function generateUpdateManifest({
  cwd = process.cwd(),
  env = process.env,
  now = new Date(),
  requireSigningKey = true,
  bundleDirectory = path.resolve(cwd, "src-tauri/target/release/bundle"),
  outputPath = path.resolve(cwd, "latest.json"),
} = {}) {
  const checked = checkReleaseVersions({ cwd, env });
  if (requireSigningKey) {
    assertSigningSecrets(env);
  }

  const repository = String(env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY).trim() || DEFAULT_REPOSITORY;
  const files = listFiles(bundleDirectory);
  const { installerPath, signaturePath } = findWindowsUpdaterArtifact(files);
  const artifactName = path.basename(installerPath);
  const signature = readFileSync(signaturePath, "utf8").trim();
  const manifest = validateManifest(
    buildManifest({
      version: checked.version,
      tag: checked.tag,
      repository,
      artifactName,
      signature,
      now,
    }),
    {
      expectedVersion: checked.version,
      expectedRepository: repository,
      expectedTag: checked.tag,
      expectedArtifactName: artifactName,
      expectedSignature: signature,
    },
  );

  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifesto gerado para ${checked.tag} usando ${artifactName}`);
  return { ...checked, repository, artifactName, outputPath, manifest };
}

function writeGithubOutput(values, env = process.env) {
  const outputFile = env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  appendFileSync(outputFile, `${lines.join("\n")}\n`);
}

export function runCli(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  if (argv.includes("--assert-homolog-publish")) {
    assertHomologIsolation(env);
    assertPublishTarget({
      channel: "homolog",
      tag: HOMOLOG_RELEASE_TAG,
      makeLatest: env.AUTOOS_MAKE_LATEST,
      prerelease: env.AUTOOS_PRERELEASE,
    });
    console.log("Publicação de homologação isolada do latest de produção.");
    return { channel: "homolog", tag: HOMOLOG_RELEASE_TAG };
  }
  const checkOnly = argv.includes("--check-versions");
  const skipSigning = argv.includes("--skip-signing-check");
  const checked = checkReleaseVersions({ cwd, env });
  writeGithubOutput(
    {
      version: checked.version,
      tag: checked.tag,
    },
    env,
  );
  if (checkOnly) {
    console.log(`Versão validada: ${checked.version}`);
    return checked;
  }
  return generateUpdateManifest({
    cwd,
    env,
    requireSigningKey: !skipSigning,
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
