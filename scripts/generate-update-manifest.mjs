import { readFileSync, writeFileSync } from "fs";
import { createSign } from "crypto";

const version = process.env.GITHUB_REF_NAME?.replace("v", "") || "0.0.0";
const tag = process.env.GITHUB_REF_NAME || "v0.0.0";
const privateKeyPath = process.env.TAURI_SIGNING_KEY || "~/.tauri/autoos.key";
const repo = "ph66ng2/AutoOS";

// Build the release URL
const url = `https://github.com/${repo}/releases/download/${tag}/AutoOS_${version}_x64_pt-BR.msi`;

// Read the private key and sign
const privateKey = readFileSync(privateKeyPath.replace("~", process.env.HOME), "utf8");
const sign = createSign("sha256");
sign.update(url);
sign.end();
const signature = sign.sign(privateKey, "base64");

const manifest = {
  version,
  notes: "Veja as notas de release no GitHub.",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url,
    },
    "linux-x86_64": {
      signature,
      url: url.replace(".msi", ".deb"),
    },
  },
};

writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log(`Manifesto gerado para v${version}`);
