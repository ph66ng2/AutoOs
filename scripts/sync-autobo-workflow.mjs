import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultSource = "/home/paulo/Projetos/AutoBO/.workflow/workflow.json";
const sourceFile = path.resolve(process.env.AUTOBO_WORKFLOW_SOURCE || defaultSource);
const destinationFile = path.join(projectRoot, "workflow-dashboard", "data", "autobo-workflow.json");

const raw = await readFile(sourceFile, "utf8");
const workflow = JSON.parse(raw);

if (!Array.isArray(workflow.tickets) || workflow.tickets.length === 0) {
  throw new Error("O workflow do AutoBO não possui tickets válidos.");
}
if (!workflow.tickets.every((ticket) => String(ticket.id || "").startsWith("BO-"))) {
  throw new Error("O snapshot do AutoBO contém ticket fora do prefixo BO-.");
}

const forbiddenKeys = [];
function scan(value, pathParts = []) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (/(password|secret|token|api[_-]?key|private[_-]?key)/i.test(key)) forbiddenKeys.push(nextPath.join("."));
    scan(nested, nextPath);
  }
}
scan(workflow);
if (forbiddenKeys.length) {
  throw new Error(`O snapshot contém campos proibidos: ${forbiddenKeys.join(", ")}`);
}

await writeFile(destinationFile, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
console.log(`Snapshot do AutoBO atualizado: ${workflow.tickets.length} tickets.`);
