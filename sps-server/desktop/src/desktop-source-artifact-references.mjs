import { createHash } from "node:crypto";
import path from "node:path";
import { types } from "node:util";
import { requireSpsSourceArtifactInventory } from "./source-artifact-inventory.mjs";

const failure = () => new Error("Desktop Source references are unavailable or changed; preserve all package files.");
const LIMIT = 1024;

function sync(action) {
  const value = action();
  if (types.isPromise(value)) {
    Promise.prototype.then.call(value, () => {}, () => {});
    throw failure();
  }
  return value;
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > 4096 || Reflect.ownKeys(descriptors).some(key => typeof key !== "string")) throw failure();
  return descriptors;
}
function field(descriptors, key) {
  const descriptor = descriptors[key];
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor)) throw failure();
  return descriptor.value;
}
function text(value, limit = 512) {
  if (typeof value !== "string" || !value || value.length > limit || /[\u0000-\u001f\u007f\uFFFD]/.test(value)) throw failure();
  return value;
}
function localPath(value) {
  text(value, 32_768);
  if (!path.isAbsolute(value) || path.resolve(value) !== value
    || (process.platform === "win32" ? !/^[A-Za-z]:\\$/.test(path.parse(value).root) : path.parse(value).root !== "/")) throw failure();
  return value;
}

function projectSourceState(value) {
  const state = record(value);
  if (Object.keys(state).length !== 3 || ["profile", "accountConnections", "encryptedShareState"].some(key => !Object.hasOwn(state, key))) throw failure();
  const profiles = [];
  const paths = [];
  let inspected = 0;
  const inspect = () => { if (++inspected > 4096) throw failure(); };
  const add = (ownerId, value) => {
    if (value === "") return;
    if (paths.length >= LIMIT) throw failure();
    paths.push(Object.freeze({ source: "desktop-source", ownerId, state: "retained", path: localPath(value), kind: "directory" }));
  };
  const profile = (value, key) => {
    if (value === undefined || value === null) return;
    const data = record(value);
    inspect();
    const frame = { key, defaultPath: field(data, "defaultWorkspacePath"), projects: [], sources: [],
      connectionKind: field(data, "connectionKind"), hubUrl: field(data, "hubUrl"), companyId: field(data, "companyId") };
    for (const value of [frame.connectionKind, frame.hubUrl, frame.companyId]) {
      if (value !== undefined && (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f\uFFFD]/.test(value))) throw failure();
    }
    const index = profiles.length;
    if (frame.defaultPath !== undefined) {
      if (typeof frame.defaultPath !== "string") throw failure();
      add(`${index}:default`, frame.defaultPath);
    }
    const projectsValue = field(data, "projectWorkspaces");
    const projects = projectsValue === undefined ? {} : record(projectsValue);
    for (const id of Object.keys(projects).sort()) {
      inspect();
      text(id, 240);
      const value = field(projects, id);
      if (typeof value !== "string") throw failure();
      frame.projects.push([id, value]);
      add(`${index}:project:${frame.projects.length - 1}`, value);
    }
    const sources = field(data, "workspaceSources");
    if (sources !== undefined) {
      if (!Array.isArray(sources) || sources.length > LIMIT || Reflect.ownKeys(sources).length !== sources.length + 1) throw failure();
      const ids = new Set();
      for (let row = 0; row < sources.length; row++) {
        inspect();
        const slot = Object.getOwnPropertyDescriptor(sources, row);
        if (!slot?.enumerable || !("value" in slot)) throw failure();
        const source = record(slot.value);
        const id = text(field(source, "id"), 80), name = text(field(source, "name"), 96);
        const sourcePath = field(source, "sourcePath");
        if (ids.has(id) || typeof sourcePath !== "string") throw failure();
        ids.add(id);
        frame.sources.push([id, name, sourcePath]);
        add(`${index}:workspace:${row}`, sourcePath);
      }
    }
    profiles.push(frame);
    if (profiles.length > 257) throw failure();
  };
  profile(field(state, "profile"), "active");
  const connectionsValue = field(state, "accountConnections");
  const connections = connectionsValue === undefined ? {} : record(connectionsValue);
  if (Object.keys(connections).length > 256) throw failure();
  for (const subject of Object.keys(connections).sort()) {
    text(subject);
    const connection = field(connections, subject);
    if (connection === undefined || connection === null) throw failure();
    profile(connection, subject);
  }
  const encrypted = field(state, "encryptedShareState") ?? null;
  if (encrypted !== null && (typeof encrypted !== "string" || !encrypted || encrypted.length > 4 * 1024 * 1024)) throw failure();
  const bytes = JSON.stringify([profiles, encrypted]);
  if (Buffer.byteLength(bytes, "utf8") > 6 * 1024 * 1024) throw failure();
  return { paths, profiles, encrypted, fingerprint: createHash("sha256").update(bytes).digest("hex") };
}

function ownedOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw failure(); }
  if (typeof value !== "string" || value !== url.origin || url.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password) throw failure();
  return value;
}
const pathKey = value => process.platform === "win32" ? value.toLowerCase() : value;

/** Private in-memory Source metadata. No credentials or account IDs are returned. */
export function captureSpsDesktopSourceArtifactReferences({ readState, readShareState, hostOrigin = null } = {}) {
  if (typeof readState !== "function" || typeof readShareState !== "function") throw failure();
  const current = () => {
    try { return projectSourceState(sync(readState)); } catch { throw failure(); }
  };
  const initial = current();
  const origin = hostOrigin === null ? null : ownedOrigin(hostOrigin);
  const references = [...initial.paths];
  const shares = new Map();
  let protectedGrants = 0;
  if (initial.encrypted !== null) {
    let protectedState;
    try { protectedState = sync(readShareState); } catch { throw failure(); }
    const projects = record(field(record(protectedState), "projects"));
    for (const id of Object.keys(projects).sort()) {
      text(id, 240);
      if (references.length >= LIMIT) throw failure();
      const source = record(field(projects, id));
      const sourcePath = localPath(field(source, "sourcePath"));
      if (origin !== null) {
        const sharePath = text(field(source, "sharePath"), 4096);
        if (!/^\\\\[^\\/\s\u0000-\u001f\u007f]+\\[^\\/\s\u0000-\u001f\u007f]+$/.test(sharePath)) throw failure();
        const grants = record(field(source, "grants"));
        const nodeIds = Object.keys(grants).sort();
        protectedGrants += nodeIds.length;
        if (nodeIds.length > 1024 || protectedGrants > 16384) throw failure();
        for (const id of nodeIds) { text(id, 80); record(field(grants, id)); }
        shares.set(id, { sourcePath, routeFingerprint: createHash("sha256").update(sharePath.toLowerCase()).digest("hex"), nodeIds });
      }
      references.push(Object.freeze({ source: "desktop-source-share", ownerId: `share:${references.length}`,
        state: "retained", path: sourcePath, kind: "directory" }));
    }
  }
  const assertCurrent = () => {
    if (current().fingerprint !== initial.fingerprint) throw failure();
  };
  return Object.freeze({ references: Object.freeze(references), assertCurrent,
    reconcileSourceInventory(value) {
      try {
        assertCurrent();
        if (origin === null) throw failure();
        const inventory = requireSpsSourceArtifactInventory(value);
        const mappings = new Map(), grantedNodes = new Map();
        for (const profile of initial.profiles) {
          if (profile.connectionKind !== "owner-host" || profile.hubUrl !== origin) continue;
          for (const [kind, rows] of [["workspace", profile.sources.map(row => [row[0], row[2]])], ["project", profile.projects]]) {
            for (const [id, sourcePath] of rows) if (sourcePath) {
              const key = `${profile.companyId}:${kind}:${id}`;
              const paths = mappings.get(key) ?? new Set();
              paths.add(pathKey(sourcePath)); mappings.set(key, paths);
            }
          }
        }
        for (const grant of inventory.grants) if (grant.revokedAt === null) {
          const key = `${grant.kind}:${grant.sourceId}`;
          const nodes = grantedNodes.get(key) ?? [];
          nodes.push(grant.nodeId); grantedNodes.set(key, nodes);
        }
        for (const source of inventory.sources) {
          const paths = mappings.get(`${source.workspaceId}:${source.kind}:${source.kind === "workspace" ? source.id : source.resourceId}`);
          if (!paths || paths.size !== 1) throw failure();
          const share = shares.get(source.kind === "workspace" ? source.id : source.resourceId);
          const activeGrants = (grantedNodes.get(`${source.kind}:${source.id}`) ?? []).sort();
          if (source.routeFingerprint === null) {
            if (share || activeGrants.length !== 0) throw failure();
          } else if (!share || pathKey(share.sourcePath) !== [...paths][0]
            || share.routeFingerprint !== source.routeFingerprint
            || JSON.stringify(share.nodeIds) !== JSON.stringify(activeGrants)) throw failure();
        }
        assertCurrent();
        return Object.freeze({ sourceCount: inventory.sources.length, grantCount: inventory.grants.length,
          fingerprint: inventory.fingerprint });
      } catch { throw failure(); }
    } });
}
