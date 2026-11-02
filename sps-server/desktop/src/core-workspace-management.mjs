const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const ACTIONS = new Set(["pause", "stop", "resume"]);
const STATES = new Set(["running", "paused", "stopped"]);
const LANES = ["agents", "jobs", "models", "commands", "plugins"];
const unavailable = () => new Error("Workspace management is unavailable. Refresh the local Host and retry.");

function record(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("Invalid Workspace management data.");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key]?.enumerable || !("value" in fields[key]))) {
    throw new TypeError("Invalid Workspace management data.");
  }
  return Object.fromEntries(keys.map(key => [key, fields[key].value]));
}

export function requireCoreWorkspaceInput(input, action = false) {
  const value = record(input, action ? ["workspaceId", "action", "expectedRevision"] : ["workspaceId"]);
  if (typeof value.workspaceId !== "string" || !UUID.test(value.workspaceId)
    || action && (!ACTIONS.has(value.action) || !Number.isSafeInteger(value.expectedRevision)
      || value.expectedRevision < 0 || value.expectedRevision > 2_147_483_646)) {
    throw new TypeError("A canonical Workspace and current execution revision are required.");
  }
  return Object.freeze(value);
}

export function projectCoreWorkspaces(input) {
  if (!Array.isArray(input) || input.length > 200) throw unavailable();
  const ids = new Set();
  return Object.freeze(input.map(row => {
    const id = Object.getOwnPropertyDescriptor(row ?? {}, "id")?.value;
    const name = Object.getOwnPropertyDescriptor(row ?? {}, "name")?.value;
    if (typeof id !== "string" || !UUID.test(id) || ids.has(id)
      || typeof name !== "string" || !name.trim() || name.length > 512 || /[\u0000-\u001f\u007f]/.test(name)) throw unavailable();
    ids.add(id);
    return Object.freeze({ id, name });
  }));
}

export function projectCoreWorkspaceExecution(input, nativeView = false) {
  const keys = ["state", "epoch", "revision", "updatedAt", "pending", "canControl"];
  if (nativeView) keys.push("cancellationIncomplete");
  else if (input && Object.hasOwn(input, "cancellationFailures")) keys.push("cancellationFailures");
  const value = record(input, keys);
  if (!STATES.has(value.state) || typeof value.epoch !== "string" || value.epoch.length > 32
    || !/^(?:0|[1-9][0-9]*)$/.test(value.epoch) || !Number.isSafeInteger(value.revision)
    || value.revision < 0 || value.revision > 2_147_483_647 || typeof value.canControl !== "boolean"
    || value.updatedAt !== null && (typeof value.updatedAt !== "string" || value.updatedAt.length !== 24
      || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt)) throw unavailable();
  const pending = record(value.pending, LANES);
  if (LANES.some(key => !Number.isSafeInteger(pending[key]) || pending[key] < 0)
    || !Number.isSafeInteger(Object.values(pending).reduce((sum, count) => sum + count, 0))) throw unavailable();
  if (nativeView && typeof value.cancellationIncomplete !== "boolean") throw unavailable();
  let cancellationIncomplete = nativeView ? value.cancellationIncomplete : false;
  if (keys.includes("cancellationFailures")) {
    if (!Array.isArray(value.cancellationFailures) || value.cancellationFailures.length > 100
      || value.cancellationFailures.some(key => typeof key !== "string" || key.length > 120)) throw unavailable();
    cancellationIncomplete = value.cancellationFailures.length > 0;
  }
  return Object.freeze({ state: value.state, epoch: value.epoch, revision: value.revision,
    updatedAt: value.updatedAt, pending: Object.freeze(pending), canControl: value.canControl,
    cancellationIncomplete });
}

// Main-private adapter over existing Core APIs; no process spawning or workflow rules.
export function createCoreWorkspaceManagementController({ captureHost, request }) {
  if (typeof captureHost !== "function" || typeof request !== "function") throw new TypeError("Invalid Workspace management configuration.");
  let changing = false;
  function capture(assertRequester) {
    if (typeof assertRequester !== "function") throw unavailable();
    assertRequester();
    const assertHost = captureHost();
    if (typeof assertHost !== "function") throw unavailable();
    const check = () => { assertRequester(); assertHost(); };
    check();
    return check;
  }
  async function checked(check, pathname, options = {}) {
    check();
    const value = await request(pathname, { ...options, assertCurrent: check });
    check();
    return value;
  }
  const list = async check => projectCoreWorkspaces(await checked(check, "/companies"));
  async function owned(check, workspaceId) {
    if (!(await list(check)).some(row => row.id === workspaceId)) throw unavailable();
  }
  const read = async (check, workspaceId) => projectCoreWorkspaceExecution(
    await checked(check, `/companies/${workspaceId}/execution-control`, { ownerBootstrap: true }));
  return Object.freeze({
    async list({ assertRequester } = {}) { return list(capture(assertRequester)); },
    async get(input, { assertRequester } = {}) {
      const { workspaceId } = requireCoreWorkspaceInput(input);
      const check = capture(assertRequester);
      await owned(check, workspaceId);
      return read(check, workspaceId);
    },
    async change(input, { assertRequester, confirm } = {}) {
      const selected = requireCoreWorkspaceInput(input, true);
      if (typeof confirm !== "function" || changing) throw unavailable();
      changing = true;
      try {
        const check = capture(assertRequester);
        await owned(check, selected.workspaceId);
        const before = await read(check, selected.workspaceId);
        if (!before.canControl || before.revision !== selected.expectedRevision) throw unavailable();
        const accepted = await confirm(selected);
        check();
        if (accepted !== true) return { cancelled: true };
        await owned(check, selected.workspaceId);
        const current = await read(check, selected.workspaceId);
        if (!current.canControl || current.revision !== selected.expectedRevision) throw unavailable();
        return projectCoreWorkspaceExecution(await checked(check, `/companies/${selected.workspaceId}/execution-control`, {
          method: "POST", ownerBootstrap: true, body: { action: selected.action, expectedRevision: selected.expectedRevision },
        }));
      } finally { changing = false; }
    },
  });
}
