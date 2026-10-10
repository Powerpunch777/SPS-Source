import fs from "node:fs/promises";
import path from "node:path";

export const SPS_AGENT_RUNTIME_PACK_MANIFEST = "sps-agent-runtime-pack.json";

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = path.normalize(value);
  return !path.isAbsolute(normalized) && normalized !== ".." && !normalized.startsWith(`..${path.sep}`);
}

function compareVersions(left, right) {
  const parse = (value) => String(value).split(/[.+-]/).map((part) => Number(part));
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta;
  }
  return String(left).localeCompare(String(right));
}

async function pathExists(entry, fsApi = fs) {
  try {
    await fsApi.access(entry);
    return true;
  } catch {
    return false;
  }
}

async function readPack(root, fsApi = fs) {
  try {
    const manifest = JSON.parse(await fsApi.readFile(path.join(root, SPS_AGENT_RUNTIME_PACK_MANIFEST), "utf8"));
    if (!Number.isInteger(manifest?.format) || manifest.format < 1) return null;
    if (typeof manifest.id !== "string" || !manifest.id.trim()) return null;
    if (typeof manifest.version !== "string" || !manifest.version.trim()) return null;
    if (manifest.commands && (typeof manifest.commands !== "object" || Array.isArray(manifest.commands))) return null;
    return { root, manifest };
  } catch {
    return null;
  }
}

export function spsAgentRuntimePacksRoot(userDataRoot) {
  return path.join(userDataRoot, "agent-runtime-packs");
}

/** List only complete packs whose declared command files are contained in the pack. */
export async function listSpsAgentRuntimePacks({ root, fsApi = fs } = {}) {
  if (!root) return [];
  let ids;
  try {
    ids = await fsApi.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const packs = [];
  for (const id of ids) {
    if (!id.isDirectory()) continue;
    const idRoot = path.join(root, id.name);
    const direct = await readPack(idRoot, fsApi);
    const versions = direct ? [] : await fsApi.readdir(idRoot, { withFileTypes: true }).catch(() => []);
    const candidates = direct ? [direct] : await Promise.all(
      versions
        .filter((entry) => entry.isDirectory())
        .map((entry) => readPack(path.join(idRoot, entry.name), fsApi)),
    );
    for (const pack of candidates) {
      if (!pack) continue;
      const commands = Object.entries(pack.manifest.commands ?? {});
      const complete = await Promise.all(commands.map(async ([, relative]) => {
        if (!isSafeRelativePath(relative)) return false;
        const resolved = path.resolve(pack.root, relative);
        const contained = !path.relative(pack.root, resolved).startsWith("..") && !path.isAbsolute(path.relative(pack.root, resolved));
        return contained && await pathExists(resolved, fsApi);
      }));
      packs.push({
        id: pack.manifest.id,
        version: pack.manifest.version,
        label: typeof pack.manifest.label === "string" ? pack.manifest.label : pack.manifest.id,
        root: pack.root,
        commands: Object.keys(pack.manifest.commands ?? {}).sort(),
        complete: complete.every(Boolean),
        manifest: pack.manifest,
      });
    }
  }
  return packs.sort((left, right) => left.id.localeCompare(right.id) || compareVersions(right.version, left.version));
}

/**
 * Copy a user-selected, already extracted pack into the app-managed cache.
 * SPS never downloads provider code implicitly; selecting this source is the
 * explicit installation action.
 */
export async function installSpsAgentRuntimePack({ sourceRoot, root, fsApi = fs } = {}) {
  const source = sourceRoot ? path.resolve(sourceRoot) : null;
  if (!source || !root) throw new Error("Choose an Agent Runtime pack folder first.");
  const sourcePack = await readPack(source, fsApi);
  if (!sourcePack) throw new Error("The selected folder is not a valid SPS Agent Runtime pack.");
  const commands = Object.entries(sourcePack.manifest.commands ?? {});
  if (commands.length === 0) throw new Error("The selected Agent Runtime pack does not declare an executable command.");
  for (const [, relative] of commands) {
    if (!isSafeRelativePath(relative) || !await pathExists(path.join(source, relative), fsApi)) {
      throw new Error("The selected Agent Runtime pack is incomplete or has an unsafe command path.");
    }
  }

  const target = path.join(path.resolve(root), sourcePack.manifest.id, sourcePack.manifest.version);
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid Agent Runtime pack destination.");
  const staging = `${target}.staging-${process.pid}-${Date.now()}`;
  await fsApi.rm(staging, { recursive: true, force: true });
  await fsApi.mkdir(path.dirname(target), { recursive: true });
  await fsApi.cp(source, staging, { recursive: true, dereference: true });
  const staged = await readPack(staging, fsApi);
  if (!staged) {
    await fsApi.rm(staging, { recursive: true, force: true });
    throw new Error("The copied Agent Runtime pack could not be verified.");
  }
  await fsApi.rm(target, { recursive: true, force: true });
  await fsApi.rename(staging, target);
  return (await listSpsAgentRuntimePacks({ root, fsApi })).find((pack) => pack.id === sourcePack.manifest.id && pack.version === sourcePack.manifest.version) ?? null;
}

export function spsAgentRuntimePackEnvironment({ root, nodeCommand } = {}) {
  const environment = {};
  if (root) environment.PAPERCLIP_AGENT_RUNTIME_PACKS_DIR = path.resolve(root);
  if (nodeCommand) environment.SPS_OWNER_HOST_NODE = nodeCommand;
  return environment;
}
