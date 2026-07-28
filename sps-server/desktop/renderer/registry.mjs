const $ = (selector) => document.querySelector(selector);

let sources = [];
let selectedSourceId = null;
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

function sourceTrustLabel(source) {
  if (source.kind === "official") return "Official source";
  return "Owner-trusted local source";
}

function releaseLabel(release) {
  return release.catalog?.displayName || release.pluginId;
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
  list.innerHTML = report.releases.map((release) => {
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
      <button class="primary stage-release" type="button" data-plugin-id="${escapeHtml(release.pluginId)}" data-version="${escapeHtml(release.version)}">Stage for review</button>
    </article>
  `;
  }).join("");
}

function renderStages(stages) {
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
    const status = stage.status === "registered" ? "registered" : "staged";
    const action = status === "registered" ? "Apply this verified version" : "Enable reviewed version";
    return `
      <article class="stage-card">
        <div>
          <h2>${escapeHtml(stage.pluginId)} <span>v${escapeHtml(stage.version)}</span></h2>
          <p>${escapeHtml(stage.packageName)} / ${escapeHtml(stage.source?.registryId ?? "Unknown source")}</p>
          <p>Capabilities: ${escapeHtml(capabilities)}</p>
          <code>${escapeHtml(String(stage.artifactSha256).slice(0, 12))}...</code>
        </div>
        <span class="stage-status ${status}">${escapeHtml(status)}</span>
        <button class="primary enable-stage" type="button" data-stage-id="${escapeHtml(stage.stageId)}">${action}</button>
      </article>
    `;
  }).join("");
}

async function loadStages() {
  $("#stage-list").innerHTML = '<p class="empty-state">Loading staged packages...</p>';
  try {
    renderStages(await window.spsRegistry.listStages());
  } catch (error) {
    $("#stage-list").innerHTML = `<div class="error-state"><strong>Could not load the review queue.</strong><pre>${escapeHtml(error instanceof Error ? error.message : String(error))}</pre></div>`;
  }
}

async function loadSources() {
  sources = await window.spsRegistry.listSources();
  if (selectedSourceId && !sources.some((source) => source.id === selectedSourceId)) selectedSourceId = null;
  renderSources();
}

async function inspectSelectedSource() {
  if (!selectedSourceId) return;
  $("#release-list").innerHTML = '<p class="empty-state">Verifying Registry index and release signatures...</p>';
  try {
    renderReleases(await window.spsRegistry.inspectSource({ sourceId: selectedSourceId }));
  } catch (error) {
    $("#release-list").innerHTML = `<div class="error-state"><strong>Registry check failed.</strong><pre>${escapeHtml(error instanceof Error ? error.message : String(error))}</pre></div>`;
  }
}

$("#refresh-sources").addEventListener("click", () => loadSources().catch((error) => setNotice(error.message, true)));
$("#refresh-stages").addEventListener("click", () => loadStages());
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
      sources = await window.spsRegistry.removeSource({ sourceId: removeId });
      if (selectedSourceId === removeId) {
        selectedSourceId = null;
        $("#catalog-title").textContent = "Choose a source";
        $("#catalog-status").textContent = "A source is verified before its releases can be staged.";
        $("#release-list").innerHTML = '<p class="empty-state">Select a trusted source to browse its releases.</p>';
      }
      renderSources();
      setNotice("Registry source removed. Existing staged plugins were not changed.");
    } else if (sourceId) {
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
  if (!button || !selectedSourceId) return;
  try {
    button.disabled = true;
    button.textContent = "Staging...";
    const staged = await window.spsRegistry.stageRelease({
      sourceId: selectedSourceId,
      pluginId: button.dataset.pluginId,
      version: button.dataset.version,
    });
    await loadStages();
    setNotice(`${staged.stage.pluginId} v${staged.stage.version} is staged and disabled. Review it below before enabling.`);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Stage for review";
  }
});

$("#stage-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".enable-stage");
  if (!button) return;
  const stageId = button.dataset.stageId;
  if (!stageId) return;
  const confirmed = window.confirm("Apply this exact reviewed plugin version? SPS will import its runtime only after this confirmation. It may install, update, or roll back the current plugin version.");
  if (!confirmed) return;
  try {
    button.disabled = true;
    button.textContent = "Applying...";
    const enabled = await window.spsRegistry.enableStage({ stageId });
    await loadStages();
    setNotice(`${enabled.plugin?.pluginKey ?? "Plugin"} v${enabled.plugin?.version ?? ""} is ready.`);
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Apply this verified version";
  }
});

await Promise.all([loadSources(), loadStages()]);
if (requestedSourceId && sources.some((source) => source.id === requestedSourceId)) {
  selectedSourceId = requestedSourceId;
  renderSources();
  await inspectSelectedSource();
}
