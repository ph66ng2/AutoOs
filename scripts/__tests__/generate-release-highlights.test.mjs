import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractUserHighlights, buildHighlights, generateReleaseHighlights } from "../generate-release-highlights.mjs";

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const section = (text) => `## Novidades para o usuário\n\n- ${text}\n`;
const release = (tag, date = "2026-11-01") => ({ tag_name: tag, published_at: date, draft: false, prerelease: false });
const pr = (number, sha, text, extra = {}) => ({ number, merge_commit_sha: sha, body: section(text), merged_at: "2026-11-02", base: { ref: "master" }, ...extra });

function fixture({ version = "0.6.3", content = '{"version":"0.6.2","highlights":[]}' } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "autoos-highlights-"));
  directories.push(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ version }));
  const file = path.join(cwd, "src/generated/release-highlights.json");
  if (content !== null) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return { cwd, file, env: { GITHUB_REPOSITORY: "owner/repo" }, git: () => "head-sha", report: () => {} };
}

function apiFor({ releases = [[release("v0.6.2")]], commits = [{ sha: "included" }], prs = [[pr(1, "included", "Busca melhorada")]], compare } = {}) {
  return (endpoint) => {
    if (endpoint.includes("/releases?")) return releases;
    if (endpoint.includes("/compare/")) return compare?.(endpoint) ?? [{ status: "ahead", total_commits: commits.length, commits }];
    if (endpoint.includes("/pulls?")) return prs;
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
}

test("extrai apenas bullets da seção padrão, ignorando exemplos, checklists e outras seções", () => {
  const body = `## O que muda\n- Interno\n## Novidades para o usuário\n<!-- - Exemplo\n- Não publicar -->\n- Busca mais rápida\n* Clientes por telefone\n- [ ] Checklist\n\n\`\`\`md\n- Código de exemplo\n\`\`\`\n## Verificação\n- Lint\n`;
  assert.deepEqual(extractUserHighlights(body), ["Busca mais rápida", "Clientes por telefone"]);
  assert.deepEqual(extractUserHighlights("## Novidades para o usuário\n\n<!-- só exemplo -->\n## Testes\n- OK"), []);
  assert.deepEqual(extractUserHighlights("## Interno\n- Sem seção"), []);
});

test("só inclui PRs mergeados para master presentes no intervalo exato de commits", () => {
  const data = buildHighlights({
    version: "0.6.3", baseTag: "v0.6.2", head: "head", commits: [{ sha: "yes" }, { sha: "also" }],
    pullRequests: [pr(3, "also", "Segunda"), pr(1, "yes", "Primeira"), pr(2, "yes", "Primeira"),
      pr(4, "old", "Antes da tag"), pr(5, "future", "Depois do checkout"),
      pr(6, "yes", "SaaS", { base: { ref: "feature" } }), pr(7, "yes", "Aberto", { merged_at: null }),
      pr(8, "yes", "Interno", { body: "## O que muda\n- Interno" })],
  });
  assert.deepEqual(data.highlights, [{ title: "Primeira" }, { title: "Segunda" }]);
  assert.deepEqual(data.pullRequests, [1, 2, 3]);
  assert.equal(data.version, "0.6.3");
});

test("usa a última release estável ancestral, com páginas de releases, commits e PRs", () => {
  const options = fixture();
  const result = generateReleaseHighlights({ ...options, api: apiFor({
    releases: [[{ ...release("updater-homolog", "2026-11-04"), prerelease: true },
      { ...release("v0.6.4", "2026-11-04"), draft: true }],
      [release("v9.9.9", "2026-11-03"), release("v0.6.2")]],
    compare: (endpoint) => endpoint.includes("v9.9.9")
      ? [{ status: "diverged", total_commits: 2, commits: [] }]
      : [{ status: "ahead", total_commits: 2, commits: [{ sha: "one" }] },
        { status: "ahead", total_commits: 2, commits: [{ sha: "two" }] }],
    prs: [[pr(1, "one", "Primeira")], [pr(2, "two", "Segunda")]],
  }) });
  assert.equal(result.baseTag, "v0.6.2");
  assert.deepEqual(result.highlights, [{ title: "Primeira" }, { title: "Segunda" }]);
  assert.deepEqual(JSON.parse(readFileSync(options.file)), result);
});

test("preserva byte a byte o conteúdo commitado de uma versão já publicada", () => {
  const original = '{"version":"0.6.2","title":"Original","highlights":[{"title":"Publicado"}]}\n';
  const options = fixture({ version: "0.6.2", content: original });
  generateReleaseHighlights({ ...options, api: (endpoint) => {
    assert.match(endpoint, /\/releases\?/);
    return [[release("v0.6.2")]];
  } });
  assert.equal(readFileSync(options.file, "utf8"), original);
});

test("sem rede, sem token ou com erro parcial mantém o JSON commitado", () => {
  for (const failureAt of ["releases", "compare", "pulls"]) {
    const options = fixture();
    const original = readFileSync(options.file, "utf8");
    const api = apiFor();
    assert.equal(generateReleaseHighlights({ ...options, api: (endpoint) => {
      if (endpoint.includes(`/${failureAt}`)) throw new Error("network/token");
      return api(endpoint);
    } }), null);
    assert.equal(readFileSync(options.file, "utf8"), original);
  }
});

test("não grava resultado parcial se a paginação de commits estiver incompleta", () => {
  const options = fixture();
  const original = readFileSync(options.file, "utf8");
  generateReleaseHighlights({ ...options, api: apiFor({ compare: () => [{ status: "ahead", total_commits: 2, commits: [{ sha: "one" }] }] }) });
  assert.equal(readFileSync(options.file, "utf8"), original);
});

test("offline e sem arquivo gera um JSON mínimo; o card usa seu aviso genérico", () => {
  const options = fixture({ content: null });
  generateReleaseHighlights({ ...options, env: { AUTOOS_HIGHLIGHTS_OFFLINE: "1" }, api: () => { throw new Error("não deve consultar"); } });
  assert.deepEqual(JSON.parse(readFileSync(options.file)), { version: "0.6.3", highlights: [] });
});

test("seções vazias geram lista vazia sem herdar novidades da versão anterior", () => {
  const options = fixture();
  const result = generateReleaseHighlights({ ...options, api: apiFor({ prs: [[pr(1, "included", "", { body: "## Novidades para o usuário\n<!-- vazio -->" })]] }) });
  assert.deepEqual(result.highlights, []);
  assert.deepEqual(result.pullRequests, []);
});
