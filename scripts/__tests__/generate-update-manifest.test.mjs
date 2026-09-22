import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAlignedVersions,
  assertSigningSecrets,
  buildManifest,
  findWindowsUpdaterArtifact,
  generateUpdateManifest,
  resolveReleaseVersion,
  runCli,
  validateManifest,
} from "../generate-update-manifest.mjs";

const SYNTHETIC_SIGNATURE = "untrusted comment: minisign signature from synthetic key\nRWTfakeSignaturePayloadForTestsOnly==";

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "autoos-updater-"));
}

function writeProject(root, { version = "0.9.9", pubkey = "dGVzdHB1YmtleQ==", createUpdaterArtifacts = true } = {}) {
  mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "autoos", version }, null, 2));
  writeFileSync(
    path.join(root, "src-tauri/Cargo.toml"),
    `[package]\nname = "autoos"\nversion = "${version}"\nedition = "2021"\n\n[dependencies]\nfoo = "1"\n`,
  );
  writeFileSync(
    path.join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({
      version,
      bundle: { createUpdaterArtifacts },
      plugins: { updater: { pubkey } },
    }),
  );
}

function writeBundle(root, { artifact = "AutoOS_0.9.9_x64_en-US.msi", signature = SYNTHETIC_SIGNATURE, emptyInstaller = false, omitSignature = false } = {}) {
  const nsisDir = path.join(root, "src-tauri/target/release/bundle/nsis");
  const msiDir = path.join(root, "src-tauri/target/release/bundle/msi");
  mkdirSync(nsisDir, { recursive: true });
  mkdirSync(msiDir, { recursive: true });
  const installerPath = path.join(artifact.endsWith(".exe") ? nsisDir : msiDir, artifact);
  writeFileSync(installerPath, emptyInstaller ? "" : "synthetic-installer");
  if (!omitSignature) {
    writeFileSync(`${installerPath}.sig`, signature);
  }
  return installerPath;
}

test("tag SemVer válida é aceita e 0.0.0 ou dispatch sem versão falham", () => {
  assert.equal(
    resolveReleaseVersion({ refName: "v0.9.9", refType: "tag" }),
    "0.9.9",
  );
  assert.equal(
    resolveReleaseVersion({ refName: "master", refType: "branch", explicitVersion: "0.9.9" }),
    "0.9.9",
  );
  assert.throws(
    () => resolveReleaseVersion({ refName: "", refType: "tag" }),
    /0\.0\.0 não é permitido|inválida/,
  );
  assert.throws(
    () => resolveReleaseVersion({ refName: "v0.0.0", refType: "tag" }),
    /0\.0\.0/,
  );
  assert.throws(
    () => resolveReleaseVersion({ refName: "master", refType: "branch" }),
    /workflow_dispatch/,
  );
  assert.throws(
    () => resolveReleaseVersion({ refName: "feature", refType: "branch", explicitVersion: "latest" }),
    /SemVer/,
  );
});

test("versões desalinhadas entre tag e manifests falham antes de gerar latest.json", () => {
  assert.throws(
    () =>
      assertAlignedVersions({
        releaseVersion: "0.9.9",
        packageVersion: "0.9.9",
        cargoVersion: "0.9.8",
        tauriVersion: "0.9.9",
      }),
    /desalinhadas/,
  );
});

test("ausência de instalador, assinatura ou asset vazio falha", () => {
  const files = [
    "/tmp/bundle/msi/AutoOS_0.9.9_x64_en-US.msi",
    "/tmp/bundle/nsis/AutoOS_0.9.9_x64-setup.exe",
  ];
  assert.throws(
    () => findWindowsUpdaterArtifact(files, { stat: () => ({ size: 10 }) }),
    /assinatura/,
  );

  const emptyRoot = tempDir();
  try {
    writeProject(emptyRoot);
    mkdirSync(path.join(emptyRoot, "src-tauri/target/release/bundle/msi"), { recursive: true });
    assert.throws(
      () =>
        generateUpdateManifest({
          cwd: emptyRoot,
          env: {
            GITHUB_REF_NAME: "v0.9.9",
            GITHUB_REF_TYPE: "tag",
            TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
          },
          requireSigningKey: true,
        }),
      /Nenhum instalador Windows/,
    );
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("dry-run sintético gera latest.json com windows-x86_64, URL e assinatura do .sig", () => {
  const root = tempDir();
  try {
    writeProject(root);
    writeBundle(root);
    const result = generateUpdateManifest({
      cwd: root,
      env: {
        GITHUB_REF_NAME: "v0.9.9",
        GITHUB_REF_TYPE: "tag",
        GITHUB_REPOSITORY: "ph66ng2/AutoOs",
        TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
      },
      now: new Date("2026-09-22T18:00:00.000Z"),
    });

    assert.equal(result.version, "0.9.9");
    assert.equal(result.artifactName, "AutoOS_0.9.9_x64_en-US.msi");
    const written = JSON.parse(readFileSync(result.outputPath, "utf8"));
    assert.equal(written.version, "0.9.9");
    assert.equal(
      written.platforms["windows-x86_64"].url,
      "https://github.com/ph66ng2/AutoOs/releases/download/v0.9.9/AutoOS_0.9.9_x64_en-US.msi",
    );
    assert.equal(written.platforms["windows-x86_64"].signature, SYNTHETIC_SIGNATURE);
    assert.doesNotMatch(JSON.stringify(written), /synthetic-private|postgres:\/\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("NSIS é usado quando o MSI assinado não existe", () => {
  const files = [
    "/tmp/bundle/nsis/AutoOS_0.9.9_x64-setup.exe",
    "/tmp/bundle/nsis/AutoOS_0.9.9_x64-setup.exe.sig",
  ];
  const found = findWindowsUpdaterArtifact(files, { stat: () => ({ size: 32 }) });
  assert.equal(path.basename(found.installerPath), "AutoOS_0.9.9_x64-setup.exe");
});

test("validateManifest recusa plataforma errada, assinatura divergente e URL de outro repo", () => {
  const manifest = buildManifest({
    version: "0.9.9",
    tag: "v0.9.9",
    repository: "ph66ng2/AutoOs",
    artifactName: "AutoOS_0.9.9_x64_en-US.msi",
    signature: SYNTHETIC_SIGNATURE,
    now: new Date("2026-09-22T18:00:00.000Z"),
  });
  assert.throws(
    () =>
      validateManifest(manifest, {
        expectedVersion: "0.9.9",
        expectedRepository: "ph66ng2/AutoOs",
        expectedTag: "v0.9.9",
        expectedArtifactName: "AutoOS_0.9.9_x64_en-US.msi",
        expectedSignature: "outra-assinatura",
      }),
    /exatamente a assinatura/,
  );
  assert.throws(
    () =>
      validateManifest(
        { ...manifest, platforms: { "linux-x86_64": manifest.platforms["windows-x86_64"] } },
        { expectedRepository: "ph66ng2/AutoOs" },
      ),
    /windows-x86_64/,
  );
});

test("--check-versions grava output do GitHub Actions e recusa dispatch sem versão", () => {
  const root = tempDir();
  const outputFile = path.join(root, "github-output");
  try {
    writeProject(root);
    writeFileSync(outputFile, "");
    const checked = runCli(["--check-versions"], {
      GITHUB_REF_NAME: "v0.9.9",
      GITHUB_REF_TYPE: "tag",
      GITHUB_OUTPUT: outputFile,
    }, root);
    assert.equal(checked.version, "0.9.9");
    assert.match(readFileSync(outputFile, "utf8"), /version=0\.9\.9/);
    assert.match(readFileSync(outputFile, "utf8"), /tag=v0\.9\.9/);

    assert.throws(
      () =>
        runCli(["--check-versions"], {
          GITHUB_REF_NAME: "master",
          GITHUB_REF_TYPE: "branch",
        }, root),
      /workflow_dispatch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("segredo de assinatura ausente é recusado sem imprimir valor", () => {
  assert.throws(() => assertSigningSecrets({}), /TAURI_SIGNING_PRIVATE_KEY/);
  assert.throws(
    () => assertSigningSecrets({ TAURI_SIGNING_PRIVATE_KEY: "abc" }),
    /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/,
  );
});
