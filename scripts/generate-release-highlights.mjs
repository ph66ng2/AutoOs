import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function extractUserHighlights(body = "") {
  const items = [];
  let inside = false;
  let fence = null;
  for (const line of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      continue;
    }
    if (fence) continue;
    if (/^##\s+Novidades para o usuário\s*#*\s*$/i.test(line)) {
      inside = true;
      continue;
    }
    if (/^#{1,2}\s/.test(line)) inside = false;
    if (!inside) continue;
    const item = line.match(/^\s*[-*+]\s+(\S.*)$/)?.[1].trim();
    if (item && !/^\[[ xX]\](?:\s|$)/.test(item)) items.push(item);
  }
  return items;
}

export function buildHighlights({ version, baseTag, head, commits, pullRequests, baseBranch = "master" }) {
  const includedCommits = new Set(commits.map(({ sha }) => sha));
  const prs = pullRequests
    .filter((pr) => pr.merged_at && pr.base?.ref === baseBranch && includedCommits.has(pr.merge_commit_sha))
    .sort((a, b) => a.merged_at.localeCompare(b.merged_at) || a.number - b.number);
  const items = [...new Set(prs.flatMap((pr) => extractUserHighlights(pr.body ?? "")))];
  return {
    version,
    baseTag,
    head,
    pullRequests: prs.filter((pr) => extractUserHighlights(pr.body ?? "").length > 0).map((pr) => pr.number),
    title: "Novidades do AutoOS",
    description: `Confira o que mudou no AutoOS ${version}.`,
    highlights: items.map((title) => ({ title })),
    badges: [],
  };
}

function run(program, args, cwd) {
  return execFileSync(program, args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function githubPages(endpoint, cwd) {
  // gh usa GH_TOKEN/GITHUB_TOKEN na CI e a autenticação local no desenvolvimento.
  return JSON.parse(run("gh", ["api", "--paginate", "--slurp", endpoint], cwd));
}

function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, file);
}

export function generateReleaseHighlights({
  cwd = root,
  env = process.env,
  api = (endpoint) => githubPages(endpoint, cwd),
  git = (args) => run("git", args, cwd),
  report = (message) => process.stdout.write(`${message}\n`),
} = {}) {
  const file = path.join(cwd, "src/generated/release-highlights.json");
  const version = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")).version;
  try {
    if (env.AUTOOS_HIGHLIGHTS_OFFLINE === "1") throw new Error("offline");
    const remote = env.GITHUB_REPOSITORY || git(["remote", "get-url", "origin"])
      .replace(/\.git$/, "").match(/github\.com[:/]([^/]+\/[^/]+)$/)?.[1];
    if (!remote || !/^[\w.-]+\/[\w.-]+$/.test(remote)) throw new Error("repository");
    const head = git(["rev-parse", "HEAD"]);
    const prefix = `repos/${remote}`;
    const releases = api(`${prefix}/releases?per_page=100`).flat()
      .filter((release) => !release.draft && !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name))
      .sort((a, b) => b.published_at.localeCompare(a.published_at));
    // Não reescreve o resumo de uma versão já publicada, inclusive a 0.6.2.
    if (releases.some((release) => release.tag_name.replace(/^v/, "") === version) && existsSync(file)) {
      const bundled = JSON.parse(readFileSync(file, "utf8"));
      if (bundled.version === version) {
        report(`Novidades: preservado o JSON da versão publicada ${version}.`);
        return bundled;
      }
    }

    let baseTag;
    let commits;
    for (const release of releases) {
      if (release.tag_name.replace(/^v/, "") === version) continue;
      const pages = api(`${prefix}/compare/${encodeURIComponent(release.tag_name)}...${head}?per_page=100`);
      // Tags de outras linhas e tags posteriores ao checkout não são a base.
      if (!["ahead", "identical"].includes(pages[0]?.status)) continue;
      baseTag = release.tag_name;
      commits = pages.flatMap((page) => page.commits);
      if (commits.length !== pages[0].total_commits) throw new Error("incomplete compare");
      break;
    }
    if (!baseTag || !commits) throw new Error("release base");
    // Paginação da API, sem depender das tags/histórico de um checkout raso da CI.
    const pullRequests = api(`${prefix}/pulls?state=closed&base=master&per_page=100`).flat();
    const content = buildHighlights({ version, baseTag, head, commits, pullRequests });
    writeJson(file, content);
    report(`Novidades: ${content.highlights.length} itens para ${version}, desde ${baseTag}.`);
    return content;
  } catch {
    // Não imprime erros de processos/HTTP: podem conter credenciais do ambiente.
    report("Novidades: GitHub indisponível ou geração incompleta; usando o JSON commitado.");
    if (!existsSync(file)) {
      writeJson(file, { version, highlights: [] });
    }
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateReleaseHighlights();
}
