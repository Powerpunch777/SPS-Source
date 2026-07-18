import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { estimatePixelLabUsage, evaluatePixelLabPreflight, getProviderBalance, listProviders, recoverPixelLabCharacter, recoverPixelLabTileset, runAssetSpec, validateAssetSpec, writePixelLabTilesetReceipt } from "../lib/asset-tool-core.mjs";
import { findLatestRunState, readRunStateWithCanonicalId, shouldReuseRun, specFileFingerprint, waitForRunState, writeRunState } from "../lib/run-ledger.mjs";

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-asset-tool-"));
const pngData = "data:image/png;base64,UE5H";

const pixelSpec = {
  provider: "pixel_lab",
  operation: "generate_image_v2",
  asset: { name: "hero", kind: "pixel_sprite", outputDir: "Assets/Art/Generated" },
  input: { description: "original pixel hero", imageSize: { width: 64, height: 64 }, noBackground: true, seed: 5 }
};
assert.equal(listProviders({ PIXELLAB_API_KEY: "token" }).find((provider) => provider.id === "pixel_lab").configured, true);
assert.deepEqual(await getProviderBalance({
  env: { PIXELLAB_API_KEY: "token" },
  fetchImpl: async (url, init) => {
    assert.ok(String(url).endsWith("/balance"));
    assert.equal(init.headers.Authorization, "Bearer token");
    return new Response(JSON.stringify({ credits: { type: "usd", usd: 2.5 }, subscription: { generations: 100, total: 200 } }), { status: 200 });
  }
}), { credits: { type: "usd", usd: 2.5 }, subscription: { generations: 100, total: 200 } });
assert.throws(() => validateAssetSpec({ ...pixelSpec, asset: { ...pixelSpec.asset, outputDir: "../outside" } }, { workspaceRoot: workspace }), /inside the selected workspace/);
assert.throws(() => validateAssetSpec({
  ...pixelSpec,
  asset: { ...pixelSpec.asset, kind: "environment_plate" }
}, { workspaceRoot: workspace }), /require input.noBackground: false/);

const largePixelValidation = validateAssetSpec({
  ...pixelSpec,
  asset: { ...pixelSpec.asset, name: "forest-room" },
  input: { ...pixelSpec.input, imageSize: { width: 640, height: 360 }, noBackground: false }
}, { workspaceRoot: workspace });
assert.deepEqual(estimatePixelLabUsage(largePixelValidation), {
  known: true,
  operation: "generate_image_v2",
  imageSize: { width: 640, height: 360 },
  outputCount: 1,
  gridPixels: 230400,
  subscriptionGenerations: 40,
  estimatedUsd: 0.185,
  source: "https://www.pixellab.ai/docs/tools/create-sl-image-pro"
});
const blockedPreflight = evaluatePixelLabPreflight({
  validation: largePixelValidation,
  balance: { credits: { usd: 1 }, subscription: { status: "active", generations: 34, total: 40 } }
});
assert.equal(blockedPreflight.allowed, false);
assert.equal(blockedPreflight.reason, "insufficient_subscription_generations_and_usd_not_approved_or_insufficient");
assert.equal(evaluatePixelLabPreflight({
  validation: largePixelValidation,
  balance: { credits: { usd: 1 }, subscription: { status: "active", generations: 34, total: 40 } },
  allowUsdCredits: true
}).fundingSource, "usd_credits");
assert.equal(evaluatePixelLabPreflight({
  validation: largePixelValidation,
  balance: { credits: { usd: 0 }, subscription: { status: "trial", generations: 40, total: 40 } }
}).fundingSource, "subscription_generations");
const blockedCalls = [];
await assert.rejects(runAssetSpec({
  spec: {
    ...pixelSpec,
    asset: { ...pixelSpec.asset, name: "forest-room-blocked" },
    input: { ...pixelSpec.input, imageSize: { width: 640, height: 360 }, noBackground: false }
  },
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  fetchImpl: async (url) => {
    blockedCalls.push(String(url));
    if (String(url).endsWith("/balance")) {
      return new Response(JSON.stringify({ credits: { usd: 0 }, subscription: { status: "active", generations: 34, total: 40 } }), { status: 200 });
    }
    throw new Error(`Unexpected provider submission: ${url}`);
  }
}), /requires 40 subscription generations; remaining 34/);
assert.equal(blockedCalls.length, 1);
assert.ok(blockedCalls[0].endsWith("/balance"));

const pixelCalls = [];
const pixelResult = await runAssetSpec({
  spec: pixelSpec,
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  fetchImpl: async (url, init = {}) => {
    pixelCalls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).endsWith("/balance")) return new Response(JSON.stringify({ credits: { usd: 0 }, subscription: { status: "active", generations: 100, total: 200 } }), { status: 200 });
    if (String(url).endsWith("/generate-image-v2")) return new Response(JSON.stringify({ background_job_id: "pixel-job", status: "processing" }), { status: 202 });
    if (String(url).endsWith("/background-jobs/pixel-job")) return new Response(JSON.stringify({ status: "completed", last_response: { images: [{ image: { base64: pngData } }] } }), { status: 200 });
    throw new Error(`Unexpected PixelLab URL: ${url}`);
  }
});
assert.equal(pixelCalls.length, 3);
assert.equal(pixelResult.files.length, 1);
assert.equal((await fs.readFile(path.join(workspace, pixelResult.files[0]))).toString(), "PNG");

const stylePath = path.join(workspace, "Art", "References", "style.png");
await fs.mkdir(path.dirname(stylePath), { recursive: true });
await fs.writeFile(stylePath, "STYLE");
const styleSpec = {
  provider: "pixel_lab",
  operation: "generate_with_style_v2",
  asset: { name: "forest-prop", kind: "pixel_prop", outputDir: "Assets/Art/Generated" },
  input: {
    description: "forest altar in the approved original style",
    imageSize: { width: 64, height: 64 },
    styleImages: [{ path: "Art/References/style.png", size: { width: 64, height: 64 } }],
    styleDescription: "top-down 16-bit action roguelike, crisp clusters",
    seed: 11
  }
};
const styleResult = await runAssetSpec({
  spec: styleSpec,
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  fetchImpl: async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/balance")) return new Response(JSON.stringify({ credits: { usd: 0 }, subscription: { status: "active", generations: 100, total: 200 } }), { status: 200 });
    if (target.endsWith("/generate-with-style-v2")) {
      const body = JSON.parse(init.body);
      assert.equal(body.style_images.length, 1);
      assert.equal(body.style_description, styleSpec.input.styleDescription);
      return new Response(JSON.stringify({ background_job_id: "style-job", status: "processing" }), { status: 202 });
    }
    if (target.endsWith("/background-jobs/style-job")) return new Response(JSON.stringify({ status: "completed", last_response: { images: [{ image: { base64: pngData } }] } }), { status: 200 });
    throw new Error(`Unexpected PixelLab style URL: ${url}`);
  }
});
assert.equal(styleResult.files.length, 1);

const tilesetSpec = {
  provider: "pixel_lab",
  operation: "create_tileset",
  asset: { name: "forest-floor", kind: "terrain_tileset", outputDir: "Assets/Art/Generated" },
  input: {
    lowerDescription: "mossy forest grass",
    upperDescription: "compact dirt path",
    transitionDescription: "moss-reclaimed organic edge",
    tileSize: { width: 16, height: 16 },
    mode: "standard",
    view: "low-angle top-down",
    outline: "crisp 1px selective dark outline",
    shading: "2 to 4 large value masses with upper-left light",
    detail: "native pixel density with restrained organic detail",
    seed: 2715
  }
};
const tilesetResult = await runAssetSpec({
  spec: tilesetSpec,
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  fetchImpl: async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/create-tileset")) {
      const body = JSON.parse(init.body);
      assert.equal(body.view, "low top-down");
      assert.equal(body.outline, "selective outline");
      assert.equal(body.shading, "basic shading");
      assert.equal(body.detail, "medium detail");
      return new Response(JSON.stringify({ background_job_id: "tileset-job", tileset_id: "tileset-1", status: "processing" }), { status: 202 });
    }
    if (target.endsWith("/background-jobs/tileset-job")) {
      const rawRgba = Buffer.from([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 255, 255
      ]).toString("base64");
      return new Response(JSON.stringify({ status: "completed", last_response: { image: { type: "base64", base64: rawRgba } } }), { status: 200 });
    }
    if (target.endsWith("/tilesets/tileset-1")) return new Response(JSON.stringify({ tileset: { tiles: [{ id: "0", corners: { NW: "lower", NE: "lower", SW: "lower", SE: "lower" }, image: { type: "base64", base64: "UE5H", format: "png" } }] } }), { status: 200 });
    throw new Error(`Unexpected PixelLab tileset URL: ${url}`);
  }
});
assert.equal(tilesetResult.files.length, 2);
assert.deepEqual([...((await fs.readFile(path.join(workspace, tilesetResult.files[0]))).subarray(0, 8))], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(await fs.readFile(path.join(workspace, tilesetResult.files[1]), "utf8"), "PNG");
assert.equal(tilesetResult.metadataFiles.length, 1);
const tilesetTopology = JSON.parse(await fs.readFile(path.join(workspace, tilesetResult.metadataFiles[0]), "utf8"));
assert.equal(tilesetTopology.tiles[0].id, "0");
assert.equal(tilesetTopology.tiles[0].corners.NW, "lower");
assert.equal(tilesetTopology.tiles[0].image.sha256, "796120837694d3f3f29259cfeb25091698c2a0aa87873658d840b4993ee889b3");

const recoveredTilesetResult = await recoverPixelLabTileset({
  spec: { ...tilesetSpec, asset: { ...tilesetSpec.asset, name: "forest-transition-recovered" } },
  tilesetId: "tileset-recovered",
  jobId: "tileset-recovered-job",
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  fetchImpl: async (url) => {
    if (String(url).endsWith("/tilesets/tileset-recovered")) {
      return new Response(JSON.stringify({ tileset: { tiles: [{ image: { type: "base64", base64: "UE5H", format: "png" } }] } }), { status: 200 });
    }
    throw new Error(`Unexpected PixelLab tileset recovery URL: ${url}`);
  }
});
assert.equal(recoveredTilesetResult.files.length, 1);
const recoveredTilesetManifest = JSON.parse(await fs.readFile(recoveredTilesetResult.manifestPath, "utf8"));
assert.equal(recoveredTilesetManifest.jobId, "tileset-recovered-job");
assert.equal(recoveredTilesetManifest.resources.tilesetId, "tileset-recovered");

const tilesetReceiptResult = await writePixelLabTilesetReceipt({
  spec: tilesetSpec,
  tilesetId: "tileset-receipt",
  jobId: "tileset-receipt-job",
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/background-jobs/tileset-receipt-job")) {
      return new Response(JSON.stringify({ status: "completed", last_response: { preview: pngData } }), { status: 200 });
    }
    if (target.endsWith("/tilesets/tileset-receipt")) {
      return new Response(JSON.stringify({
        tileset: {
          id: "tileset-receipt",
          tiles: [{
            id: "tile-1",
            corners: { nw: "grass", ne: "grass", sw: "dirt", se: "dirt" },
            connections: ["tile-2"],
            image: { type: "base64", base64: "UE5H", format: "png" }
          }]
        }
      }), { status: 200 });
    }
    throw new Error(`Unexpected PixelLab receipt URL: ${url}`);
  }
});
const tilesetReceipt = JSON.parse(await fs.readFile(tilesetReceiptResult.receiptPath, "utf8"));
assert.deepEqual(tilesetReceipt.tileset.tileset.tiles[0].corners, { nw: "grass", ne: "grass", sw: "dirt", se: "dirt" });
assert.deepEqual(tilesetReceipt.tileset.tileset.tiles[0].connections, ["tile-2"]);
assert.equal(tilesetReceipt.tileset.tileset.tiles[0].image.base64.redacted, true);
assert.equal(tilesetReceipt.tileset.tileset.tiles[0].image.base64.bytes, 3);
assert.equal(JSON.stringify(tilesetReceipt).includes("UE5H"), false);

const characterSpec = {
  provider: "pixel_lab",
  operation: "create_character_v3",
  asset: { name: "leon-v3", kind: "directional_character", outputDir: "Assets/Art/Generated" },
  input: {
    description: "original young archer hero with a blue cloak",
    imageSize: { width: 64, height: 64 },
    view: "low top-down",
    templateId: "mannequin",
    seed: 17
  }
};
const characterSubmissionReceipts = [];
const characterResult = await runAssetSpec({
  spec: characterSpec,
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  onSubmitted: async (receipt) => {
    characterSubmissionReceipts.push(receipt);
  },
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/create-character-v3")) return new Response(JSON.stringify({ background_job_id: "character-job", character_id: "character-1", status: "processing" }), { status: 200 });
    if (target.endsWith("/background-jobs/character-job")) {
      assert.equal(characterSubmissionReceipts.length, 1);
      return new Response(JSON.stringify({ status: "completed" }), { status: 200 });
    }
    if (target.endsWith("/characters/character-1")) return new Response(JSON.stringify({ id: "character-1", rotation_urls: { south: "https://download.example/leon-south.png", east: "https://download.example/leon-east.png" } }), { status: 200 });
    if (target.startsWith("https://download.example/")) return new Response(Uint8Array.from([7, 8, 9]), { status: 200, headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected PixelLab character URL: ${url}`);
  }
});
assert.deepEqual(characterSubmissionReceipts, [{
  provider: "pixel_lab",
  operation: "create_character_v3",
  jobId: "character-job",
  jobIds: ["character-job"],
  resources: { characterId: "character-1", tilesetId: null, uiAssetId: null }
}]);
assert.equal(characterResult.files.length, 2);
assert.equal(JSON.parse(await fs.readFile(characterResult.manifestPath, "utf8")).resources.characterId, "character-1");

const recoveredCharacterResult = await recoverPixelLabCharacter({
  spec: { ...characterSpec, asset: { ...characterSpec.asset, name: "leon-recovered" } },
  characterId: "character-recovered",
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/characters/character-recovered")) {
      return new Response(JSON.stringify({ id: "character-recovered", rotation_urls: { south: "https://download.example/recovered-south.png" } }), { status: 200 });
    }
    if (target.endsWith("/recovered-south.png")) return new Response(Uint8Array.from([10, 11, 12]), { status: 200, headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected PixelLab recovery URL: ${url}`);
  }
});
assert.equal(recoveredCharacterResult.files.length, 1);
assert.equal(JSON.parse(await fs.readFile(recoveredCharacterResult.manifestPath, "utf8")).resources.characterId, "character-recovered");
const firstRecoveredFile = path.join(workspace, recoveredCharacterResult.files[0]);
const replacedCharacterResult = await recoverPixelLabCharacter({
  spec: { ...characterSpec, asset: { ...characterSpec.asset, name: "leon-recovered" } },
  characterId: "character-replaced",
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/characters/character-replaced")) {
      return new Response(JSON.stringify({ id: "character-replaced", rotation_urls: { north: "https://download.example/replaced-north.png" } }), { status: 200 });
    }
    if (target.endsWith("/replaced-north.png")) return new Response(Uint8Array.from([13, 14, 15]), { status: 200, headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected PixelLab replacement URL: ${url}`);
  }
});
assert.equal(replacedCharacterResult.files.length, 1);
assert.equal(await fs.stat(firstRecoveredFile).then(() => true, () => false), false);

const animationSpec = {
  provider: "pixel_lab",
  operation: "animate_character",
  asset: { name: "leon-walk", kind: "character_animation", outputDir: "Assets/Art/Generated" },
  input: { characterId: "character-1", animationName: "walk", actionDescription: "walk", mode: "v3", frameCount: 4, directions: ["south", "north"] }
};
const defaultAnimation = validateAssetSpec({
  ...animationSpec,
  input: { characterId: "character-1", actionDescription: "walk", mode: "v3", frameCount: 8 }
}, { workspaceRoot: workspace });
assert.deepEqual(defaultAnimation.input.directions, ["south"]);
assert.throws(() => validateAssetSpec({
  ...animationSpec,
  input: { characterId: "character-1", actionDescription: "walk", mode: "v3", frameCount: 5 }
}, { workspaceRoot: workspace }), /even integer between 4 and 16/);
assert.throws(() => validateAssetSpec({
  ...animationSpec,
  input: { characterId: "character-1", mode: "template", frameCount: 4 }
}, { workspaceRoot: workspace }), /requires input.templateAnimationId/);
const animationResult = await runAssetSpec({
  spec: animationSpec,
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/animate-character")) return new Response(JSON.stringify({ background_job_ids: ["animation-south", "animation-north"], directions: ["south", "north"], status: "processing" }), { status: 200 });
    if (target.includes("/background-jobs/animation-")) return new Response(JSON.stringify({ status: "completed", last_response: { images: [{ image: { base64: pngData } }] } }), { status: 200 });
    if (target.endsWith("/characters/character-1")) return new Response(JSON.stringify({ id: "character-1" }), { status: 200 });
    if (target.endsWith("/characters/character-1/zip")) return new Response(Uint8Array.from([80, 75, 3, 4]), { status: 200, headers: { "content-type": "application/zip" } });
    throw new Error(`Unexpected PixelLab animation URL: ${url}`);
  }
});
assert.equal(animationResult.files.length, 3);
const animationManifest = JSON.parse(await fs.readFile(animationResult.manifestPath, "utf8"));
assert.equal(animationManifest.jobIds.length, 2);
assert.deepEqual(animationManifest.delivery.animation, {
  mode: "v3",
  directions: ["south", "north"],
  requestedFrameCount: 4,
  frameCountSemantics: "generated_frames_excluding_reference",
  storedFrameCount: 5,
  referenceFrameIndex: 0,
  playableFrameIndices: [1, 2, 3, 4]
});

let lockedBundleAttempts = 0;
const recoveredAnimationResult = await recoverPixelLabCharacter({
  spec: { ...animationSpec, asset: { ...animationSpec.asset, name: "leon-walk-recovered" } },
  characterId: "character-locked-bundle",
  workspaceRoot: workspace,
  env: { PIXELLAB_API_KEY: "pixel-token" },
  sleep: async () => {},
  fetchImpl: async (url) => {
    const target = String(url);
    if (target.endsWith("/characters/character-locked-bundle")) {
      return new Response(JSON.stringify({ id: "character-locked-bundle" }), { status: 200 });
    }
    if (target.endsWith("/characters/character-locked-bundle/zip")) {
      lockedBundleAttempts += 1;
      if (lockedBundleAttempts === 1) {
        return new Response("bundle is still locked", { status: 423, headers: { "retry-after": "0" } });
      }
      return new Response(Uint8Array.from([80, 75, 3, 4]), { status: 200, headers: { "content-type": "application/zip" } });
    }
    throw new Error(`Unexpected PixelLab animation recovery URL: ${url}`);
  }
});
assert.equal(lockedBundleAttempts, 2);
assert.equal(recoveredAnimationResult.files.length, 1);
assert.equal(JSON.parse(await fs.readFile(recoveredAnimationResult.manifestPath, "utf8")).resources.characterId, "character-locked-bundle");

const ledgerRoot = path.join(workspace, "run-ledger");
const ledgerSpecPath = path.join(workspace, "Art", "Requests", "leon-walk.asset.json");
await fs.mkdir(path.dirname(ledgerSpecPath), { recursive: true });
await fs.writeFile(ledgerSpecPath, JSON.stringify(animationSpec), "utf8");
const ledgerFingerprint = await specFileFingerprint(ledgerSpecPath);
await writeRunState({
  runsRoot: ledgerRoot,
  runId: "completed-run-1234",
  state: {
    runId: "completed-run-1234",
    status: "completed",
    workspaceRoot: workspace,
    specPath: ledgerSpecPath,
    specFingerprint: ledgerFingerprint,
    finishedAt: "2026-07-15T01:00:00.000Z"
  }
});
const latestLedgerRun = await findLatestRunState({
  runsRoot: ledgerRoot,
  workspaceRoot: workspace,
  specPath: ledgerSpecPath,
  specFingerprint: ledgerFingerprint,
  sameFingerprint: true
});
assert.equal(latestLedgerRun.runId, "completed-run-1234");
assert.equal(shouldReuseRun(latestLedgerRun), true);
assert.equal(shouldReuseRun({ status: "failed", submission: { jobId: "paid-job" } }), true);
assert.equal(shouldReuseRun({ status: "failed", submission: null }), true);
assert.equal(shouldReuseRun({ status: "failed", submission: null }, { retryFailed: true }), false);

const typoLedgerRoot = path.join(workspace, "typo-run-ledger");
await writeRunState({
  runsRoot: typoLedgerRoot,
  runId: "e75069c8-b476-4458-aeaa-7f701585fd18",
  state: { runId: "e75069c8-b476-4458-aeaa-7f701585fd18", status: "completed" }
});
const correctedRun = await readRunStateWithCanonicalId({
  runsRoot: typoLedgerRoot,
  runId: "e75069c8-b476-445a-aeaa-7f701585fd18"
});
assert.equal(correctedRun.corrected, true);
assert.equal(correctedRun.canonicalRunId, "e75069c8-b476-4458-aeaa-7f701585fd18");
assert.equal(correctedRun.state.status, "completed");

await writeRunState({ runsRoot: typoLedgerRoot, runId: "wait-run-1234", state: { runId: "wait-run-1234", status: "submitted" } });
let waitPolls = 0;
const waitedRun = await waitForRunState({
  runsRoot: typoLedgerRoot,
  runId: "wait-run-1234",
  timeoutMs: 1_000,
  pollMs: 1,
  sleep: async () => {
    waitPolls += 1;
    await writeRunState({ runsRoot: typoLedgerRoot, runId: "wait-run-1234", state: { runId: "wait-run-1234", status: "completed" } });
  }
});
assert.equal(waitPolls, 1);
assert.equal(waitedRun.status, "completed");
assert.equal(waitedRun.wait.terminal, true);
assert.equal(waitedRun.wait.timedOut, false);

const sourcePath = path.join(workspace, "Art", "References", "prop.png");
await fs.mkdir(path.dirname(sourcePath), { recursive: true });
await fs.writeFile(sourcePath, "PNG");
const meshySpec = {
  provider: "meshy",
  operation: "image_to_3d",
  asset: { name: "prop", kind: "3d_prop", outputDir: "Assets/Art/Generated" },
  input: { sourceImagePath: "Art/References/prop.png", shouldTexture: true, targetFormats: ["glb"] }
};
const meshyResult = await runAssetSpec({
  spec: meshySpec,
  workspaceRoot: workspace,
  env: { MESHY_API_KEY: "meshy-token" },
  sleep: async () => {},
  fetchImpl: async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/image-to-3d") && init.method === "POST") return new Response(JSON.stringify({ result: "meshy-job" }), { status: 200 });
    if (target.endsWith("/image-to-3d/meshy-job")) return new Response(JSON.stringify({ status: "SUCCEEDED", model_urls: { glb: "https://download.example/prop.glb" }, thumbnail_url: "https://download.example/prop.png" }), { status: 200 });
    if (target.endsWith("prop.glb")) return new Response(Uint8Array.from([1, 2, 3]), { status: 200 });
    if (target.endsWith("prop.png")) return new Response(Uint8Array.from([4, 5, 6]), { status: 200 });
    throw new Error(`Unexpected Meshy URL: ${url}`);
  }
});
assert.equal(meshyResult.files.length, 2);
assert.ok((await fs.readFile(path.join(workspace, meshyResult.files[0]))).length > 0);

await fs.rm(workspace, { recursive: true, force: true });
console.log("PASS Image Worker Asset Tool selects PixelLab or Meshy and records generated outputs");
