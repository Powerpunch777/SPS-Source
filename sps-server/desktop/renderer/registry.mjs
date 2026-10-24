const $ = (selector) => document.querySelector(selector);

let sources = [];
let selectedSourceId = null;
let developerProjects = [];
let developerContext = null;
let developerContextError = null;
let selectedDeveloperFolder = null;
let previewDiagnostics = [];
let previewDiagnosticsWarning = null;
let previewState = { active: false };
let sourceInspectionRevision = 0;
let sourceListRevision = 0;
let currentSourceInspection = null;
let requestedSourcePending = true;
let registryStages = [];
const developerInspections = new Map();
const requestedSourceId = new URLSearchParams(window.location.search).get("source");

function setNotice(message = "", error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLoadError(selector, message) {
  $(selector).innerHTML = `<div class="error-state"><strong>${escapeHtml(message)}</strong><p>Use Refresh to retry.</p></div>`;
}

function resetCatalog() {
  sourceInspectionRevision += 1;
  currentSourceInspection = null;
  $("#catalog-title").textContent = "Choose a source";
  $("#catalog-status").textContent = "A source is verified before its releases can be staged.";
  $("#release-list").innerHTML = '<p class="empty-state">Select a trusted source to browse its releases.</p>';
}

function sourceTrustLabel(source) {
  if (source.kind === "official") return "Official source";
  return "Owner-trusted local source";
}

function releaseLabel(release) {
  return release.catalog?.displayName || release.pluginId;
}

function shortHash(value) {
  return typeof value === "string" ? `${value.slice(0, 10)}...` : "Not available";
}

function developerGateMarkup(candidate) {
  if (!candidate) return '<span class="developer-status idle">Not checked</span>';
  return ["build", "validate", "test"].map((command) => {
    const gate = candidate.gates?.[command];
    const label = command[0].toUpperCase() + command.slice(1);
    return `<span class="developer-status ${gate?.success ? "passed" : "failed"}">${escapeHtml(label)} ${gate?.success ? "passed" : "failed"}</span>`;
  }).join("");
}

function developerConformanceMarkup(candidate) {
  const report = candidate?.conformance;
  if (!report) return "Not available";
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const passed = checks.filter((check) => check.status === "passed").length;
  return `<span class="developer-status ${report.status === "passed" ? "passed" : "failed"}">${escapeHtml(report.status)}</span> ${passed}/${checks.length} checks`;
}

function renderDeveloperProjects() {
  const list = $("#developer-project-list");
  if (developerProjects.length === 0) {
    list.innerHTML = '<p class="empty-state">No external plugin projects are connected.</p>';
    return;
  }
  list.innerHTML = developerProjects.map((project) => {
    const inspection = developerInspections.get(project.id);
    const changed = inspection?.changedSinceCandidate;
    const lastKnownGood = project.lastKnownGood;
    return `
      <article class="developer-card" data-project-id="${escapeHtml(project.id)}">
        <div class="developer-card-heading">
          <div>
            <span class="release-badge development">Development</span>
            <h2>${escapeHtml(project.displayName)}</h2>
            <p>${escapeHtml(project.sourceLabel)}</p>
          </div>
          <button class="remove-developer-project" type="button" data-project-id="${escapeHtml(project.id)}" title="Disconnect project">Disconnect</button>
        </div>
        <div class="developer-gates">${developerGateMarkup(project.candidate)}</div>
        <dl class="developer-metadata">
          <div><dt>Source</dt><dd><code>${escapeHtml(shortHash(inspection?.current?.sourceFingerprint ?? project.candidate?.sourceFingerprint))}</code>${changed === true ? '<span class="changed">Changed</span>' : changed === false ? '<span class="clean">Current</span>' : ""}</dd></div>
          <div><dt>Output</dt><dd><code>${escapeHtml(shortHash(inspection?.current?.outputFingerprint ?? project.candidate?.outputFingerprint))}</code></dd></div>
          <div><dt>Conformance</dt><dd>${developerConformanceMarkup(project.candidate)}</dd></div>
          <div><dt>Last known good</dt><dd>${lastKnownGood ? `<code>${escapeHtml(lastKnownGood.deployment.pluginId)} v${escapeHtml(lastKnownGood.deployment.version)}</code>` : "None"}</dd></div>
        </dl>
        <div class="developer-actions">
          ${developerContext ? `<button class="secondary link-developer-context" type="button" data-project-id="${escapeHtml(project.id)}" ${developerContext.project?.id === project.id ? "disabled" : ""}>${developerContext.project?.id === project.id ? "Linked to this context" : "Link to this context"}</button>` : ""}
          <button class="secondary inspect-developer-project" type="button" data-project-id="${escapeHtml(project.id)}">Check changes</button>
          <button class="secondary run-developer-gates" type="button" data-project-id="${escapeHtml(project.id)}">Build &amp; test</button>
          <button class="primary apply-developer-candidate" type="button" data-project-id="${escapeHtml(project.id)}" ${project.candidate?.promotable && changed !== true ? "" : "disabled"}>Open isolated preview</button>
          ${lastKnownGood ? `<button class="secondary rollback-developer-project" type="button" data-project-id="${escapeHtml(project.id)}">Open last good preview</button>` : ""}
          ${lastKnownGood ? `<button class="secondary reload-developer-ui" type="button" data-project-id="${escapeHtml(project.id)}">Reload UI</button>` : ""}
          ${lastKnownGood ? `<button class="secondary restart-developer-worker" type="button" data-project-id="${escapeHtml(project.id)}">Restart worker</button>` : ""}
          ${lastKnownGood ? `<button class="secondary reveal-developer-package" type="button" data-project-id="${escapeHtml(project.id)}">Show verified package</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderDeveloperContext() {
  const visible = Boolean(developerContext || developerContextError);
  $("#developer-context").hidden = !visible;
  document.body.classList.toggle("developer-context-mode", Boolean(developerContext));
  $("#developer-context-title").textContent = developerContextError
    ? "Project context unavailable" : developerContext
      ? `${developerContext.workspaceName} / ${developerContext.pluginName} / ${developerContext.context.contextId.slice(0, 8)}` : "";
  $("#developer-context-project").textContent = developerContextError || (developerContext?.project
    ? `Linked: ${developerContext.project.displayName}`
    : developerContext?.missingProject ? "The linked project was disconnected. Choose another project or unlink this reference."
      : "No project linked.");
  $("#clear-developer-context").hidden = !developerContext || (!developerContext.project && !developerContext.missingProject);
}

async function loadDeveloperContext() {
  try {
    developerContext = await window.spsRegistry.getDeveloperContext();
    developerContextError = null;
  } catch {
    developerContext = null;
    developerContextError = "Refresh developer projects before linking a project.";
  }
  renderDeveloperContext();
}

function renderPreviewDiagnostics() {
  const list = $("#preview-diagnostics-list");
  if (previewDiagnosticsWarning) {
    list.innerHTML = `<div class="error-state"><strong>Preview diagnostics unavailable.</strong><p>${escapeHtml(previewDiagnosticsWarning)}</p></div>`;
    return;
  }
  if (previewDiagnostics.length === 0) {
    list.innerHTML = '<p class="empty-state">No Development diagnostics have been recorded.</p>';
    return;
  }
  list.innerHTML = previewDiagnostics.map((event) => `
    <article class="preview-diagnostic ${escapeHtml(event.level)}">
      <span class="preview-diagnostic-level">${escapeHtml(event.level)}</span>
      <code>${escapeHtml(event.origin)} / ${escapeHtml(event.category)} / ${escapeHtml(event.code)}</code>
      <p>${escapeHtml(event.message)}</p>
      <time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(new Date(event.occurredAt).toLocaleTimeString())}</time>
    </article>
  `).join("");
}

function renderPreviewEnvironment() {
  const fixture = previewState.fixture;
  const active = previewState.active === true && fixture;
  $("#preview-environment-status").textContent = active
    ? `${previewState.buildId} is isolated from the production Workspace.`
    : "Open an isolated Preview to test plugin UI states.";
  $("#preview-role").value = fixture?.role ?? "host";
  $("#preview-viewport").value = fixture?.viewport ?? "desktop";
  $("#preview-ui-state").value = fixture?.uiState ?? "live";
  $("#preview-node").checked = fixture?.fixtures?.node?.enabled ?? true;
  $("#preview-runtime").checked = fixture?.fixtures?.runtime?.enabled ?? true;
  $("#preview-source").checked = fixture?.fixtures?.source?.enabled ?? true;
  for (const control of document.querySelectorAll("#preview-environment-form select, #preview-environment-form input, #apply-preview-environment")) {
    control.disabled = !active;
  }
}

function renderSources() {
  const list = $("#source-list");
  if (sources.length === 0) {
    list.innerHTML = '<p class="empty-state">No trusted Registry sources yet.</p>';
    return;
  }
  list.innerHTML = sources.map((source) => `
    <article class="source-card ${source.id === selectedSourceId ? "selected" : ""}">
      <button class="source-select" type="button" data-source-id="${escapeHtml(source.id)}">
        <strong>${escapeHtml(source.displayName)}</strong>
        <span>${escapeHtml(sourceTrustLabel(source))}${source.isBundled ? " / Bundled" : ""}${source.localFolderName ? ` / ${escapeHtml(source.localFolderName)}` : ""}</span>
      </button>
      ${source.isBundled ? "" : `<button class="remove-source" type="button" data-remove-source-id="${escapeHtml(source.id)}" title="Remove source">Remove</button>`}
    </article>
  `).join("");
}

function renderReleases(report) {
  $("#catalog-title").textContent = report.source.displayName;
  $("#catalog-status").textContent = report.warning || (report.valid ? `Verified through ${report.trust}.` : "Verification failed.");
  const list = $("#release-list");
  if (!report.valid) {
    list.innerHTML = `<div class="error-state"><strong>Source was not accepted.</strong><pre>${escapeHtml(report.errors.join("\n"))}</pre></div>`;
    return;
  }
  if (report.releases.length === 0) {
    list.innerHTML = '<p class="empty-state">This Registry has no verified releases.</p>';
    return;
  }
  const orderedReleases = [...report.releases].sort((left, right) =>
    String(right.version).localeCompare(String(left.version), undefined, { numeric: true, sensitivity: "base" }),
  );
  list.innerHTML = orderedReleases.map((release) => {
    const documentation = release.catalog?.documentationUrl
      ? `<a class="documentation-link" href="${escapeHtml(release.catalog.documentationUrl)}" target="_blank" rel="noreferrer">Open documentation</a>`
      : "";
    const summary = release.catalog?.summary
      ? `<p class="release-summary">${escapeHtml(release.catalog.summary)}</p>`
      : "";
    const capabilities = Array.isArray(release.capabilities)
      ? release.capabilities.length === 0 ? "No declared capabilities" : release.capabilities.join(", ")
      : "Full capability detail appears in the static review step.";
    const publisherName = release.publisherProfile?.displayName || release.publisherId;
    const publisherWebsite = release.publisherProfile?.websiteUrl
      ? `<a class="publisher-link" href="${escapeHtml(release.publisherProfile.websiteUrl)}" target="_blank" rel="noreferrer">Publisher site</a>`
      : "";
    return `
    <article class="release-card">
      <div class="release-copy">
        <h2>${escapeHtml(releaseLabel(release))}</h2>
        <p class="release-identity"><code>${escapeHtml(release.pluginId)}</code> / v${escapeHtml(release.version)}</p>
        ${summary}
        <p class="release-publisher">Published by ${escapeHtml(publisherName)} <code>${escapeHtml(release.publisherId)}</code> / ${escapeHtml(release.visibility)}</p>
        <p class="release-capabilities">Capabilities: ${escapeHtml(capabilities)}</p>
        <span class="release-links">${documentation}${publisherWebsite}</span>
      </div>
      <div class="release-meta"><span>${Math.ceil(release.artifact.sizeBytes / 1024)} KB</span><code>${escapeHtml(release.artifact.sha256.slice(0, 12))}...</code><span class="release-badge">${escapeHtml(report.source.kind === "official" ? "Official" : "Verified release")}</span></div>
      <button class="primary stage-release" type="button" data-source-id="${escapeHtml(report.source.id)}" data-inspection-revision="${currentSourceInspection.revision}" data-plugin-id="${escapeHtml(release.pluginId)}" data-version="${escapeHtml(release.version)}">Stage for review</button>
    </article>
  `;
  }).join("");
}

function renderStages(stages) {
  registryStages = Array.isArray(stages) ? stages : [];
  const list = $("#stage-list");
  if (!Array.isArray(stages) || stages.length === 0) {
    list.innerHTML = '<p class="empty-state">No staged packages. Stage a verified release before any plugin code can run.</p>';
    return;
  }

  const ordered = [...stages].sort((left, right) => String(right.stagedAt).localeCompare(String(left.stagedAt)));
  list.innerHTML = ordered.map((stage) => {
    const capabilities = Array.isArray(stage.capabilities) && stage.capabilities.length > 0
      ? stage.capabilities.join(", ")
      : "No declared capabilities";
    const status = ["staged", "registered", "review_pending"].includes(stage.status) ? stage.status : "unavailable";
    const action = status === "registered" ? "Apply this verified version" : "Enable reviewed version";
    const pending = status === "review_pending";
    return `
      <article class="stage-card">
        <div>
          <h2>${escapeHtml(stage.pluginId)} <span>v${escapeHtml(stage.version)}</span></h2>
          <p>${escapeHtml(stage.packageName)} / ${escapeHtml(stage.source?.registryId ?? "Unknown source")}</p>
          <p>Capabilities: ${escapeHtml(capabilities)}</p>
          <code>${escapeHtml(String(stage.artifactSha256).slice(0, 12))}...</code>
        </div>
        <span class="stage-status ${status}">${pending ? "Awaiting Host review" : escapeHtml(status)}</span>
        ${pending ? '<p>Open SPS Workspace > Settings > Plugins to approve or reject this update.</p>'
          : status === "unavailable" ? '<p>Refresh the review queue before applying this package.</p>'
            : `<button class="primary enable-stage" type="button" data-stage-id="${escapeHtml(stage.stageId)}">${action}</button>`}
      </article>
    `;
  }).join("");
}

async function loadStages() {
  registryStages = [];
  $("#stage-list").innerHTML = '<p class="empty-state">Loading staged packages...</p>';
  try {
    renderStages(await window.spsRegistry.listStages());
    return true;
  } catch {
    renderLoadError("#stage-list", "Could not load the review queue.");
    return false;
  }
}

async function loadSources() {
  const revision = ++sourceListRevision;
  resetCatalog();
  $("#source-list").innerHTML = '<p class="empty-state">Loading Registry sources...</p>';
  try {
    const loaded = await window.spsRegistry.listSources();
    if (revision !== sourceListRevision) return;
    sources = loaded;
    if (selectedSourceId && !sources.some((source) => source.id === selectedSourceId)) selectedSourceId = null;
    if (requestedSourcePending) {
      requestedSourcePending = false;
      if (!selectedSourceId && sources.some((source) => source.id === requestedSourceId)) selectedSourceId = requestedSourceId;
    }
    renderSources();
    if (selectedSourceId) await inspectSelectedSource();
  } catch {
    if (revision !== sourceListRevision) return;
    sources = [];
    selectedSourceId = null;
    resetCatalog();
    renderLoadError("#source-list", "Could not load Registry sources.");
  }
}

async function loadDeveloperProjects() {
  const contextRequest = loadDeveloperContext();
  $("#developer-project-list").innerHTML = '<p class="empty-state">Loading connected developer projects...</p>';
  try {
    const [loaded] = await Promise.all([window.spsRegistry.listDeveloperProjects(), contextRequest]);
    developerProjects = loaded;
    for (const projectId of [...developerInspections.keys()]) {
      if (!developerProjects.some((project) => project.id === projectId)) developerInspections.delete(projectId);
    }
    renderDeveloperProjects();
  } catch {
    renderLoadError("#developer-project-list", "Could not load developer projects.");
  } finally {
    await contextRequest;
  }
}

async function loadPreviewDiagnostics() {
  $("#preview-diagnostics-list").innerHTML = '<p class="empty-state">Loading development diagnostics...</p>';
  try {
    const result = await window.spsRegistry.listPreviewDiagnostics({
      limit: 80,
      origin: $("#preview-diagnostics-origin").value || undefined,
      category: $("#preview-diagnostics-category").value || undefined,
      level: $("#preview-diagnostics-level").value || undefined,
    });
    previewDiagnostics = Array.isArray(result?.events) ? result.events : [];
    previewDiagnosticsWarning = result?.warning ?? null;
    renderPreviewDiagnostics();
  } catch {
    previewDiagnostics = [];
    previewDiagnosticsWarning = "Could not load development diagnostics. Use Refresh to retry.";
    renderPreviewDiagnostics();
  }
}

async function loadPreviewState() {
  previewState = { active: false };
  renderPreviewEnvironment();
  $("#preview-environment-status").textContent = "Loading Preview environment...";
  try {
    previewState = await window.spsRegistry.getPreviewState();
    renderPreviewEnvironment();
  } catch {
    $("#preview-environment-status").textContent = "Could not load the Preview environment. Use Refresh to retry.";
  }
}

async function inspectSelectedSource() {
  const sourceId = selectedSourceId;
  const revision = ++sourceInspectionRevision;
  currentSourceInspection = null;
  if (!sourceId) return;
  const isCurrent = () => revision === sourceInspectionRevision && sourceId === selectedSourceId
    && sources.some((source) => source.id === sourceId);
  $("#catalog-title").textContent = sources.find((source) => source.id === sourceId)?.displayName ?? "Registry source";
  $("#catalog-status").textContent = "Verifying selected source...";
  $("#release-list").innerHTML = '<p class="empty-state">Verifying Registry index and release signatures...</p>';
  try {
    const report = await window.spsRegistry.inspectSource({ sourceId });
    if (!isCurrent()) return;
    if (report.source?.id !== sourceId) throw new Error("Registry source mismatch.");
    if (report.valid) currentSourceInspection = { sourceId, revision, releases: report.releases };
    renderReleases(report);
  } catch {
    if (!isCurrent()) return;
    currentSourceInspection = null;
    $("#catalog-status").textContent = "Verification unavailable.";
    renderLoadError("#release-list", "Could not verify this Registry. Refresh sources to retry.");
  }
}

$("#refresh-sources").addEventListener("click", () => loadSources());
$("#refresh-stages").addEventListener("click", () => loadStages());
$("#refresh-developer-projects").addEventListener("click", () => loadDeveloperProjects());
$("#clear-developer-context").addEventListener("click", async (event) => {
  if (!developerContext) return;
  event.currentTarget.disabled = true;
  try {
    developerContext = await window.spsRegistry.clearDeveloperContext({ contextToken: developerContext.contextToken });
    renderDeveloperContext(); renderDeveloperProjects();
    setNotice("Project reference unlinked. External files and Source permissions were not changed.");
  } catch (error) { setNotice(error.message, true); }
  finally { $("#clear-developer-context").disabled = false; }
});
$("#refresh-preview-diagnostics").addEventListener("click", () => loadPreviewDiagnostics());
for (const control of document.querySelectorAll("#preview-diagnostics-origin, #preview-diagnostics-category, #preview-diagnostics-level")) {
  control.addEventListener("change", () => loadPreviewDiagnostics());
}
$("#refresh-preview-environment").addEventListener("click", () => loadPreviewState());
$("#preview-environment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!previewState.active || !previewState.fixture) return;
  const currentFixtures = previewState.fixture.fixtures;
  const toggle = (name, enabled) => ({
    enabled,
    ...(currentFixtures?.[name]?.payload ? { payload: currentFixtures[name].payload } : {}),
  });
  try {
    previewState = await window.spsRegistry.updatePreviewEnvironment({
      projectId: previewState.projectId,
      fixture: {
        role: $("#preview-role").value,
        viewport: $("#preview-viewport").value,
        uiState: $("#preview-ui-state").value,
        fixtures: {
          node: toggle("node", $("#preview-node").checked),
          runtime: toggle("runtime", $("#preview-runtime").checked),
          source: toggle("source", $("#preview-source").checked),
        },
      },
    });
    renderPreviewEnvironment();
    await loadPreviewDiagnostics();
    setNotice("Preview environment saved. The isolated Preview reloaded with the new fixture.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});
$("#clear-preview-diagnostics").addEventListener("click", async () => {
  if (!window.confirm("Clear all saved plugin Preview diagnostics?")) return;
  try {
    await window.spsRegistry.clearPreviewDiagnostics();
    await loadPreviewDiagnostics();
    setNotice("Plugin Preview diagnostics cleared.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});
$("#choose-developer-folder").addEventListener("click", async () => {
  try {
    const selected = await window.spsRegistry.chooseDeveloperProjectFolder();
    if (!selected) return;
    selectedDeveloperFolder = selected;
    $("#developer-source-path").value = selected.sourceLabel;
    if (!$("#developer-display-name").value) $("#developer-display-name").value = selected.sourceLabel;
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});
$("#developer-project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!selectedDeveloperFolder) {
    setNotice("Choose an external plugin project folder first.", true);
    return;
  }
  try {
    await window.spsRegistry.connectDeveloperProject({
      sourcePath: selectedDeveloperFolder.sourcePath,
      sourceLabel: selectedDeveloperFolder.sourceLabel,
      displayName: $("#developer-display-name").value.trim() || selectedDeveloperFolder.sourceLabel,
    });
    selectedDeveloperFolder = null;
    form.reset();
    await loadDeveloperProjects();
    setNotice("Development project connected. SPS has not built or executed it.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});
$("#choose-local-folder").addEventListener("click", async () => {
  try {
    const selected = await window.spsRegistry.chooseLocalSource();
    if (!selected) return;
    $("#local-path").value = selected.localPath;
    if (!$("#source-name").value) $("#source-name").value = selected.localFolderName;
    if (!$("#source-id").value) {
      const slug = selected.localFolderName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "") || "registry";
      $("#source-id").value = `local.${slug}`.slice(0, 128);
    }
  } catch (error) {
    setNotice(error.message, true);
  }
});

$("#source-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const input = {
      id: $("#source-id").value.trim(),
      kind: "local",
      displayName: $("#source-name").value.trim(),
      localPath: $("#local-path").value,
    };
    sourceListRevision += 1;
    sources = await window.spsRegistry.addSource(input);
    selectedSourceId = input.id;
    renderSources();
    await inspectSelectedSource();
    $("#source-form").reset();
    setNotice("Trusted Registry source added. No plugin was downloaded or run.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});

$("#source-list").addEventListener("click", async (event) => {
  const removeId = event.target.closest("[data-remove-source-id]")?.dataset.removeSourceId;
  const sourceId = event.target.closest("[data-source-id]")?.dataset.sourceId;
  try {
    if (removeId) {
      sourceListRevision += 1;
      if (selectedSourceId === removeId) {
        selectedSourceId = null;
        resetCatalog();
      }
      sources = await window.spsRegistry.removeSource({ sourceId: removeId });
      if (selectedSourceId && !sources.some((source) => source.id === selectedSourceId)) {
        selectedSourceId = null;
        resetCatalog();
      }
      renderSources();
      setNotice("Registry source removed. Existing staged plugins were not changed.");
    } else if (sourceId && sources.some((source) => source.id === sourceId)) {
      selectedSourceId = sourceId;
      renderSources();
      await inspectSelectedSource();
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});

$("#release-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".stage-release");
  if (!button || button.disabled) return;
  const inspection = currentSourceInspection;
  if (!inspection || inspection.sourceId !== selectedSourceId
    || !sources.some((source) => source.id === inspection.sourceId)
    || button.dataset.sourceId !== inspection.sourceId
    || button.dataset.inspectionRevision !== String(inspection.revision)
    || !inspection.releases.some((release) => release.pluginId === button.dataset.pluginId && release.version === button.dataset.version)) {
    setNotice("This release view is no longer current. Select the source again before staging.", true);
    return;
  }
  try {
    button.disabled = true;
    button.textContent = "Staging...";
    const staged = await window.spsRegistry.stageRelease({
      sourceId: inspection.sourceId,
      pluginId: button.dataset.pluginId,
      version: button.dataset.version,
    });
    await loadStages();
    setNotice(`${staged.stage.pluginId} v${staged.stage.version} is staged and disabled. Review it below before enabling.`);
  } catch {
    setNotice("Could not stage this release. Refresh sources and try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Stage for review";
  }
});

$("#stage-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".enable-stage");
  if (!button || button.disabled) return;
  const stageId = button.dataset.stageId;
  const stage = registryStages.find((entry) => entry.stageId === stageId);
  if (!stage || !["staged", "registered"].includes(stage.status)) return;
  const confirmed = window.confirm("Apply this exact reviewed plugin version? SPS will import its runtime only after this confirmation. It may install, update, or roll back the current plugin version.");
  if (!confirmed) return;
  try {
    button.disabled = true;
    button.textContent = "Applying...";
    const enabled = await window.spsRegistry.enableStage({ stageId });
    const pending = enabled.stage?.status === "review_pending" || enabled.plugin?.status === "upgrade_pending";
    const loaded = await loadStages();
    if (pending) {
      if (loaded) renderStages(registryStages.map((entry) => entry.stageId === stageId ? { ...entry, status: "review_pending" } : entry));
      setNotice("This update is awaiting Host review. Open SPS Workspace > Settings > Plugins to approve or reject it.");
    } else if (enabled.plugin?.status === "ready") {
      setNotice(`${enabled.plugin.pluginKey ?? "Plugin"} v${enabled.plugin.version ?? ""} is ready.`);
    } else {
      setNotice("Package applied. Check its status in SPS Workspace > Settings > Plugins.");
    }
  } catch {
    await loadStages();
    setNotice("Could not apply this package. Check the review queue and try again.", true);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = stage.status === "registered" ? "Apply this verified version" : "Enable reviewed version";
    }
  }
});

$("#developer-project-list").addEventListener("click", async (event) => {
  const projectId = event.target.closest("[data-project-id]")?.dataset.projectId;
  if (!projectId) return;
  const button = event.target.closest("button");
  if (!button) return;
  button.disabled = true;
  try {
    if (button.classList.contains("link-developer-context")) {
      if (!developerContext) throw new Error("Open this project from a Workspace context first.");
      developerContext = await window.spsRegistry.linkDeveloperContext({ projectId, contextToken: developerContext.contextToken });
      renderDeveloperContext(); renderDeveloperProjects();
      setNotice("Project reference linked. Build, Preview and Source permissions remain separate actions.");
      return;
    }
    if (button.classList.contains("inspect-developer-project")) {
      const inspection = await window.spsRegistry.inspectDeveloperProject({ projectId });
      developerInspections.set(projectId, inspection);
      const index = developerProjects.findIndex((project) => project.id === projectId);
      if (index !== -1) developerProjects[index] = inspection.project;
      renderDeveloperProjects();
      setNotice(inspection.changedSinceCandidate ? "This project changed after its last gate run." : "Source and output still match the verified candidate.");
      return;
    }
    if (button.classList.contains("run-developer-gates")) {
      const gateResult = await window.spsRegistry.runDeveloperGates({ projectId });
      const index = developerProjects.findIndex((project) => project.id === projectId);
      if (index !== -1) developerProjects[index] = gateResult.project;
      developerInspections.delete(projectId);
      renderDeveloperProjects();
      const failed = gateResult.reports.filter((report) => !report.success);
      setNotice(failed.length === 0
        ? "Build, validation, and lifecycle tests passed for one stable source tuple."
        : `${failed.map((report) => report.command).join(", ")} did not pass. The active plugin was not changed.`,
      failed.length > 0);
      return;
    }
    if (button.classList.contains("apply-developer-candidate")) {
      if (!window.confirm("Open this exact verified build in an isolated Preview? Production Workspace data and plugins will not be changed.")) return;
      const applied = await window.spsRegistry.applyDeveloperCandidate({ projectId });
      const index = developerProjects.findIndex((project) => project.id === projectId);
      if (index !== -1) developerProjects[index] = applied.project;
      developerInspections.delete(projectId);
      await loadStages();
      renderDeveloperProjects();
      await loadPreviewState();
      await loadPreviewDiagnostics();
      setNotice(`${applied.plugin.pluginKey} v${applied.plugin.version} is running in an isolated Preview and is now the last known good development build.`);
      return;
    }
    if (button.classList.contains("rollback-developer-project")) {
      if (!window.confirm("Open the last known good build in its isolated Preview?")) return;
      const restored = await window.spsRegistry.rollbackDeveloperProject({ projectId });
      const index = developerProjects.findIndex((project) => project.id === projectId);
      if (index !== -1) developerProjects[index] = restored.project;
      developerInspections.delete(projectId);
      renderDeveloperProjects();
      await loadPreviewState();
      await loadPreviewDiagnostics();
      setNotice(`${restored.plugin.pluginKey} v${restored.plugin.version} opened in its isolated Preview.`);
      return;
    }
    if (button.classList.contains("reload-developer-ui")) {
      await window.spsRegistry.reloadDeveloperUi({ projectId });
      setNotice("The SPS Workspace UI reloaded without restarting the plugin worker.");
      return;
    }
    if (button.classList.contains("restart-developer-worker")) {
      await window.spsRegistry.restartDeveloperWorker({ projectId });
      await loadPreviewDiagnostics();
      setNotice("The plugin worker restarted without replacing its verified UI build.");
      return;
    }
    if (button.classList.contains("reveal-developer-package")) {
      const artifact = await window.spsRegistry.revealDeveloperPackage({ projectId });
      setNotice(`Opened the last Preview-verified package: ${artifact.fileName} (${artifact.sizeBytes.toLocaleString()} bytes). SHA-256: ${artifact.sha256}. New source edits are not included until verified in Preview.`);
      return;
    }
    if (button.classList.contains("remove-developer-project")) {
      if (!window.confirm("Disconnect this development project? SPS will not delete or modify its external source folder.")) return;
      await window.spsRegistry.removeDeveloperProject({ projectId });
      developerInspections.delete(projectId);
      await loadDeveloperProjects();
      setNotice("Development project disconnected. Its external files were not changed.");
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

await Promise.allSettled([loadDeveloperProjects(), loadPreviewState(), loadPreviewDiagnostics(), loadSources(), loadStages()]);
