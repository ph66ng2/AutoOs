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
  interface: "Interface",
  auth: "Auth",
  subscription: "SaaS",
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
  { id: "done", label: "Feito", hint: "Merged na feature." },
];

export const TRACKS = [
  {
    id: "saas",
    label: "SaaS",
    description: "Identidade, fotos, entitlement e runtime offline.",
    prefixes: ["AO-PS-", "AO-AUTH-", "AO-SUB-", "AO-PHOTO-"],
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
      "AO-PS-005",
      "AO-PS-006",
      "AO-SUB-004",
      "AO-PS-007",
      "AO-SUB-005",
      "AO-PS-008",
    ],
    skip: [],
    why: {
      "AO-AUTH-004": "Fecha Auth e destrava a ponte das fotos.",
      "AO-SUB-002": "Acesso Online sem PowerSync; já está em revisão.",
      "AO-SUB-003": "Entitlement no servidor, em paralelo com Auth.",
      "AO-PHOTO-009": "Só sobe depois de AUTH-004 e SUB-002.",
      "AO-PS-005": "Ramo paralelo de PowerSync; não bloqueia o Online.",
    },
  },
  {
    id: "interface",
    label: "Interface",
    description: "Acabamento das telas. Comece pelo que o usuário vê todo dia.",
    prefixes: ["AO-UI-"],
    recommended: [
      "AO-UI-003",
      "AO-UI-001",
      "AO-UI-008",
      "AO-UI-012",
      "AO-UI-005",
      "AO-UI-002",
      "AO-UI-013",
      "AO-UI-015",
      "AO-UI-006",
      "AO-UI-016",
      "AO-UI-004",
      "AO-UI-009",
      "AO-UI-010",
      "AO-UI-011",
      "AO-UI-014",
      "AO-UI-017",
      "AO-UI-007",
      "AO-UI-018",
      "AO-UI-020",
      "AO-UI-022",
      "AO-UI-021",
      "AO-UI-023",
    ],
    skip: ["AO-UI-019"],
    why: {
      "AO-UI-003": "Único com efeito funcional: a cor do status deixa de mudar entre sessões.",
      "AO-UI-001": "Fundação. Destrava toaster e movimento reduzido.",
      "AO-UI-008": "Retorno de pressão. Aparece em todo botão do app.",
      "AO-UI-012": "Tira transition-all. Precisa existir antes da escala de raio.",
      "AO-UI-005": "Borda do Perfil. Barato e destrava o raio.",
      "AO-UI-002": "Um Toaster só, com tema explícito.",
      "AO-UI-013": "Corta as animações infinitas de boot quando o sistema pede menos movimento.",
      "AO-UI-015": "Altura única por densidade. Cuidado com o balcão de toque.",
      "AO-UI-006": "Um spinner. Sem isso o loading por região herda três indicadores.",
      "AO-UI-016": "Anel de foco igual em campo, botão e seletor.",
      "AO-UI-004": "Começo da corrente da sidebar.",
      "AO-UI-020": "Acaba com o piscar do cabeçalho a cada navegação.",
      "AO-UI-023": "Teclado no Dashboard. Faz antes dos raios e diálogos.",
      "AO-UI-019": "Pior retorno da lista. Deixe no catálogo, não execute agora.",
    },
  },
  {
    id: "hotfix",
    label: "Correções",
    description: "Buracos de produção. Entram na frente do acabamento.",
    prefixes: ["AO-HOTFIX-"],
    recommended: ["AO-HOTFIX-005", "AO-HOTFIX-004"],
    skip: [],
    why: {
      "AO-HOTFIX-005": "Já está em revisão. Feche o merge antes de abrir outro hotfix.",
      "AO-HOTFIX-004": "Impede cadastro sem empresa. Liberado para começar.",
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
  [/^AO-UI-/, "interface"],
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

export function boardColumn(ticket, tickets) {
  if (!ticket) return "waiting";
  if (ticket.status === "merged") return "done";
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

export function nextRecommended(tickets, trackId = "all") {
  const scoped = ticketsForTrack(tickets, trackId);
  const inProgress = scoped.find((ticket) => ticket.status === "in_progress");
  if (inProgress) return { ticket: inProgress, source: "in_progress" };

  const tracks = trackId === "all" ? TRACKS : [trackById(trackId)].filter(Boolean);
  for (const track of tracks) {
    for (const ticketId of track.recommended) {
      if (track.skip.includes(ticketId)) continue;
      const ticket = scoped.find((item) => item.id === ticketId) || tickets.find((item) => item.id === ticketId);
      if (!ticket) continue;
      if (ticket.status === "review") return { ticket, source: "review", track };
      if (isActionable(ticket, tickets)) return { ticket, source: "ready", track };
    }
  }

  const review = scoped.find((ticket) => ticket.status === "review");
  if (review) return { ticket: review, source: "review" };
  const ready = scoped.find((ticket) => isActionable(ticket, tickets));
  if (ready) return { ticket: ready, source: "ready" };
  const waiting = scoped.find((ticket) => ticket.status !== "merged");
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

export function pathEntries(tickets, trackId) {
  const tracks = trackId === "all" ? TRACKS : [trackById(trackId)].filter(Boolean);
  const next = nextRecommended(tickets, trackId).ticket;
  return tracks.flatMap((track) => {
    const ids = [...track.recommended, ...track.skip.filter((id) => !track.recommended.includes(id))];
    return ids.map((ticketId, index) => {
      const ticket = tickets.find((item) => item.id === ticketId);
      const column = ticket ? boardColumn(ticket, tickets) : "waiting";
      return {
        trackId: track.id,
        trackLabel: track.label,
        ticketId,
        ticket,
        column,
        skipped: isSkipped(track, ticketId),
        reason: reasonFor(track, ticketId),
        current: next?.id === ticketId,
        index,
      };
    });
  });
}

export function groupedReadyTickets(tickets) {
  return TRACKS.map((track) => {
    const trackTickets = sortForColumn(
      "ready",
      tickets.filter((ticket) => ticketMatchesTrack(ticket.id, track) && boardColumn(ticket, tickets) === "ready"),
      tickets,
      track.id,
    );
    return { track, tickets: trackTickets };
  }).filter((group) => group.tickets.length > 0);
}

function indexById(tickets) {
  return new Map(tickets.map((ticket) => [ticket.id, ticket]));
}
