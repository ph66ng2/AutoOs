const STATUS_ORDER = ["ready", "in_progress", "review", "merged", "blocked"];
const STATUS_LABELS = {
  ready: "Pronto",
  in_progress: "Em andamento",
  review: "Revisão",
  merged: "Concluído",
  blocked: "Bloqueado",
};
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
const AREA_LABELS = {
  all: "Todas",
  product: "Produto",
  powersync: "PowerSync",
  auth: "Auth",
  subscription: "SaaS",
  photos: "Fotos",
  hotfix: "Correções",
};
const AREA_KEYS = Object.keys(AREA_LABELS);
const GITHUB_REPOSITORY = "ph66ng2/AutoOs";
const state = {
  workflow: null,
  events: [],
  editable: false,
  mode: "static",
  view: "board",
  area: "all",
  query: "",
  selectedTicketId: null,
};

const elements = {
  modeBadge: document.querySelector("#mode-badge"),
  sourceLabel: document.querySelector("#source-label"),
  accessLabel: document.querySelector("#access-label"),
  refreshButton: document.querySelector("#refresh-button"),
  lastRead: document.querySelector("#last-read"),
  qualityAlert: document.querySelector("#quality-alert"),
  progressPercent: document.querySelector("#progress-percent"),
  progressBar: document.querySelector("#progress-bar"),
  metricTotal: document.querySelector("#metric-total"),
  metricReady: document.querySelector("#metric-ready"),
  metricMerged: document.querySelector("#metric-merged"),
  metricBlocked: document.querySelector("#metric-blocked"),
  searchInput: document.querySelector("#search-input"),
  areaFilters: document.querySelector("#area-filters"),
  boardView: document.querySelector("#board-view"),
  timelineView: document.querySelector("#timeline-view"),
  timelineList: document.querySelector("#timeline-list"),
  eventCount: document.querySelector("#event-count"),
  dependencyGraph: document.querySelector("#dependency-graph"),
  focusWave: document.querySelector("#focus-wave"),
  focusTicketId: document.querySelector("#focus-ticket-id"),
  focusTitle: document.querySelector("#focus-title"),
  focusSummary: document.querySelector("#focus-summary"),
  focusButton: document.querySelector("#focus-button"),
  activityHistory: document.querySelector("#activity-history"),
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

function areaFor(ticketId) {
  if (/^AO-(CNPJ|PDF|CLI|UX|EMAIL)/.test(ticketId)) return "product";
  if (ticketId.startsWith("AO-PS-")) return "powersync";
  if (ticketId.startsWith("AO-AUTH-")) return "auth";
  if (ticketId.startsWith("AO-SUB-")) return "subscription";
  if (ticketId.startsWith("AO-PHOTO-")) return "photos";
  if (ticketId.startsWith("AO-HOTFIX-")) return "hotfix";
  return "product";
}

function allTickets() {
  return state.workflow?.tickets || [];
}

function ticketById(ticketId) {
  return allTickets().find((ticket) => ticket.id === ticketId);
}

function pendingBlockers(ticket) {
  return (ticket.blockedBy || []).filter((blockerId) => ticketById(blockerId)?.status !== "merged");
}

const WAVE_LABELS = ["Fundação", "Base", "Integração", "Runtime", "Decisão"];
const waveMemo = new Map();

function waveForTicket(ticketId, visiting = new Set()) {
  if (waveMemo.has(ticketId)) return waveMemo.get(ticketId);
  if (visiting.has(ticketId)) return 1;
  const ticket = ticketById(ticketId);
  if (!ticket) return 1;
  visiting.add(ticketId);
  const dependencies = (ticket.blockedBy || []).filter((dependencyId) => ticketById(dependencyId));
  const depth = dependencies.length === 0
    ? 1
    : Math.max(...dependencies.map((dependencyId) => waveForTicket(dependencyId, visiting))) + 1;
  visiting.delete(ticketId);
  const wave = Math.min(depth, WAVE_LABELS.length);
  waveMemo.set(ticketId, wave);
  return wave;
}

function waveFor(ticket) {
  return waveForTicket(ticket.id);
}

function waveStatusCopy(ticket) {
  const blockers = pendingBlockers(ticket);
  if (blockers.length) return `⇢ ${blockers.length} dep.`;
  if (ticket.status === "merged") return "concluído";
  if (ticket.status === "in_progress") return "em andamento";
  if (ticket.status === "review") return "em revisão";
  if (ticket.status === "blocked") return "bloqueado";
  return "sem bloqueios";
}

function filteredTickets() {
  const query = state.query.trim().toLocaleLowerCase("pt-BR");
  return allTickets().filter((ticket) => {
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
  let workflowPayload;
  let eventsPayload;
  try {
    workflowPayload = await fetchJson("./api/workflow");
    eventsPayload = await fetchJson("./api/events");
    state.editable = Boolean(workflowPayload.editable);
    state.mode = "local";
  } catch {
    workflowPayload = await fetchJson("./data/workflow.json").catch(async () => fetchJson("../.workflow/workflow.json"));
    eventsPayload = await fetchJson("./data/events.json").catch(() => []);
    state.editable = false;
    state.mode = "static";
  }
  state.workflow = workflowPayload.workflow || workflowPayload;
  state.events = eventsPayload.events || eventsPayload || [];
  render();
}

function validateWorkflow() {
  const issues = [];
  if (state.workflow?.baseBranch !== "origin/feature") issues.push("baseBranch diferente de origin/feature");
  if (state.workflow?.promotionTarget !== "origin/master") issues.push("promotionTarget diferente de origin/master");
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
  elements.modeBadge.textContent = state.editable ? "Edição local" : "feature / workflow.json";
  elements.modeBadge.classList.toggle("editable", state.editable);
  elements.sourceLabel.textContent = state.editable ? "feature / workflow.json" : "feature / workflow.json";
  elements.accessLabel.textContent = state.editable ? "Edição local" : "Somente leitura";
  elements.lastRead.textContent = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date());
}

function renderMetrics() {
  const tickets = allTickets();
  const readyNow = tickets.filter((ticket) => ticket.status === "ready" && pendingBlockers(ticket).length === 0).length;
  const blocked = tickets.filter((ticket) => pendingBlockers(ticket).length > 0 || ticket.status === "blocked").length;
  const progress = tickets.length ? Math.round((tickets.filter((ticket) => ticket.status === "merged").length / tickets.length) * 100) : 0;
  elements.metricTotal.textContent = tickets.length;
  elements.metricReady.textContent = readyNow;
  elements.metricMerged.textContent = tickets.filter((ticket) => ticket.status === "merged").length;
  elements.metricBlocked.textContent = blocked;
  elements.progressPercent.textContent = `${progress}%`;
  elements.progressBar.style.width = `${progress}%`;
}

function renderFilters() {
  elements.areaFilters.innerHTML = AREA_KEYS.map((area) => `<button class="filter-button ${state.area === area ? "active" : ""}" data-area="${area}" type="button">${AREA_LABELS[area]}</button>`).join("");
  elements.areaFilters.querySelectorAll("[data-area]").forEach((button) => {
    button.addEventListener("click", () => {
      state.area = button.dataset.area;
      render();
    });
  });
}

function ticketCard(ticket) {
  const footer = waveStatusCopy(ticket);
  return `<button class="ticket-card" data-ticket="${escapeHtml(ticket.id)}" data-area="${areaFor(ticket.id)}" type="button">
    <span class="ticket-id">${escapeHtml(ticket.id)}</span>
    <span class="ticket-title">${escapeHtml(ticket.title)}</span>
    <span class="ticket-footer"><span class="ticket-state state-${escapeHtml(ticket.status)}"><i aria-hidden="true"></i>${escapeHtml(footer)}</span><span>abrir</span></span>
  </button>`;
}

function renderBoard() {
  const tickets = filteredTickets();
  waveMemo.clear();
  elements.boardView.innerHTML = WAVE_LABELS.map((label, index) => {
    const waveNumber = index + 1;
    const waveTickets = tickets.filter((ticket) => waveFor(ticket) === waveNumber);
    return `<section class="wave-column">
      <div class="wave-heading"><div><p>ONDA ${String(waveNumber).padStart(2, "0")}</p><h3>${label}</h3></div><span class="wave-count">${waveTickets.length}</span></div>
      ${waveTickets.length ? waveTickets.map(ticketCard).join("") : `<div class="empty-column">Nenhum ticket</div>`}
    </section>`;
  }).join("");
  elements.boardView.querySelectorAll("[data-ticket]").forEach((card) => card.addEventListener("click", () => openDialog(card.dataset.ticket)));
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
      const areaMatches = state.area === "all" || relatedTicketIds.some((ticketId) => areaFor(ticketId) === state.area);
      const queryMatches = !state.query || [event.ticketId, event.summary, event.type].join(" ").toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"));
      return areaMatches && queryMatches;
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

const criticalPaths = [
  { label: "Auth → fotos cloud", ids: ["AO-AUTH-002", "AO-AUTH-003", "AO-AUTH-004", "AO-PHOTO-009", "AO-PHOTO-003"] },
  { label: "PowerSync → offline", ids: ["AO-PS-005", "AO-PS-006", "AO-PS-007", "AO-SUB-005", "AO-PS-008"] },
  { label: "SaaS Online → runtime", ids: ["AO-SUB-002", "AO-SUB-003", "AO-SUB-004"] },
  { label: "Fotos → Storage", ids: ["AO-PHOTO-004", "AO-PHOTO-005", "AO-PHOTO-006", "AO-PHOTO-007", "AO-PHOTO-008"] },
];

function renderDependencyGraph() {
  elements.dependencyGraph.innerHTML = criticalPaths.map((path) => {
    const nodes = path.ids.map((ticketId) => ticketById(ticketId)).filter(Boolean);
    return `<div class="dependency-lane"><div class="lane-label">${escapeHtml(path.label)}</div><div class="lane-track">${nodes.map((ticket, index) => `${index ? `<span class="graph-arrow" aria-hidden="true">→</span>` : ""}<button class="graph-node" data-ticket="${escapeHtml(ticket.id)}" type="button"><strong>${escapeHtml(ticket.id)}</strong><span>${escapeHtml(STATUS_LABELS[ticket.status] || ticket.status)}</span></button>`).join("")}</div></div>`;
  }).join("");
  elements.dependencyGraph.querySelectorAll("[data-ticket]").forEach((node) => node.addEventListener("click", () => openDialog(node.dataset.ticket)));
}

function renderFocus() {
  const candidates = allTickets().filter((ticket) => ticket.status === "in_progress" || (ticket.status === "ready" && pendingBlockers(ticket).length === 0));
  const ticket = candidates[0] || allTickets().find((candidate) => candidate.status === "review" || candidate.status === "blocked");
  if (!ticket) {
    elements.focusWave.textContent = "Onda --";
    elements.focusTicketId.textContent = "SEM LIBERAÇÕES";
    elements.focusTitle.textContent = "O grafo está aguardando dependências.";
    elements.focusSummary.textContent = "Abra um ticket bloqueado para ver o caminho que precisa ser concluído.";
    elements.focusButton.disabled = true;
    return;
  }
  elements.focusWave.textContent = `Onda ${waveFor(ticket)}`;
  elements.focusTicketId.textContent = ticket.id;
  elements.focusTitle.textContent = ticket.title;
  elements.focusSummary.textContent = ticket.objective || ticket.context || "Sem objetivo descrito.";
  elements.focusButton.disabled = false;
  elements.focusButton.onclick = () => openDialog(ticket.id);
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
  const tickets = allTickets();
  const blocked = tickets.filter((ticket) => pendingBlockers(ticket).length > 0 || ticket.status === "blocked").length;
  const review = tickets.filter((ticket) => ticket.status === "review").length;
  const score = Math.max(0, Math.min(100, 100 - blocked * 7 - review * 2));
  elements.healthScore.textContent = `${score}/100`;
  elements.healthSummary.textContent = blocked
    ? `As dependências estão claras. ${blocked} bloqueio${blocked === 1 ? " merece" : "s merecem"} atenção nesta onda.`
    : "As dependências estão claras e não há bloqueios ativos no caminho atual.";
  elements.healthSpeed.textContent = review ? "Em revisão" : "Boa";
  elements.healthBlockers.textContent = blocked ? `${blocked} ativo${blocked === 1 ? "" : "s"}` : "Nenhum";
}

function renderViews() {
  elements.boardView.classList.toggle("hidden", state.view !== "board");
  elements.timelineView.classList.toggle("hidden", state.view !== "timeline");
  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function render() {
  renderHeader();
  renderQuality();
  renderMetrics();
  renderFilters();
  renderBoard();
  renderTimeline();
  renderDependencyGraph();
  renderFocus();
  renderActivity();
  renderHealth();
  renderViews();
}

function dialogBlock(title, content) {
  return `<div class="detail-block"><h3>${escapeHtml(title)}</h3>${content}</div>`;
}

function openDialog(ticketId) {
  const ticket = ticketById(ticketId);
  if (!ticket) return;
  state.selectedTicketId = ticketId;
  const blockers = pendingBlockers(ticket);
  const ticketEvents = state.events.filter((event) => event.ticketId === ticketId || event.ticketIds?.includes(ticketId)).slice(0, 6);
  elements.dialogContent.innerHTML = `<div class="dialog-inner">
    <div class="dialog-title-row"><span class="ticket-id">${escapeHtml(ticket.id)}</span><h2 id="dialog-title">${escapeHtml(ticket.title)}</h2><p class="dialog-summary">${escapeHtml(ticket.objective || ticket.context || "Sem objetivo descrito.")}</p></div>
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
    <form id="status-form" class="status-editor"><label>Status<select id="status-select">${STATUS_ORDER.map((status) => `<option value="${status}" ${ticket.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`).join("")}</select></label><button class="button status-save" type="submit">${state.editable ? "Salvar status" : "Solicitar no GitHub"}</button></form><textarea id="status-note" class="dialog-note" placeholder="Nota opcional para a linha do tempo"></textarea><p id="status-form-error" class="dialog-error hidden"></p>${state.editable ? "" : `<p class="dialog-readonly">A solicitação abrirá um Issue pré-preenchido. A Action valida a mudança e cria um PR para <strong>feature</strong>.</p>`}
    ${ticketEvents.length ? `<div class="detail-block" style="margin-top:16px"><h3>Atividade recente</h3>${ticketEvents.map((event) => `<p style="margin:0 0 7px;color:var(--muted);font-size:12px"><strong style="color:var(--ink)">${escapeHtml(formatDate(event.timestamp))}</strong> · ${escapeHtml(event.summary || event.type)}</p>`).join("")}</div>` : ""}
  </div>`;
  elements.dialog.classList.remove("hidden");
  elements.dialog.querySelector("#status-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveStatus(ticket.id);
  });
  elements.dialog.querySelector("#status-select")?.addEventListener("change", (event) => {
    const pending = event.target.value === "in_progress" ? pendingBlockers(ticket) : [];
    const error = elements.dialog.querySelector("#status-form-error");
    if (pending.length) {
      error.textContent = `Não liberado: ${pending.join(", ")}.`;
      error.classList.remove("hidden");
    } else {
      error.classList.add("hidden");
    }
  });
}

async function saveStatus(ticketId) {
  const status = elements.dialog.querySelector("#status-select")?.value;
  const note = elements.dialog.querySelector("#status-note")?.value.trim() || "";
  const errorElement = elements.dialog.querySelector("#status-form-error");
  if (!status) return;
  if (!state.editable) {
    const ticket = ticketById(ticketId);
    const title = encodeURIComponent(`[Workflow] ${ticketId} → ${STATUS_LABELS[status]}`);
    const body = encodeURIComponent(`<!-- autoos-workflow-status-request -->\nticketId=${ticketId}\nstatus=${status}\nnote=${note || "Solicitação feita pelo painel público."}`);
    window.open(`https://github.com/${GITHUB_REPOSITORY}/issues/new?title=${title}&body=${body}&labels=workflow-status`, "_blank", "noopener");
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

elements.refreshButton.addEventListener("click", () => {
  void loadData().then(() => showToast("Painel atualizado."));
});
elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});
document.querySelectorAll(".view-button").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  document.querySelectorAll(".view-button").forEach((viewButton) => viewButton.setAttribute("aria-selected", String(viewButton === button)));
  renderViews();
}));
elements.activityHistory.addEventListener("click", () => {
  state.view = "timeline";
  document.querySelectorAll(".view-button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.view === "timeline")));
  renderViews();
  document.querySelector("#waves")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.dialogClose.addEventListener("click", () => elements.dialog.classList.add("hidden"));
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") elements.dialog.classList.add("hidden");
});

void loadData().catch((error) => {
  elements.qualityAlert.classList.remove("hidden");
  elements.qualityAlert.innerHTML = `<strong>Não foi possível carregar o workflow:</strong> ${escapeHtml(error.message)}`;
});
