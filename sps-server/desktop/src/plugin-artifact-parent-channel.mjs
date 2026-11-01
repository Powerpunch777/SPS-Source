import { randomUUID } from "node:crypto";
import path from "node:path";

const REQUEST = "sps.plugin-artifacts.request";
const RESPONSE = "sps.plugin-artifacts.response";
const READY = "sps.plugin-artifacts.ready";
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const SOURCES = new Set(["plugin", "pending-previous", "pending-candidate", "pending-backup", "review-previous",
  "review-candidate", "review-backup", "worker", "preparation", "registry-stage"]);
const failure = () => Object.assign(new Error("The owned Core artifact observation is unavailable; keep all package files."),
  { code: "SPS_PLUGIN_ARTIFACT_CHANNEL_UNAVAILABLE" });
function exact(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== names.length
    || names.some(key => !descriptors[key]?.enumerable || !("value" in descriptors[key]))) throw failure();
  return value;
}
const text = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const canonical = value => typeof value === "string" && value.length > 0 && value.length <= 32_768
  && !/[\u0000-\u001f\u007f]/.test(value) && path.isAbsolute(value) && path.resolve(value) === value;
function parentPaths(value) {
  if (!Array.isArray(value) || value.length > 4096 || Reflect.ownKeys(value).length !== value.length + 1
    || Object.keys(value).length !== value.length) throw failure();
  const entries = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index++) {
    if (!entries[index]?.enumerable || !("value" in entries[index])) throw failure();
  }
  const seen = new Set();
  const result = Object.freeze(Array.from({ length: value.length }, (_, index) => {
    const value = entries[index].value;
    const input = exact(value, ["source", "ownerId", "state", "path", "kind"]);
    if (!text(input.source) || !text(input.ownerId) || !text(input.state) || !canonical(input.path)
      || !["file", "directory"].includes(input.kind)) throw failure();
    const reference = { source: input.source, ownerId: input.ownerId, state: input.state, path: input.path, kind: input.kind };
    const key = JSON.stringify(reference);
    if (seen.has(key)) throw failure();
    seen.add(key);
    return Object.freeze(reference);
  }));
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 4 * 1024 * 1024) throw failure();
  return result;
}
function snapshot(value, expectedParent) {
  const input = exact(value, ["coverage", "fingerprint", "references", ...(expectedParent === undefined ? [] : ["parentPaths"])]);
  const coverage = expectedParent === undefined ? "core-only" : "core-and-parent-paths";
  if (input.coverage !== coverage || typeof input.fingerprint !== "string" || !HASH.test(input.fingerprint) || !Array.isArray(input.references)
    || input.references.length > 60_000 || Buffer.byteLength(JSON.stringify(input), "utf8") > 8 * 1024 * 1024) throw failure();
  const references = input.references.map(value => {
    const reference = exact(value, ["source", "ownerId", "state", "path", "kind", "canonicalPath"]);
    if (!SOURCES.has(reference.source) || !text(reference.ownerId) || !text(reference.state)
      || !canonical(reference.path) || !canonical(reference.canonicalPath) || !["file", "directory"].includes(reference.kind)) throw failure();
    return Object.freeze({ ...reference });
  });
  let observedParent;
  if (expectedParent !== undefined) {
    if (!Array.isArray(input.parentPaths) || input.parentPaths.length !== expectedParent.length) throw failure();
    observedParent = Object.freeze(input.parentPaths.map((value, index) => {
      const entry = exact(value, ["source", "ownerId", "state", "path", "kind", "canonicalPath"]);
      if (!canonical(entry.canonicalPath) || Object.keys(expectedParent[index]).some(key => entry[key] !== expectedParent[index][key])) throw failure();
      return Object.freeze({ ...entry });
    }));
  }
  return Object.freeze({ coverage, fingerprint: input.fingerprint, references: Object.freeze(references),
    ...(expectedParent === undefined ? {} : { parentPaths: observedParent }) });
}

/** Only an exact directly owned ChildProcess supplies this private channel. */
export function createSpsPluginArtifactParentClient(channel, { isCurrent, onUncertain = () => {}, timeoutMs = 15_000 } = {}) {
  if (!channel || typeof channel.on !== "function" || typeof channel.removeListener !== "function"
    || typeof channel.send !== "function" || typeof isCurrent !== "function" || typeof onUncertain !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError("Invalid artifact parent client.");
  let channelId = null, disposed = false, uncertain = false, active = false, uncertaintyNotified = false;
  const pending = new Map();
  const assertCurrent = () => {
    if (disposed || channel.connected !== true || isCurrent() !== true || uncertain) throw failure();
  };
  const fail = () => {
    if ((active || pending.size > 0) && !uncertaintyNotified) {
      uncertaintyNotified = true;
      try { onUncertain(); } catch { /* The current scope is still denied locally. */ }
    }
    uncertain = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(failure()); }
    pending.clear();
  };
  const onMessage = value => {
    let kind;
    try { kind = Object.getOwnPropertyDescriptor(value ?? {}, "kind")?.value; } catch { return; }
    if (kind !== READY && kind !== RESPONSE) return;
    try {
      assertCurrent();
      if (kind === READY) {
        exact(value, ["v", "kind", "channelId"]);
        if (value.v !== 1 || !UUID.test(value.channelId) || channelId !== null) throw failure();
        channelId = value.channelId;
        return;
      }
      const item = pending.get(value.id);
      if (!item) throw failure();
      exact(value, ["v", "kind", "channelId", "id", "transactionId", "operation", "ok",
        ...(value.ok === false ? ["errorCode"] : item.operation === "begin" ? ["snapshot"] : [])]);
      if (value.v !== 1 || value.channelId !== channelId || value.transactionId !== item.transactionId
        || value.operation !== item.operation || typeof value.ok !== "boolean"
        || value.ok === false && value.errorCode !== "plugin_artifact_channel_unavailable") throw failure();
      const result = value.ok && item.operation === "begin" ? snapshot(value.snapshot, item.parentPaths) : null;
      clearTimeout(item.timer); pending.delete(value.id);
      if (value.ok) item.resolve(result);
      else item.reject(failure());
    } catch { fail(); }
  };
  const request = (operation, transactionId, parentPaths) => {
    assertCurrent();
    if (!channelId) throw failure();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { fail(); }, timeoutMs);
      pending.set(id, { operation, transactionId, parentPaths, timer, resolve, reject });
      try {
        channel.send({ v: 1, kind: REQUEST, channelId, id, transactionId, operation,
          ...(parentPaths === undefined ? {} : { parentPaths }) }, error => { if (error) fail(); });
      } catch { fail(); }
    });
  };
  channel.on("message", onMessage);
  channel.on("disconnect", fail);
  channel.on("exit", fail);
  channel.on("error", fail);
  return Object.freeze({
    async withSnapshot(action, options) {
      assertCurrent();
      if (active || typeof action !== "function") throw failure();
      const paths = options === undefined ? undefined : parentPaths(exact(options, ["parentPaths"]).parentPaths);
      active = true;
      const transactionId = randomUUID();
      let begun = false, inScope = false;
      try {
        const observation = await request("begin", transactionId, paths);
        assertCurrent(); begun = true; inScope = true;
        const scope = Object.freeze({ ...observation, async assertCurrent() {
          if (!inScope) throw failure();
          assertCurrent(); await request("check", transactionId); assertCurrent();
          if (!inScope) throw failure();
        } });
        let result, error, failed = false;
        try { await scope.assertCurrent(); result = await action(scope); await scope.assertCurrent(); }
        catch (caught) { failed = true; error = caught; }
        inScope = false;
        // Never end until the real callback settles. A failed/late end receipt
        // poisons this client; only confirmed old-Core closure permits replacement.
        await request("end", transactionId);
        begun = false;
        assertCurrent();
        if (failed) throw error;
        return result;
      } catch (error) {
        if (begun || pending.size !== 0) fail();
        throw error;
      } finally { inScope = false; active = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; fail();
      channel.removeListener("message", onMessage);
      channel.removeListener("disconnect", fail);
      channel.removeListener("exit", fail);
      channel.removeListener("error", fail);
    },
  });
}
