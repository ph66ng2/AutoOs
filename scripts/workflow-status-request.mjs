import { readFile } from "node:fs/promises";
import { getProjectPaths, updateTicketStatus } from "../workflow-dashboard/storage.mjs";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH não foi definido.");

const payload = JSON.parse(await readFile(eventPath, "utf8"));
const body = payload.issue?.body || "";
if (!body.includes("<!-- autoos-workflow-status-request -->")) {
  console.log("Issue comum; nenhuma solicitação de workflow encontrada.");
  process.exit(0);
}

function field(name) {
  const match = body.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.trim() || "";
}

const ticketId = field("ticketId");
const status = field("status");
const note = field("note") || `Solicitação do Issue #${payload.issue.number}.`;
if (!ticketId || !status) throw new Error("Solicitação sem ticketId ou status.");

const result = await updateTicketStatus({
  ticketId,
  status,
  summary: note,
  actor: payload.issue.user?.login || "github",
  source: "github-status-request",
  metadata: { issue: payload.issue.number, issueUrl: payload.issue.html_url },
}, getProjectPaths(process.cwd()));

console.log(JSON.stringify({ ticketId, status: result.ticket.status, issue: payload.issue.number }));
