import { readFile } from "node:fs/promises";
import path from "node:path";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";
import { draftSpsExtension, searchSpsDiscoveryCatalog } from "./catalog-tools.js";

function catalogPath() {
  const configured = String(process.env.SPS_PLUGIN_DISCOVERY_CATALOG_PATH || "").trim();
  return configured ? path.resolve(configured) : null;
}

async function loadCatalog() {
  const filePath = catalogPath();
  if (!filePath) throw new Error("The SPS Official Registry catalog has not been prepared on this Owner Host.");
  let catalog;
  try {
    catalog = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error("The verified SPS Official Registry catalog is unavailable. Open Settings > Plugins later or check the Owner Host connection.");
  }
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.releases)) {
    throw new Error("The verified SPS Official Registry catalog is invalid.");
  }
  return catalog;
}

function contentForRecommendations(result) {
  if (result.recommendations.length === 0) {
    return "No verified SPS Official Registry extension matched that query. You can draft a new extension instead. No plugin lifecycle action was taken.";
  }
  return [
    "Verified SPS Official Registry recommendations:",
    ...result.recommendations.map((entry) => `- ${entry.catalog?.displayName ?? entry.pluginId} (${entry.pluginId} v${entry.version}): ${entry.catalog?.summary ?? "No summary."}`),
    "These are recommendations only. Nothing was installed, enabled, updated, or removed.",
  ].join("\n");
}

function safeTool(ctx, name, handler) {
  return async (params) => {
    try {
      return await handler(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn("SPS Plugin Discovery tool failed", { name, message });
      return { error: "plugin_discovery_unavailable", content: message };
    }
  };
}

const declarations = new Map(manifest.tools.map((tool) => [tool.name, tool]));

const plugin = definePlugin({
  async setup(ctx) {
    ctx.tools.register("search-sps-extensions", declarations.get("search-sps-extensions"), safeTool(ctx, "search-sps-extensions", async (params) => {
      const result = searchSpsDiscoveryCatalog(await loadCatalog(), params);
      return { content: contentForRecommendations(result), data: result };
    }));
    ctx.tools.register("draft-sps-extension", declarations.get("draft-sps-extension"), safeTool(ctx, "draft-sps-extension", async (params) => {
      const draft = draftSpsExtension(params);
      return {
        content: "Prepared an SPS extension draft. No files, packages, plugin lifecycle state, or Company structure were changed.",
        data: draft,
      };
    }));
  },

  async onHealth() {
    try {
      const catalog = await loadCatalog();
      return { status: "ok", message: "Verified SPS Official Registry catalog is ready.", details: { refreshedAt: catalog.refreshedAt, releaseCount: catalog.releases.length } };
    } catch (error) {
      return { status: "degraded", message: error instanceof Error ? error.message : String(error) };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
