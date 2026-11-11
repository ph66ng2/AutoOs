import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAlignedVersions,
  assertHomologWorkflow,
  assertPublishTarget,
  assertSigningSecrets,
  artifactMatchesVersion,
  buildManifest,
  findWindowsUpdaterArtifact,
  generateUpdateManifest,
  HOMOLOG_ENDPOINT,
  HOMOLOG_RELEASE_TAG,
  PRODUCTION_LATEST_ENDPOINT,
  resolveHomologTrigger,
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
    () => findWindowsUpdaterArtifact(files, { version: "0.9.9", stat: () => ({ size: 10 }) }),
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
  const found = findWindowsUpdaterArtifact(files, { version: "0.9.9", stat: () => ({ size: 32 }) });
  assert.equal(path.basename(found.installerPath), "AutoOS_0.9.9_x64-setup.exe");
});

test("instalador de outra versão no bundle nunca é escolhido (recorrência do latest.json da v0.6.2)", () => {
  const stat = () => ({ size: 32 });
  const stale = [
    "/tmp/bundle/msi/AutoOS_0.6.1_x64_en-US.msi",
    "/tmp/bundle/msi/AutoOS_0.6.1_x64_en-US.msi.sig",
    "/tmp/bundle/nsis/AutoOS_0.6.1_x64-setup.exe",
    "/tmp/bundle/nsis/AutoOS_0.6.1_x64-setup.exe.sig",
  ];
  const current = [
    "/tmp/bundle/msi/AutoOS_0.6.2_x64_en-US.msi",
    "/tmp/bundle/msi/AutoOS_0.6.2_x64_en-US.msi.sig",
  ];

  // MSI 0.6.1 residual (cache do target) + MSI 0.6.2 assinado: escolhe o 0.6.2, em qualquer ordem.
  for (const files of [[...stale, ...current], [...current, ...stale]]) {
    const found = findWindowsUpdaterArtifact(files, { version: "0.6.2", stat });
    assert.equal(path.basename(found.installerPath), "AutoOS_0.6.2_x64_en-US.msi");
    assert.equal(path.basename(found.signaturePath), "AutoOS_0.6.2_x64_en-US.msi.sig");
  }

  // Só o 0.6.1 no bundle: falha em vez de publicar manifesto apontando para ele.
  assert.throws(
    () => findWindowsUpdaterArtifact(stale, { version: "0.6.2", stat }),
    /versão 0\.6\.2[\s\S]*outra versão foram recusados: AutoOS_0\.6\.1_x64_en-US\.msi/,
  );

  // MSI só da versão antiga e NSIS da versão certa: usa o NSIS 0.6.2, não o MSI 0.6.1.
  const mixed = [
    ...stale.slice(0, 2),
    "/tmp/bundle/nsis/AutoOS_0.6.2_x64-setup.exe",
    "/tmp/bundle/nsis/AutoOS_0.6.2_x64-setup.exe.sig",
  ];
  assert.equal(
    path.basename(findWindowsUpdaterArtifact(mixed, { version: "0.6.2", stat }).installerPath),
    "AutoOS_0.6.2_x64-setup.exe",
  );

  // MSI e NSIS da versão certa: a preferência estável é o MSI (histórico de produção).
  const both = [...current, ...mixed.slice(2)];
  assert.equal(
    path.basename(findWindowsUpdaterArtifact(both, { version: "0.6.2", stat }).installerPath),
    "AutoOS_0.6.2_x64_en-US.msi",
  );
  // Homologação publica só NSIS: um MSI não entra no manifesto desse canal.
  assert.equal(
    path.basename(findWindowsUpdaterArtifact(both, { version: "0.6.2", kinds: ["nsis"], stat }).installerPath),
    "AutoOS_0.6.2_x64-setup.exe",
  );
  assert.throws(
    () => findWindowsUpdaterArtifact(current, { version: "0.6.2", kinds: ["nsis"], stat }),
    /Nenhum instalador Windows \(NSIS\)/,
  );

  // Versão parecida não confunde (0.6.2 x 10.6.2 x 0.6.20) e versão ausente é erro.
  assert.equal(artifactMatchesVersion("AutoOS_0.6.2_x64-setup.exe", "0.6.2"), true);
  assert.equal(artifactMatchesVersion("AutoOS_10.6.2_x64-setup.exe", "0.6.2"), false);
  assert.equal(artifactMatchesVersion("AutoOS_0.6.20_x64-setup.exe", "0.6.2"), false);
  assert.throws(() => findWindowsUpdaterArtifact(both, { stat }), /inválida/);
});

test("geração com bundle residual: manifesto 0.6.2 aponta para o MSI 0.6.2 e falha se só houver 0.6.1", () => {
  const root = tempDir();
  const env = {
    GITHUB_REF_NAME: "v0.6.2",
    GITHUB_REF_TYPE: "tag",
    GITHUB_REPOSITORY: "ph66ng2/AutoOs",
    TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
  };
  try {
    writeProject(root, { version: "0.6.2" });
    writeBundle(root, { artifact: "AutoOS_0.6.1_x64_en-US.msi", signature: "assinatura-antiga-0.6.1" });
    assert.throws(() => generateUpdateManifest({ cwd: root, env }), /outra versão foram recusados/);

    writeBundle(root, { artifact: "AutoOS_0.6.2_x64_en-US.msi" });
    const result = generateUpdateManifest({ cwd: root, env });
    assert.equal(result.artifactName, "AutoOS_0.6.2_x64_en-US.msi");
    assert.equal(
      result.manifest.platforms["windows-x86_64"].url,
      "https://github.com/ph66ng2/AutoOs/releases/download/v0.6.2/AutoOS_0.6.2_x64_en-US.msi",
    );
    assert.equal(result.manifest.platforms["windows-x86_64"].signature, SYNTHETIC_SIGNATURE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("latest.json de exemplo segue o schema e manifesto com artefato de outra versão é recusado", () => {
  const example = JSON.parse(
    readFileSync(new URL("./fixtures/latest.example.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(example).sort(), ["notes", "platforms", "pub_date", "version"]);
  assert.deepEqual(Object.keys(example.platforms), ["windows-x86_64"]);
  assert.deepEqual(Object.keys(example.platforms["windows-x86_64"]).sort(), ["signature", "url"]);
  assert.equal(typeof example.notes, "string");
  assert.doesNotThrow(() =>
    validateManifest(example, {
      expectedVersion: "0.9.9",
      expectedRepository: "ph66ng2/AutoOs",
      expectedTag: "v0.9.9",
      expectedArtifactName: "AutoOS_0.9.9_x64_en-US.msi",
    }),
  );

  // Formato do manifesto quebrado da v0.6.2: tag certa, instalador da 0.6.1.
  const broken = {
    ...example,
    version: "0.6.2",
    platforms: {
      "windows-x86_64": {
        ...example.platforms["windows-x86_64"],
        url: "https://github.com/ph66ng2/AutoOs/releases/download/v0.6.2/AutoOS_0.6.1_x64_en-US.msi",
      },
    },
  };
  assert.throws(
    () => validateManifest(broken, { expectedVersion: "0.6.2", expectedRepository: "ph66ng2/AutoOs" }),
    /artefato de outra versão/,
  );
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

test("homologação publica na tag isolada e recusa latest, banco e make_latest", () => {
  const root = tempDir();
  try {
    writeProject(root);
    // Só o NSIS é publicado no canal; um MSI no bundle não pode entrar no manifesto.
    writeBundle(root);
    writeBundle(root, { artifact: "AutoOS_0.9.9_x64-setup.exe" });
    const result = generateUpdateManifest({
      cwd: root,
      env: {
        AUTOOS_UPDATER_CHANNEL: "homolog",
        AUTOOS_HOMOLOG_CONFIRMATION: "HOMOLOG",
        AUTOOS_RELEASE_VERSION: "0.9.9",
        GITHUB_REPOSITORY: "ph66ng2/AutoOs",
        TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
      },
      now: new Date("2026-09-22T18:00:00.000Z"),
    });
    assert.equal(result.tag, HOMOLOG_RELEASE_TAG);
    assert.equal(
      result.manifest.platforms["windows-x86_64"].url,
      "https://github.com/ph66ng2/AutoOs/releases/download/updater-homolog/AutoOS_0.9.9_x64-setup.exe",
    );
    assert.throws(
      () =>
        generateUpdateManifest({
          cwd: root,
          env: {
            AUTOOS_UPDATER_CHANNEL: "homolog",
            AUTOOS_HOMOLOG_CONFIRMATION: "HOMOLOG",
            AUTOOS_RELEASE_VERSION: "0.9.9",
            DATABASE_URL: "postgres://user:secret@localhost/db",
            TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
          },
        }),
      /recusou variável de banco/,
    );
    assert.throws(
      () => assertPublishTarget({ channel: "homolog", tag: HOMOLOG_RELEASE_TAG, makeLatest: "true", prerelease: "true" }),
      /make_latest/,
    );
    assert.throws(
      () => assertPublishTarget({ channel: "production", tag: HOMOLOG_RELEASE_TAG, makeLatest: "true", prerelease: "false" }),
      /production não pode publicar/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("as notas do arquivo updater-notes.txt entram no manifesto da tela", () => {
  const root = tempDir();
  try {
    writeProject(root);
    writeBundle(root);
    const notes = "0.5.5: o AutoOS verifica atualizações no GitHub. A instalação só começa em Baixar e instalar.";
    writeFileSync(path.join(root, "updater-notes.txt"), `${notes}\n`);
    const result = generateUpdateManifest({
      cwd: root,
      env: {
        GITHUB_REF_NAME: "v0.9.9",
        GITHUB_REF_TYPE: "tag",
        GITHUB_REPOSITORY: "ph66ng2/AutoOs",
        TAURI_SIGNING_PRIVATE_KEY: "synthetic-private",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "synthetic-pass",
      },
    });
    assert.equal(result.manifest.notes, notes);
    assert.ok(notes.length <= 400);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("produção consulta só o latest; homologação consulta o canal isolado e cai para produção", () => {
  const base = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const overlay = JSON.parse(readFileSync("src-tauri/tauri.homolog.conf.json", "utf8"));
  const workflow = readFileSync(".github/workflows/updater-homolog.yml", "utf8");
  assert.deepEqual(base.plugins.updater.endpoints, [PRODUCTION_LATEST_ENDPOINT]);
  assert.deepEqual(overlay.plugins.updater.endpoints, [HOMOLOG_ENDPOINT, PRODUCTION_LATEST_ENDPOINT]);
  assert.equal(overlay.plugins.updater.pubkey, undefined);
  assert.doesNotThrow(() => assertHomologWorkflow(workflow));
  assert.match(workflow, /fail_on_unmatched_files:\s*true/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /Remove-Item -Recurse -Force \$bundle/);
});

test("build de produção limpa o bundle antes de compilar e não publica no canal de homologação", () => {
  const workflow = readFileSync(".github/workflows/build.yml", "utf8");
  const clean = workflow.indexOf("Remove-Item -Recurse -Force $bundle");
  const build = workflow.indexOf("tauri-apps/tauri-action");
  assert.ok(clean > 0 && clean < build, "a limpeza do bundle precisa vir antes do build");
  assert.ok(workflow.indexOf("actions/cache") < clean, "a limpeza precisa vir depois da restauração do cache");
  assert.doesNotMatch(workflow, /updater-homolog/);
});

const VALID_HOMOLOG_WORKFLOW = [
  "on:",
  "  push:",
  "    tags:",
  '      - "homolog-*"',
  "      - 'hotfix-*'",
  "  workflow_dispatch:",
  "    inputs:",
  "      confirmacao: # Digite HOMOLOG",
  "jobs:",
  "  publish:",
  "    steps:",
  "      - run: npm run tauri:build:homolog # src-tauri/tauri.homolog.conf.json",
  "      - uses: softprops/action-gh-release@v2",
  "        with:",
  "          tag_name: updater-homolog",
  "          prerelease: true",
  "          make_latest: false",
].join("\n");

test("workflow de homologação aceita dispatch e tags homolog-*/hotfix-* e recusa o resto", () => {
  assert.doesNotThrow(() => assertHomologWorkflow(VALID_HOMOLOG_WORKFLOW));
  const dispatchOnly = VALID_HOMOLOG_WORKFLOW.replace(/  push:\n    tags:\n.*\n.*\n/, "");
  assert.doesNotMatch(dispatchOnly, /push:/);
  assert.doesNotThrow(() => assertHomologWorkflow(dispatchOnly));

  const mutate = (from, to) => {
    assert.ok(VALID_HOMOLOG_WORKFLOW.includes(from), `trecho ausente no YAML de teste: ${from}`);
    return VALID_HOMOLOG_WORKFLOW.replace(from, to);
  };
  const refused = [
    [mutate('      - "homolog-*"', '      - "v*"'), /homolog-\*\/hotfix-\*/],
    [mutate('      - "homolog-*"', '      - "*"'), /homolog-\*\/hotfix-\*/],
    [mutate("    tags:", "    branches:"), /só aceita tags/],
    [mutate("    tags:", "    branches: [master]\n    tags:"), /só aceita tags/],
    [mutate("    tags:", "    tags-ignore:"), /só aceita tags/],
    [mutate("  push:\n    tags:", "  push:\n    tags: ['v*']\n    paths:"), /só aceita tags/],
    [mutate("  push:\n    tags:\n      - \"homolog-*\"\n      - 'hotfix-*'\n", "  push:\n"), /precisa listar tags/],
    [mutate("  push:", "  push: {}"), /precisa listar tags/],
    [mutate("  workflow_dispatch:", "  pull_request:\n  workflow_dispatch:"), /só pode ser workflow_dispatch ou push de tags/],
    [mutate("  workflow_dispatch:", "  release:\n    types: [published]\n  workflow_dispatch:"), /só pode ser/],
    [mutate("  workflow_dispatch:", "  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:"), /só pode ser/],
    [mutate("  workflow_dispatch:\n    inputs:\n      confirmacao: # Digite HOMOLOG\n", ""), /precisa de workflow_dispatch/],
    [mutate("make_latest: false", "make_latest: true"), /make_latest/],
    [mutate("prerelease: true", "prerelease: false"), /prerelease/],
    [mutate("tag_name: updater-homolog", "tag_name: v1.2.3"), /tag isolada/],
    [`${VALID_HOMOLOG_WORKFLOW}\n          # https://github.com/ph66ng2/AutoOs/releases/latest/download/latest.json`, /latest nem para banco/],
    [`${VALID_HOMOLOG_WORKFLOW}\n        env:\n          AUTOOS_DATABASE_URL: x`, /latest nem para banco/],
  ];
  for (const [source, expected] of refused) {
    assert.throws(() => assertHomologWorkflow(source), expected, source);
  }
});

test("disparo de homologação: dispatch usa os inputs, tag homolog-/hotfix- define a versão, v* é recusada", () => {
  assert.deepEqual(
    resolveHomologTrigger({ eventName: "workflow_dispatch", refType: "branch", refName: "master", inputVersion: "0.9.9", inputConfirmation: "HOMOLOG" }),
    { version: "0.9.9", confirmation: "HOMOLOG", source: "workflow_dispatch" },
  );
  // No dispatch a confirmação digitada não é substituída: valor errado segue errado e é barrado adiante.
  assert.equal(
    resolveHomologTrigger({ eventName: "workflow_dispatch", inputVersion: "0.9.9", inputConfirmation: "sim" }).confirmation,
    "sim",
  );
  assert.throws(() => resolveHomologTrigger({ eventName: "workflow_dispatch", inputVersion: "" }), /inválida/);
  assert.deepEqual(
    resolveHomologTrigger({ eventName: "push", refType: "tag", refName: "hotfix-0.9.9" }),
    { version: "0.9.9", confirmation: "HOMOLOG", source: "tag hotfix" },
  );
  assert.equal(resolveHomologTrigger({ eventName: "push", refType: "tag", refName: "homolog-v0.9.9" }).version, "0.9.9");
  for (const refName of ["v0.9.9", "hotfix-", "hotfix-0.9", "homolog-0.9.9-rc1", "release-0.9.9", "hotfix-0.0.0"]) {
    assert.throws(() => resolveHomologTrigger({ eventName: "push", refType: "tag", refName }), /recusada|0\.0\.0/, refName);
  }
  assert.throws(() => resolveHomologTrigger({ eventName: "push", refType: "branch", refName: "hotfix-0.9.9" }), /só publica/);
  assert.throws(() => resolveHomologTrigger({ eventName: "pull_request", refType: "branch", refName: "x" }), /só publica/);
});

test("--resolve-homolog-trigger grava versão e confirmação e a tag precisa bater com os manifests", () => {
  const root = tempDir();
  const outputFile = path.join(root, "github-output");
  try {
    writeProject(root);
    writeFileSync(outputFile, "");
    runCli(["--resolve-homolog-trigger"], {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: "hotfix-0.9.9",
      GITHUB_OUTPUT: outputFile,
    }, root);
    const output = readFileSync(outputFile, "utf8");
    assert.match(output, /^version=0\.9\.9$/m);
    assert.match(output, /^confirmacao=HOMOLOG$/m);

    // Passo seguinte do workflow: a versão da tag é conferida com os três manifests.
    const homologEnv = { AUTOOS_UPDATER_CHANNEL: "homolog", AUTOOS_HOMOLOG_CONFIRMATION: "HOMOLOG" };
    assert.equal(
      runCli(["--check-versions"], { ...homologEnv, AUTOOS_RELEASE_VERSION: "0.9.9" }, root).tag,
      HOMOLOG_RELEASE_TAG,
    );
    assert.throws(
      () => runCli(["--check-versions"], { ...homologEnv, AUTOOS_RELEASE_VERSION: "0.9.8" }, root),
      /desalinhadas/,
    );
    assert.throws(
      () => runCli(["--check-versions"], { AUTOOS_UPDATER_CHANNEL: "homolog", AUTOOS_HOMOLOG_CONFIRMATION: "sim", AUTOOS_RELEASE_VERSION: "0.9.9" }, root),
      /Confirmação inválida/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
