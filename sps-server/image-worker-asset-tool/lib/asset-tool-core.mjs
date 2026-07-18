import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const PIXELLAB_BASE_URL = "https://api.pixellab.ai/v2";
const MESHY_BASE_URL = "https://api.meshy.ai/openapi/v1";
const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const PIXELLAB_PRO_IMAGE_OPERATIONS = new Set([
  "generate_image_v2",
  "generate_with_style_v2",
  "generate_ui_v2"
]);
const PIXELLAB_PRO_USAGE_TIERS = [
  { maxGridPixels: 256 * 256, subscriptionGenerations: 20, estimatedUsd: 0.095 },
  { maxGridPixels: 341 * 341, subscriptionGenerations: 25, estimatedUsd: 0.125 },
  { maxGridPixels: 512 * 512, subscriptionGenerations: 40, estimatedUsd: 0.185 }
];

const PROVIDERS = {
  pixel_lab: {
    displayName: "PixelLab",
    output: "Style-consistent PNG pixel art, directional characters, animations, UI, and tilesets",
    apiKeyEnvironment: "PIXELLAB_API_KEY",
    operations: [
      "generate_image_v2",
      "generate_with_style_v2",
      "generate_ui_v2",
      "create_ui_asset",
      "create_character_4_directions",
      "create_character_8_directions",
      "create_character_v3",
      "animate_character",
      "create_tileset"
    ]
  },
  meshy: {
    displayName: "Meshy",
    output: "GLB/FBX/OBJ 3D assets from a source image",
    apiKeyEnvironment: "MESHY_API_KEY",
    operations: ["image_to_3d"]
  }
};

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSegment(value, label) {
  const normalized = text(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized === "." || normalized === "..") throw new Error(`${label} must be a safe file name.`);
  return normalized.slice(0, 120);
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function resolveWithinRoot(root, input, label) {
  const result = path.resolve(root, text(input));
  if (!insideRoot(root, result)) throw new Error(`${label} must remain inside the selected workspace.`);
  return result;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`Unsupported image type for ${filePath}. Use PNG, JPG, JPEG, or WebP.`);
}

async function dataUriFromFile(filePath) {
  const content = await fs.readFile(filePath);
  return `data:${mimeType(filePath)};base64,${content.toString("base64")}`;
}

function normalizeImageSize(raw, label = "imageSize") {
  const source = isObject(raw) ? raw : {};
  const width = number(source.width);
  const height = number(source.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 2048 || height > 2048) {
    throw new Error(`${label} must declare integer width and height between 16 and 2048.`);
  }
  return { width, height };
}

function normalizeStringList(raw, label, allowed = null) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const values = [...new Set(raw.map((entry) => text(entry)).filter(Boolean))];
  if (!values.length) throw new Error(`${label} must contain at least one value.`);
  if (allowed) {
    const invalid = values.filter((entry) => !allowed.has(entry));
    if (invalid.length) throw new Error(`${label} contains unsupported values: ${invalid.join(", ")}.`);
  }
  return values;
}

const TILESET_OUTLINES = new Set([
  "single color black outline",
  "single color outline",
  "selective outline",
  "lineless"
]);
const TILESET_SHADING = new Set([
  "flat shading",
  "basic shading",
  "medium shading",
  "detailed shading",
  "highly detailed shading"
]);
const TILESET_DETAIL = new Set(["low detail", "medium detail", "highly detailed"]);
const TILESET_VIEWS = new Set(["low top-down", "high top-down"]);

function normalizeTilesetEnum(raw, label, allowed, aliases = []) {
  const value = text(raw).toLowerCase();
  if (!value) return null;
  if (allowed.has(value)) return value;
  for (const [pattern, normalized] of aliases) {
    if (pattern.test(value)) return normalized;
  }
  throw new Error(`${label} is unsupported. Use one of: ${[...allowed].join(", ")}.`);
}

function normalizeReferenceImage(raw, workspaceRoot, label, { requireSize = false } = {}) {
  const source = isObject(raw) ? raw : {};
  const imagePath = text(source.path);
  if (!imagePath) throw new Error(`${label}.path is required.`);
  return {
    path: resolveWithinRoot(workspaceRoot, imagePath, `${label}.path`),
    ...(source.size || requireSize ? { size: normalizeImageSize(source.size, `${label}.size`) } : {}),
    usageDescription: text(source.usageDescription, "Use as a visual reference")
  };
}

function optionalReferenceImage(raw, workspaceRoot, label, options) {
  return raw ? normalizeReferenceImage(raw, workspaceRoot, label, options) : null;
}

function normalizePixelLabCommon(input, workspaceRoot, { requireImageSize = true } = {}) {
  const description = text(input.description);
  if (!description || description.length > 2000) throw new Error("PixelLab input.description must be between 1 and 2000 characters.");
  return {
    description,
    ...(requireImageSize || input.imageSize ? { imageSize: normalizeImageSize(input.imageSize) } : {}),
    noBackground: input.noBackground !== false,
    ...(number(input.seed) !== null ? { seed: number(input.seed) } : {}),
    ...(text(input.name) ? { name: text(input.name) } : {})
  };
}

function providerFor(spec) {
  const provider = text(spec?.provider);
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error("provider must be pixel_lab or meshy.");
  return provider;
}

function operationFor(spec, provider) {
  const operation = text(spec?.operation);
  if (!PROVIDERS[provider].operations.includes(operation)) {
    throw new Error(`${provider} operation must be one of: ${PROVIDERS[provider].operations.join(", ")}.`);
  }
  return operation;
}

function normalizeAsset(spec) {
  const asset = isObject(spec?.asset) ? spec.asset : {};
  return {
    name: safeSegment(asset.name, "asset.name"),
    outputDir: text(asset.outputDir),
    kind: text(asset.kind, "generated")
  };
}

function normalizePixelLabInput(spec, workspaceRoot, operation) {
  const input = isObject(spec?.input) ? spec.input : {};
  if (operation === "animate_character") {
    const characterId = text(input.characterId);
    if (!characterId) throw new Error("PixelLab animate_character requires input.characterId.");
    const frameCount = number(input.frameCount, 8);
    if (!Number.isInteger(frameCount) || frameCount < 4 || frameCount > 16 || frameCount % 2 !== 0) {
      throw new Error("input.frameCount must be an even integer between 4 and 16.");
    }
    const allowedDirections = new Set(["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]);
    const mode = text(input.mode);
    if (mode && !new Set(["template", "v3", "pro"]).has(mode)) {
      throw new Error("input.mode must be template, v3, or pro.");
    }
    const templateAnimationId = text(input.templateAnimationId);
    if (mode === "template" && !templateAnimationId) {
      throw new Error("PixelLab template animation mode requires input.templateAnimationId.");
    }
    if (input.enhancePrompt === true && (mode === "template" || mode === "pro" || (!mode && templateAnimationId))) {
      throw new Error("input.enhancePrompt is supported only for PixelLab v3 animation mode.");
    }
    return {
      characterId,
      ...(text(input.animationName) ? { animationName: text(input.animationName) } : {}),
      ...(text(input.description) ? { description: text(input.description) } : {}),
      ...(text(input.actionDescription) ? { actionDescription: text(input.actionDescription) } : {}),
      ...(templateAnimationId ? { templateAnimationId } : {}),
      ...(mode ? { mode } : {}),
      frameCount,
      directions: input.directions ? normalizeStringList(input.directions, "input.directions", allowedDirections) : ["south"],
      ...(number(input.seed) !== null ? { seed: number(input.seed) } : {}),
      enhancePrompt: input.enhancePrompt === true
    };
  }

  if (operation === "create_tileset") {
    const lowerDescription = text(input.lowerDescription);
    const upperDescription = text(input.upperDescription);
    if (!lowerDescription || !upperDescription) throw new Error("PixelLab create_tileset requires input.lowerDescription and input.upperDescription.");
    const tileSize = normalizeImageSize(input.tileSize || { width: 16, height: 16 }, "input.tileSize");
    if (tileSize.width > 128 || tileSize.height > 128) throw new Error("PixelLab input.tileSize must not exceed 128 pixels.");
    return {
      lowerDescription,
      upperDescription,
      ...(text(input.transitionDescription) ? { transitionDescription: text(input.transitionDescription) } : {}),
      tileSize,
      mode: text(input.mode, "standard"),
      view: normalizeTilesetEnum(input.view || "high top-down", "input.view", TILESET_VIEWS, [
        [/low(?:-|\s*)angle.*top[- ]down|low.*top[- ]down/, "low top-down"],
        [/high(?:-|\s*)angle.*top[- ]down|high.*top[- ]down/, "high top-down"]
      ]),
      ...(number(input.seed) !== null ? { seed: number(input.seed) } : {}),
      ...(text(input.outline) ? {
        outline: normalizeTilesetEnum(input.outline, "input.outline", TILESET_OUTLINES, [
          [/selective/, "selective outline"],
          [/lineless|no outline/, "lineless"],
          [/black/, "single color black outline"],
          [/outline/, "single color outline"]
        ])
      } : {}),
      ...(text(input.shading) ? {
        shading: normalizeTilesetEnum(input.shading, "input.shading", TILESET_SHADING, [
          [/highly.*detail/, "highly detailed shading"],
          [/detail/, "detailed shading"],
          [/medium/, "medium shading"],
          [/basic|value mass|large (?:light|dark|shade|shadow) (?:mass|cluster)/, "basic shading"],
          [/flat/, "flat shading"]
        ])
      } : {}),
      ...(text(input.detail) ? {
        detail: normalizeTilesetEnum(input.detail, "input.detail", TILESET_DETAIL, [
          [/highly|high detail/, "highly detailed"],
          [/medium|restrained|moderate/, "medium detail"],
          [/low|minimal|sparse/, "low detail"]
        ])
      } : {})
    };
  }

  const common = normalizePixelLabCommon(input, workspaceRoot, { requireImageSize: operation !== "create_ui_asset" });
  if (operation === "generate_image_v2") {
    const styleImage = optionalReferenceImage(input.styleImage, workspaceRoot, "input.styleImage", { requireSize: true });
    return { ...common, ...(styleImage ? { styleImage } : {}) };
  }
  if (operation === "generate_with_style_v2") {
    if (!Array.isArray(input.styleImages) || input.styleImages.length < 1 || input.styleImages.length > 4) {
      throw new Error("PixelLab generate_with_style_v2 requires 1 to 4 input.styleImages.");
    }
    return {
      ...common,
      styleImages: input.styleImages.map((entry, index) => normalizeReferenceImage(entry, workspaceRoot, `input.styleImages[${index}]`, { requireSize: true })),
      ...(text(input.styleDescription) ? { styleDescription: text(input.styleDescription) } : {})
    };
  }
  if (operation === "generate_ui_v2") {
    const conceptImage = optionalReferenceImage(input.conceptImage, workspaceRoot, "input.conceptImage", { requireSize: true });
    return {
      ...common,
      ...(conceptImage ? { conceptImage } : {}),
      ...(text(input.colorPalette) ? { colorPalette: text(input.colorPalette) } : {})
    };
  }
  if (operation === "create_ui_asset") {
    const styleImage = optionalReferenceImage(input.styleImage, workspaceRoot, "input.styleImage");
    return {
      ...common,
      ...(styleImage ? { styleImage } : {}),
      ...(text(input.colorPalette) ? { colorPalette: text(input.colorPalette) } : {})
    };
  }
  if (operation === "create_character_v3") {
    const referenceImage = optionalReferenceImage(input.referenceImage, workspaceRoot, "input.referenceImage");
    return {
      ...common,
      ...(referenceImage ? { referenceImage } : {}),
      view: text(input.view, "low top-down"),
      templateId: text(input.templateId, "mannequin"),
      outline: text(input.outline, "single color black outline"),
      detail: text(input.detail, "medium detail"),
      enhancePrompt: input.enhancePrompt === true
    };
  }
  if (operation === "create_character_4_directions" || operation === "create_character_8_directions") {
    return {
      ...common,
      view: text(input.view, "low top-down"),
      ...(text(input.outline) ? { outline: text(input.outline) } : {}),
      ...(text(input.shading) ? { shading: text(input.shading) } : {}),
      ...(text(input.detail) ? { detail: text(input.detail) } : {})
    };
  }
  throw new Error(`Unsupported PixelLab operation: ${operation}.`);
}

function normalizeMeshyInput(spec, workspaceRoot) {
  const input = isObject(spec?.input) ? spec.input : {};
  const sourceImagePath = text(input.sourceImagePath);
  const sourceImageUrl = text(input.sourceImageUrl);
  if (!sourceImagePath && !sourceImageUrl) throw new Error("Meshy requires input.sourceImagePath or input.sourceImageUrl.");
  return {
    ...(sourceImagePath ? { sourceImagePath: resolveWithinRoot(workspaceRoot, sourceImagePath, "input.sourceImagePath") } : {}),
    ...(sourceImageUrl ? { sourceImageUrl } : {}),
    shouldTexture: input.shouldTexture !== false,
    shouldRemesh: input.shouldRemesh === true,
    ...(number(input.targetPolycount) !== null ? { targetPolycount: number(input.targetPolycount) } : {}),
    targetFormats: Array.isArray(input.targetFormats) && input.targetFormats.length ? input.targetFormats.map((entry) => text(entry)).filter(Boolean) : ["glb"]
  };
}

export function listProviders(env = process.env) {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    displayName: provider.displayName,
    output: provider.output,
    operations: provider.operations,
    configured: Boolean(text(env?.[provider.apiKeyEnvironment]))
  }));
}

export async function getProviderBalance({ provider = "pixel_lab", env = process.env, fetchImpl = fetch } = {}) {
  if (provider !== "pixel_lab") throw new Error("Balance lookup is currently supported only for pixel_lab.");
  const runtime = providerRuntime(provider, env);
  return apiJson(fetchImpl, `${runtime.baseUrl}/balance`, runtime.apiKey, { method: "GET" }, "PixelLab balance lookup");
}

function pixelLabProOutputCount(maxDimension) {
  if (maxDimension <= 42) return 64;
  if (maxDimension <= 85) return 16;
  if (maxDimension <= 170) return 4;
  return 1;
}

export function estimatePixelLabUsage(validation) {
  if (validation?.provider !== "pixel_lab" || !PIXELLAB_PRO_IMAGE_OPERATIONS.has(validation?.operation)) return null;
  const imageSize = validation?.input?.imageSize;
  if (!imageSize) return null;
  const outputCount = pixelLabProOutputCount(Math.max(imageSize.width, imageSize.height));
  const gridPixels = imageSize.width * imageSize.height * outputCount;
  const tier = PIXELLAB_PRO_USAGE_TIERS.find((entry) => gridPixels <= entry.maxGridPixels);
  if (!tier) {
    return {
      known: false,
      operation: validation.operation,
      imageSize,
      outputCount,
      gridPixels,
      reason: "requested_grid_exceeds_documented_pro_tiers",
      source: "https://www.pixellab.ai/docs/tools/create-sl-image-pro"
    };
  }
  return {
    known: true,
    operation: validation.operation,
    imageSize,
    outputCount,
    gridPixels,
    subscriptionGenerations: tier.subscriptionGenerations,
    estimatedUsd: tier.estimatedUsd,
    source: "https://www.pixellab.ai/docs/tools/create-sl-image-pro"
  };
}

function environmentFlag(value) {
  return new Set(["1", "true", "yes", "on"]).has(text(value).toLowerCase());
}

export function evaluatePixelLabPreflight({ validation, balance, allowUsdCredits = false }) {
  const estimatedUsage = estimatePixelLabUsage(validation);
  if (!estimatedUsage) {
    return {
      required: false,
      allowed: true,
      reason: "operation_has_no_local_cost_estimate",
      estimatedUsage: null
    };
  }
  if (!estimatedUsage.known) {
    return {
      required: true,
      allowed: false,
      reason: estimatedUsage.reason,
      estimatedUsage,
      policy: { allowUsdCredits: Boolean(allowUsdCredits) }
    };
  }
  const subscriptionStatus = text(balance?.subscription?.status).toLowerCase();
  const subscriptionGenerations = Math.max(0, number(balance?.subscription?.generations, 0));
  const subscriptionActive = !subscriptionStatus || new Set(["active", "trial", "trialing"]).has(subscriptionStatus);
  const usdCredits = Math.max(0, number(balance?.credits?.usd, 0));
  const subscriptionAllowed = subscriptionActive && subscriptionGenerations >= estimatedUsage.subscriptionGenerations;
  const usdAllowed = Boolean(allowUsdCredits) && usdCredits >= estimatedUsage.estimatedUsd;
  const fundingSource = subscriptionAllowed ? "subscription_generations" : usdAllowed ? "usd_credits" : null;
  return {
    required: true,
    allowed: Boolean(fundingSource),
    fundingSource,
    reason: fundingSource
      ? "sufficient_approved_provider_balance"
      : subscriptionActive
        ? "insufficient_subscription_generations_and_usd_not_approved_or_insufficient"
        : "inactive_subscription_and_usd_not_approved_or_insufficient",
    estimatedUsage,
    balance: {
      subscription: {
        status: subscriptionStatus || null,
        generations: subscriptionGenerations,
        total: Math.max(0, number(balance?.subscription?.total, 0))
      },
      credits: { usd: usdCredits }
    },
    policy: { allowUsdCredits: Boolean(allowUsdCredits) }
  };
}

export async function preflightAssetSpec({ validation, env = process.env, fetchImpl = fetch, allowUsdCredits = environmentFlag(env?.PIXELLAB_ALLOW_USD_CREDITS) }) {
  const estimatedUsage = estimatePixelLabUsage(validation);
  if (!estimatedUsage) return evaluatePixelLabPreflight({ validation, balance: null, allowUsdCredits });
  if (!estimatedUsage.known) return evaluatePixelLabPreflight({ validation, balance: null, allowUsdCredits });
  const balance = await getProviderBalance({ provider: "pixel_lab", env, fetchImpl });
  return evaluatePixelLabPreflight({ validation, balance, allowUsdCredits });
}

export async function loadAssetSpec(specPath) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(specPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read asset spec ${specPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) throw new Error("Asset spec must be a JSON object.");
  return parsed;
}

export function validateAssetSpec(spec, { workspaceRoot }) {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const provider = providerFor(spec);
  const operation = operationFor(spec, provider);
  const asset = normalizeAsset(spec);
  if (!asset.outputDir) throw new Error("asset.outputDir is required.");
  const outputDir = resolveWithinRoot(resolvedWorkspace, asset.outputDir, "asset.outputDir");
  const input = provider === "pixel_lab"
    ? normalizePixelLabInput(spec, resolvedWorkspace, operation)
    : normalizeMeshyInput(spec, resolvedWorkspace);
  if (provider === "pixel_lab" && asset.kind === "environment_plate" && input.noBackground !== false) {
    throw new Error("PixelLab environment_plate assets require input.noBackground: false for an opaque plate.");
  }
  const validation = { provider, operation, asset, input, workspaceRoot: resolvedWorkspace, outputDir };
  return { ...validation, estimatedUsage: estimatePixelLabUsage(validation) };
}

async function pixelLabBase64Image(reference) {
  return { type: "base64", base64: await dataUriFromFile(reference.path) };
}

async function pixelLabReference(style) {
  return {
    image: await pixelLabBase64Image(style),
    size: style.size,
    usage_description: style.usageDescription
  };
}

async function pixelLabStyleReference(style) {
  return {
    image: await pixelLabBase64Image(style),
    width: style.size.width,
    height: style.size.height
  };
}

async function buildPixelLabSubmission(validation) {
  const { operation, input } = validation;
  const commonImageBody = {
    description: input.description,
    ...(input.imageSize ? { image_size: input.imageSize } : {}),
    no_background: input.noBackground,
    ...(input.seed !== undefined ? { seed: input.seed } : {})
  };
  if (operation === "generate_image_v2") {
    return {
      endpoint: "/generate-image-v2",
      body: {
        ...commonImageBody,
        ...(input.styleImage ? { style_image: await pixelLabReference(input.styleImage) } : {})
      }
    };
  }
  if (operation === "generate_with_style_v2") {
    return {
      endpoint: "/generate-with-style-v2",
      body: {
        ...commonImageBody,
        style_images: await Promise.all(input.styleImages.map(pixelLabStyleReference)),
        ...(input.styleDescription ? { style_description: input.styleDescription } : {})
      }
    };
  }
  if (operation === "generate_ui_v2") {
    return {
      endpoint: "/generate-ui-v2",
      body: {
        ...commonImageBody,
        ...(input.conceptImage ? { concept_image: { image: await pixelLabBase64Image(input.conceptImage), size: input.conceptImage.size } } : {}),
        ...(input.colorPalette ? { color_palette: input.colorPalette } : {})
      }
    };
  }
  if (operation === "create_ui_asset") {
    return {
      endpoint: "/create-ui-asset",
      body: {
        ...commonImageBody,
        ...(input.styleImage ? { style_image: await pixelLabBase64Image(input.styleImage) } : {}),
        ...(input.colorPalette ? { color_palette: input.colorPalette } : {}),
        ...(input.name ? { name: input.name } : {})
      }
    };
  }
  if (operation === "create_character_4_directions" || operation === "create_character_8_directions") {
    return {
      endpoint: operation === "create_character_8_directions" ? "/create-character-with-8-directions" : "/create-character-with-4-directions",
      body: {
        ...commonImageBody,
        view: input.view,
        ...(input.outline ? { outline: input.outline } : {}),
        ...(input.shading ? { shading: input.shading } : {}),
        ...(input.detail ? { detail: input.detail } : {})
      }
    };
  }
  if (operation === "create_character_v3") {
    return {
      endpoint: "/create-character-v3",
      body: {
        ...commonImageBody,
        ...(input.referenceImage ? { reference_image: await pixelLabBase64Image(input.referenceImage) } : {}),
        view: input.view,
        template_id: input.templateId,
        outline: input.outline,
        detail: input.detail,
        enhance_prompt: input.enhancePrompt,
        ...(input.name ? { name: input.name } : {})
      }
    };
  }
  if (operation === "animate_character") {
    return {
      endpoint: "/animate-character",
      body: {
        character_id: input.characterId,
        frame_count: input.frameCount,
        directions: input.directions,
        enhance_prompt: input.enhancePrompt,
        ...(input.animationName ? { animation_name: input.animationName } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.actionDescription ? { action_description: input.actionDescription } : {}),
        ...(input.templateAnimationId ? { template_animation_id: input.templateAnimationId } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {})
      }
    };
  }
  if (operation === "create_tileset") {
    return {
      endpoint: "/create-tileset",
      body: {
        lower_description: input.lowerDescription,
        upper_description: input.upperDescription,
        ...(input.transitionDescription ? { transition_description: input.transitionDescription } : {}),
        tile_size: input.tileSize,
        mode: input.mode,
        view: input.view,
        ...(input.outline ? { outline: input.outline } : {}),
        ...(input.shading ? { shading: input.shading } : {}),
        ...(input.detail ? { detail: input.detail } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {})
      }
    };
  }
  throw new Error(`Unsupported PixelLab operation: ${operation}.`);
}

async function buildMeshySubmission(validation) {
  const { input } = validation;
  const imageUrl = input.sourceImagePath ? await dataUriFromFile(input.sourceImagePath) : input.sourceImageUrl;
  return {
    endpoint: "/image-to-3d",
    body: {
      image_url: imageUrl,
      should_texture: input.shouldTexture,
      should_remesh: input.shouldRemesh,
      target_formats: input.targetFormats,
      ...(input.targetPolycount ? { target_polycount: input.targetPolycount } : {})
    }
  };
}

function providerRuntime(provider, env) {
  const apiKey = text(env?.[PROVIDERS[provider].apiKeyEnvironment]);
  if (!apiKey) throw new Error(`${PROVIDERS[provider].apiKeyEnvironment} is not configured for the Image Worker.`);
  return {
    baseUrl: provider === "pixel_lab" ? PIXELLAB_BASE_URL : MESHY_BASE_URL,
    apiKey
  };
}

async function responseJson(response, action) {
  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`${action} returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const rawDetail = data?.detail ?? data?.message ?? data?.error ?? body;
    const detail = (typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail)).slice(0, 1000);
    throw new Error(`${action} failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return data;
}

async function apiJson(fetchImpl, url, apiKey, init, action) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init?.headers || {}) }
  });
  return responseJson(response, action);
}

function pixelLabJobId(response) {
  return text(response?.background_job_id || response?.job_id);
}

function pixelLabJobIds(response) {
  const ids = Array.isArray(response?.background_job_ids) ? response.background_job_ids.map((entry) => text(entry)).filter(Boolean) : [];
  const single = pixelLabJobId(response);
  return [...new Set(single ? [single, ...ids] : ids)];
}

function meshyJobId(response) {
  return text(response?.result || response?.id);
}

export async function submitAssetSpec({ validation, env = process.env, fetchImpl = fetch }) {
  const runtime = providerRuntime(validation.provider, env);
  const submission = validation.provider === "pixel_lab"
    ? await buildPixelLabSubmission(validation)
    : await buildMeshySubmission(validation);
  const response = await apiJson(fetchImpl, `${runtime.baseUrl}${submission.endpoint}`, runtime.apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission.body)
  }, `${PROVIDERS[validation.provider].displayName} submission`);
  const jobIds = validation.provider === "pixel_lab" ? pixelLabJobIds(response) : [meshyJobId(response)].filter(Boolean);
  return {
    runtime,
    response,
    jobId: jobIds[0] || null,
    jobIds,
    resources: validation.provider === "pixel_lab" ? {
      characterId: text(response?.character_id || (validation.operation === "animate_character" ? validation.input.characterId : "")) || null,
      tilesetId: text(response?.tileset_id) || null,
      uiAssetId: text(response?.ui_asset_id) || null
    } : {}
  };
}

function providerStatus(provider, response) {
  return text(response?.status).toUpperCase();
}

function isSucceeded(provider, response) {
  const status = providerStatus(provider, response);
  return status === "COMPLETED" || status === "SUCCEEDED" || (!status && provider === "pixel_lab" && Boolean(response?.images));
}

function isFailed(provider, response) {
  const status = providerStatus(provider, response);
  return ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status);
}

async function pollJob({ provider, runtime, jobId, fetchImpl, sleep, timeoutMs }) {
  const endpoint = provider === "pixel_lab" ? `/background-jobs/${encodeURIComponent(jobId)}` : `/image-to-3d/${encodeURIComponent(jobId)}`;
  const startedAt = Date.now();
  while (true) {
    const response = await apiJson(fetchImpl, `${runtime.baseUrl}${endpoint}`, runtime.apiKey, { method: "GET" }, `${PROVIDERS[provider].displayName} job poll`);
    if (isSucceeded(provider, response)) return response;
    if (isFailed(provider, response)) {
      throw new Error(`${PROVIDERS[provider].displayName} job ${jobId} failed: ${text(response?.task_error?.message || response?.error || response?.message, "Unknown provider error")}`);
    }
    if (Date.now() - startedAt >= timeoutMs) throw new Error(`${PROVIDERS[provider].displayName} job ${jobId} timed out.`);
    await sleep(POLL_INTERVAL_MS);
  }
}

function dataUriBytes(value) {
  const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(value);
  if (!match) return null;
  return { contentType: match[1] || "application/octet-stream", bytes: Buffer.from(match[2], "base64") };
}

function pixelLabBase64Bytes(value) {
  const encoded = text(value).replace(/\s+/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) return null;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.length ? bytes : null;
}

function encodedImageExtension(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  return null;
}

function rawRgbaDimensions(value, bytes) {
  const width = Number(value.width ?? value.imageWidth ?? value.size?.width ?? value.dimensions?.width);
  const height = Number(value.height ?? value.imageHeight ?? value.size?.height ?? value.dimensions?.height);
  if (Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 && width * height * 4 === bytes.length) {
    return { width, height };
  }
  const side = Math.sqrt(bytes.length / 4);
  return Number.isSafeInteger(side) && side > 0 ? { width: side, height: side } : null;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function rawRgbaToPng(bytes, { width, height }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rowBytes = width * 4;
  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) bytes.copy(scanlines, row * (rowBytes + 1) + 1, row * rowBytes, (row + 1) * rowBytes);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pixelLabBase64Artifact(value, bytes) {
  const encodedExtension = encodedImageExtension(bytes);
  if (encodedExtension) return { bytes, extension: encodedExtension };
  const rgbaDimensions = rawRgbaDimensions(value, bytes);
  if (rgbaDimensions) return { bytes: rawRgbaToPng(bytes, rgbaDimensions), extension: ".png" };
  const explicitFormat = text(value.format);
  return { bytes, extension: explicitFormat ? extensionForPixelLabFormat(explicitFormat) : ".bin" };
}

function extensionForPixelLabFormat(format) {
  const normalized = text(format).toLowerCase();
  if (normalized === "jpeg") return ".jpg";
  return /^[a-z0-9]{1,6}$/.test(normalized) ? `.${normalized}` : ".png";
}

function extensionForContentType(contentType, fallback = ".bin") {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "model/gltf-binary") return ".glb";
  return fallback;
}

function collectPixelLabArtifacts(value, trail = [], results = [], seenUrls = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectPixelLabArtifacts(entry, [...trail, String(index + 1)], results, seenUrls));
    return results;
  }
  if (typeof value === "string") {
    const decoded = dataUriBytes(value);
    if (decoded) {
      results.push({ label: safeSegment(trail.join("-") || "image", "generated image label"), bytes: decoded.bytes, extension: extensionForContentType(decoded.contentType, ".png") });
    } else if (/^https:\/\//i.test(value) && !seenUrls.has(value)) {
      seenUrls.add(value);
      results.push({ label: safeSegment(trail.join("-") || "download", "generated file label"), url: value });
    }
    return results;
  }
  if (!isObject(value)) return results;
  if (Buffer.isBuffer(value.bytes) && text(value.extension)) {
    results.push({ label: safeSegment(value.label || trail.join("-") || "download", "generated file label"), bytes: value.bytes, extension: value.extension });
    return results;
  }
  const base64 = text(value.base64);
  const dataUri = base64 ? dataUriBytes(base64) : null;
  const rawBytes = base64 && !dataUri ? pixelLabBase64Bytes(base64) : null;
  if (dataUri || rawBytes) {
    const artifact = rawBytes ? pixelLabBase64Artifact(value, rawBytes) : null;
    results.push({
      label: safeSegment(trail.join("-") || "image", "generated image label"),
      bytes: dataUri?.bytes || artifact.bytes,
      extension: dataUri ? extensionForContentType(dataUri.contentType, ".png") : artifact.extension
    });
    return results;
  }
  for (const [key, entry] of Object.entries(value)) collectPixelLabArtifacts(entry, [...trail, key], results, seenUrls);
  return results;
}

const RETRYABLE_DOWNLOAD_STATUSES = new Set([408, 423, 425, 429, 500, 502, 503, 504]);

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  return Math.min(30_000, 5_000 * (2 ** Math.max(0, attempt - 1)));
}

async function download(fetchImpl, url, label, extension, headers = undefined, {
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxAttempts = 6
} = {}) {
  let response;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetchImpl(url, headers ? { headers } : undefined);
    if (response.ok) break;
    const detail = text(await response.text().catch(() => "")).slice(0, 300);
    if (!RETRYABLE_DOWNLOAD_STATUSES.has(response.status) || attempt === maxAttempts) {
      throw new Error(`Could not download ${label} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
    }
    await sleep(retryDelayMs(response, attempt));
  }
  const contentType = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  let inferred = extensionForContentType(contentType, "");
  if (!inferred) {
    try {
      const pathname = new URL(url).pathname;
      const candidate = path.extname(pathname).toLowerCase();
      if (/^\.[a-z0-9]{1,6}$/.test(candidate)) inferred = candidate;
    } catch {}
  }
  return { label, bytes: Buffer.from(await response.arrayBuffer()), extension: extension || inferred || ".bin" };
}

async function materializePixelLabArtifacts(fetchImpl, value) {
  const discovered = collectPixelLabArtifacts(value);
  return Promise.all(discovered.map((entry) => entry.url ? download(fetchImpl, entry.url, entry.label) : entry));
}

async function collectMeshyFiles(fetchImpl, response) {
  const files = [];
  const modelUrls = isObject(response?.model_urls) ? response.model_urls : {};
  for (const [format, url] of Object.entries(modelUrls)) {
    if (!text(url)) continue;
    files.push(await download(fetchImpl, url, format, format === "glb" ? ".glb" : `.${format}`));
  }
  if (text(response?.thumbnail_url)) files.push(await download(fetchImpl, response.thumbnail_url, "preview", ".png"));
  return files;
}

async function enrichPixelLabCompletion({ validation, submission, completion, fetchImpl, sleep }) {
  const resources = submission.resources || {};
  const enriched = { submission: submission.response, jobs: Array.isArray(completion) ? completion : [completion] };
  if (resources.characterId) {
    enriched.character = await apiJson(fetchImpl, `${submission.runtime.baseUrl}/characters/${encodeURIComponent(resources.characterId)}`, submission.runtime.apiKey, { method: "GET" }, "PixelLab character fetch");
    if (validation.operation === "animate_character") {
      const bundleUrl = `${submission.runtime.baseUrl}/characters/${encodeURIComponent(resources.characterId)}/zip`;
      enriched.characterBundle = await download(
        fetchImpl,
        bundleUrl,
        "character-animation-bundle",
        ".zip",
        { Authorization: `Bearer ${submission.runtime.apiKey}` },
        { sleep }
      );
    }
  }
  if (resources.tilesetId) {
    enriched.tileset = await apiJson(fetchImpl, `${submission.runtime.baseUrl}/tilesets/${encodeURIComponent(resources.tilesetId)}`, submission.runtime.apiKey, { method: "GET" }, "PixelLab tileset fetch");
  }
  if (resources.uiAssetId) {
    enriched.uiAsset = await apiJson(fetchImpl, `${submission.runtime.baseUrl}/ui-assets/${encodeURIComponent(resources.uiAssetId)}`, submission.runtime.apiKey, { method: "GET" }, "PixelLab UI asset fetch");
  }
  return enriched;
}

async function removePreviousManagedOutputs({ validation, outputRoot, manifestPath }) {
  let previousManifest;
  try {
    previousManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`Could not read the previous asset manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  const managedEntries = [
    ...(Array.isArray(previousManifest?.files) ? previousManifest.files : []),
    ...(Array.isArray(previousManifest?.metadataFiles) ? previousManifest.metadataFiles : [])
  ];
  for (const entry of new Set(managedEntries)) {
    const managedPath = path.resolve(validation.workspaceRoot, text(entry));
    if (!insideRoot(outputRoot, managedPath)) throw new Error("The previous asset manifest contains a file outside its managed output directory.");
    await fs.rm(managedPath, { force: true });
  }
}

function pixelLabTilesetTopology(providerResponse) {
  const response = providerResponse?.tileset;
  const tileset = response?.tileset || response;
  if (!Array.isArray(tileset?.tiles)) return null;
  return {
    version: 1,
    totalTiles: tileset.total_tiles ?? tileset.tiles.length,
    tileSize: tileset.tile_size ?? null,
    terrainTypes: tileset.terrain_types ?? null,
    metadata: response?.metadata ?? null,
    tiles: tileset.tiles.map((tile) => {
      const encoded = text(tile?.image?.base64);
      const decoded = encoded ? dataUriBytes(encoded)?.bytes || pixelLabBase64Bytes(encoded) : null;
      return {
        id: tile?.id ?? null,
        name: tile?.name ?? null,
        corners: tile?.corners ?? null,
        pattern4x4: tile?.pattern_4x4 ?? null,
        originalPosition: tile?.original_position ?? null,
        description: tile?.description ?? null,
        connections: tile?.connections ?? null,
        image: decoded ? {
          bytes: decoded.length,
          sha256: createHash("sha256").update(decoded).digest("hex"),
          format: text(tile?.image?.format) || encodedImageExtension(decoded)?.slice(1) || null
        } : null
      };
    })
  };
}

function deliveryMetadata(validation) {
  if (validation.provider !== "pixel_lab" || validation.operation !== "animate_character") return null;
  const mode = validation.input.mode || (validation.input.templateAnimationId ? "template" : "v3");
  const requestedFrameCount = validation.input.frameCount;
  return {
    animation: {
      mode,
      directions: validation.input.directions,
      requestedFrameCount,
      frameCountSemantics: mode === "v3" ? "generated_frames_excluding_reference" : "provider_mode_dependent",
      storedFrameCount: mode === "v3" ? requestedFrameCount + 1 : null,
      referenceFrameIndex: mode === "v3" ? 0 : null,
      playableFrameIndices: mode === "v3" ? Array.from({ length: requestedFrameCount }, (_, index) => index + 1) : null
    }
  };
}

async function persistOutputs({ validation, submission, completion, fetchImpl, sleep }) {
  const outputRoot = path.join(validation.outputDir, validation.asset.name);
  const manifestPath = path.join(outputRoot, "asset-manifest.json");
  const providerResponse = validation.provider === "pixel_lab"
    ? await enrichPixelLabCompletion({ validation, submission, completion, fetchImpl, sleep })
    : completion;
  const files = validation.provider === "pixel_lab"
    ? await materializePixelLabArtifacts(fetchImpl, providerResponse)
    : await collectMeshyFiles(fetchImpl, completion);
  if (!files.length) throw new Error(`${PROVIDERS[validation.provider].displayName} completed without downloadable output files.`);
  await fs.mkdir(outputRoot, { recursive: true });
  await removePreviousManagedOutputs({ validation, outputRoot, manifestPath });
  const writtenFiles = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filename = `${validation.asset.name}-${String(index + 1).padStart(2, "0")}-${safeSegment(file.label, "output label")}${file.extension}`;
    const outputPath = path.join(outputRoot, filename);
    await fs.writeFile(outputPath, file.bytes);
    writtenFiles.push(outputPath);
  }
  const metadataFiles = [];
  const topology = validation.provider === "pixel_lab" && validation.operation === "create_tileset"
    ? pixelLabTilesetTopology(providerResponse)
    : null;
  if (topology) {
    const topologyPath = path.join(outputRoot, "provider-topology.json");
    await fs.writeFile(topologyPath, `${JSON.stringify(topology, null, 2)}\n`, "utf8");
    metadataFiles.push(topologyPath);
  }
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: validation.provider,
    operation: validation.operation,
    asset: validation.asset,
    jobId: submission.jobId || null,
    jobIds: submission.jobIds || [],
    resources: submission.resources || {},
    delivery: deliveryMetadata(validation),
    files: writtenFiles.map((file) => path.relative(validation.workspaceRoot, file)),
    metadataFiles: metadataFiles.map((file) => path.relative(validation.workspaceRoot, file)),
    request: {
      provider: validation.provider,
      operation: validation.operation,
      asset: validation.asset,
      input: validation.input
    }
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outputRoot, manifestPath, files: manifest.files, metadataFiles: manifest.metadataFiles, jobId: manifest.jobId, delivery: manifest.delivery };
}

function providerPayloadReceipt(bytes, encoding, contentType = null) {
  return {
    redacted: true,
    encoding,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...(contentType ? { contentType } : {})
  };
}

function sanitizeProviderPayload(value, key = "") {
  if (Array.isArray(value)) return value.map((entry) => sanitizeProviderPayload(entry, key));
  if (typeof value === "string") {
    const dataUri = dataUriBytes(value);
    if (dataUri) return providerPayloadReceipt(dataUri.bytes, "data-uri-base64", dataUri.contentType);
    if (/base64/i.test(key)) {
      const bytes = pixelLabBase64Bytes(value);
      return bytes
        ? providerPayloadReceipt(bytes, "base64")
        : { redacted: true, encoding: "base64", invalid: true, characters: value.length };
    }
    return value;
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
    entryKey,
    sanitizeProviderPayload(entryValue, entryKey)
  ]));
}

export async function writePixelLabTilesetReceipt({
  spec,
  tilesetId,
  jobId = null,
  workspaceRoot,
  env = process.env,
  fetchImpl = fetch
}) {
  const validation = validateAssetSpec(spec, { workspaceRoot });
  if (validation.provider !== "pixel_lab" || validation.operation !== "create_tileset") {
    throw new Error("Tileset receipts require a PixelLab create_tileset spec.");
  }
  const normalizedTilesetId = text(tilesetId);
  if (!normalizedTilesetId) throw new Error("tilesetId is required for a PixelLab tileset receipt.");
  const normalizedJobId = text(jobId) || null;
  const runtime = providerRuntime("pixel_lab", env);
  const [job, tileset] = await Promise.all([
    normalizedJobId
      ? apiJson(fetchImpl, `${runtime.baseUrl}/background-jobs/${encodeURIComponent(normalizedJobId)}`, runtime.apiKey, { method: "GET" }, "PixelLab job receipt fetch")
      : null,
    apiJson(fetchImpl, `${runtime.baseUrl}/tilesets/${encodeURIComponent(normalizedTilesetId)}`, runtime.apiKey, { method: "GET" }, "PixelLab tileset receipt fetch")
  ]);
  const outputRoot = path.join(validation.outputDir, validation.asset.name);
  const receiptPath = path.join(outputRoot, "provider-receipt.json");
  const receipt = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    provider: "pixel_lab",
    operation: validation.operation,
    jobId: normalizedJobId,
    tilesetId: normalizedTilesetId,
    note: "Provider image payloads are redacted to byte counts and SHA-256 digests; topology metadata is preserved.",
    job: sanitizeProviderPayload(job),
    tileset: sanitizeProviderPayload(tileset)
  };
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return {
    receiptPath,
    relativeReceiptPath: path.relative(validation.workspaceRoot, receiptPath),
    jobId: normalizedJobId,
    tilesetId: normalizedTilesetId
  };
}

export async function runAssetSpec({ spec, workspaceRoot, env = process.env, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = DEFAULT_TIMEOUT_MS, onPreflight = null, onSubmitted = null }) {
  const validation = validateAssetSpec(spec, { workspaceRoot });
  const preflight = await preflightAssetSpec({ validation, env, fetchImpl });
  if (typeof onPreflight === "function") await onPreflight(preflight);
  if (!preflight.allowed) {
    const required = preflight.estimatedUsage?.subscriptionGenerations;
    const remaining = preflight.balance?.subscription?.generations;
    const detail = required == null
      ? preflight.reason
      : `requires ${required} subscription generations; remaining ${remaining ?? "unknown"}; USD credits allowed: ${preflight.policy?.allowUsdCredits === true}`;
    throw new Error(`PixelLab preflight blocked submission: ${detail}.`);
  }
  const submission = await submitAssetSpec({ validation, env, fetchImpl });
  if (typeof onSubmitted === "function") {
    await onSubmitted({
      provider: validation.provider,
      operation: validation.operation,
      jobId: submission.jobId,
      jobIds: submission.jobIds,
      resources: submission.resources
    });
  }
  let completion = submission.response;
  if (submission.jobIds.length) {
    const completions = await Promise.all(submission.jobIds.map((jobId) => pollJob({ provider: validation.provider, runtime: submission.runtime, jobId, fetchImpl, sleep, timeoutMs })));
    completion = completions.length === 1 ? completions[0] : completions;
  }
  return persistOutputs({ validation, submission, completion, fetchImpl, sleep });
}

export async function recoverPixelLabCharacter({
  spec,
  characterId,
  workspaceRoot,
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const validation = validateAssetSpec(spec, { workspaceRoot });
  if (validation.provider !== "pixel_lab") throw new Error("Character recovery is supported only for pixel_lab.");
  if (!new Set(["create_character_v3", "create_character_4_directions", "create_character_8_directions", "animate_character"]).has(validation.operation)) {
    throw new Error("Character recovery requires a PixelLab character or character animation spec.");
  }
  const normalizedCharacterId = text(characterId);
  if (!normalizedCharacterId) throw new Error("characterId is required for PixelLab character recovery.");
  const runtime = providerRuntime("pixel_lab", env);
  const submission = {
    runtime,
    response: { character_id: normalizedCharacterId, recovered: true },
    jobId: null,
    jobIds: [],
    resources: { characterId: normalizedCharacterId, tilesetId: null, uiAssetId: null }
  };
  return persistOutputs({
    validation,
    submission,
    completion: { status: "completed", recovered: true },
    fetchImpl,
    sleep
  });
}

export async function recoverPixelLabTileset({
  spec,
  tilesetId,
  jobId = null,
  workspaceRoot,
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const validation = validateAssetSpec(spec, { workspaceRoot });
  if (validation.provider !== "pixel_lab" || validation.operation !== "create_tileset") {
    throw new Error("Tileset recovery requires a PixelLab create_tileset spec.");
  }
  const normalizedTilesetId = text(tilesetId);
  if (!normalizedTilesetId) throw new Error("tilesetId is required for PixelLab tileset recovery.");
  const normalizedJobId = text(jobId) || null;
  const runtime = providerRuntime("pixel_lab", env);
  const submission = {
    runtime,
    response: { tileset_id: normalizedTilesetId, background_job_id: normalizedJobId, recovered: true },
    jobId: normalizedJobId,
    jobIds: normalizedJobId ? [normalizedJobId] : [],
    resources: { characterId: null, tilesetId: normalizedTilesetId, uiAssetId: null }
  };
  return persistOutputs({
    validation,
    submission,
    completion: { status: "completed", recovered: true },
    fetchImpl,
    sleep
  });
}
