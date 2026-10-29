// Core health is available while configured bundles are installed sequentially.
// This test helper waits for bundle rows; it does not change Host admission.
export async function waitForBundledPluginRows({ request, pluginIds, timeoutMs = 60_000,
  now = Date.now, delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  const expected = new Set(pluginIds);
  const deadline = now() + timeoutMs;
  let summary = "not observed";
  while (now() < deadline) {
    const response = await request("/api/plugins", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Could not inspect bundled plugins (${response.status}).`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Bundled plugin list must be an array.");
    const observed = rows.filter(row => expected.has(row?.manifestJson?.id));
    const byId = new Map();
    for (const row of observed) {
      const id = row.manifestJson.id;
      if (byId.has(id)) throw new Error(`Bundled plugin list repeated ${id}.`);
      byId.set(id, row.status);
      if (row.status === "error") throw new Error(`Bundled plugin ${id} failed to load.`);
    }
    summary = [...expected].map(id => `${id}:${byId.get(id) ?? "missing"}`).join(",");
    if ([...expected].every(id => byId.get(id) === "ready")) return;
    await delay(Math.min(250, Math.max(0, deadline - now())));
  }
  throw new Error(`Bundled plugins did not become ready: ${summary}.`);
}
