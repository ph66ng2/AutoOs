import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readEvents, readWorkflow, recordEvent, updateTicketStatus } from "./storage.mjs";

const temporaryDirectories = [];

function fixturePaths(directory) {
  return {
    root: directory,
    workflowDir: path.join(directory, ".workflow"),
    workflowFile: path.join(directory, ".workflow", "workflow.json"),
    eventsFile: path.join(directory, ".workflow", "events.jsonl"),
    lockFile: path.join(directory, ".workflow", ".lock"),
    dashboardDir: directory,
  };
}

async function makeFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "autoos-workflow-storage-"));
  temporaryDirectories.push(directory);
  const paths = fixturePaths(directory);
  await mkdir(paths.workflowDir, { recursive: true });
  await writeFile(paths.workflowFile, JSON.stringify({
    baseBranch: "origin/feature",
    promotionTarget: "origin/master",
    tickets: [
      { id: "AO-ROOT-001", status: "merged", blockedBy: [] },
      { id: "AO-CHILD-001", status: "ready", blockedBy: ["AO-ROOT-001"] },
      { id: "AO-LOCK-001", status: "ready", blockedBy: ["AO-CHILD-001"] },
    ],
  }), "utf8");
  return paths;
}

afterEach(async () => {
  while (temporaryDirectories.length) await rm(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe("workflow storage", () => {
  it("recusa iniciar um ticket com dependência não mesclada", async () => {
    const paths = await makeFixture();
    await assert.rejects(
      updateTicketStatus({ ticketId: "AO-LOCK-001", status: "in_progress" }, paths),
      (error) => error.code === "BLOCKED" && error.pendingBlockers.includes("AO-CHILD-001"),
    );
    const workflow = await readWorkflow(paths);
    assert.equal(workflow.tickets.find((ticket) => ticket.id === "AO-LOCK-001").status, "ready");
  });

  it("atualiza status e registra evento com troca atômica", async () => {
    const paths = await makeFixture();
    const result = await updateTicketStatus({
      ticketId: "AO-CHILD-001",
      status: "in_progress",
      summary: "Agente iniciou o ticket",
    }, paths);
    assert.equal(result.ticket.status, "in_progress");
    assert.equal((await readWorkflow(paths)).tickets.find((ticket) => ticket.id === "AO-CHILD-001").status, "in_progress");
    assert.equal((await readEvents(paths))[0].summary, "Agente iniciou o ticket");
  });

  it("registra progresso sem mudar o status", async () => {
    const paths = await makeFixture();
    await recordEvent({ ticketId: "AO-CHILD-001", type: "test", summary: "Teste passou", metadata: { commit: "abc1234" } }, paths);
    const workflow = JSON.parse(await readFile(paths.workflowFile, "utf8"));
    assert.equal(workflow.tickets.find((ticket) => ticket.id === "AO-CHILD-001").status, "ready");
    const [event] = await readEvents(paths);
    assert.deepEqual({ type: event.type, commit: event.commit }, { type: "test", commit: "abc1234" });
  });
});
