const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "unknown") return "unknown";
  if (dateStr.includes("T")) {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch (_) {
      return dateStr;
    }
  }
  return dateStr;
};

const renderCard = (item) => {
  const status = item.status || "unknown";
  const isApproved = status === "approved";
  const badgeClass = isApproved ? "badge-ok" : "badge-pending";
  const dateStr = item.date || item.createdAt || "unknown";
  const displayDate = formatDate(dateStr);
  const textContent = item.text || item.content || "";

  const candidateSource = [
    item.source?.kind && `kind=${item.source.kind}`,
    item.source?.identifier && `identifier=${item.source.identifier}`,
    item.source?.id && `id=${item.source.id}`,
    item.source?.note
  ].filter(Boolean).join("; ");

  const provenancePath = item.provenance?.path || candidateSource;
  const provenanceLine = item.provenance?.lineStart ? `:${item.provenance.lineStart}` : "";

  return `
    <div class="card">
      <div class="card-header">
        <div class="header-left">
          <span class="badge ${badgeClass}">${status.toUpperCase()}</span>
          ${item.scope ? `<span class="scope-tag">${escapeHtml(item.scope)}</span>` : ""}
          ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ""}
        </div>
        <span class="card-date">${escapeHtml(displayDate)}</span>
      </div>

      <div class="memory-text">${escapeHtml(textContent)}</div>

      ${(provenancePath || item.section) ? `
        <div class="provenance-section">
          ${item.section ? `
            <div class="provenance-row">
              <span class="provenance-label">Section:</span>
              <span class="provenance-value">${escapeHtml(item.section)}</span>
            </div>
          ` : ""}
          ${provenancePath ? `
            <div class="provenance-row">
              <span class="provenance-label">Provenance:</span>
              <span class="provenance-code">${escapeHtml(provenancePath)}${escapeHtml(provenanceLine)}</span>
            </div>
          ` : ""}
        </div>
      ` : ""}
    </div>
  `;
};

const renderCandidateCard = (item) => {
  const status = item.status || "candidate";
  const statusText = escapeHtml(String(status).toUpperCase());
  const isApproved = status === "approved";
  const badgeClass = isApproved ? "badge-ok" : "badge-pending";
  const dateStr = item.createdAt || item.date || "unknown";
  const displayDate = formatDate(dateStr);
  const textContent = item.content || item.text || "";

  const candidateSource = [
    item.source?.kind && `kind=${item.source.kind}`,
    item.source?.identifier && `identifier=${item.source.identifier}`,
    item.source?.id && `id=${item.source.id}`,
    item.source?.note
  ].filter(Boolean).join("; ");

  const provenancePath = item.provenance?.path || candidateSource;
  const provenanceLine = item.provenance?.lineStart ? `:${item.provenance.lineStart}` : "";

  // Render idempotency and review metadata only if they exist
  let metadataRows = "";
  if (item.idempotencyKey) {
    metadataRows += `
      <div class="provenance-row">
        <span class="provenance-label">Idempotency Key:</span>
        <span class="provenance-code">${escapeHtml(item.idempotencyKey)}</span>
      </div>
    `;
  }
  if (item.review) {
    const reviewNote = item.review.note ? `; note=${item.review.note}` : "";
    metadataRows += `
      <div class="provenance-row">
        <span class="provenance-label">Review:</span>
        <span class="provenance-value">${escapeHtml(item.review.status || item.review.action || "unknown")}${escapeHtml(reviewNote)}</span>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header">
        <div class="header-left">
          <span class="badge ${badgeClass}">${statusText}</span>
          ${item.scope ? `<span class="scope-tag">${escapeHtml(item.scope)}</span>` : ""}
          ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ""}
        </div>
        <span class="card-date">${escapeHtml(displayDate)}</span>
      </div>

      <div class="memory-text">${escapeHtml(textContent)}</div>

      <div class="provenance-section">
        ${item.issueId ? `
          <div class="provenance-row">
            <span class="provenance-label">Issue ID:</span>
            <span class="provenance-value" style="font-weight: 600;">${escapeHtml(item.issueId)}</span>
          </div>
        ` : ""}
        ${provenancePath ? `
          <div class="provenance-row">
            <span class="provenance-label">Provenance:</span>
            <span class="provenance-code">${escapeHtml(provenancePath)}${escapeHtml(provenanceLine)}</span>
          </div>
        ` : ""}
        ${metadataRows}
      </div>
    </div>
  `;
};

const renderSection = (title, items, typeLabel) => {
  if (!items || items.length === 0) {
    return `
      <div class="section-container">
        <h3 class="section-title">
          <span>${escapeHtml(title)}</span>
          <span class="counter-badge">0</span>
        </h3>
        <div class="empty-section-banner">
          No ${escapeHtml(typeLabel.toLowerCase())} memories found.
        </div>
      </div>
    `;
  }

  return `
    <div class="section-container">
      <h3 class="section-title">
        <span>${escapeHtml(title)}</span>
        <span class="counter-badge">${items.length}</span>
      </h3>
      <div class="cards-grid">
        ${items.map(item => renderCard(item)).join("")}
      </div>
    </div>
  `;
};

const SHARED_STYLES = `
  :host {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
    color: rgba(255, 255, 255, 0.9);
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }

  .header {
    margin-bottom: 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 16px;
  }

  .header-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: #fff;
  }

  .header-subtitle {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Loading state */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: 16px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error state */
  .error-container {
    padding: 24px;
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    background-color: rgba(239, 68, 68, 0.05);
    color: #ef4444;
  }

  .error-title {
    margin: 0 0 8px 0;
    font-weight: 600;
    font-size: 16px;
  }

  .error-body {
    margin: 0;
    font-size: 14px;
    opacity: 0.8;
  }

  /* Empty state */
  .empty-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 32px;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    text-align: center;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 8px;
  }

  .empty-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    max-width: 360px;
    line-height: 1.5;
  }

  /* Section styles */
  .section-container {
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .counter-badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
    background-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
  }

  .empty-section-banner {
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.02);
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
  }

  .cards-grid {
    display: grid;
    gap: 16px;
  }

  /* Card styles */
  .card {
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s ease, background-color 0.2s ease;
  }

  .card:hover {
    border-color: rgba(255, 255, 255, 0.15);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .badge-ok {
    background-color: rgba(34, 197, 94, 0.1);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .badge-pending {
    background-color: rgba(234, 179, 8, 0.1);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.2);
  }

  .scope-tag {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a78bfa;
    font-weight: 600;
  }

  .type-tag {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.4);
  }

  .card-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .memory-text {
    white-space: pre-wrap;
    word-break: break-word;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    line-height: 1.6;
  }

  .provenance-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .provenance-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .provenance-label {
    color: rgba(255, 255, 255, 0.25);
  }

  .provenance-value {
    color: rgba(255, 255, 255, 0.6);
  }

  .provenance-code {
    font-family: monospace;
    color: #818cf8;
    background-color: rgba(129, 140, 248, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    word-break: break-all;
  }

  /* The local Paperclip instance uses a light canvas by default. */
  :host { color: #172033; }
  .header { border-bottom-color: #e2e8f0; }
  .header-title, .section-title { color: #172033; }
  .header-subtitle, .loading-text, .card-date { color: #64748b; }
  .empty-container, .empty-section-banner, .card { border-color: #dbe3ec; background-color: #ffffff; }
  .empty-title { color: #172033; }
  .empty-desc, .empty-section-banner { color: #64748b; }
  .counter-badge { background-color: #eef2f7; color: #475569; }
  .card:hover { border-color: #cbd5e1; background-color: #f8fafc; }
  .scope-tag { color: #6d28d9; }
  .type-tag { color: #64748b; }
  .memory-text { color: #1f2937; }
  .provenance-section { border-top-color: #e2e8f0; color: #64748b; }
  .provenance-label { color: #94a3b8; }
  .provenance-value { color: #475569; }
  .provenance-code { color: #4338ca; background-color: #eef2ff; }
`;

class MemoryTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._mounted = false;
    this._loading = false;
    this._error = null;
    this._data = null;
    this._lastCacheKey = null;
  }

  get pluginSlot() {
    return this._pluginSlot;
  }

  set pluginSlot(val) {
    this._pluginSlot = val;
    this._fetchData();
  }

  get pluginContext() {
    return this._pluginContext;
  }

  set pluginContext(val) {
    this._pluginContext = val;
    this._fetchData();
  }

  connectedCallback() {
    this._mounted = true;
    this._fetchData();
  }

  disconnectedCallback() {
    this._mounted = false;
  }

  async _fetchData() {
    if (!this._mounted) return;
    const context = this._pluginContext;
    const slot = this._pluginSlot;
    if (!context) return;

    const companyId = context.companyId;
    const issueId = context.entityId;
    const projectId = context.projectId;

    if (!companyId || !issueId) {
      return;
    }

    const cacheKey = `${companyId}:${projectId}:${issueId}`;
    if (this._lastCacheKey === cacheKey && (this._loading || this._data || this._error)) {
      return;
    }
    this._lastCacheKey = cacheKey;

    this._loading = true;
    this._error = null;
    this._data = null;
    this._render();

    try {
      const pluginId = slot?.pluginId || "local.memory-sidecar";
      const url = `/api/plugins/${pluginId}/data/memory-view`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          params: {
            companyId,
            projectId: projectId || null,
            issueId
          }
        })
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      this._data = resJson.data || {};
      this._loading = false;
      this._render();
    } catch (err) {
      this._error = err;
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    let contentHtml = "";

    if (this._loading) {
      contentHtml = `
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Recalling task room memory...</span>
        </div>
      `;
    } else if (this._error) {
      contentHtml = `
        <div class="error-container">
          <h4 class="error-title">Failed to load memory data</h4>
          <p class="error-body">${escapeHtml(this._error.message || String(this._error))}</p>
        </div>
      `;
    } else if (this._data) {
      const companyMemories = this._data.companyMemories || [];
      const projectMemories = this._data.projectMemories || [];
      const candidates = this._data.candidates || [];
      const hasAssignee = !!this._data.hasAssignee;
      const agentMemories = this._data.agentMemories || [];

      const hasNoData = companyMemories.length === 0 &&
                        projectMemories.length === 0 &&
                        candidates.length === 0 &&
                        (!hasAssignee || agentMemories.length === 0);

      if (hasNoData) {
        contentHtml = `
          <div class="empty-container">
            <span class="empty-title">No Memory Found</span>
            <span class="empty-desc">
              There is no approved company/project memory or proposed candidates associated with this task room yet.
            </span>
          </div>
        `;
      } else {
        contentHtml = `
          ${renderSection("Memory Candidates", candidates, "Candidate")}
          ${hasAssignee ? renderSection("Assigned Agent Memory", agentMemories, "Agent") : ""}
          ${renderSection("Project Memory", projectMemories, "Project")}
          ${renderSection("Company Memory", companyMemories, "Company")}
        `;
      }
    } else {
      contentHtml = `
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;
    }

    shadow.innerHTML = `
      <style>${SHARED_STYLES}</style>

      <div class="header">
        <h2 class="header-title">Task Room Memory</h2>
        <p class="header-subtitle">Read-only view of memory items and proposed candidates.</p>
      </div>

      <div class="content-body">
        ${contentHtml}
      </div>
    `;
  }
}

if (!customElements.get("paperclip-memory-tab")) {
  customElements.define("paperclip-memory-tab", MemoryTabElement);
}

export const MemoryTab = "paperclip-memory-tab";

class ProjectMemoryTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._mounted = false;
    this._loading = false;
    this._error = null;
    this._data = null;
    this._lastCacheKey = null;
  }

  get pluginSlot() {
    return this._pluginSlot;
  }

  set pluginSlot(val) {
    this._pluginSlot = val;
    this._fetchData();
  }

  get pluginContext() {
    return this._pluginContext;
  }

  set pluginContext(val) {
    this._pluginContext = val;
    this._fetchData();
  }

  connectedCallback() {
    this._mounted = true;
    this._fetchData();
  }

  disconnectedCallback() {
    this._mounted = false;
  }

  async _fetchData() {
    if (!this._mounted) return;
    const context = this._pluginContext;
    const slot = this._pluginSlot;
    if (!context) return;

    const companyId = context.companyId;
    const projectId = context.projectId || context.entityId;

    if (!companyId || !projectId) {
      this._error = new Error("companyId and projectId are required for project-memory-view data");
      this._loading = false;
      this._render();
      return;
    }

    const cacheKey = `${companyId}:${projectId}`;
    if (this._lastCacheKey === cacheKey && (this._loading || this._data || this._error)) {
      return;
    }
    this._lastCacheKey = cacheKey;

    this._loading = true;
    this._error = null;
    this._data = null;
    this._render();

    try {
      const pluginId = slot?.pluginId || "local.memory-sidecar";
      const url = `/api/plugins/${pluginId}/data/project-memory-view`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          params: {
            companyId,
            projectId
          }
        })
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      this._data = resJson.data || {};
      this._loading = false;
      this._render();
    } catch (err) {
      this._error = err;
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    let contentHtml = "";

    if (this._loading) {
      contentHtml = `
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Recalling project memory...</span>
        </div>
      `;
    } else if (this._error) {
      contentHtml = `
        <div class="error-container">
          <h4 class="error-title">Failed to load memory data</h4>
          <p class="error-body">${escapeHtml(this._error.message || String(this._error))}</p>
        </div>
      `;
    } else if (this._data) {
      const companyMemories = this._data.companyMemories || [];
      const projectMemories = this._data.projectMemories || [];
      const candidates = this._data.candidates || [];

      const hasNoData = companyMemories.length === 0 && projectMemories.length === 0 && candidates.length === 0;

      if (hasNoData) {
        contentHtml = `
          <div class="empty-container">
            <span class="empty-title">No Memory Found</span>
            <span class="empty-desc">
              There is no approved company/project memory or proposed candidates associated with this project yet.
            </span>
          </div>
        `;
      } else {
        contentHtml = `
          ${renderSection("Memory Candidates", candidates, "Candidate")}
          ${renderSection("Project Memory", projectMemories, "Project")}
          ${renderSection("Company Memory", companyMemories, "Company")}
        `;
      }
    } else {
      contentHtml = `
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;
    }

    shadow.innerHTML = `
      <style>${SHARED_STYLES}</style>

      <div class="header">
        <h2 class="header-title">Project Hub Memory</h2>
        <p class="header-subtitle">Read-only view of memory items and proposed candidates for this project.</p>
      </div>

      <div class="content-body">
        ${contentHtml}
      </div>
    `;
  }
}

if (!customElements.get("paperclip-project-memory-tab")) {
  customElements.define("paperclip-project-memory-tab", ProjectMemoryTabElement);
}

export const ProjectMemoryTab = "paperclip-project-memory-tab";

class ProjectMemoryCandidatesTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._mounted = false;
    this._loading = false;
    this._error = null;
    this._data = null;
    this._lastCacheKey = null;
  }

  get pluginSlot() {
    return this._pluginSlot;
  }

  set pluginSlot(val) {
    this._pluginSlot = val;
    this._fetchData();
  }

  get pluginContext() {
    return this._pluginContext;
  }

  set pluginContext(val) {
    this._pluginContext = val;
    this._fetchData();
  }

  connectedCallback() {
    this._mounted = true;
    this._fetchData();
  }

  disconnectedCallback() {
    this._mounted = false;
  }

  async _fetchData() {
    if (!this._mounted) return;
    const context = this._pluginContext;
    const slot = this._pluginSlot;
    if (!context) return;

    const companyId = context.companyId;
    const projectId = context.projectId || context.entityId;

    if (!companyId || !projectId) {
      this._error = new Error("companyId and projectId are required for project-memory-candidates-view data");
      this._loading = false;
      this._render();
      return;
    }

    const cacheKey = `${companyId}:${projectId}`;
    if (this._lastCacheKey === cacheKey && (this._loading || this._data || this._error)) {
      return;
    }
    this._lastCacheKey = cacheKey;

    this._loading = true;
    this._error = null;
    this._data = null;
    this._render();

    try {
      const pluginId = slot?.pluginId || "local.memory-sidecar";
      const url = `/api/plugins/${pluginId}/data/project-memory-candidates-view`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          params: {
            companyId,
            projectId
          }
        })
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      this._data = resJson.data || {};
      this._loading = false;
      this._render();
    } catch (err) {
      this._error = err;
      this._loading = false;
      this._render();
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    let contentHtml = "";

    if (this._loading) {
      contentHtml = `
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">Loading memory candidates...</span>
        </div>
      `;
    } else if (this._error) {
      contentHtml = `
        <div class="error-container">
          <h4 class="error-title">Failed to load memory candidates</h4>
          <p class="error-body">${escapeHtml(this._error.message || String(this._error))}</p>
        </div>
      `;
    } else if (this._data) {
      const candidates = this._data.candidates || [];

      if (candidates.length === 0) {
        contentHtml = `
          <div class="empty-container">
            <span class="empty-title">No Proposed Candidates</span>
            <span class="empty-desc">
              There are no memory candidates proposed for this project yet.
            </span>
          </div>
        `;
      } else {
        contentHtml = `
          <div class="section-container">
            <h3 class="section-title">
              <span>Memory Candidates Queue</span>
              <span class="counter-badge">${candidates.length}</span>
            </h3>
            <div class="cards-grid">
              ${candidates.map(item => renderCandidateCard(item)).join("")}
            </div>
          </div>
        `;
      }
    } else {
      contentHtml = `
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;
    }

    shadow.innerHTML = `
      <style>${SHARED_STYLES}</style>

      <div class="header">
        <h2 class="header-title">Project Memory Candidates</h2>
        <p class="header-subtitle">Read-only queue of proposed memory candidates for CTO review.</p>
      </div>

      <div class="content-body">
        ${contentHtml}
      </div>
    `;
  }
}

if (!customElements.get("paperclip-project-memory-candidates-tab")) {
  customElements.define("paperclip-project-memory-candidates-tab", ProjectMemoryCandidatesTabElement);
}

export const ProjectMemoryCandidatesTab = "paperclip-project-memory-candidates-tab";

class ProjectDirectTaskPreviewTabElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pluginSlot = null;
    this._pluginContext = null;
    this._mounted = false;
    this._submitting = false;
    this._previewData = null;
    this._error = null;
    this._launching = false;
    this._launchResult = null;
    this._launchError = null;
    this._currentDraft = null;
    this._agentRooms = [];
    this._agentRoomsLoading = false;
    this._agentRoomsKey = null;
  }

  get pluginSlot() {
    return this._pluginSlot;
  }

  set pluginSlot(val) {
    this._pluginSlot = val;
  }

  get pluginContext() {
    return this._pluginContext;
  }

  set pluginContext(val) {
    this._pluginContext = val;
    this._render();
    void this._loadAgentRooms();
  }

  connectedCallback() {
    this._mounted = true;
    this._render();
    void this._loadAgentRooms();
  }

  disconnectedCallback() {
    this._mounted = false;
  }

  async _loadAgentRooms() {
    const context = this._pluginContext;
    const projectId = context?.projectId || context?.entityId;
    const companyId = context?.companyId;
    const pluginId = this._pluginSlot?.pluginId || "local.memory-sidecar";
    if (!companyId || !projectId || this._agentRoomsLoading) return;

    const key = `${companyId}:${projectId}:${pluginId}`;
    if (this._agentRoomsKey === key) return;
    this._agentRoomsLoading = true;
    try {
      const response = await fetch(`/api/plugins/${pluginId}/data/direct-task-agent-rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, params: { companyId, projectId } })
      });
      if (!response.ok) throw new Error("Unable to load Agent Rooms.");
      const body = await response.json();
      this._agentRooms = Array.isArray(body?.data?.agentRooms) ? body.data.agentRooms : [];
      this._agentRoomsKey = key;
    } catch (_) {
      this._agentRooms = [];
      this._agentRoomsKey = key;
    } finally {
      this._agentRoomsLoading = false;
      this._updateAgentRoomOptions();
    }
  }

  _updateAgentRoomOptions() {
    const shadow = this.shadowRoot;
    const roleSelect = shadow?.getElementById("role-select");
    const roomSelect = shadow?.getElementById("agent-room-select");
    if (!roleSelect || !roomSelect) return;

    const previousValue = roomSelect.value;
    const role = roleSelect.value;
    const rooms = this._agentRooms.filter((room) => room.role === role);
    const placeholder = this._agentRoomsLoading
      ? "Loading Agent Rooms..."
      : (role ? "Select an Agent Room..." : "Select a worker role first...");
    roomSelect.innerHTML = `<option value="" disabled selected>${escapeHtml(placeholder)}</option>${rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.identifier)} - ${escapeHtml(room.title)}</option>`).join("")}`;
    if (rooms.some((room) => room.id === previousValue)) roomSelect.value = previousValue;
    roomSelect.disabled = this._agentRoomsLoading || !role || rooms.length === 0;
  }

  _setupFormListeners() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    const form = shadow.getElementById("preview-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (this._submitting) return;

      const roleSelect = shadow.getElementById("role-select");
      const agentRoomSelect = shadow.getElementById("agent-room-select");
      const titleInput = shadow.getElementById("title-input");
      const descInput = shadow.getElementById("description-input");

      const role = roleSelect.value;
      const parentId = agentRoomSelect.value;
      const title = titleInput.value.trim();
      const description = descInput.value.trim();

      // Clear errors
      shadow.getElementById("error-role").textContent = "";
      shadow.getElementById("error-agent-room").textContent = "";
      shadow.getElementById("error-title").textContent = "";
      shadow.getElementById("error-description").textContent = "";

      let clientValid = true;
      if (!role) {
        shadow.getElementById("error-role").textContent = "Role selection is required.";
        clientValid = false;
      } else if (role !== "unreal-code" && role !== "unreal-qa") {
        shadow.getElementById("error-role").textContent = "Invalid role selected.";
        clientValid = false;
      }

      if (!parentId) {
        shadow.getElementById("error-agent-room").textContent = "Agent Room selection is required.";
        clientValid = false;
      }

      if (!title) {
        shadow.getElementById("error-title").textContent = "Title is required.";
        clientValid = false;
      } else if (title.length > 200) {
        shadow.getElementById("error-title").textContent = `Title must be 200 characters or less (current: ${title.length}).`;
        clientValid = false;
      }

      if (!description) {
        shadow.getElementById("error-description").textContent = "Description is required.";
        clientValid = false;
      } else if (description.length > 4000) {
        shadow.getElementById("error-description").textContent = `Description must be 4,000 characters or less (current: ${description.length}).`;
        clientValid = false;
      }

      if (!clientValid) return;

      this._submitting = true;
      this._error = null;
      this._previewData = null;
      this._updateButtonState();

      try {
        const context = this._pluginContext;
        const slot = this._pluginSlot;
        if (!context) throw new Error("Plugin context not initialized");

        const companyId = context.companyId;
        const projectId = context.projectId || context.entityId;
        const pluginId = slot?.pluginId || "local.memory-sidecar";
        const url = `/api/plugins/${pluginId}/data/direct-task-preview`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            companyId,
            params: {
              companyId,
              projectId,
              role,
              parentId,
              title,
              description
            }
          })
        });

        if (!response.ok) {
          let errMsg = `HTTP ${response.status}`;
          try {
            const errData = await response.json();
            errMsg = errData.message || errData.error || errMsg;
          } catch (_) {}
          throw new Error(errMsg);
        }

        const resJson = await response.json();
        this._previewData = resJson.data || {};
        
        if (this._previewData.valid) {
          this._currentDraft = {
            role,
            parentId,
            title,
            description,
            idempotencyKey: 'idem-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
          };
          this._launchResult = null;
          this._launchError = null;
        } else {
          this._currentDraft = null;
          const sErrors = this._previewData.errors;
          if (sErrors) {
            if (sErrors.role) shadow.getElementById("error-role").textContent = sErrors.role;
            if (sErrors.title) shadow.getElementById("error-title").textContent = sErrors.title;
            if (sErrors.description) shadow.getElementById("error-description").textContent = sErrors.description;
          }
        }
      } catch (err) {
        this._error = err;
      } finally {
        this._submitting = false;
        this._updateButtonState();
        this._renderPreviewResult();
      }
    });
  }

  _setupFormChangeListeners() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    const roleSelect = shadow.getElementById("role-select");
    const agentRoomSelect = shadow.getElementById("agent-room-select");
    const titleInput = shadow.getElementById("title-input");
    const descInput = shadow.getElementById("description-input");

    const onInputChange = () => {
      if (this._currentDraft) {
        if (roleSelect.value !== this._currentDraft.role ||
            agentRoomSelect.value !== this._currentDraft.parentId ||
            titleInput.value.trim() !== this._currentDraft.title ||
            descInput.value.trim() !== this._currentDraft.description) {
          this._previewData = null;
          this._currentDraft = null;
          this._launchResult = null;
          this._launchError = null;
          this._renderPreviewResult();
        }
      }
    };

    if (roleSelect) roleSelect.addEventListener("change", () => {
      this._updateAgentRoomOptions();
      onInputChange();
    });
    if (agentRoomSelect) agentRoomSelect.addEventListener("change", onInputChange);
    if (titleInput) titleInput.addEventListener("input", onInputChange);
    if (descInput) descInput.addEventListener("input", onInputChange);
  }

  _updateButtonState() {
    const shadow = this.shadowRoot;
    if (!shadow) return;
    const btn = shadow.getElementById("preview-btn");
    const text = shadow.querySelector(".btn-text");
    const spinner = shadow.querySelector(".btn-spinner");

    if (btn && text && spinner) {
      if (this._submitting) {
        btn.disabled = true;
        text.textContent = "Validating...";
        spinner.style.display = "inline-block";
      } else {
        btn.disabled = false;
        text.textContent = "Preview Request";
        spinner.style.display = "none";
      }
    }
  }

  _renderLaunchContent() {
    if (this._launchResult && this._launchResult.ok) {
      const companyPrefix = this._pluginContext?.companyPrefix;
      const identifier = this._launchResult.identifier;
      let linkHtml = "";
      if (
        companyPrefix &&
        typeof companyPrefix === "string" &&
        /^[A-Za-z0-9_-]{1,80}$/.test(companyPrefix) &&
        identifier &&
        typeof identifier === "string" &&
        /^[A-Za-z0-9_-]{1,120}$/.test(identifier)
      ) {
        const taskUrl = `/${encodeURIComponent(companyPrefix)}/issues/${encodeURIComponent(identifier)}`;
        linkHtml = `<a href="${escapeHtml(taskUrl)}" class="task-link" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Open Paperclip Task Room</a>`;
      }
      return `
        <div class="launch-success" style="color: #15803d; font-size: 13px;">
          <p style="margin: 0 0 8px 0; font-weight: 600;">✓ Task Room Launched Successfully!</p>
          <p style="margin: 0 0 8px 0;">Issue Identifier: <strong style="font-weight: 700;">${escapeHtml(identifier)}</strong></p>
          ${linkHtml}
        </div>
      `;
    }

    let errorHtml = "";
    if (this._launchError) {
      errorHtml = `
        <div class="launch-error" style="color: #b91c1c; font-size: 13px; margin-bottom: 12px; background: #fee2e2; padding: 8px 12px; border-radius: 6px; border: 1px solid #fca5a5; width: 100%; box-sizing: border-box;">
          <strong>Error launching task room:</strong> ${escapeHtml(this._launchError.message || String(this._launchError))}
        </div>
      `;
    }

    const disabledAttr = this._launching ? "disabled" : "";
    const btnText = this._launching ? "Launching Task Room..." : "Launch Task Room";
    const spinnerStyle = this._launching ? "inline-block" : "none";

    return `
      ${errorHtml}
      <button type="button" id="launch-btn" class="preview-btn" style="background-color: #059669;" ${disabledAttr}>
        <span class="launch-btn-text">${escapeHtml(btnText)}</span>
        <span class="btn-spinner launch-spinner" style="display: ${spinnerStyle};"></span>
      </button>
    `;
  }

  async _handleLaunch() {
    if (!this._currentDraft) return;

    this._launching = true;
    this._launchError = null;
    this._launchResult = null;
    this._renderPreviewResult();

    try {
      const context = this._pluginContext;
      const slot = this._pluginSlot;
      if (!context) throw new Error("Plugin context not initialized");

      const companyId = context.companyId;
      const projectId = context.projectId || context.entityId;
      const pluginId = slot?.pluginId || "local.memory-sidecar";
      const url = `/api/plugins/${pluginId}/actions/direct-task-submit`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          params: {
            projectId,
            role: this._currentDraft.role,
            parentId: this._currentDraft.parentId,
            title: this._currentDraft.title,
            description: this._currentDraft.description,
            idempotencyKey: this._currentDraft.idempotencyKey
          }
        })
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const resJson = await response.json();
      // Paperclip action responses vary between direct result and data-wrapped shapes.
      const result = [
        resJson,
        resJson?.result,
        resJson?.data,
        resJson?.data?.result,
        resJson?.result?.data
      ].find((candidate) => candidate && typeof candidate === "object" && typeof candidate.ok === "boolean") || resJson;

      if (result && result.ok) {
        this._launchResult = result;
      } else {
        throw new Error(result?.message || result?.code || "Failed to launch task room.");
      }
    } catch (err) {
      this._launchError = err;
    } finally {
      this._launching = false;
      this._renderPreviewResult();
    }
  }

  _renderPreviewResult() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    const resultContainer = shadow.getElementById("preview-result");
    if (!resultContainer) return;

    if (this._error) {
      resultContainer.className = "preview-result invalid";
      resultContainer.style.display = "flex";
      resultContainer.innerHTML = `
        <h4 class="result-title invalid">Validation Error</h4>
        <p class="result-value">${escapeHtml(this._error.message || String(this._error))}</p>
      `;
    } else if (this._previewData) {
      const data = this._previewData;
      if (data.valid) {
        resultContainer.className = "preview-result valid";
        resultContainer.style.display = "flex";
        resultContainer.innerHTML = `
          <h4 class="result-title valid">✓ Request Valid</h4>
          <div class="result-grid">
            <div class="result-label">Worker Role:</div>
            <div class="result-value result-value-highlight">${escapeHtml(data.roleLabel)}</div>

            <div class="result-label">Safety Boundary:</div>
            <div class="result-value result-boundary">${escapeHtml(data.roleBoundary)}</div>

            <div class="result-label">Paperclip Outcome:</div>
            <div class="result-value">${escapeHtml(data.paperclipStatement)}</div>
          </div>
          <div class="launch-section" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #bbf7d0; display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;">
            ${this._renderLaunchContent()}
          </div>
        `;

        const launchBtn = shadow.getElementById("launch-btn");
        if (launchBtn) {
          launchBtn.addEventListener("click", async () => {
            if (this._launching) return;
            await this._handleLaunch();
          });
        }
      } else {
        resultContainer.className = "preview-result invalid";
        resultContainer.style.display = "flex";
        resultContainer.innerHTML = `
          <h4 class="result-title invalid">✗ Validation Failed</h4>
          <p class="result-value">Please correct the highlighted errors in the form above and try again.</p>
        `;
      }
    } else {
      resultContainer.style.display = "none";
      resultContainer.innerHTML = "";
    }
  }

  _render() {
    const shadow = this.shadowRoot;
    if (!shadow) return;

    const context = this._pluginContext;
    if (!context) {
      shadow.innerHTML = `
        <style>${SHARED_STYLES}</style>
        <div class="loading-container">
          <span class="loading-text">Initializing context...</span>
        </div>
      `;
      return;
    }

    const companyId = context.companyId;
    const projectId = context.projectId || context.entityId;

    shadow.innerHTML = `
      <style>
        ${SHARED_STYLES}
        
        .execution-status-banner {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          color: #b45309;
          background: #fef3c7;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .status-text {
          margin: 0;
          font-size: 13px;
          color: #78350f;
          line-height: 1.5;
        }
        .preview-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: #ffffff;
          border: 1px solid #dbe3ec;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }
        .form-group select,
        .form-group input,
        .form-group textarea {
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 14px;
          background-color: #f8fafc;
          color: #0f172a;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .form-group select:focus,
        .form-group input:focus,
        .form-group textarea:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          background-color: #ffffff;
        }
        .field-error {
          font-size: 12px;
          color: #ef4444;
          min-height: 16px;
          margin-top: 2px;
        }
        .preview-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          background-color: #4f46e5;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .preview-btn:hover:not(:disabled) {
          background-color: #4338ca;
        }
        .preview-btn:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }
        .btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .preview-result {
          padding: 24px;
          border-radius: 12px;
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .preview-result.valid {
          border: 1px solid #bbf7d0;
          background-color: #f0fdf4;
        }
        .preview-result.invalid {
          border: 1px solid #fecaca;
          background-color: #fef2f2;
        }
        .result-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0;
        }
        .result-title.valid { color: #15803d; }
        .result-title.invalid { color: #b91c1c; }
        .result-grid {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 12px;
          font-size: 13px;
          line-height: 1.5;
        }
        @media (max-width: 600px) {
          .result-grid {
            grid-template-columns: 1fr;
            gap: 4px;
          }
          .result-label {
            font-weight: 600;
          }
        }
        .result-label {
          color: #475569;
          font-weight: 500;
        }
        .result-value {
          color: #0f172a;
        }
        .result-value-highlight {
          font-weight: 600;
        }
        .result-boundary {
          font-style: italic;
          background-color: rgba(0, 0, 0, 0.02);
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 3px solid #6366f1;
        }
      </style>

      <div class="header">
        <h2 class="header-title">Direct Task Preview</h2>
        <p class="header-subtitle">Validate and preview a future direct Task Room request.</p>
      </div>

      <div class="content-body">
        <div class="execution-status-banner">
          <span class="status-badge">Controlled Local Execution</span>
          <p class="status-text">A validated request creates one unassigned child Task Room under the selected Agent Room.</p>
        </div>

        <form id="preview-form" class="preview-form">
          <div class="form-group">
            <label for="role-select">Target Worker Role</label>
            <select id="role-select" name="role" required>
              <option value="" disabled selected>Select a verified worker role...</option>
              <option value="unreal-code">Unreal Code Worker (unreal-code)</option>
              <option value="unreal-qa">Unreal QA Worker (unreal-qa)</option>
            </select>
            <div class="field-error" id="error-role"></div>
          </div>

          <div class="form-group">
            <label for="agent-room-select">Agent Room</label>
            <select id="agent-room-select" name="agentRoom" required disabled>
              <option value="" disabled selected>Select a worker role first...</option>
            </select>
            <div class="field-error" id="error-agent-room"></div>
          </div>

          <div class="form-group">
            <label for="title-input">Task Title</label>
            <input type="text" id="title-input" name="title" placeholder="Enter task title (max 200 chars)" required max="200" />
            <div class="field-error" id="error-title"></div>
          </div>

          <div class="form-group">
            <label for="description-input">Task Description</label>
            <textarea id="description-input" name="description" placeholder="Enter detailed task description (max 4,000 chars)" required rows="6"></textarea>
            <div class="field-error" id="error-description"></div>
          </div>

          <button type="submit" class="preview-btn" id="preview-btn">
            <span class="btn-text">Preview Request</span>
            <span class="btn-spinner" style="display: none;"></span>
          </button>
        </form>

        <div id="preview-result" class="preview-result" style="display: none;"></div>
      </div>
    `;

    this._setupFormListeners();
    this._setupFormChangeListeners();
  }
}

if (!customElements.get("paperclip-project-direct-task-preview-tab")) {
  customElements.define("paperclip-project-direct-task-preview-tab", ProjectDirectTaskPreviewTabElement);
}

export const ProjectDirectTaskPreviewTab = "paperclip-project-direct-task-preview-tab";


// AgentMemoryTab removed per CMP-32.
