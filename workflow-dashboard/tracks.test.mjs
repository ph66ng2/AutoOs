import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  areaFor,
  boardColumn,
  groupedReadyTickets,
  nextRecommended,
  pathEntries,
  pendingBlockers,
  sortForColumn,
  ticketsForTrack,
  unlocksFrom,
} from "./tracks.js";

const tickets = [
  { id: "AO-AUTH-004", status: "ready", blockedBy: ["AO-AUTH-003"] },
  { id: "AO-AUTH-003", status: "merged", blockedBy: [] },
  { id: "AO-SUB-002", status: "merged", blockedBy: [] },
  { id: "AO-AUTH-TEST-001", status: "review", blockedBy: ["AO-AUTH-002"] },
  { id: "AO-UI-003", status: "ready", blockedBy: [] },
  { id: "AO-UI-001", status: "ready", blockedBy: [] },
  { id: "AO-UI-002", status: "ready", blockedBy: ["AO-UI-001"] },
  { id: "AO-UI-019", status: "ready", blockedBy: [] },
  { id: "AO-HOTFIX-004", status: "ready", blockedBy: [] },
  { id: "AO-HOTFIX-005", status: "merged", blockedBy: [] },
  { id: "AO-UPD-001", status: "ready", blockedBy: [] },
];

describe("workflow tracks", () => {
  it("classifica AO-UI como interface e AO-UPD como updater", () => {
    assert.equal(areaFor("AO-UI-003"), "interface");
    assert.equal(areaFor("AO-UPD-001"), "updater");
    assert.equal(areaFor("AO-AUTH-TEST-001"), "auth");
  });

  it("coloca no quadro o que está liberado, o que espera e o que destrava", () => {
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-UI-003"), tickets), "ready");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-UI-002"), tickets), "waiting");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-SUB-002"), tickets), "done");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-AUTH-TEST-001"), tickets), "review");
    assert.deepEqual(pendingBlockers(tickets.find((ticket) => ticket.id === "AO-UI-002"), tickets), ["AO-UI-001"]);
    assert.deepEqual(unlocksFrom("AO-UI-001", tickets), ["AO-UI-002"]);
  });

  it("recomenda 003 na interface e AUTH-004 no SaaS", () => {
    assert.equal(nextRecommended(tickets, "interface").ticket.id, "AO-UI-003");
    assert.equal(nextRecommended(tickets, "saas").ticket.id, "AO-AUTH-004");
    assert.equal(nextRecommended(tickets, "hotfix").ticket.id, "AO-HOTFIX-004");
  });

  it("na visão completa, o SaaS em andamento de negócio vem antes do acabamento", () => {
    assert.equal(nextRecommended(tickets, "all").ticket.id, "AO-AUTH-004");
  });

  it("agrupa o que pode começar por foco e empurra o ticket adiado para o fim", () => {
    const groups = groupedReadyTickets(tickets);
    const interfaceGroup = groups.find((group) => group.track.id === "interface");
    assert.deepEqual(interfaceGroup.tickets.map((ticket) => ticket.id), ["AO-UI-003", "AO-UI-001", "AO-UI-019"]);
    const ordered = sortForColumn("ready", interfaceGroup.tickets, tickets, "interface").map((ticket) => ticket.id);
    assert.equal(ordered.at(-1), "AO-UI-019");
  });

  it("mantém pronto quando a dependência mesclada não está no filtro", () => {
    const filtered = [tickets.find((ticket) => ticket.id === "AO-AUTH-004")];
    const groups = groupedReadyTickets(filtered, tickets);
    const saasGroup = groups.find((group) => group.track.id === "saas");
    assert.deepEqual(saasGroup.tickets.map((ticket) => ticket.id), ["AO-AUTH-004"]);
  });

  it("a linha do tempo da interface marca o atual e o adiado", () => {
    const entries = pathEntries(tickets, "interface");
    assert.equal(entries[0].ticketId, "AO-UI-003");
    assert.equal(entries[0].current, true);
    assert.equal(entries.find((entry) => entry.ticketId === "AO-UI-019").skipped, true);
    assert.equal(ticketsForTrack(tickets, "interface").every((ticket) => ticket.id.startsWith("AO-UI-")), true);
  });
});
