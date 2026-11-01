import { readDeveloperProjectArtifactReferences } from "./developer-project-store.mjs";
import { readRegistrySourceArtifactReferences } from "./registry-source-catalog.mjs";
import { readSpsRuntimeConfigArtifactReferences } from "./runtime-config-artifact-references.mjs";
import { types } from "node:util";

const failure = () => new Error("Desktop artifact inputs are incomplete or changed; preserve all package files.");

/** A private input reader, not Host authorization, filesystem ownership or deletion. */
export async function readSpsDesktopPluginArtifactInputs({ vaultRoot, runtimeOwners, preview = null, configuredMemoryPath = null, assertCurrent } = {}) {
  if (!Array.isArray(runtimeOwners) || runtimeOwners.length < 1 || runtimeOwners.length > 3
    || typeof assertCurrent !== "function") throw failure();
  const owners = runtimeOwners.map(owner => {
    if (!["core", "memory"].includes(owner?.kind) || typeof owner.manager?.readRuntimeArtifactReferences !== "function") throw failure();
    return Object.freeze({ kind: owner.kind, manager: owner.manager });
  });
  if (owners.some(owner => owner.kind === "memory") !== (configuredMemoryPath !== null)) throw failure();
  const check = () => {
    const receipt = assertCurrent();
    if (receipt === undefined) return;
    // Main authority is synchronous. Drain an accidentally returned Promise's
    // rejection without accepting it or touching inputs before authorization.
    if (types.isPromise(receipt)) Promise.prototype.then.call(receipt, () => {}, () => {});
    throw failure();
  };
  const readRuntimes = () => owners.map(owner => {
    const value = owner.manager.readRuntimeArtifactReferences();
    if (value?.available !== true || !Array.isArray(value.references)) throw failure();
    return value;
  });
  check();
  const runtimes = readRuntimes();
  const signature = JSON.stringify(runtimes);
  const readers = [];
  readers.push(await readDeveloperProjectArtifactReferences({ vaultRoot })); check();
  readers.push(await readRegistrySourceArtifactReferences({ vaultRoot })); check();
  const configs = new Map();
  if (configuredMemoryPath !== null) {
    readers.push(await readSpsRuntimeConfigArtifactReferences({ configPath: configuredMemoryPath, kind: "memory" })); check();
    configs.set(JSON.stringify(["memory", configuredMemoryPath]), true);
  }
  for (const [index, runtime] of runtimes.entries()) {
    const kind = owners[index].kind;
    const selected = runtime.references.filter(reference => kind === "memory"
      ? reference.source === "desktop-memory-runtime" && reference.ownerId.endsWith(":config")
      : reference.source === "desktop-owned-runtime" && /:(?:config-argument|PAPERCLIP_CONFIG)$/.test(reference.ownerId));
    if (runtime.references.length && selected.length === 0) throw failure();
    for (const reference of selected) {
      if (reference.kind !== "file" || typeof reference.path !== "string") throw failure();
      const key = JSON.stringify([kind, reference.path]);
      if (!configs.has(key)) {
        configs.set(key, true);
        readers.push(await readSpsRuntimeConfigArtifactReferences({ configPath: reference.path, kind })); check();
      }
    }
  }
  const extra = preview ? ["fixturePath", "accessTokenPath"].map(label => Object.freeze({
    source: "desktop-preview-data", ownerId: label, state: "retained", path: preview[label], kind: "file",
  })) : [];
  const references = Object.freeze([...readers.flatMap(reader => reader.references),
    ...runtimes.flatMap(runtime => runtime.references), ...extra]);
  return Object.freeze({ references, async assertCurrent() {
    check();
    if (JSON.stringify(readRuntimes()) !== signature) throw failure();
    for (const reader of readers) { await reader.assertCurrent(); check(); }
    if (JSON.stringify(readRuntimes()) !== signature) throw failure();
  } });
}
