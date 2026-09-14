import { execFileSync } from "node:child_process";
import { getGitContext, getProjectPaths, recordEvent } from "../workflow-dashboard/storage.mjs";

const [command, ticketId, ...rest] = process.argv.slice(2);
const commands = {
  start: { type: "started", status: "in_progress" },
  progress: { type: "progress" },
  test: { type: "test", },
  review: { type: "review", status: "review" },
  block: { type: "blocked", status: "blocked" },
  ready: { type: "unblocked", status: "ready" },
  merged: { type: "merged", status: "merged" },
};

function usage() {
  console.error("Uso: npm run workflow:report -- <start|progress|test|review|block|ready|merged> TICKET [resumo]");
  console.error("Exemplo: npm run workflow:report -- progress AO-PS-005 'Sync Streams validadas'");
  process.exit(64);
}

if (!commands[command] || !ticketId) usage();

const config = commands[command];
const summary = rest.join(" ").trim() || config.type;
const cwd = process.cwd();
const git = getGitContext(cwd);
let actor = "agente";
try {
  actor = execFileSync("git", ["config", "user.name"], { cwd, encoding: "utf8" }).trim() || actor;
} catch {
  // Identidade local opcional; o ticket e a evidência continuam obrigatórios.
}

const result = await recordEvent({
  ticketId,
  type: config.type,
  status: config.status,
  summary,
  actor,
  source: "workflow-report",
  metadata: { branch: git.branch, commit: git.commit },
}, getProjectPaths(cwd));

console.log(JSON.stringify({ ticketId, status: result.ticket?.status, event: result.event }, null, 2));
