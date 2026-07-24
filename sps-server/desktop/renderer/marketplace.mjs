const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setNotice(message = "", error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
}

function pluginName(release) {
  return release.catalog?.displayName || release.pluginId;
}

function renderCatalog(catalog) {
  const status = $("#catalog-status");
  const list = $("#catalog");
  const review = $("#open-review");
  review.hidden = true;
  if (!catalog.valid) {
    status.textContent = "The official catalog could not be verified.";
    list.innerHTML = `<div class="error-state"><strong>Catalog unavailable</strong><pre>${escapeHtml(catalog.errors.join("\n"))}</pre></div>`;
    return;
  }
  status.textContent = `${catalog.source.displayName} verified. ${catalog.releases.length} public plugin${catalog.releases.length === 1 ? "" : "s"} available.`;
  review.hidden = false;
  if (catalog.releases.length === 0) {
    list.innerHTML = '<p class="empty-state">No public plugins are published yet.</p>';
    return;
  }
  list.innerHTML = catalog.releases.map((release) => {
    const publisher = release.publisherProfile?.displayName || release.publisherId;
    const summary = release.catalog?.summary || "A verified SPS plugin release.";
    const documentation = release.catalog?.documentationUrl
      ? `<a href="${escapeHtml(release.catalog.documentationUrl)}" target="_blank" rel="noreferrer">Documentation</a>`
      : "";
    const publisherSite = release.publisherProfile?.websiteUrl
      ? `<a href="${escapeHtml(release.publisherProfile.websiteUrl)}" target="_blank" rel="noreferrer">Publisher site</a>`
      : "";
    const capabilities = Array.isArray(release.capabilities) && release.capabilities.length > 0
      ? `${release.capabilities.length} declared ${release.capabilities.length === 1 ? "capability" : "capabilities"}`
      : "Capability details available in review";
    return `
      <article class="plugin-card">
        <div class="plugin-card-top"><span class="verified">Verified release</span><span class="version">v${escapeHtml(release.version)}</span></div>
        <h3>${escapeHtml(pluginName(release))}</h3>
        <p class="plugin-id"><code>${escapeHtml(release.pluginId)}</code></p>
        <p class="summary">${escapeHtml(summary)}</p>
        <p class="publisher">By ${escapeHtml(publisher)} <span>${escapeHtml(release.publisherId)}</span></p>
        <p class="capabilities">${escapeHtml(capabilities)}</p>
        <div class="links">${documentation}${publisherSite}</div>
      </article>
    `;
  }).join("");
}

async function loadCatalog() {
  $("#catalog").innerHTML = '<p class="empty-state">Checking the signed SPS catalog...</p>';
  try {
    renderCatalog(await window.spsMarketplace.loadCatalog());
    setNotice("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    $("#catalog-status").textContent = "Catalog unavailable.";
    $("#catalog").innerHTML = `<div class="error-state"><strong>Catalog unavailable</strong><pre>${escapeHtml(message)}</pre></div>`;
    setNotice(message, true);
  }
}

$("#refresh").addEventListener("click", () => void loadCatalog());
$("#open-review").addEventListener("click", async () => {
  try {
    const result = await window.spsMarketplace.openInstallReview();
    if (result?.opened) setNotice("Plugin sources & review opened. Nothing has been installed yet.");
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
});

await loadCatalog();
