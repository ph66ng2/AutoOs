import {
  AREA_LABELS,
  BOARD_COLUMNS,
  STATUS_LABELS,
  STATUS_ORDER,
  TRACKS,
  areaFor,
  boardColumn,
  groupedReadyTickets,
  isSkipped,
  nextRecommended,
  pathEntries,
  pendingBlockers,
  reasonFor,
  sortForColumn,
  ticketsForTrack,
  trackById,
  unlocksFrom,
} from "./tracks.js";

const STATUS_EVENT_LABELS = {
  started: "trabalho iniciado",
  progress: "progresso registrado",
  test: "teste registrado",
  review: "enviado para revisão",
  blocked: "bloqueio registrado",
  unblocked: "ticket liberado",
  merged: "ticket concluído",
  status_changed: "status atualizado",
};

const AREA_KEYS = Object.keys(AREA_LABELS);
const FOCUS_STORAGE_KEY = "autoos-workflow-foco";
const PROJECT_STORAGE_KEY = "autoos-workflow-projeto";
const PROJECTS = [
  {
    id: "autoos",
    label: "AutoOS",
    subtitle: "PROJECT OS",
    workflowUrl: "./data/workflow.json",
    eventsUrl: "./data/events.json",
    sourceLabel: "feature / workflow.json",
    staticModeLabel: "feature / workflow.json",
    expectedBaseBranch: "origin/feature",
    expectedPromotionTarget: "origin/master",
    repository: "ph66ng2/AutoOs",
    supportsTracks: true,
    supportsStatusRequests: true,
  },
  {
    id: "autobo",
    label: "AutoBO",
    subtitle: "FINANCEIRO-FISCAL",
    workflowUrl: "./data/autobo-workflow.json",
    eventsUrl: "./data/autobo-events.json",
    sourceLabel: "AutoBO / workflow.json privado",
    staticModeLabel: "Espelho publicado",
    expectedBaseBranch: "origin/main",
    expectedPromotionTarget: "origin/main",
    repository: null,
    supportsTracks: false,
    supportsStatusRequests: false,
  },
];
const PROJECT_IDS = PROJECTS.map((project) => project.id);
const TRACK_IDS = ["all", ...TRACKS.map((track) => track.id)];
const PAGE_IDS = ["overview", "board", "activity"];
const PAGE_META = {
  overview: { title: "Visão geral", eyebrow: "AUTOOS / WORKFLOW", documentTitle: "AutoOS Workflow | Visão geral" },
  board: { title: "Kanban", eyebrow: "AUTOOS / QUADRO", documentTitle: "AutoOS Workflow | Kanban" },
  activity: { title: "Atividade", eyebrow: "AUTOOS / MOVIMENTO", documentTitle: "AutoOS Workflow | Atividade" },
};

const state = {
  project: "autoos",
  workflow: null,
  events: [],
  editable: false,
  mode: "static",
  view: "board",
  track: "all",
  area: "all",
  query: "",
  selectedTicketId: null,
  showDone: false,
};

const elements = {
  projectSwitcher: document.querySelector("#project-switcher"),
  brandName: document.querySelector("#brand-name"),
  brandSubtitle: document.querySelector("#brand-subtitle"),
  mobileBrandName: document.querySelector("#mobile-brand-name"),
  modeBadge: document.querySelector("#mode-badge"),
  sourceLabel: document.querySelector("#source-label"),
  accessLabel: document.querySelector("#access-label"),
  refreshButton: document.querySelector("#refresh-button"),
  lastRead: document.querySelector("#last-read"),
  qualityAlert: document.querySelector("#quality-alert"),
  pageEyebrow: document.querySelector("#page-eyebrow"),
  pageTitle: document.querySelector("#page-title"),
  progressPercent: document.querySelector("#progress-percent"),
  progressBar: document.querySelector("#progress-bar"),
  metricTotal: document.querySelector("#metric-total"),
  metricReady: document.querySelector("#metric-ready"),
  metricMerged: document.querySelector("#metric-merged"),
  metricBlocked: document.querySelector("#metric-blocked"),
  searchInput: document.querySelector("#search-input"),
  areaFilters: document.querySelector("#area-filters"),
  areaControl: document.querySelector("#area-control"),
  trackFilters: document.querySelector("#track-filters"),
  trackControl: document.querySelector("#track-control"),
  boardView: document.querySelector("#board-view"),
  pathView: document.querySelector("#path-view"),
  pathList: document.querySelector("#path-list"),
  pathTitle: document.querySelector("#path-title"),
  pathCount: document.querySelector("#path-count"),
  timelineView: document.querySelector("#timeline-view"),
  timelineList: document.querySelector("#timeline-list"),
  eventCount: document.querySelector("#event-count"),
  focusWave: document.querySelector("#focus-wave"),
  focusTicketId: document.querySelector("#focus-ticket-id"),
  focusTitle: document.querySelector("#focus-title"),
  focusSummary: document.querySelector("#focus-summary"),
  focusUnlocks: document.querySelector("#focus-unlocks"),
  focusButton: document.querySelector("#focus-button"),
  activityPreview: document.querySelector("#activity-preview"),
  healthScore: document.querySelector("#health-score"),
  healthSummary: document.querySelector("#health-summary"),
  healthSpeed: document.querySelector("#health-speed"),
  healthBlockers: document.querySelector("#health-blockers"),
  dialog: document.querySelector("#ticket-dialog"),
  dialogContent: document.querySelector("#dialog-content"),
  dialogClose: document.querySelector("#dialog-close"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function allTickets() {
  return state.workflow?.tickets || [];
}

function ticketById(ticketId) {
  return allTickets().find((ticket) => ticket.id === ticketId);
}

function projectById(projectId) {
  return PROJECTS.find((project) => project.id === projectId) || PROJECTS[0];
}

function currentProject() {
  return projectById(state.project);
}

function currentTrack() {
  return trackById(state.track);
}

function scopedTickets() {
  const query = state.query.trim().toLocaleLowerCase("pt-BR");
  return ticketsForTrack(allTickets(), state.track).filter((ticket) => {
    const areaMatches = state.area === "all" || areaFor(ticket.id) === state.area;
    if (!areaMatches) return false;
    if (!query) return true;
    return [ticket.id, ticket.title, ticket.objective, ticket.context]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(query);
  });
}

function readStoredTrack() {
  if (!currentProject().supportsTracks) return "all";
  const fromUrl = new URLSearchParams(window.location.search).get("foco");
  if (TRACK_IDS.includes(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem(`${FOCUS_STORAGE_KEY}-${state.project}`);
    if (TRACK_IDS.includes(stored)) return stored;
  } catch {
    /* ignore quota / privacy */
  }
  return "all";
}

function persistTrack(trackId) {
  if (!currentProject().supportsTracks) return;
  state.track = trackId;
  const url = new URL(window.location.href);
  if (trackId === "all") url.searchParams.delete("foco");
  else url.searchParams.set("foco", trackId);
  window.history.replaceState({}, "", url);
  try {
    window.localStorage.setItem(`${FOCUS_STORAGE_KEY}-${state.project}`, trackId);
  } catch {
    /* ignore */
  }
}

function readStoredProject() {
  const fromUrl = new URLSearchParams(window.location.search).get("projeto");
  if (PROJECT_IDS.includes(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (PROJECT_IDS.includes(stored)) return stored;
  } catch {
    /* ignore quota / privacy */
  }
  return "autoos";
}

function persistProject(projectId) {
  if (!PROJECT_IDS.includes(projectId) || state.project === projectId) return;
  state.project = projectId;
  state.track = "all";
  state.area = "all";
  state.query = "";
  state.showDone = false;
  elements.searchInput.value = "";
  const url = new URL(window.location.href);
  if (projectId === "autoos") url.searchParams.delete("projeto");
  else url.searchParams.set("projeto", projectId);
  url.searchParams.delete("foco");
  window.history.replaceState({}, "", url);
  try {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
  } catch {
    /* ignore quota / privacy */
  }
  void loadData();
}

function currentPage() {
  const raw = (window.location.hash || "#overview").replace("#", "");
  if (raw === "kanban" || raw === "quadro") return "board";
  return PAGE_IDS.includes(raw) ? raw : "overview";
}

function bootPage() {
  if (window.location.hash) return;
  const foco = new URLSearchParams(window.location.search).get("foco");
  const page = TRACK_IDS.includes(foco) && foco !== "all" ? "board" : "overview";
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${page}`);
}

function goToPage(page) {
  if (currentPage() === page) {
    renderNav();
    return;
  }
  window.location.hash = page;
}

function dateValue(value) {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, includeTime = true) {
  const date = dateValue(value);
  if (!date) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

function displayList(items, empty = "Não informado") {
  if (!Array.isArray(items) || items.length === 0) return `<p>${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Resposta ${response.status}`);
  return response.json();
}

async function loadData() {
  const project = currentProject();
  let workflowPayload;
  let eventsPayload;
  if (project.id === "autoos") {
    try {
      workflowPayload = await fetchJson("./api/workflow");
      eventsPayload = await fetchJson("./api/events");
      state.editable = Boolean(workflowPayload.editable);
      state.mode = "local";
    } catch {
      workflowPayload = await fetchJson(project.workflowUrl).catch(async () => fetchJson("../.workflow/workflow.json"));
      eventsPayload = await fetchJson(project.eventsUrl).catch(() => []);
      state.editable = false;
      state.mode = "static";
    }
  } else {
    workflowPayload = await fetchJson(project.workflowUrl);
    eventsPayload = await fetchJson(project.eventsUrl).catch(() => []);
    state.editable = false;
    state.mode = "static";
  }
  state.workflow = workflowPayload.workflow || workflowPayload;
  state.events = eventsPayload.events || eventsPayload || [];
  render();
}

function validateWorkflow() {
  const project = currentProject();
  const issues = [];
  if (state.workflow?.baseBranch !== project.expectedBaseBranch) issues.push(`baseBranch diferente de ${project.expectedBaseBranch}`);
  if (state.workflow?.promotionTarget !== project.expectedPromotionTarget) issues.push(`promotionTarget diferente de ${project.expectedPromotionTarget}`);
  for (const ticket of allTickets()) {
    if (!ticket.testInstructions) issues.push(`${ticket.id} sem testInstructions`);
  }
  return issues;
}

function renderQuality() {
  const issues = validateWorkflow();
  if (issues.length === 0) {
    elements.qualityAlert.classList.add("hidden");
    return;
  }
  elements.qualityAlert.classList.remove("hidden");
  const more = issues.length > 1 ? ` e mais ${issues.length - 1}` : "";
  elements.qualityAlert.innerHTML = `<strong>Atenção ao contrato do workflow:</strong> ${escapeHtml(issues[0])}${more}. O painel continua disponível, mas o planejador precisa dessa correção.`;
}

function renderHeader() {
  const project = currentProject();
  elements.modeBadge.textContent = state.editable ? "Edição local" : project.staticModeLabel;
  elements.modeBadge.classList.toggle("editable", state.editable);
  elements.sourceLabel.textContent = state.editable ? "feature / workflow.json" : project.sourceLabel;
  elements.accessLabel.textContent = state.editable ? "Edição local" : project.id === "autobo" ? "Snapshot somente leitura" : "Somente leitura";
  elements.brandName.textContent = project.label;
  elements.brandSubtitle.textContent = project.subtitle;
  elements.mobileBrandName.textContent = `${project.label} Workflow`;
  elements.lastRead.textContent = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date());
}

function renderProjectSwitcher() {
  elements.projectSwitcher.innerHTML = PROJECTS.map((project) => {
    const selected = project.id === state.project;
    return `<button class="project-tab ${selected ? "active" : ""}" data-project="${escapeHtml(project.id)}" type="button" role="tab" aria-selected="${selected}">${escapeHtml(project.label)}</button>`;
  }).join("");
  elements.projectSwitcher.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => persistProject(button.dataset.project));
  });
}

function renderMetrics() {
  const tickets = scopedTickets();
  const readyNow = tickets.filter((ticket) => boardColumn(ticket, allTickets()) === "ready").length;
  const waiting = tickets.filter((ticket) => boardColumn(ticket, allTickets()) === "waiting").length;
  const progress = tickets.length ? Math.round((tickets.filter((ticket) => ticket.status === "merged").length / tickets.length) * 100) : 0;
  elements.metricTotal.textContent = tickets.length;
  elements.metricReady.textContent = readyNow;
  elements.metricMerged.textContent = tickets.filter((ticket) => ticket.status === "merged").length;
  elements.metricBlocked.textContent = waiting;
  elements.progressPercent.textContent = `${progress}%`;
  elements.progressBar.style.width = `${progress}%`;
}

function renderTrackFilters() {
  if (!currentProject().supportsTracks) {
    elements.trackControl.hidden = true;
    elements.trackFilters.innerHTML = "";
    return;
  }
  elements.trackControl.hidden = false;
  const options = [
    { id: "all", label: "Tudo", description: "Todos os focos no mesmo quadro" },
    ...TRACKS.map((track) => ({ id: track.id, label: track.label, description: track.description })),
  ];
  elements.trackFilters.innerHTML = options.map((option) => `<option value="${escapeHtml(option.id)}" title="${escapeHtml(option.description)}">${escapeHtml(option.label)}</option>`).join("");
  elements.trackFilters.value = state.track;
  elements.trackFilters.onchange = () => {
    persistTrack(elements.trackFilters.value);
    if (state.track !== "all") state.area = "all";
    render();
  };
}

function renderFilters() {
  if (!currentProject().supportsTracks || state.track !== "all") {
    elements.areaControl.hidden = true;
    return;
  }
  elements.areaControl.hidden = false;
  elements.areaFilters.innerHTML = AREA_KEYS.map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(AREA_LABELS[area] || area)}</option>`).join("");
  elements.areaFilters.value = state.area;
  elements.areaFilters.onchange = () => {
    state.area = elements.areaFilters.value;
    render();
  };
}

function cardMeta(ticket) {
  const track = currentTrack() || TRACKS.find((item) => item.prefixes.some((prefix) => ticket.id.startsWith(prefix)));
  const unlocks = unlocksFrom(ticket.id, allTickets());
  const blockers = pendingBlockers(ticket, allTickets());
  const skipped = track ? isSkipped(track, ticket.id) : false;
  const why = track ? reasonFor(track, ticket.id) : "";
  if (skipped) return { line: "Fora da rota. Deixe no catálogo.", kind: "skip" };
  if (blockers.length) return { line: `Espera ${blockers.slice(0, 2).join(" · ")}`, kind: "wait" };
  if (unlocks.length) return { line: `Daqui abre ${unlocks.slice(0, 2).join(" · ")}`, kind: "go" };
  if (why) return { line: why, kind: "why" };
  return { line: STATUS_LABELS[ticket.status] || ticket.status, kind: "status" };
}

function ticketCard(ticket, options = {}) {
  const recommended = nextRecommended(allTickets(), state.track).ticket;
  const isNext = recommended?.id === ticket.id;
  const meta = cardMeta(ticket);
  const groupLabel = options.groupLabel ? `<span class="ticket-track">${escapeHtml(options.groupLabel)}</span>` : "";
  return `<button class="ticket-card ${isNext ? "is-next" : ""} ${meta.kind === "skip" ? "is-skipped" : ""}" data-ticket="${escapeHtml(ticket.id)}" data-area="${areaFor(ticket.id)}" type="button">
    <span class="ticket-top">${groupLabel}<span class="ticket-id">${escapeHtml(ticket.id)}</span>${isNext ? `<span class="next-pill">agora</span>` : ""}</span>
    <span class="ticket-title">${escapeHtml(ticket.title)}</span>
    <span class="ticket-footer"><span class="ticket-state state-${escapeHtml(ticket.status)}"><i aria-hidden="true"></i>${escapeHtml(meta.line)}</span></span>
  </button>`;
}

function renderReadyColumn(tickets) {
  if (state.track === "all") {
    const groups = groupedReadyTickets(tickets, allTickets());
    if (!groups.length) return `<div class="empty-column">Nada liberado neste filtro.</div>`;
    return groups.map((group) => `<div class="kanban-group"><p class="kanban-group-label">${escapeHtml(group.track.label)}</p>${group.tickets.map((ticket) => ticketCard(ticket, { groupLabel: group.track.label })).join("")}</div>`).join("");
  }
  const ordered = sortForColumn("ready", tickets, allTickets(), state.track);
  return ordered.length ? ordered.map((ticket) => ticketCard(ticket)).join("") : `<div class="empty-column">Nada liberado neste foco.</div>`;
}

function renderBoard() {
  const tickets = scopedTickets();
  const nextId = nextRecommended(allTickets(), state.track).ticket?.id;
  elements.boardView.innerHTML = BOARD_COLUMNS.map((column) => {
    let columnTickets = tickets.filter((ticket) => boardColumn(ticket, allTickets()) === column.id);
    if (column.id !== "ready") columnTickets = sortForColumn(column.id, columnTickets, allTickets(), state.track);
    const collapsed = column.id === "done" && !state.showDone && columnTickets.length > 8;
    const visible = collapsed ? columnTickets.slice(0, 8) : columnTickets;
    const body = column.id === "ready"
      ? renderReadyColumn(columnTickets)
      : visible.length
        ? visible.map((ticket) => ticketCard(ticket)).join("")
        : `<div class="empty-column">Vazio</div>`;
    const extra = collapsed
      ? `<button class="show-more" data-expand-done type="button">Ver os ${columnTickets.length - 8} concluídos restantes</button>`
      : "";
    return `<section class="kanban-column column-${column.id}">
      <div class="kanban-heading">
        <div><p>${escapeHtml(column.hint)}</p><h3>${escapeHtml(column.label)}</h3></div>
        <span class="wave-count">${columnTickets.length}</span>
      </div>
      <div class="kanban-body">${body}${extra}</div>
    </section>`;
  }).join("");
  elements.boardView.querySelectorAll("[data-ticket]").forEach((card) => card.addEventListener("click", () => openDialog(card.dataset.ticket)));
  elements.boardView.querySelector("[data-expand-done]")?.addEventListener("click", () => {
    state.showDone = true;
    renderBoard();
  });
  if (nextId) {
    const nextCard = elements.boardView.querySelector(`[data-ticket="${nextId}"]`);
    nextCard?.classList.add("is-next");
  }
}

function renderPath() {
  const track = currentTrack();
  const allEntries = currentProject().supportsTracks ? pathEntries(allTickets(), state.track) : genericPathEntries();
  const entries = allEntries.filter((entry) => {
    if (state.area !== "all" && areaFor(entry.ticketId) !== state.area) return false;
    if (!state.query) return true;
    return [entry.ticketId, entry.ticket?.title, entry.reason].join(" ").toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"));
  });
  elements.pathTitle.textContent = track ? `Rota ${track.label}` : currentProject().supportsTracks ? "Rotas por foco" : "Ordem das dependências";
  elements.pathCount.textContent = `${entries.length} passos`;
  if (!entries.length) {
    elements.pathList.innerHTML = `<li class="empty-column">Nenhum passo neste filtro.</li>`;
    return;
  }
  let lastTrack = "";
  elements.pathList.innerHTML = entries.map((entry, index) => {
    const heading = entry.trackId !== lastTrack && state.track === "all"
      ? `<p class="path-track">${escapeHtml(entry.trackLabel)}</p>`
      : "";
    lastTrack = entry.trackId;
    const status = entry.skipped ? "adiado" : entry.ticket ? (BOARD_COLUMNS.find((column) => column.id === entry.column)?.label || entry.column) : "ausente";
    const stateClass = entry.skipped ? "skipped" : entry.current ? "current" : entry.column;
    return `<li>${heading}<button class="path-item path-${stateClass}" data-ticket="${escapeHtml(entry.ticketId)}" type="button">
      <span class="path-index">${String(index + 1).padStart(2, "0")}</span>
      <span><strong>${escapeHtml(entry.ticketId)}</strong><em>${escapeHtml(entry.ticket?.title || "Ticket não encontrado")}</em><small>${escapeHtml(entry.reason || status)}</small></span>
      <span class="path-status">${escapeHtml(status)}</span>
    </button></li>`;
  }).join("");
  elements.pathList.querySelectorAll("[data-ticket]").forEach((item) => {
    if (item.dataset.ticket) item.addEventListener("click", () => openDialog(item.dataset.ticket));
  });
}

function genericPathEntries() {
  const byId = new Map(allTickets().map((ticket) => [ticket.id, ticket]));
  const visited = new Set();
  const ordered = [];
  function visit(ticket) {
    if (!ticket || visited.has(ticket.id)) return;
    visited.add(ticket.id);
    (ticket.blockedBy || []).forEach((blockerId) => visit(byId.get(blockerId)));
    ordered.push(ticket);
  }
  allTickets().forEach(visit);
  return ordered.map((ticket) => ({
    ticketId: ticket.id,
    ticket,
    column: boardColumn(ticket, allTickets()),
    skipped: false,
    reason: pendingBlockers(ticket, allTickets()).length ? `Depende de ${pendingBlockers(ticket, allTickets()).join(", ")}.` : ticket.objective || "Liberado pela ordem atual.",
    current: nextRecommended(allTickets()).ticket?.id === ticket.id,
  }));
}

function derivedEvents() {
  return allTickets()
    .filter((ticket) => ticket.completedAt)
    .map((ticket) => ({
      eventId: `derived-${ticket.id}`,
      ticketId: ticket.id,
      type: "merged",
      status: "merged",
      timestamp: ticket.completedAt,
      summary: `${ticket.title} entrou no histórico concluído.`,
      actor: "workflow.json",
      source: "derived",
    }));
}

function timelineEvents() {
  const byId = new Map();
  [...state.events, ...derivedEvents()].forEach((event) => {
    if (!event.timestamp) return;
    const key = event.eventId || `${event.ticketId || "project"}-${event.type}-${event.timestamp}`;
    if (!byId.has(key)) byId.set(key, event);
  });
  return [...byId.values()]
    .filter((event) => {
      const relatedTicketIds = [...new Set([event.ticketId, ...(event.ticketIds || [])].filter(Boolean))];
      const trackMatches = state.track === "all" || relatedTicketIds.some((ticketId) => ticketsForTrack([{ id: ticketId }], state.track).length);
      const areaMatches = state.area === "all" || relatedTicketIds.some((ticketId) => areaFor(ticketId) === state.area);
      const queryMatches = !state.query || [event.ticketId, event.summary, event.type].join(" ").toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"));
      return trackMatches && areaMatches && queryMatches;
    })
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function renderTimeline() {
  const events = timelineEvents();
  elements.eventCount.textContent = `${events.length} eventos`;
  if (!events.length) {
    elements.timelineList.innerHTML = `<div class="empty-column">Nenhum evento para este filtro.</div>`;
    return;
  }
  elements.timelineList.innerHTML = events.slice(0, 80).map((event) => {
    const label = STATUS_EVENT_LABELS[event.type] || event.type || "atividade";
    return `<button class="timeline-item" data-ticket="${escapeHtml(event.ticketId || "")}" type="button">
      <span class="timeline-date">${escapeHtml(formatDate(event.timestamp))}</span>
      <span class="timeline-marker"></span>
      <span><strong>${escapeHtml(label)}</strong><p>${escapeHtml(event.summary || "Sem resumo")}</p></span>
      <span class="timeline-ticket">${escapeHtml(event.ticketId || event.ticketIds?.slice(0, 2).join(" / ") || "PROJETO")}</span>
    </button>`;
  }).join("");
  elements.timelineList.querySelectorAll("[data-ticket]").forEach((item) => {
    if (item.dataset.ticket) item.addEventListener("click", () => openDialog(item.dataset.ticket));
  });
}

function renderFocus() {
  const result = nextRecommended(allTickets(), state.track);
  const ticket = result.ticket;
  const track = currentTrack();
  elements.focusWave.textContent = track ? `Foco ${track.label}` : "Todos os focos";
  if (!ticket) {
    elements.focusTicketId.textContent = "SEM LIBERAÇÕES";
    elements.focusTitle.textContent = "Nada liberado neste foco.";
    elements.focusSummary.textContent = "Mude o foco ou espere um merge para abrir o próximo card.";
    elements.focusUnlocks.textContent = "";
    elements.focusButton.disabled = true;
    return;
  }
  const unlocks = unlocksFrom(ticket.id, allTickets());
  const why = reasonFor(result.track || track, ticket.id);
  elements.focusTicketId.textContent = ticket.id;
  elements.focusTitle.textContent = ticket.title;
  elements.focusSummary.textContent = why || ticket.objective || ticket.context || "Sem objetivo descrito.";
  elements.focusUnlocks.textContent = unlocks.length ? `Daqui você segue para ${unlocks.join(", ")}.` : "Este passo não destrava outro ticket diretamente.";
  elements.focusButton.disabled = false;
  elements.focusButton.onclick = () => {
    state.view = "board";
    goToPage("board");
    openDialog(ticket.id);
  };
}

function renderActivity() {
  const events = timelineEvents().slice(0, 4);
  if (!events.length) {
    elements.activityPreview.innerHTML = `<div class="empty-column">Nenhuma atividade registrada.</div>`;
    return;
  }
  elements.activityPreview.innerHTML = events.map((event) => {
    const label = STATUS_EVENT_LABELS[event.type] || event.type || "atividade";
    const ticketId = event.ticketId || event.ticketIds?.[0] || "PROJETO";
    const symbol = event.type === "merged" ? "✓" : event.type === "blocked" ? "!" : "→";
    return `<button class="activity-item" data-ticket="${escapeHtml(event.ticketId || "")}" type="button"><span class="activity-icon" aria-hidden="true">${symbol}</span><span><strong>${escapeHtml(ticketId)} ${escapeHtml(label)}</strong><p>${escapeHtml(event.summary || "Sem resumo")}</p></span><time>${escapeHtml(formatActivityTime(event.timestamp))}</time></button>`;
  }).join("");
  elements.activityPreview.querySelectorAll("[data-ticket]").forEach((item) => {
    if (item.dataset.ticket) item.addEventListener("click", () => openDialog(item.dataset.ticket));
  });
}

function formatActivityTime(value) {
  const date = dateValue(value);
  if (!date) return "--";
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `${diffMinutes} min`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)} h`;
  return `${Math.round(diffMinutes / 1440)} d`;
}

function renderHealth() {
  const tickets = scopedTickets();
  const waiting = tickets.filter((ticket) => boardColumn(ticket, allTickets()) === "waiting").length;
  const review = tickets.filter((ticket) => ticket.status === "review").length;
  const score = Math.max(0, Math.min(100, 100 - waiting * 4 - review * 2));
  elements.healthScore.textContent = `${score}/100`;
  elements.healthSummary.textContent = waiting
    ? `${waiting} ticket${waiting === 1 ? "" : "s"} na fila deste foco. A coluna da esquerda é o que dá para começar.`
    : "Neste foco, nada está preso em dependência. Siga o card marcado como agora.";
  elements.healthSpeed.textContent = review ? "Em revisão" : "Boa";
  elements.healthBlockers.textContent = waiting ? `${waiting} na fila` : "Nenhum";
}

function renderViews() {
  if (state.view === "timeline") state.view = "board";
  elements.boardView.classList.toggle("hidden", state.view !== "board");
  elements.pathView.classList.toggle("hidden", state.view !== "path");
  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderNav() {
  const page = currentPage();
  const meta = PAGE_META[page];
  const project = currentProject();
  document.body.dataset.page = page;
  document.querySelectorAll(".site-page").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === page);
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", href === `#${page}`);
  });
  if (meta) {
    if (elements.pageTitle) elements.pageTitle.textContent = meta.title;
    if (elements.pageEyebrow) elements.pageEyebrow.textContent = `${project.label.toUpperCase()} / ${meta.eyebrow.split("/").at(-1).trim()}`;
    document.title = `${project.label} Workflow | ${meta.title}`;
  }
}

function render() {
  renderHeader();
  renderProjectSwitcher();
  renderQuality();
  renderTrackFilters();
  renderMetrics();
  renderFilters();
  renderBoard();
  renderPath();
  renderTimeline();
  renderFocus();
  renderActivity();
  renderHealth();
  renderViews();
  renderNav();
}

function dialogBlock(title, content) {
  return `<div class="detail-block"><h3>${escapeHtml(title)}</h3>${content}</div>`;
}

function openDialog(ticketId) {
  const ticket = ticketById(ticketId);
  if (!ticket) return;
  state.selectedTicketId = ticketId;
  const blockers = pendingBlockers(ticket, allTickets());
  const unlocks = unlocksFrom(ticket.id, allTickets());
  const ticketEvents = state.events.filter((event) => event.ticketId === ticketId || event.ticketIds?.includes(ticketId)).slice(0, 6);
  const column = BOARD_COLUMNS.find((item) => item.id === boardColumn(ticket, allTickets()));
  const project = currentProject();
  const statusControls = project.supportsStatusRequests
    ? `<form id="status-form" class="status-editor"><label>Status<select id="status-select">${STATUS_ORDER.map((status) => `<option value="${status}" ${ticket.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("")}</select></label><button class="button status-save" type="submit">${state.editable ? "Salvar status" : "Solicitar no GitHub"}</button></form><textarea id="status-note" class="dialog-note" placeholder="Nota opcional para a linha do tempo"></textarea><p id="status-form-error" class="dialog-error hidden"></p>${state.editable ? "" : `<p class="dialog-readonly">A solicitação abrirá um Issue pré-preenchido. A Action valida a mudança e cria um PR para <strong>feature</strong>.</p>`}`
    : `<p class="dialog-readonly"><strong>AutoBO está em consulta.</strong> A fonte oficial permanece no repositório privado AutoBO; este painel publica somente um espelho de leitura.</p>`;
  elements.dialogContent.innerHTML = `<div class="dialog-inner">
    <div class="dialog-title-row"><span class="ticket-id">${escapeHtml(ticket.id)}</span><h2 id="dialog-title">${escapeHtml(ticket.title)}</h2><p class="dialog-summary">${escapeHtml(ticket.objective || ticket.context || "Sem objetivo descrito.")}</p></div>
    <div class="path-callout">
      <p><strong>${escapeHtml(column?.label || ticket.status)}</strong> · ${escapeHtml(cardMeta(ticket).line)}</p>
      ${unlocks.length ? `<div class="unlock-row">${unlocks.map((id) => `<button class="unlock-chip" data-ticket="${escapeHtml(id)}" type="button">${escapeHtml(id)}</button>`).join("")}</div>` : ""}
    </div>
    <div class="detail-grid">
      ${dialogBlock("Escopo", displayList(ticket.scope))}
      ${dialogBlock("Fora do escopo", displayList(ticket.outOfScope))}
      ${dialogBlock("Comportamento", `<p>${escapeHtml(ticket.expectedBehavior || "Não informado")}</p>`)}
      ${dialogBlock("Dependências", displayList(ticket.blockedBy, "Nenhuma"))}
      ${dialogBlock("Aceite", displayList(ticket.acceptanceCriteria))}
      ${dialogBlock("Testes", displayList(ticket.tests))}
      ${dialogBlock("Arquivos prováveis", displayList(ticket.likelyFiles))}
      ${dialogBlock("Riscos", displayList(ticket.risks))}
    </div>
    <details class="detail-block"><summary>Instruções reproduzíveis de teste</summary><div class="detail-grid">
      ${dialogBlock("Pré-requisitos", displayList(ticket.testInstructions?.prerequisites))}
      ${dialogBlock("Passos", displayList(ticket.testInstructions?.steps))}
      ${dialogBlock("Resultado e evidência", displayList(ticket.testInstructions?.expectedResultAndEvidence))}
      ${dialogBlock("Impacto nos dados", `<p>${escapeHtml(ticket.testInstructions?.dataImpact || "Não informado")}</p>`)}
      ${dialogBlock("Limpeza e rollback", displayList(ticket.testInstructions?.cleanupAndRollback))}
      ${dialogBlock("Restrições de staging", `<p>${escapeHtml(ticket.testInstructions?.stagingRestrictions || "Não informado")}</p>`)}
    </div></details>
    ${blockers.length ? `<p class="dialog-error">Aguardando: ${escapeHtml(blockers.join(", "))}</p>` : ""}
    ${statusControls}
    ${ticketEvents.length ? `<div class="detail-block" style="margin-top:16px"><h3>Atividade recente</h3>${ticketEvents.map((event) => `<p style="margin:0 0 7px;color:var(--muted);font-size:12px"><strong style="color:var(--ink)">${escapeHtml(formatDate(event.timestamp))}</strong> · ${escapeHtml(event.summary || event.type)}</p>`).join("")}</div>` : ""}
  </div>`;
  elements.dialog.classList.remove("hidden");
  elements.dialog.querySelector("#status-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveStatus(ticket.id);
  });
  elements.dialog.querySelector("#status-select")?.addEventListener("change", (event) => {
    const pending = event.target.value === "in_progress" ? pendingBlockers(ticket, allTickets()) : [];
    const error = elements.dialog.querySelector("#status-form-error");
    if (pending.length) {
      error.textContent = `Não liberado: ${pending.join(", ")}.`;
      error.classList.remove("hidden");
    } else {
      error.classList.add("hidden");
    }
  });
  elements.dialog.querySelectorAll(".unlock-chip").forEach((chip) => {
    chip.addEventListener("click", () => openDialog(chip.dataset.ticket));
  });
}

async function saveStatus(ticketId) {
  if (!currentProject().supportsStatusRequests) {
    showToast("O AutoBO está disponível somente para consulta neste painel.");
    return;
  }
  const status = elements.dialog.querySelector("#status-select")?.value;
  const note = elements.dialog.querySelector("#status-note")?.value.trim() || "";
  const errorElement = elements.dialog.querySelector("#status-form-error");
  if (!status) return;
  if (!state.editable) {
    const title = encodeURIComponent(`[Workflow] ${ticketId} → ${STATUS_LABELS[status]}`);
    const body = encodeURIComponent(`<!-- autoos-workflow-status-request -->\nticketId=${ticketId}\nstatus=${status}\nnote=${note || "Solicitação feita pelo painel público."}`);
    window.open(`https://github.com/${currentProject().repository}/issues/new?title=${title}&body=${body}&labels=workflow-status`, "_blank", "noopener");
    showToast("Solicitação aberta no GitHub para confirmação.");
    return;
  }
  try {
    const response = await fetch(`./api/tickets/${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, note, summary: note || `Status alterado para ${STATUS_LABELS[status]}.` }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o status.");
    await loadData();
    openDialog(ticketId);
    showToast("Status salvo e evento adicionado à linha do tempo.");
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove("hidden");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

state.project = readStoredProject();
state.track = readStoredTrack();
bootPage();

elements.refreshButton.addEventListener("click", () => {
  void loadData().then(() => showToast("Painel atualizado."));
});
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});
document.querySelectorAll(".view-button").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  renderViews();
}));
elements.dialogClose.addEventListener("click", () => elements.dialog.classList.add("hidden"));
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") elements.dialog.classList.add("hidden");
});
window.addEventListener("hashchange", renderNav);

void loadData().catch((error) => {
  elements.qualityAlert.classList.remove("hidden");
  elements.qualityAlert.innerHTML = `<strong>Não foi possível carregar o workflow:</strong> ${escapeHtml(error.message)}`;
});
