import { createHash } from "node:crypto";
import path from "node:path";
import { types } from "node:util";

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
    const frame = { key, defaultPath: field(data, "defaultWorkspacePath"), projects: [], sources: [] };
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
  return { paths, encrypted, fingerprint: createHash("sha256").update(bytes).digest("hex") };
}

/** Private in-memory Source metadata. No credentials or account IDs are returned. */
export function captureSpsDesktopSourceArtifactReferences({ readState, readShareState } = {}) {
  if (typeof readState !== "function" || typeof readShareState !== "function") throw failure();
  const current = () => {
    try { return projectSourceState(sync(readState)); } catch { throw failure(); }
  };
  const initial = current();
  const references = [...initial.paths];
  if (initial.encrypted !== null) {
    let protectedState;
    try { protectedState = sync(readShareState); } catch { throw failure(); }
    const projects = record(field(record(protectedState), "projects"));
    for (const id of Object.keys(projects).sort()) {
      text(id, 240);
      if (references.length >= LIMIT) throw failure();
      const source = record(field(projects, id));
      const sourcePath = localPath(field(source, "sourcePath"));
      references.push(Object.freeze({ source: "desktop-source-share", ownerId: `share:${references.length}`,
        state: "retained", path: sourcePath, kind: "directory" }));
    }
  }
  return Object.freeze({ references: Object.freeze(references), assertCurrent() {
    if (current().fingerprint !== initial.fingerprint) throw failure();
  } });
}
