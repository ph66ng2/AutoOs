export const STATUS_ORDER = ["ready", "in_progress", "review", "merged", "blocked"];

export const STATUS_LABELS = {
  ready: "Pronto",
  in_progress: "Em andamento",
  review: "Revisão",
  merged: "Concluído",
  blocked: "Bloqueado",
};

export const AREA_LABELS = {
  all: "Todas",
  auth: "Auth",
  subscription: "SaaS",
  fiscal: "Fiscal PROD",
  powersync: "PowerSync",
  photos: "Fotos",
  hotfix: "Correções",
  updater: "Atualização",
  product: "Produto",
};

export const BOARD_COLUMNS = [
  { id: "ready", label: "Pode começar", hint: "Liberado agora. Dá para spawnar." },
  { id: "doing", label: "Em curso", hint: "Já tem dono. Não abra outro no mesmo arquivo." },
  { id: "review", label: "Revisão", hint: "PR aberto. Merge é humano." },
  { id: "waiting", label: "Na fila", hint: "Ainda depende de outro ticket." },
  { id: "paused", label: "Fora do foco", hint: "Adiado ou substituído no roadmap. Status preservado." },
  { id: "done", label: "Feito", hint: "Merged na feature." },
];

export const TRACKS = [
  {
    id: "fiscal",
    label: "Fiscal PROD",
    description: "Marco atual: ownership, fato faturável e operação fiscal na OS.",
    prefixes: ["AO-WF-", "AO-SUITE-", "AO-FISC-"],
    recommended: ["AO-WF-RECONCILE-001", "AO-SUITE-001", "AO-SUITE-002", "AO-FISC-001", "AO-FISC-003", "AO-FISC-002", "AO-FISC-004", "AO-FISC-005", "AO-FISC-006", "AO-FISC-GATE-001"],
    skip: [],
    why: { "AO-SUITE-001": "Definir a autoridade dos dados antes de portar módulos do AutoBO." },
  },
  {
    id: "saas",
    label: "SaaS",
    description: "Entregas Online existentes; expansão pausada após o marco Fiscal.",
    prefixes: ["AO-PS-", "AO-AUTH-", "AO-SUB-", "AO-PHOTO-", "AO-SAAS-", "AO-EQP-ONLINE-", "AO-SRV-ONLINE-", "AO-INS-ONLINE-"],
    recommended: [
      "AO-AUTH-004",
      "AO-SUB-002",
      "AO-SUB-003",
      "AO-PHOTO-009",
      "AO-PHOTO-003",
      "AO-PHOTO-004",
      "AO-PHOTO-005",
      "AO-PHOTO-006",
      "AO-PHOTO-007",
      "AO-PHOTO-008",
    ],
    skip: [],
    why: {
      "AO-AUTH-004": "Fecha Auth e destrava a ponte das fotos.",
      "AO-SUB-002": "Concluído na feature (#34). CRUD Online de clientes sem PowerSync.",
      "AO-SUB-003": "Entitlement no servidor, em paralelo com Auth.",
      "AO-PHOTO-009": "AUTH-004 destrava; SUB-002 já está na feature.",
    },
  },
  {
    id: "hotfix",
    label: "Correções",
    description: "Buracos de produção. Entram na frente do acabamento.",
    prefixes: ["AO-HOTFIX-"],
    recommended: ["AO-HOTFIX-004", "AO-HOTFIX-005"],
    skip: [],
    why: {
      "AO-HOTFIX-004": "Impede cadastro sem empresa. Liberado para começar.",
      "AO-HOTFIX-005": "Concluído na master 0.5.2. Observações do orçamento e decode NUMERIC.",
    },
  },
  {
    id: "updater",
    label: "Atualização",
    description: "Assinatura e atualização Windows.",
    prefixes: ["AO-UPD-"],
    recommended: ["AO-UPD-001", "AO-UPD-002", "AO-UPD-003"],
    skip: [],
    why: {
      "AO-UPD-001": "Primeiro o artefato assinado. Sem isso a UX de update mente.",
    },
  },
];

const AREA_PREFIXES = [
  [/^AO-(WF|SUITE|FISC)-/, "fiscal"],
  [/^AO-PS-/, "powersync"],
  [/^AO-AUTH-/, "auth"],
  [/^AO-SUB-/, "subscription"],
  [/^AO-PHOTO-/, "photos"],
  [/^AO-HOTFIX-/, "hotfix"],
  [/^AO-UPD-/, "updater"],
  [/^AO-(CNPJ|PDF|CLI|UX|EMAIL|INT)-/, "product"],
];

export function areaFor(ticketId) {
  const id = String(ticketId || "");
  const match = AREA_PREFIXES.find(([pattern]) => pattern.test(id));
  return match ? match[1] : "product";
}

export function trackById(trackId) {
  return TRACKS.find((track) => track.id === trackId) || null;
}

export function ticketMatchesTrack(ticketId, track) {
  if (!track) return true;
  return track.prefixes.some((prefix) => String(ticketId).startsWith(prefix));
}

export function ticketsForTrack(tickets, trackId) {
  if (!trackId || trackId === "all") return [...tickets];
  const track = trackById(trackId);
  if (!track) return [];
  return tickets.filter((ticket) => ticketMatchesTrack(ticket.id, track));
}

export function pendingBlockers(ticket, tickets) {
  const byId = indexById(tickets);
  return (ticket?.blockedBy || []).filter((blockerId) => byId.get(blockerId)?.status !== "merged");
}

export function roadmapKind(ticket, roadmap) {
  if (!ticket || !roadmap || ticket.status === "merged") return "history";
  if (roadmap.supersededIds?.includes(ticket.id)) return "superseded";
  if (roadmap.deferredIds?.includes(ticket.id)) return "deferred";
  if (roadmap.focusIds?.includes(ticket.id)) return "focus";
  return "unclassified";
}

export function boardColumn(ticket, tickets, roadmap) {
  if (!ticket) return "waiting";
  if (ticket.status === "merged") return "done";
  if (["deferred", "superseded"].includes(roadmapKind(ticket, roadmap))) return "paused";
  if (ticket.status === "review") return "review";
  if (ticket.status === "in_progress") return "doing";
  if (ticket.status === "blocked" || pendingBlockers(ticket, tickets).length > 0) return "waiting";
  return "ready";
}

export function unlocksFrom(ticketId, tickets) {
  return tickets
    .filter((ticket) => (ticket.blockedBy || []).includes(ticketId) && ticket.status !== "merged")
    .map((ticket) => ticket.id);
}

export function sequenceIndex(track, ticketId) {
  if (!track) return Number.POSITIVE_INFINITY;
  const index = track.recommended.indexOf(ticketId);
  return index === -1 ? track.recommended.length + 50 : index;
}

export function isSkipped(track, ticketId) {
  return Boolean(track?.skip?.includes(ticketId));
}

export function reasonFor(track, ticketId) {
  return track?.why?.[ticketId] || "";
}

export function isActionable(ticket, tickets) {
  return ticket.status === "in_progress" || (ticket.status === "ready" && pendingBlockers(ticket, tickets).length === 0);
}

export function nextRecommended(tickets, trackId = "all", roadmap) {
  const scoped = ticketsForTrack(tickets, trackId);
  const active = scoped.filter((ticket) => !["deferred", "superseded"].includes(roadmapKind(ticket, roadmap)));
  const inProgress = active.find((ticket) => ticket.status === "in_progress");
  if (inProgress) return { ticket: inProgress, source: "in_progress" };

  if (trackId === "all" && roadmap?.focusIds) {
    for (const ticketId of roadmap.focusIds) {
      const ticket = active.find((item) => item.id === ticketId);
      if (ticket?.status === "review") return { ticket, source: "review" };
      if (ticket && isActionable(ticket, tickets)) return { ticket, source: "ready" };
    }
  }

  const tracks = trackId === "all" ? TRACKS : [trackById(trackId)].filter(Boolean);
  for (const track of tracks) {
    for (const ticketId of track.recommended) {
      if (track.skip.includes(ticketId)) continue;
      const ticket = active.find((item) => item.id === ticketId);
      if (!ticket) continue;
      if (ticket.status === "review") return { ticket, source: "review", track };
      if (isActionable(ticket, tickets)) return { ticket, source: "ready", track };
    }
  }

  const review = active.find((ticket) => ticket.status === "review");
  if (review) return { ticket: review, source: "review" };
  const ready = active.find((ticket) => isActionable(ticket, tickets));
  if (ready) return { ticket: ready, source: "ready" };
  const waiting = active.find((ticket) => ticket.status !== "merged");
  return waiting ? { ticket: waiting, source: "waiting" } : { ticket: null, source: "empty" };
}

export function sortForColumn(columnId, columnTickets, tickets, trackId) {
  const track = trackById(trackId);
  const copy = [...columnTickets];
  copy.sort((left, right) => {
    if (columnId === "done") return String(right.id).localeCompare(left.id);
    if (columnId === "waiting") {
      const delta = pendingBlockers(left, tickets).length - pendingBlockers(right, tickets).length;
      if (delta !== 0) return delta;
    }
    if (track) {
      const skipDelta = Number(isSkipped(track, left.id)) - Number(isSkipped(track, right.id));
      if (skipDelta !== 0) return skipDelta;
      const sequenceDelta = sequenceIndex(track, left.id) - sequenceIndex(track, right.id);
      if (sequenceDelta !== 0) return sequenceDelta;
    } else {
      const leftTrack = TRACKS.find((item) => ticketMatchesTrack(left.id, item));
      const rightTrack = TRACKS.find((item) => ticketMatchesTrack(right.id, item));
      const leftIndex = leftTrack ? sequenceIndex(leftTrack, left.id) : 99;
      const rightIndex = rightTrack ? sequenceIndex(rightTrack, right.id) : 99;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    return left.id.localeCompare(right.id);
  });
  return copy;
}

export function pathEntries(tickets, trackId, roadmap) {
  const tracks = trackId === "all" ? TRACKS : [trackById(trackId)].filter(Boolean);
  const next = nextRecommended(tickets, trackId, roadmap).ticket;
  return tracks.flatMap((track) => {
    const ids = [...track.recommended, ...track.skip.filter((id) => !track.recommended.includes(id))];
    return ids.map((ticketId, index) => {
      const ticket = tickets.find((item) => item.id === ticketId);
      const column = ticket ? boardColumn(ticket, tickets, roadmap) : "waiting";
      return {
        trackId: track.id,
        trackLabel: track.label,
        ticketId,
        ticket,
        column,
        skipped: isSkipped(track, ticketId) || ["deferred", "superseded"].includes(roadmapKind(ticket, roadmap)),
        reason: reasonFor(track, ticketId),
        current: next?.id === ticketId,
        index,
      };
    });
  });
}

export function groupedReadyTickets(tickets, workflowTickets = tickets, roadmap) {
  return TRACKS.map((track) => {
    const trackTickets = sortForColumn(
      "ready",
      tickets.filter((ticket) => ticketMatchesTrack(ticket.id, track) && boardColumn(ticket, workflowTickets, roadmap) === "ready"),
      workflowTickets,
      track.id,
    );
    return { track, tickets: trackTickets };
  }).filter((group) => group.tickets.length > 0);
}

function indexById(tickets) {
  return new Map(tickets.map((ticket) => [ticket.id, ticket]));
}
