const $ = (selector) => document.querySelector(selector);

let sources = [];
let selectedSourceId = null;

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
        <span>${escapeHtml(source.kind)}${source.localFolderName ? ` · ${escapeHtml(source.localFolderName)}` : ""}</span>
      </button>
      <button class="remove-source" type="button" data-remove-source-id="${escapeHtml(source.id)}" title="Remove source">Remove</button>
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
  list.innerHTML = report.releases.map((release) => `
    <article class="release-card">
      <div><h2>${escapeHtml(release.pluginId)}</h2><p>v${escapeHtml(release.version)} · ${escapeHtml(release.visibility)} · ${escapeHtml(release.publisherId)}</p></div>
      <div class="release-meta"><span>${Math.ceil(release.artifact.sizeBytes / 1024)} KB</span><code>${escapeHtml(release.artifact.sha256.slice(0, 12))}...</code></div>
      <button class="primary stage-release" type="button" data-plugin-id="${escapeHtml(release.pluginId)}" data-version="${escapeHtml(release.version)}">Stage for review</button>
    </article>
  `).join("");
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

function toggleSourceFields() {
  const local = $("#source-kind").value === "local";
  $("#local-source-fields").hidden = !local;
  $("#remote-source-fields").hidden = local;
  $("#source-index-url").required = !local;
  $("#source-root-key-id").required = !local;
  $("#source-root-key").required = !local;
}

$("#refresh-sources").addEventListener("click", () => loadSources().catch((error) => setNotice(error.message, true)));
$("#source-kind").addEventListener("change", toggleSourceFields);
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
  } catch (error) { setNotice(error.message, true); }
});

$("#source-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const kind = $("#source-kind").value;
    const input = {
      id: $("#source-id").value.trim(),
      kind,
      displayName: $("#source-name").value.trim(),
      ...(kind === "local"
        ? { localPath: $("#local-path").value }
        : {
          indexUrl: $("#source-index-url").value.trim(),
          trustedRootKeyId: $("#source-root-key-id").value.trim(),
          trustedRootPublicKey: $("#source-root-key").value.trim(),
        }),
    };
    sources = await window.spsRegistry.addSource(input);
    selectedSourceId = input.id;
    renderSources();
    await inspectSelectedSource();
    $("#source-form").reset();
    toggleSourceFields();
    setNotice("Trusted Registry source added. No plugin was downloaded or run.");
  } catch (error) { setNotice(error instanceof Error ? error.message : String(error), true); }
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
  } catch (error) { setNotice(error instanceof Error ? error.message : String(error), true); }
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
    const shouldEnable = window.confirm(`${staged.stage.pluginId} ${staged.stage.version} was staged without execution.\n\nEnable it now? This is the first point where SPS may load the plugin runtime.`);
    if (shouldEnable) {
      const enabled = await window.spsRegistry.enableStage({ stageId: staged.stage.stageId });
      setNotice(`${enabled.plugin?.pluginKey ?? staged.stage.pluginId} is enabled.`);
    } else {
      setNotice(`${staged.stage.pluginId} is staged and disabled.`);
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Stage for review";
  }
});

toggleSourceFields();
await loadSources();
