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
  { id: "AO-PS-005", status: "ready", blockedBy: [] },
  { id: "AO-PS-006", status: "ready", blockedBy: ["AO-PS-005"] },
  { id: "AO-HOTFIX-004", status: "ready", blockedBy: [] },
  { id: "AO-HOTFIX-005", status: "merged", blockedBy: [] },
  { id: "AO-UPD-001", status: "ready", blockedBy: [] },
];

describe("workflow tracks", () => {
  it("classifica tickets SaaS e de atualização", () => {
    assert.equal(areaFor("AO-PS-005"), "powersync");
    assert.equal(areaFor("AO-UPD-001"), "updater");
    assert.equal(areaFor("AO-AUTH-TEST-001"), "auth");
  });

  it("coloca no quadro o que está liberado, o que espera e o que destrava", () => {
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-PS-005"), tickets), "ready");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-PS-006"), tickets), "waiting");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-SUB-002"), tickets), "done");
    assert.equal(boardColumn(tickets.find((ticket) => ticket.id === "AO-AUTH-TEST-001"), tickets), "review");
    assert.deepEqual(pendingBlockers(tickets.find((ticket) => ticket.id === "AO-PS-006"), tickets), ["AO-PS-005"]);
    assert.deepEqual(unlocksFrom("AO-PS-005", tickets), ["AO-PS-006"]);
  });

  it("recomenda AUTH-004 no SaaS", () => {
    assert.equal(nextRecommended(tickets, "saas").ticket.id, "AO-AUTH-004");
    assert.equal(nextRecommended(tickets, "hotfix").ticket.id, "AO-HOTFIX-004");
  });

  it("na visão completa, o SaaS vem antes dos demais focos", () => {
    assert.equal(nextRecommended(tickets, "all").ticket.id, "AO-AUTH-004");
  });

  it("agrupa o que pode começar por foco", () => {
    const groups = groupedReadyTickets(tickets);
    const saasGroup = groups.find((group) => group.track.id === "saas");
    assert.deepEqual(saasGroup.tickets.map((ticket) => ticket.id), ["AO-AUTH-004", "AO-PS-005"]);
    const ordered = sortForColumn("ready", saasGroup.tickets, tickets, "saas").map((ticket) => ticket.id);
    assert.equal(ordered[0], "AO-AUTH-004");
  });

  it("mantém pronto quando a dependência mesclada não está no filtro", () => {
    const filtered = [tickets.find((ticket) => ticket.id === "AO-AUTH-004")];
    const groups = groupedReadyTickets(filtered, tickets);
    const saasGroup = groups.find((group) => group.track.id === "saas");
    assert.deepEqual(saasGroup.tickets.map((ticket) => ticket.id), ["AO-AUTH-004"]);
  });

  it("a linha do tempo SaaS marca o atual", () => {
    const entries = pathEntries(tickets, "saas");
    assert.equal(entries[0].ticketId, "AO-AUTH-004");
    assert.equal(entries[0].current, true);
    assert.equal(ticketsForTrack(tickets, "saas").every((ticket) => /^(AO-PS-|AO-AUTH-|AO-SUB-|AO-PHOTO-)/.test(ticket.id)), true);
  });
});
