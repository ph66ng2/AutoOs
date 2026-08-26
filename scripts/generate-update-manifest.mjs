import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const version = process.env.GITHUB_REF_NAME?.replace("v", "") || "0.0.0";
const tag = process.env.GITHUB_REF_NAME || "v0.0.0";
const repo = "ph66ng2/AutoOS";

const bundleDirectory = path.resolve("src-tauri/target/release/bundle");

function findFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? findFiles(entryPath) : [entryPath];
  });
}

const files = findFiles(bundleDirectory);
const installerPath = files.find((file) => file.endsWith(".msi"));

if (!installerPath) {
  throw new Error(`Nenhum instalador MSI foi encontrado em ${bundleDirectory}.`);
}

const signaturePath = `${installerPath}.sig`;
if (!files.includes(signaturePath)) {
  throw new Error(
    `Assinatura do updater não encontrada: ${signaturePath}. ` +
      "Confirme que TAURI_SIGNING_PRIVATE_KEY está configurada e createUpdaterArtifacts está ativado.",
  );
}

const artifactName = path.basename(installerPath);
const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(artifactName)}`;
const signature = readFileSync(signaturePath, "utf8").trim();

const manifest = {
  version,
  notes: "Veja as notas de release no GitHub.",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url,
    },
  },
};

writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log(`Manifesto gerado para v${version} usando ${artifactName}`);
