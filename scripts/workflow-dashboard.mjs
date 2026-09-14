import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { getProjectPaths, readTimelineEvents, readWorkflow, updateTicketStatus, recordEvent } from "../workflow-dashboard/storage.mjs";

const port = Number(process.env.AUTOOS_WORKFLOW_PORT || 4173);
const paths = getProjectPaths();
const dashboardDir = paths.dashboardDir;
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeStaticPath(requestPath) {
  const requested = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const target = path.resolve(dashboardDir, requested);
  if (target !== dashboardDir && !target.startsWith(`${dashboardDir}${path.sep}`)) return null;
  return target;
}

async function serveStatic(requestPath, response) {
  const target = safeStaticPath(requestPath);
  if (!target) return sendJson(response, 400, { error: "Caminho inválido." });
  try {
    const fileStats = await stat(target);
    if (!fileStats.isFile()) return sendJson(response, 404, { error: "Arquivo não encontrado." });
    response.writeHead(200, { "content-type": mimeTypes[path.extname(target)] || "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(target).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Arquivo não encontrado." });
  }
}

async function handle(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true, mode: "local", editable: true, projectRoot: paths.root });
    }
    if (pathname === "/api/workflow" && request.method === "GET") {
      return sendJson(response, 200, { workflow: await readWorkflow(paths), mode: "local", editable: true });
    }
    if (pathname === "/api/events" && request.method === "GET") {
      return sendJson(response, 200, { events: await readTimelineEvents(paths), mode: "local" });
    }
    const ticketMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
    if (ticketMatch && request.method === "PATCH") {
      const body = await readBody(request);
      const result = await updateTicketStatus({
        ticketId: decodeURIComponent(ticketMatch[1]),
        status: body.status,
        summary: body.summary,
        actor: body.actor || "painel local",
        metadata: { note: body.note || null },
      }, paths);
      return sendJson(response, 200, { workflow: result.workflow, ticket: result.ticket, event: result.event });
    }
    if (pathname === "/api/report" && request.method === "POST") {
      const body = await readBody(request);
      const result = await recordEvent({
        ticketId: body.ticketId,
        type: body.type || "progress",
        status: body.status,
        summary: body.summary,
        actor: body.actor || "agente",
        metadata: {
          branch: body.branch || null,
          commit: body.commit || null,
          pr: body.pr || null,
          threadId: body.threadId || null,
          evidence: Array.isArray(body.evidence) ? body.evidence : [],
        },
      }, paths);
      return sendJson(response, 201, { event: result.event, ticket: result.ticket });
    }
    return serveStatic(pathname, response);
  } catch (error) {
    const statusCode = error.code === "NOT_FOUND" ? 404 : error.code === "BLOCKED" ? 409 : 400;
    return sendJson(response, statusCode, { error: error.message, pendingBlockers: error.pendingBlockers || [] });
  }
}

http.createServer((request, response) => {
  void handle(request, response);
}).listen(port, "127.0.0.1", () => {
  console.log(`AutoOS Workflow aberto em http://127.0.0.1:${port}`);
  console.log(`Fonte: ${paths.workflowFile}`);
});
