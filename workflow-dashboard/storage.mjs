import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const STATUSES = ["ready", "in_progress", "review", "merged", "blocked"];

function runGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function parseWorktrees(output) {
  return output
    .split(/\n\s*\n/)
    .map((block) => {
      const entry = {};
      for (const line of block.split("\n")) {
        const [key, ...value] = line.split(" ");
        if (key === "worktree") entry.path = value.join(" ");
        if (key === "branch") entry.branch = value.join(" ");
      }
      return entry;
    })
    .filter((entry) => entry.path);
}

export function resolveProjectRoot(start = process.cwd()) {
  const currentRoot = runGit(["rev-parse", "--show-toplevel"], start);
  const worktrees = parseWorktrees(runGit(["worktree", "list", "--porcelain"], start));
  const primary = worktrees.find((entry) => entry.branch === "refs/heads/feature") || worktrees[0];
  return primary?.path || currentRoot || start;
}

export function getProjectPaths(start = process.cwd()) {
  const root = resolveProjectRoot(start);
  const currentRoot = runGit(["rev-parse", "--show-toplevel"], start) || root;
  const workflowDir = path.join(root, ".workflow");
  return {
    root,
    currentRoot,
    workflowDir,
    workflowFile: path.join(workflowDir, "workflow.json"),
    eventsFile: path.join(workflowDir, "events.jsonl"),
    lockFile: path.join(workflowDir, ".workflow-dashboard.lock"),
    dashboardDir: path.join(currentRoot, "workflow-dashboard"),
  };
}

export async function readWorkflow(paths = getProjectPaths()) {
  const raw = await readFile(paths.workflowFile, "utf8");
  const workflow = JSON.parse(raw);
  if (!Array.isArray(workflow.tickets)) {
    throw new Error("workflow.json não contém uma lista de tickets válida.");
  }
  return workflow;
}

export async function readEvents(paths = getProjectPaths()) {
  try {
    const raw = await readFile(paths.eventsFile, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function ticketIdsFromText(value) {
  return [...new Set(String(value || "").match(/AO-[A-Z]+-\d{3}/g) || [])];
}

export async function readGitHubEvents(repository = process.env.GITHUB_REPOSITORY || "ph66ng2/AutoOs") {
  try {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "autoos-workflow-dashboard",
    };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repository}/pulls?state=all&per_page=100&sort=updated&direction=desc`, { headers });
    if (!response.ok) return [];
    const pullRequests = await response.json();
    return pullRequests.flatMap((pullRequest) => {
      const ids = ticketIdsFromText(`${pullRequest.title}\n${pullRequest.body || ""}`);
      const common = {
        source: "github",
        pr: pullRequest.number,
        url: pullRequest.html_url,
        branch: pullRequest.head?.ref || null,
        ticketIds: ids,
        ...(ids.length === 1 ? { ticketId: ids[0] } : {}),
      };
      const events = [{
        eventId: `github-pr-${pullRequest.number}-opened`,
        timestamp: pullRequest.created_at,
        type: "pr_opened",
        summary: `PR #${pullRequest.number} aberta: ${pullRequest.title}`,
        ...common,
      }];
      if (pullRequest.merged_at) {
        events.push({
          eventId: `github-pr-${pullRequest.number}-merged`,
          timestamp: pullRequest.merged_at,
          type: "merged",
          status: "merged",
          summary: `PR #${pullRequest.number} integrada: ${pullRequest.title}`,
          ...common,
        });
      } else if (pullRequest.state === "closed") {
        events.push({
          eventId: `github-pr-${pullRequest.number}-closed`,
          timestamp: pullRequest.closed_at || pullRequest.updated_at,
          type: "pr_closed",
          summary: `PR #${pullRequest.number} encerrada: ${pullRequest.title}`,
          ...common,
        });
      }
      return events;
    });
  } catch {
    return [];
  }
}

export async function readTimelineEvents(paths = getProjectPaths()) {
  const [localEvents, githubEvents] = await Promise.all([readEvents(paths), readGitHubEvents()]);
  return [...localEvents, ...githubEvents].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

async function writeWorkflow(workflow, paths) {
  await mkdir(paths.workflowDir, { recursive: true });
  const temporaryFile = path.join(paths.workflowDir, `.workflow.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporaryFile, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  await rename(temporaryFile, paths.workflowFile);
}

async function appendEvent(event, paths) {
  await mkdir(paths.workflowDir, { recursive: true });
  await appendFile(paths.eventsFile, `${JSON.stringify(event)}\n`, "utf8");
}

export async function withWorkflowLock(callback, paths = getProjectPaths()) {
  await mkdir(paths.workflowDir, { recursive: true });
  let lockHandle;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      lockHandle = await open(paths.lockFile, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!lockHandle) throw new Error("O workflow está sendo atualizado por outro agente. Tente novamente.");

  try {
    return await callback();
  } finally {
    await lockHandle.close();
    await rm(paths.lockFile, { force: true });
  }
}

export function getGitContext(cwd = process.cwd()) {
  return {
    branch: runGit(["branch", "--show-current"], cwd) || null,
    commit: runGit(["rev-parse", "--short", "HEAD"], cwd) || null,
  };
}

function ticketById(workflow, ticketId) {
  return workflow.tickets.find((ticket) => ticket.id === ticketId);
}

export function getPendingBlockers(workflow, ticket) {
  return (ticket.blockedBy || []).filter((blockerId) => {
    const blocker = ticketById(workflow, blockerId);
    return !blocker || blocker.status !== "merged";
  });
}

function ensureStatus(status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`Status inválido: ${status}. Use ${STATUSES.join(", ")}.`);
  }
}

export async function updateTicketStatus({ ticketId, status, summary, actor = "local", source = "workflow-dashboard", metadata = {} }, paths = getProjectPaths()) {
  ensureStatus(status);
  return withWorkflowLock(async () => {
    const workflow = await readWorkflow(paths);
    const ticket = ticketById(workflow, ticketId);
    if (!ticket) {
      const error = new Error(`Ticket não encontrado: ${ticketId}`);
      error.code = "NOT_FOUND";
      throw error;
    }

    const pendingBlockers = status === "in_progress" ? getPendingBlockers(workflow, ticket) : [];
    if (pendingBlockers.length > 0) {
      const error = new Error(`Ticket bloqueado por: ${pendingBlockers.join(", ")}`);
      error.code = "BLOCKED";
      error.pendingBlockers = pendingBlockers;
      throw error;
    }

    const previousStatus = ticket.status;
    ticket.status = status;
    if (status === "merged" && !ticket.completedAt) {
      ticket.completedAt = new Date().toISOString().slice(0, 10);
    }
    await writeWorkflow(workflow, paths);

    const event = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      ticketId,
      type: "status_changed",
      previousStatus,
      status,
      summary: summary || `Status alterado de ${previousStatus} para ${status}.`,
      actor,
      source,
      ...metadata,
    };
    await appendEvent(event, paths);
    return { workflow, ticket, event };
  }, paths);
}

export async function recordEvent({ ticketId, type, summary, status, actor = "agent", source = "workflow-report", metadata = {} }, paths = getProjectPaths()) {
  if (status) ensureStatus(status);
  return withWorkflowLock(async () => {
    const workflow = await readWorkflow(paths);
    const ticket = ticketId ? ticketById(workflow, ticketId) : null;
    if (ticketId && !ticket) {
      const error = new Error(`Ticket não encontrado: ${ticketId}`);
      error.code = "NOT_FOUND";
      throw error;
    }
    if (status) {
      const pendingBlockers = status === "in_progress" ? getPendingBlockers(workflow, ticket) : [];
      if (pendingBlockers.length > 0) {
        const error = new Error(`Ticket bloqueado por: ${pendingBlockers.join(", ")}`);
        error.code = "BLOCKED";
        error.pendingBlockers = pendingBlockers;
        throw error;
      }
      ticket.status = status;
      if (status === "merged" && !ticket.completedAt) ticket.completedAt = new Date().toISOString().slice(0, 10);
      await writeWorkflow(workflow, paths);
    }

    const event = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...(ticketId ? { ticketId } : {}),
      type,
      ...(status ? { status } : {}),
      summary: summary || type,
      actor,
      source,
      ...metadata,
    };
    await appendEvent(event, paths);
    return { workflow, ticket, event };
  }, paths);
}
