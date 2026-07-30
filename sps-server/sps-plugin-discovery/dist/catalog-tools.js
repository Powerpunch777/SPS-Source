const MAX_RESULTS = 12;

const FEATURE_DECLARATIONS = Object.freeze({
  tools: {
    capabilities: ["agent.tools.register"],
    primitives: [],
  },
  surface: {
    capabilities: ["ui.page.register", "ui.sidebar.register"],
    primitives: [],
  },
  automation: {
    capabilities: ["events.subscribe", "jobs.schedule"],
    primitives: [],
  },
  integration: {
    capabilities: ["api.routes.register", "http.outbound"],
    primitives: [],
  },
  workspace_source: {
    capabilities: ["sps.workspaceSources.read"],
    primitives: ["workspace.sources.metadata", "workspace.sources.route"],
  },
  runtime_execution: {
    capabilities: ["sps.runtimes.read", "sps.runs.dispatch", "sps.runs.read"],
    primitives: ["runtimes.list", "runtimes.dispatch", "runs.observe"],
  },
  artifacts: {
    capabilities: ["sps.artifacts.write"],
    primitives: ["artifacts.write"],
  },
  secrets: {
    capabilities: ["secrets.read-ref"],
    primitives: ["secrets.use"],
  },
});

const FEATURE_ALIASES = Object.freeze({ local_folder: "workspace_source" });

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function boundedLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(parsed)));
}

function normalize(value) {
  return asString(value).toLocaleLowerCase();
}

function releaseSearchText(release) {
  const catalog = asRecord(release.catalog);
  const publisher = asRecord(release.publisherProfile);
  return normalize([
    release.pluginId,
    catalog.displayName,
    catalog.summary,
    release.publisherId,
    publisher.displayName,
    ...(Array.isArray(release.capabilities) ? release.capabilities : []),
  ].filter(Boolean).join(" "));
}

function releaseScore(release, terms) {
  const text = releaseSearchText(release);
  const id = normalize(release.pluginId);
  const name = normalize(asRecord(release.catalog).displayName);
  return terms.reduce((score, term) => score
    + (id.includes(term) ? 8 : 0)
    + (name.includes(term) ? 5 : 0)
    + (text.includes(term) ? 1 : 0), 0);
}

function publicRecommendation(release) {
  return {
    pluginId: asString(release.pluginId),
    version: asString(release.version),
    isLatest: release.isLatest === true,
    visibility: asString(release.visibility),
    ...(release.catalog ? { catalog: { ...asRecord(release.catalog) } } : {}),
    ...(Array.isArray(release.capabilities) ? { capabilities: [...release.capabilities] } : {}),
    ...(asString(release.publisherId) ? { publisherId: asString(release.publisherId) } : {}),
    ...(release.publisherProfile ? { publisherProfile: { ...asRecord(release.publisherProfile) } } : {}),
  };
}

export function searchSpsDiscoveryCatalog(catalog, input = {}) {
  const releases = Array.isArray(catalog?.releases) ? catalog.releases : [];
  const query = asString(asRecord(input).query);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const matches = releases
    .filter((release) => terms.length === 0 || terms.every((term) => releaseSearchText(release).includes(term)))
    .sort((left, right) => {
      const scoreDelta = releaseScore(right, terms) - releaseScore(left, terms);
      if (scoreDelta !== 0) return scoreDelta;
      return asString(asRecord(left.catalog).displayName, left.pluginId)
        .localeCompare(asString(asRecord(right.catalog).displayName, right.pluginId));
    })
    .slice(0, boundedLimit(asRecord(input).limit))
    .map(publicRecommendation);
  return {
    query,
    refreshedAt: asString(catalog?.refreshedAt) || null,
    source: {
      id: asString(catalog?.source?.id, "io.sps.official"),
      displayName: asString(catalog?.source?.displayName, "SPS Official Registry"),
    },
    recommendations: matches,
  };
}

function draftSlug(value) {
  const slug = normalize(value).replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return slug || "extension";
}

export function draftSpsExtension(input = {}) {
  const request = asRecord(input);
  const goal = asString(request.goal);
  if (!goal) throw new Error("A plugin goal is required before an extension can be drafted.");
  const displayName = asString(request.displayName, "SPS Extension Draft");
  const requestedFeatures = Array.isArray(request.features)
    ? [...new Set(request.features
      .map((item) => asString(item))
      .map((item) => FEATURE_ALIASES[item] ?? item)
      .filter((item) => Object.hasOwn(FEATURE_DECLARATIONS, item)))]
    : [];
  const capabilities = [...new Set(requestedFeatures.flatMap((feature) => FEATURE_DECLARATIONS[feature].capabilities))];
  const primitives = [...new Set(requestedFeatures.flatMap((feature) => FEATURE_DECLARATIONS[feature].primitives))];
  const extensionKind = requestedFeatures.includes("tools")
    ? "tool_provider"
    : requestedFeatures.includes("surface")
      ? "surface"
      : null;
  const pluginId = asString(request.pluginId, `draft.${draftSlug(displayName)}`);
  return {
    goal,
    draftOnly: true,
    plugin: {
      id: pluginId,
      apiVersion: 1,
      version: "0.1.0",
      displayName,
      description: goal.slice(0, 500),
      author: "Plugin author",
      categories: ["automation"],
      features: requestedFeatures,
      capabilities,
      sps: {
        contractVersion: "2.0",
        primitives,
      },
      ...(extensionKind ? {
        agentPlatform: {
          contractVersion: "1.0",
          kind: extensionKind,
          profileKey: draftSlug(pluginId),
        },
      } : {}),
    },
    suggestedFiles: ["package.json", "sps-plugin.json", "dist/manifest.js", "dist/worker.js", "test/plugin.test.mjs"],
    validationPlan: ["Define the smallest capability set.", "Run SPS Extension Profile validation.", "Test the plugin locally before packaging.", "Review the package in Settings > Plugins before lifecycle changes."],
  };
}
