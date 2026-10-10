// ../../external/sps-plugin-sdk/platform/index.mjs
var SPS_PLATFORM_CONTRACT_VERSION = "1.0";
var SPS_PLATFORM_CAPABILITIES = Object.freeze([
  "agent.tools.register",
  "events.subscribe",
  "events.emit",
  "jobs.schedule",
  "plugin.state.read",
  "plugin.state.write"
]);
var CAPABILITY_SET = new Set(SPS_PLATFORM_CAPABILITIES);
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasOnlyJsonProperties(value) {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && "value" in descriptor);
  });
}
function isJsonValue(value, ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || ancestors.has(value)) return false;
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !isJsonValue(descriptor.value, ancestors)) {
        ancestors.delete(value);
        return false;
      }
    }
    const valid2 = !Reflect.ownKeys(value).some((key) => key !== "length" && (!/^0$|^[1-9][0-9]*$/.test(String(key)) || Number(key) >= value.length));
    ancestors.delete(value);
    return valid2;
  }
  if (!isPlainObject(value) || !hasOnlyJsonProperties(value) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}
function assertJsonValue(value, label = "value") {
  if (!isJsonValue(value)) throw new TypeError(`${label} must be a finite, acyclic plain JSON value.`);
  return value;
}
function assertRecord(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object.`);
  return value;
}
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}
function freezeDeclaration(value) {
  return Object.freeze({ ...value });
}
function assertJsonObject(value, label) {
  assertJsonValue(value, label);
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain JSON object.`);
  return value;
}
function defineTool(name, declaration, handler) {
  const value = assertRecord(declaration, "tool declaration");
  const tool2 = {
    name: assertNonEmptyString(name, "tool name"),
    declaration: freezeDeclaration({
      displayName: assertNonEmptyString(value.displayName, "tool displayName"),
      description: assertNonEmptyString(value.description, "tool description"),
      parametersSchema: assertJsonObject(value.parametersSchema, "tool parametersSchema")
    }),
    handler
  };
  if (typeof tool2.handler !== "function") throw new TypeError("tool handler must be a function.");
  return freezeDeclaration(tool2);
}
function defineEvent(name, filterOrHandler, maybeHandler) {
  const event = { name: assertNonEmptyString(name, "event name") };
  if (maybeHandler === void 0) event.handler = filterOrHandler;
  else {
    event.filter = assertJsonObject(filterOrHandler, "event filter");
    event.handler = maybeHandler;
  }
  if (typeof event.handler !== "function") throw new TypeError("event handler must be a function.");
  return freezeDeclaration(event);
}
function defineJob(jobKey, handler) {
  const job = { jobKey: assertNonEmptyString(jobKey, "jobKey"), handler };
  if (typeof job.handler !== "function") throw new TypeError("job handler must be a function.");
  return freezeDeclaration(job);
}
function defineDataProvider(key, handler) {
  const provider = { key: assertNonEmptyString(key, "data provider key"), handler };
  if (typeof provider.handler !== "function") throw new TypeError("data provider handler must be a function.");
  return freezeDeclaration(provider);
}
function defineUnique(registrations, toDefinition, identity, label) {
  if (registrations === void 0) return Object.freeze([]);
  if (!Array.isArray(registrations)) throw new TypeError(`${label} must be an array.`);
  const names = /* @__PURE__ */ new Set();
  const result = registrations.map((registration) => {
    const definition = toDefinition(registration);
    const name = identity(definition);
    if (names.has(name)) throw new TypeError(`${label} contains duplicate name '${name}'.`);
    names.add(name);
    return definition;
  });
  return Object.freeze(result);
}
function defineCapabilities(capabilities) {
  if (capabilities === void 0) return Object.freeze([]);
  if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== "string")) {
    throw new TypeError("capabilities must be an array of strings.");
  }
  const unique = [...new Set(capabilities)];
  const unsupported = unique.filter((capability) => !CAPABILITY_SET.has(capability));
  if (unsupported.length > 0) throw new TypeError(`Unsupported SPS Platform capabilities: ${unsupported.join(", ")}.`);
  if (unique.length !== capabilities.length) throw new TypeError("capabilities must not contain duplicates.");
  return Object.freeze(unique);
}
function defineSpsPlatformContract(contract = {}) {
  const value = assertRecord(contract, "Platform contract");
  if (value.contractVersion !== void 0 && value.contractVersion !== SPS_PLATFORM_CONTRACT_VERSION) {
    throw new TypeError(`Platform contractVersion must be ${SPS_PLATFORM_CONTRACT_VERSION}.`);
  }
  return Object.freeze({
    contractVersion: SPS_PLATFORM_CONTRACT_VERSION,
    capabilities: defineCapabilities(value.capabilities),
    tools: defineUnique(value.tools, (entry) => {
      const tool2 = assertRecord(entry, "tool registration");
      return defineTool(tool2.name, tool2.declaration, tool2.handler);
    }, (tool2) => tool2.name, "tools"),
    events: defineUnique(value.events, (entry) => {
      const event = assertRecord(entry, "event registration");
      return Object.hasOwn(event, "filter") ? defineEvent(event.name, event.filter, event.handler) : defineEvent(event.name, event.handler);
    }, (event) => event.name, "events"),
    jobs: defineUnique(value.jobs, (entry) => {
      const job = assertRecord(entry, "job registration");
      return defineJob(job.jobKey, job.handler);
    }, (job) => job.jobKey, "jobs"),
    data: defineUnique(value.data, (entry) => {
      const provider = assertRecord(entry, "data provider registration");
      return defineDataProvider(provider.key, provider.handler);
    }, (provider) => provider.key, "data providers")
  });
}

// ../../external/sps-plugin-sdk/worker/index.mjs
import { createInterface } from "node:readline";
import { AsyncLocalStorage } from "node:async_hooks";

// ../../external/sps-plugin-sdk/profile/extension-profile-v2.mjs
var SPS_CORE_PRIMITIVES = Object.freeze([
  "workspace.sources.metadata",
  "workspace.sources.route",
  "runtimes.list",
  "runtimes.dispatch",
  "runs.observe",
  "artifacts.write",
  "secrets.use"
]);
var CORE_PRIMITIVE_SET = new Set(SPS_CORE_PRIMITIVES);

// ../../external/sps-plugin-sdk/runtime/index.mjs
var SPS_RUNTIME_OPERATIONS = Object.freeze([
  "sps.workspaceSources.list",
  "sps.runtimes.list",
  "sps.executionGrants.list",
  "sps.executionGrants.upsert",
  "sps.executionGrants.revoke",
  "sps.runs.dispatch",
  "sps.runs.get",
  "sps.runs.listEvents",
  "sps.artifacts.publish",
  "sps.artifacts.list"
]);
var OPERATION_SET = new Set(SPS_RUNTIME_OPERATIONS);
var PRIMITIVE_SET = new Set(SPS_CORE_PRIMITIVES);

// ../../external/sps-plugin-sdk/worker/index.mjs
var RUNTIME_OPERATION_SET = new Set(SPS_RUNTIME_OPERATIONS);
var LIFECYCLE_METHODS = /* @__PURE__ */ new Set(["initialize", "health", "shutdown"]);
var PLATFORM_METHODS = /* @__PURE__ */ new Set(["executeTool", "onEvent", "runJob", "getData"]);
var PLATFORM_HOST_OPERATIONS = /* @__PURE__ */ new Set([
  "state.get",
  "state.set",
  "state.delete",
  "events.emit",
  "events.subscribe",
  "inbox.publish",
  "inbox.update",
  "inbox.withdraw"
]);
var JSON_RPC_VERSION = "2.0";
var SURFACE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isJsonValue2(value, ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const valid2 = value.every((entry) => isJsonValue2(entry, ancestors));
    ancestors.delete(value);
    return valid2;
  }
  if (!isRecord(value) || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) => isJsonValue2(entry, ancestors));
  ancestors.delete(value);
  return valid;
}
function error(code, message, data) {
  const value = { code, message };
  if (data !== void 0) value.data = data;
  return value;
}
function toError(value, fallback = "Worker request failed.") {
  if (value instanceof Error) return value;
  if (isRecord(value) && typeof value.message === "string") return Object.assign(new Error(value.message), { code: value.code, data: value.data });
  return new Error(fallback);
}
function validateHandlers(handlers) {
  if (!isRecord(handlers)) throw new TypeError("SPS Worker definition must be an object.");
  const result = {};
  for (const method of LIFECYCLE_METHODS) {
    if (handlers[method] !== void 0 && typeof handlers[method] !== "function") {
      throw new TypeError(`SPS Worker ${method} handler must be a function.`);
    }
    if (typeof handlers[method] === "function") result[method] = handlers[method];
  }
  const platform2 = handlers.platform;
  if (platform2 !== void 0 && (!isRecord(platform2) || platform2.contractVersion !== "1.0" || !Array.isArray(platform2.tools) || !Array.isArray(platform2.events) || !Array.isArray(platform2.jobs) || !Array.isArray(platform2.data))) {
    throw new TypeError("SPS Worker platform must be a defineSpsPlatformContract result.");
  }
  return Object.freeze({ ...result, ...platform2 === void 0 ? {} : { platform: platform2 } });
}
function defineSpsPlugin(handlers) {
  return Object.freeze({ handlers: validateHandlers(handlers) });
}
function normalizePlugin(plugin2) {
  if (isRecord(plugin2) && isRecord(plugin2.handlers)) return plugin2;
  return defineSpsPlugin(plugin2);
}
function runSpsWorker(plugin2, options = {}) {
  const definition = normalizePlugin(plugin2);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const logger = options.logger ?? ((message) => process.stderr.write(`${message}
`));
  if (!input || typeof input.on !== "function") throw new TypeError("SPS Worker input must be a readable stream.");
  if (!output || typeof output.write !== "function") throw new TypeError("SPS Worker output must be a writable stream.");
  if (typeof logger !== "function") throw new TypeError("SPS Worker logger must be a function.");
  let nextRequestId = 1;
  let closed = false;
  let lifecycleState = "new";
  const pending = /* @__PURE__ */ new Map();
  const invocationStorage = new AsyncLocalStorage();
  const controller = new AbortController();
  let resolveClosed;
  const closedPromise = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  function write(message) {
    if (closed) throw new Error("SPS Worker transport is closed.");
    if (!isJsonValue2(message)) throw new TypeError("SPS Worker protocol messages must be JSON values.");
    output.write(`${JSON.stringify(message)}
`);
  }
  function close(reason = new Error("SPS Worker transport closed.")) {
    if (closed) return;
    closed = true;
    controller.abort(reason);
    for (const { reject } of pending.values()) reject(reason);
    pending.clear();
    reader.close();
    input.pause?.();
    resolveClosed();
  }
  function callHost(operation, inputValue) {
    if (!RUNTIME_OPERATION_SET.has(operation) && !PLATFORM_HOST_OPERATIONS.has(operation)) {
      return Promise.reject(new TypeError(`Unsupported SPS Worker-to-Host operation: ${String(operation)}.`));
    }
    if (!isJsonValue2(inputValue)) {
      return Promise.reject(new TypeError("SPS Worker request input must be JSON-serializable."));
    }
    if (closed) return Promise.reject(new Error("SPS Worker transport is closed."));
    const id = `sps-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        const invocation = invocationStorage.getStore();
        write({ jsonrpc: JSON_RPC_VERSION, id, method: operation, params: inputValue, ...invocation ? { paperclipInvocationId: invocation.id } : {} });
      } catch (cause) {
        pending.delete(id);
        reject(toError(cause));
      }
    });
  }
  const spsTransport = Object.freeze({
    request(operation, inputValue) {
      if (!RUNTIME_OPERATION_SET.has(operation)) {
        return Promise.reject(new TypeError(`Unsupported SPS Runtime operation: ${String(operation)}.`));
      }
      return callHost(operation, inputValue);
    }
  });
  const platform2 = Object.freeze({
    events: Object.freeze({
      emit(name, companyId, payload) {
        if (typeof name !== "string" || name.length === 0 || typeof companyId !== "string" || companyId.length === 0 || !isJsonValue2(payload)) {
          return Promise.reject(new TypeError("SPS Platform event emission must use non-empty names and JSON payloads."));
        }
        return callHost("events.emit", { name, companyId, payload });
      }
    }),
    state: Object.freeze({
      get(key) {
        return callHost("state.get", validateStateKey(key));
      },
      set(key, value) {
        if (!isJsonValue2(value)) return Promise.reject(new TypeError("SPS Platform state values must be JSON-serializable."));
        return callHost("state.set", { ...validateStateKey(key), value });
      },
      delete(key) {
        return callHost("state.delete", validateStateKey(key));
      }
    })
  });
  function inboxString(value, label, maxLength) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
      throw new TypeError(`${label} must be between 1 and ${maxLength} characters.`);
    }
    return value.trim();
  }
  function assertSafeNavigationTarget(value) {
    const target = inboxString(value, "SPS Inbox navigationTarget", 500);
    if (!target.startsWith("/") || target.startsWith("//") || target.includes("..")) {
      throw new TypeError("SPS Inbox navigationTarget must be a safe absolute SPS route.");
    }
    return target;
  }
  function validateInboxActionId(value) {
    const id = inboxString(value, "SPS Inbox action id", 100);
    if (!SURFACE_ID_RE.test(id)) throw new TypeError("SPS Inbox action ids must use lowercase letters, numbers, dots, underscores, or hyphens.");
    return id;
  }
  function validateInboxItem(input2) {
    if (!isRecord(input2) || typeof input2.companyId !== "string" || input2.companyId.trim().length === 0 || input2.targetUserId !== void 0 && input2.targetUserId !== null && (typeof input2.targetUserId !== "string" || input2.targetUserId.trim().length === 0) || input2.severity !== void 0 && !["info", "success", "warning", "error"].includes(input2.severity) || input2.actionIds !== void 0 && !Array.isArray(input2.actionIds) || input2.opaqueReference !== void 0 && (!isRecord(input2.opaqueReference) || !isJsonValue2(input2.opaqueReference))) {
      throw new TypeError("SPS Inbox entries require a company, JSON-safe optional fields, and a supported severity.");
    }
    if (input2.opaqueReference !== void 0 && new TextEncoder().encode(JSON.stringify(input2.opaqueReference)).byteLength > 32768) {
      throw new TypeError("SPS Inbox opaqueReference must not exceed 32 KiB.");
    }
    const externalId = inboxString(input2.externalId, "SPS Inbox externalId", 200);
    const category = inboxString(input2.category, "SPS Inbox category", 100);
    const title = inboxString(input2.title, "SPS Inbox title", 200);
    const summary = inboxString(input2.summary, "SPS Inbox summary", 2e3);
    const actionIds = input2.actionIds === void 0 ? void 0 : [...new Set(input2.actionIds.map(validateInboxActionId))];
    const navigationTarget = input2.navigationTarget === void 0 || input2.navigationTarget === null ? input2.navigationTarget : assertSafeNavigationTarget(input2.navigationTarget);
    return {
      companyId: input2.companyId.trim(),
      externalId,
      ...input2.targetUserId === void 0 ? {} : { targetUserId: input2.targetUserId === null ? null : input2.targetUserId.trim() },
      category,
      ...input2.severity === void 0 ? {} : { severity: input2.severity },
      title,
      summary,
      ...input2.navigationTarget === void 0 ? {} : { navigationTarget },
      ...actionIds === void 0 ? {} : { actionIds },
      ...input2.opaqueReference === void 0 ? {} : { opaqueReference: input2.opaqueReference }
    };
  }
  function validateInboxKey(input2) {
    if (!isRecord(input2) || typeof input2.companyId !== "string" || input2.companyId.trim().length === 0) {
      throw new TypeError("SPS Inbox keys require non-empty companyId and externalId.");
    }
    return {
      companyId: input2.companyId.trim(),
      externalId: inboxString(input2.externalId, "SPS Inbox externalId", 200)
    };
  }
  const inbox = Object.freeze({
    async publish(input2) {
      const result = await callHost("inbox.publish", validateInboxItem(input2));
      if (!isRecord(result) || typeof result.id !== "string" || typeof result.externalId !== "string") {
        throw new TypeError("SPS Host returned an invalid Inbox publish result.");
      }
      return { id: result.id, externalId: result.externalId };
    },
    async update(input2) {
      const result = await callHost("inbox.update", validateInboxItem(input2));
      if (!isRecord(result) || typeof result.id !== "string" || typeof result.externalId !== "string") {
        throw new TypeError("SPS Host returned an invalid Inbox update result.");
      }
      return { id: result.id, externalId: result.externalId };
    },
    async withdraw(input2) {
      await callHost("inbox.withdraw", validateInboxKey(input2));
    }
  });
  function validateStateKey(key) {
    if (!isRecord(key) || typeof key.scopeKind !== "string" || typeof key.stateKey !== "string" || key.stateKey.length === 0 || key.scopeId !== void 0 && (typeof key.scopeId !== "string" || key.scopeId.length === 0) || key.namespace !== void 0 && (typeof key.namespace !== "string" || key.namespace.length === 0)) {
      throw new TypeError("SPS Platform state keys must be valid JSON state keys.");
    }
    return { scopeKind: key.scopeKind, ...key.scopeId === void 0 ? {} : { scopeId: key.scopeId }, ...key.namespace === void 0 ? {} : { namespace: key.namespace }, stateKey: key.stateKey };
  }
  function sendResponse(id, result) {
    write({ jsonrpc: JSON_RPC_VERSION, id, result: result === void 0 ? null : result });
  }
  function sendError(id, value) {
    write({ jsonrpc: JSON_RPC_VERSION, id: id ?? null, error: value });
  }
  async function dispatchPlatformMethod(method, params) {
    if (method === "getData") {
      if (!isRecord(params) || typeof params.key !== "string" || !isRecord(params.params ?? {}) || !isJsonValue2(params.params ?? {}) || params.companyId !== void 0 && typeof params.companyId !== "string" || params.renderEnvironment !== void 0 && !isJsonValue2(params.renderEnvironment)) {
        throw new TypeError("Invalid getData params.");
      }
      const registration2 = definition.handlers.platform?.data.find((provider) => provider.key === params.key);
      if (!registration2) throw Object.assign(new Error(`Unknown SPS Platform data provider: ${params.key}`), { code: -32601 });
      return registration2.handler({
        ...params.params ?? {},
        ...params.companyId === void 0 ? {} : { companyId: params.companyId },
        ...params.renderEnvironment === void 0 ? {} : { renderEnvironment: params.renderEnvironment }
      }, platform2);
    }
    if (method === "executeTool") {
      if (!isRecord(params) || typeof params.toolName !== "string" || !isJsonValue2(params.parameters) || !isJsonValue2(params.runContext)) throw new TypeError("Invalid executeTool params.");
      const registration2 = definition.handlers.platform?.tools.find((tool2) => tool2.name === params.toolName);
      if (!registration2) throw Object.assign(new Error(`Unknown SPS Platform tool: ${params.toolName}.`), { code: -32601 });
      return registration2.handler(params.parameters, params.runContext, platform2);
    }
    if (method === "onEvent") {
      if (!isRecord(params) || !isRecord(params.event) || typeof params.event.eventType !== "string" || !isJsonValue2(params.event)) throw new TypeError("Invalid onEvent params.");
      const registrations = definition.handlers.platform?.events.filter((event) => event.name === params.event.eventType) ?? [];
      if (registrations.length === 0) throw Object.assign(new Error(`Unknown SPS Platform event: ${params.event.eventType}.`), { code: -32601 });
      for (const registration2 of registrations) await registration2.handler(params.event, platform2);
      return null;
    }
    if (!isRecord(params) || !isRecord(params.job) || typeof params.job.jobKey !== "string" || !isJsonValue2(params.job)) throw new TypeError("Invalid runJob params.");
    const registration = definition.handlers.platform?.jobs.find((job) => job.jobKey === params.job.jobKey);
    if (!registration) throw Object.assign(new Error(`Unknown SPS Platform job: ${params.job.jobKey}.`), { code: -32601 });
    return registration.handler(params.job, platform2);
  }
  async function handleHostRequest(message) {
    const { id, method } = message;
    if (!LIFECYCLE_METHODS.has(method) && !PLATFORM_METHODS.has(method)) {
      sendError(id, error(-32601, `Unsupported SPS Worker method: ${String(method)}.`));
      return;
    }
    if (method === "initialize") {
      if (lifecycleState !== "new") {
        sendError(id, error(-32001, "SPS Worker has already been initialized."));
        return;
      }
      lifecycleState = "initializing";
      try {
        await definition.handlers.initialize?.({ params: message.params, spsTransport, platform: platform2, inbox, signal: controller.signal });
        for (const registration of definition.handlers.platform?.events ?? []) {
          await callHost("events.subscribe", { eventPattern: registration.name, filter: registration.filter ?? null });
        }
        lifecycleState = "ready";
        const supportedMethods = ["health", "shutdown"].filter((name) => typeof definition.handlers[name] === "function");
        if (definition.handlers.platform) {
          supportedMethods.push("executeTool", "onEvent", "runJob");
          if (definition.handlers.platform.data.length > 0) supportedMethods.push("getData");
        }
        sendResponse(id, { ok: true, supportedMethods });
      } catch (cause) {
        lifecycleState = "new";
        const value = toError(cause, "SPS Worker initialize failed.");
        sendError(id, error(-32e3, value.message, value.data));
      }
      return;
    }
    if (PLATFORM_METHODS.has(method)) {
      if (lifecycleState !== "ready") {
        sendError(id, error(-32002, "SPS Worker is not initialized."));
        return;
      }
      const params = message.params;
      try {
        const result = await dispatchPlatformMethod(method, params);
        sendResponse(id, result);
      } catch (cause) {
        const value = toError(cause, `SPS Worker ${method} failed.`);
        sendError(id, error(value.code === -32601 ? -32601 : -32602, value.message, value.data));
      }
      return;
    }
    if (method === "health" && lifecycleState !== "ready") {
      sendError(id, error(-32002, "SPS Worker is not initialized."));
      return;
    }
    if (method === "health" && typeof definition.handlers.health !== "function") {
      sendError(id, error(-32601, "SPS Worker does not implement health."));
      return;
    }
    if (method === "shutdown") lifecycleState = "shutting_down";
    const handler = definition.handlers[method];
    try {
      const result = handler ? await handler({ params: message.params, spsTransport, platform: platform2, inbox, signal: controller.signal }) : null;
      sendResponse(id, result);
      if (method === "shutdown") close(new Error("SPS Host requested shutdown."));
    } catch (cause) {
      const value = toError(cause, `SPS Worker ${method} failed.`);
      sendError(id, error(-32e3, value.message, value.data));
      if (method === "shutdown") close(value);
    }
  }
  async function handleHostNotification(message) {
    if (message.method !== "onEvent") {
      logger(`SPS Worker ignored unsupported Host notification: ${String(message.method)}.`);
      return;
    }
    if (lifecycleState !== "ready") {
      logger("SPS Worker ignored an event notification before initialization.");
      return;
    }
    try {
      await dispatchPlatformMethod(message.method, message.params);
    } catch (cause) {
      logger(`SPS Worker event notification failed: ${toError(cause).message}`);
    }
  }
  function handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendError(null, error(-32700, "Parse error."));
      return;
    }
    if (!isRecord(message) || message.jsonrpc !== JSON_RPC_VERSION) {
      sendError(null, error(-32600, "Invalid JSON-RPC request."));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "method")) {
      const hasId = Object.prototype.hasOwnProperty.call(message, "id");
      const isNotification = !hasId;
      if (typeof message.method !== "string" || hasId && typeof message.id !== "string" && typeof message.id !== "number") {
        if (isNotification) logger("SPS Worker ignored an invalid JSON-RPC notification.");
        else sendError(null, error(-32600, "Invalid JSON-RPC request."));
        return;
      }
      const invocation = message.paperclipInvocation;
      const invoke = () => isNotification ? handleHostNotification(message) : handleHostRequest(message);
      if (invocation !== void 0 && (!isRecord(invocation) || typeof invocation.id !== "string" || invocation.id.length === 0 || !isJsonValue2(invocation.scope))) {
        if (isNotification) logger("SPS Worker ignored a notification with invalid Host invocation metadata.");
        else sendError(message.id, error(-32600, "Invalid SPS Host invocation."));
        return;
      }
      void (invocation ? invocationStorage.run(invocation, invoke) : invoke()).catch((cause) => logger(`SPS Worker request handling failed: ${toError(cause).message}`));
      return;
    }
    if ((typeof message.id === "string" || typeof message.id === "number") && (Object.prototype.hasOwnProperty.call(message, "result") || Object.prototype.hasOwnProperty.call(message, "error"))) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (Object.prototype.hasOwnProperty.call(message, "error")) request.reject(toError(message.error, "SPS Host RPC failed."));
      else request.resolve(message.result);
      return;
    }
    logger("SPS Worker ignored invalid JSON-RPC response.");
  }
  const reader = createInterface({ input, crlfDelay: Infinity });
  reader.on("line", handleLine);
  reader.on("close", () => close(new Error("SPS Host input stream closed.")));
  input.once?.("error", (cause) => close(toError(cause, "SPS Host input stream failed.")));
  output.once?.("error", (cause) => close(toError(cause, "SPS Worker output stream failed.")));
  return Object.freeze({
    spsTransport,
    signal: controller.signal,
    closed: closedPromise,
    shutdown(reason) {
      close(toError(reason, "SPS Worker shutdown requested."));
    }
  });
}

// src/manifest.js
var evidenceSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["workspace_file", "run", "test", "diagnostic", "artifact", "preview", "package"] },
      ref: { type: "string", description: "Opaque ID or project-relative reference. Absolute paths and URLs are rejected." },
      label: { type: "string" },
      digest: { type: "string", description: "Optional SHA-256 digest." }
    },
    required: ["kind", "ref"]
  }
};
var createPluginProjectTool = {
  name: "create-sps-plugin-project",
  displayName: "Create SPS Plugin Project",
  description: "Open an append-only SPS plugin authoring session and return the exact public project contract. The Agent performs file work with its own approved workspace tools; this call does not install or activate a plugin.",
  parametersSchema: {
    type: "object",
    properties: {
      goal: { type: "string" },
      displayName: { type: "string" },
      pluginId: { type: "string" },
      projectRef: { type: "string", description: "Project-relative or opaque reference to the external plugin project." }
    },
    required: ["goal"]
  }
};
var runAuthoringStepTool = {
  name: "run-sps-authoring-step",
  displayName: "Record SPS Authoring Step",
  description: "Record one Agent-executed authoring step and its inspectable evidence in the session ledger. This never treats an Agent claim as a passed Core build gate.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      objective: { type: "string" },
      status: { type: "string", enum: ["requested", "running", "passed", "failed", "blocked"] },
      evidence: evidenceSchema
    },
    required: ["authoringSessionId", "objective", "status"]
  }
};
var inspectBuildTool = {
  name: "inspect-sps-plugin-build",
  displayName: "Inspect SPS Plugin Build",
  description: "Attach build, validation, or test evidence to an authoring session. Desktop Developer Mode reruns mandatory gates before Preview.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      status: { type: "string", enum: ["running", "passed", "failed", "blocked"] },
      summary: { type: "string" },
      evidence: evidenceSchema
    },
    required: ["authoringSessionId", "status", "summary", "evidence"]
  }
};
var openPreviewTool = {
  name: "open-sps-plugin-preview",
  displayName: "Request SPS Plugin Preview",
  description: "Record a request to open the current verified candidate in Desktop's isolated Plugin Preview. The request does not affect the production Workspace or plugin lifecycle.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      summary: { type: "string" },
      evidence: evidenceSchema
    },
    required: ["authoringSessionId"]
  }
};
var packageTool = {
  name: "create-sps-plugin-package",
  displayName: "Create SPS Plugin Package",
  description: "Record the package produced from a passed Builder project and attach its immutable evidence. This creates a candidate package record only; it never installs, enables, updates, disables, or removes a plugin.",
  parametersSchema: {
    type: "object",
    properties: {
      authoringSessionId: { type: "string" },
      packageRef: { type: "string", description: "Project-relative or opaque reference to the package produced by the approved workspace packaging tool." },
      packageVersion: { type: "string" },
      summary: { type: "string" },
      evidence: evidenceSchema
    },
    required: ["authoringSessionId", "packageRef", "evidence"]
  }
};
var manifest_default = {
  id: "sps.plugin-discovery",
  apiVersion: 1,
  version: "0.4.0",
  displayName: "Plugin Builder",
  description: "An independent workspace for creating, validating, previewing, and packaging SPS plugins.",
  author: "SPS",
  categories: ["automation", "ui"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register"
  ],
  companyActivation: { defaultEnabled: true },
  agentPlatform: {
    contractVersion: "1.0",
    kind: "tool_provider",
    profileKey: "sps-plugin-builder"
  },
  sps: {
    contractVersion: "2.0",
    primitives: []
  },
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui-v0.4.0" },
  ui: {
    slots: [
      {
        type: "page",
        id: "plugin-builder-page",
        routePath: "builder",
        displayName: "Plugin Builder",
        exportName: "PluginBuilderPage",
        order: 1
      }
    ]
  },
  tools: [
    createPluginProjectTool,
    runAuthoringStepTool,
    inspectBuildTool,
    openPreviewTool,
    packageTool
  ]
};

// src/authoring.js
import { randomUUID } from "node:crypto";
var STATE_NAMESPACE = "discovery";
var AUTHORING_STATE_KEY = "authoring-sessions";
var MAX_SESSIONS = 24;
var MAX_EVENTS = 120;
var ID_PATTERN = /^spsas_[a-z0-9]{8,64}$/;
var EVIDENCE_ID_PATTERN = /^spsae_[a-z0-9]{8,64}$/;
var PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
var DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
var EVENT_TYPES = /* @__PURE__ */ new Set(["project", "authoring", "build", "preview", "package"]);
var EVENT_STATUSES = /* @__PURE__ */ new Set(["requested", "running", "passed", "failed", "blocked", "ready"]);
var EVIDENCE_KINDS = /* @__PURE__ */ new Set(["workspace_file", "run", "test", "diagnostic", "artifact", "preview", "package"]);
function stateKey(companyId) {
  return { scopeKind: "company", scopeId: companyId, namespace: STATE_NAMESPACE, stateKey: AUTHORING_STATE_KEY };
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function bounded(value, max, fallback = "") {
  return asString(value, fallback).slice(0, max);
}
function safeRelativeReference(value) {
  const ref = bounded(value, 500);
  if (!ref) throw new Error("Evidence reference is required.");
  if (/^(?:[a-z]:[\\/]|[\\/]{2}|\/|file:|https?:)/i.test(ref) || ref.includes("\0") || ref.split(/[\\/]/).includes("..")) {
    throw new Error("Evidence must use an opaque ID or project-relative reference.");
  }
  return ref;
}
function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((entry) => {
    const record = asRecord(entry);
    const kind = asString(record.kind);
    if (!EVIDENCE_KINDS.has(kind)) throw new Error(`Unsupported authoring evidence kind: ${kind || "missing"}.`);
    const digest = asString(record.digest).toLowerCase();
    if (digest && !DIGEST_PATTERN.test(digest)) throw new Error("Evidence digest must be SHA-256.");
    return {
      kind,
      ref: safeRelativeReference(record.ref),
      label: bounded(record.label, 160, kind),
      ...digest ? { digest } : {}
    };
  });
}
function normalizeEvent(value) {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!EVIDENCE_ID_PATTERN.test(id)) throw new Error("Authoring evidence id is invalid.");
  const type = asString(record.type);
  const status = asString(record.status);
  if (!EVENT_TYPES.has(type) || !EVENT_STATUSES.has(status)) throw new Error("Authoring event type or status is invalid.");
  const at = asString(record.at);
  if (!Number.isFinite(Date.parse(at))) throw new Error("Authoring event timestamp is invalid.");
  return {
    id,
    type,
    status,
    summary: bounded(record.summary, 2e3),
    at,
    ...asString(record.runId) ? { runId: bounded(record.runId, 120) } : {},
    evidence: normalizeEvidence(record.evidence)
  };
}
function normalizeSession(value) {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!ID_PATTERN.test(id)) throw new Error("Authoring session id is invalid.");
  const pluginId = asString(record.pluginId);
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Plugin id is invalid.");
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Authoring session timestamp is invalid.");
  }
  return {
    id,
    pluginId,
    ...asString(record.projectRef) ? { projectRef: safeRelativeReference(record.projectRef) } : {},
    displayName: bounded(record.displayName, 120, pluginId),
    goal: bounded(record.goal, 2e3),
    status: bounded(record.status, 40, "drafting"),
    createdAt,
    updatedAt,
    events: (() => {
      const events = Array.isArray(record.events) ? record.events : [];
      if (events.length > MAX_EVENTS) throw new Error("Authoring session evidence exceeds the append-only ledger limit.");
      return events.map(normalizeEvent);
    })()
  };
}
function normalizeSessions(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_SESSIONS) throw new Error("Authoring project count exceeds the append-only ledger limit.");
  return value.map(normalizeSession);
}
function eventStatusForSession(event) {
  if (event.status === "failed" || event.status === "blocked") return event.status;
  if (event.type === "package" && event.status === "passed") return "packaged";
  if (event.type === "preview" && event.status === "passed") return "previewed";
  if (event.type === "build" && event.status === "passed") return "verified";
  return "drafting";
}
function eventFromInput(type, input, runId, now) {
  const status = asString(input.status, type === "project" || type === "preview" ? "requested" : "running");
  if (!EVENT_STATUSES.has(status)) throw new Error("Authoring event status is invalid.");
  return normalizeEvent({
    id: `spsae_${randomUUID().replaceAll("-", "")}`,
    type,
    status,
    summary: bounded(input.summary ?? input.objective, 2e3, `${type} ${status}`),
    at: now(),
    runId,
    evidence: input.evidence
  });
}
function createDiscoveryAuthoringService(ctx, { now = () => (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const mutationQueues = /* @__PURE__ */ new Map();
  function mutate(companyId, operation) {
    const previous = mutationQueues.get(companyId) ?? Promise.resolve();
    const current = previous.catch(() => {
    }).then(operation);
    mutationQueues.set(companyId, current);
    return current.finally(() => {
      if (mutationQueues.get(companyId) === current) mutationQueues.delete(companyId);
    });
  }
  async function load(companyId) {
    return normalizeSessions(await ctx.state.get(stateKey(companyId)));
  }
  async function save(companyId, sessions) {
    const normalized = normalizeSessions(sessions);
    await ctx.state.set(stateKey(companyId), normalized);
    return normalized;
  }
  async function append(companyId, sessionId, event, validate = null) {
    return mutate(companyId, async () => {
      const sessions = await load(companyId);
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Authoring session was not found in this Workspace.");
      if (session.events.length >= MAX_EVENTS) {
        throw new Error("Authoring evidence ledger is full. Export or archive this project before recording more evidence.");
      }
      if (validate) validate(session);
      session.events = [...session.events, normalizeEvent(event)];
      session.updatedAt = event.at;
      session.status = eventStatusForSession(event);
      await save(companyId, sessions);
      return session;
    });
  }
  async function createProject(input, runContext) {
    const request = asRecord(input);
    const goal = bounded(request.goal, 2e3);
    if (!goal) throw new Error("A plugin goal is required.");
    const displayName = bounded(request.displayName, 120, "SPS Plugin");
    const pluginId = asString(request.pluginId, `local.${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plugin"}`);
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Plugin id must use lowercase letters, numbers, dots, underscores, or hyphens.");
    const projectRef = asString(request.projectRef) ? safeRelativeReference(request.projectRef) : "";
    const timestamp = now();
    const session = normalizeSession({
      id: `spsas_${randomUUID().replaceAll("-", "")}`,
      pluginId,
      ...projectRef ? { projectRef } : {},
      displayName,
      goal,
      status: "drafting",
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [eventFromInput("project", {
        status: "requested",
        summary: `Create a separate plugin project for ${displayName}.`
      }, runContext.runId, now)]
    });
    return mutate(runContext.companyId, async () => {
      const sessions = await load(runContext.companyId);
      if (sessions.length >= MAX_SESSIONS) {
        throw new Error("Plugin Builder project limit reached. Export or archive an existing project before starting another.");
      }
      await save(runContext.companyId, [...sessions, session]);
      return session;
    });
  }
  async function runStep(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("authoring", request, runContext.runId, now));
  }
  async function inspectBuild(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("build", request, runContext.runId, now));
  }
  async function requestPreview(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("preview", {
      ...request,
      status: "requested",
      summary: request.summary ?? "Open the verified candidate in the isolated Plugin Preview."
    }, runContext.runId, now));
  }
  async function createPackage(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    const packageRef = safeRelativeReference(request.packageRef);
    const packageVersion = bounded(request.packageVersion, 80);
    const summary = bounded(request.summary, 2e3, "Created an SPS plugin package candidate from the verified Builder project.");
    return append(runContext.companyId, sessionId, eventFromInput("package", {
      ...request,
      status: "passed",
      summary: packageVersion ? `${summary} Version: ${packageVersion}.` : summary,
      evidence: [...Array.isArray(request.evidence) ? request.evidence : [], { kind: "package", ref: packageRef, label: "SPS plugin package" }]
    }, runContext.runId, now), (session) => {
      const build = [...session.events].reverse().find((event) => event.type === "build");
      if (!build || build.status !== "passed") {
        throw new Error("A passed latest build inspection is required before creating a package candidate.");
      }
    });
  }
  return { load, createProject, runStep, inspectBuild, requestPreview, createPackage };
}
var discoveryAuthoringState = Object.freeze({
  namespace: STATE_NAMESPACE,
  stateKey: AUTHORING_STATE_KEY,
  maxSessions: MAX_SESSIONS,
  maxEvents: MAX_EVENTS
});

// src/worker.js
var authoringServices = /* @__PURE__ */ new WeakMap();
function authoringFor(platform2) {
  let authoring = authoringServices.get(platform2);
  if (!authoring) {
    authoring = createDiscoveryAuthoringService({ state: platform2.state });
    authoringServices.set(platform2, authoring);
  }
  return authoring;
}
function safeTool(name, handler) {
  return async (params, runContext, platform2) => {
    try {
      return await handler(authoringFor(platform2), params, runContext);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      process.stderr.write(`SPS Plugin Builder tool failed (${name}): ${message}
`);
      return { error: "plugin_builder_unavailable", content: message };
    }
  };
}
async function workspaceView(authoring, params) {
  const sessions = await authoring.load(params.companyId);
  return { authoringSessions: sessions, authoringSessionCount: sessions.length, activeAuthoringSession: sessions.at(-1) ?? null };
}
var declarations = new Map(manifest_default.tools.map((tool2) => [tool2.name, tool2]));
function tool(name, handler) {
  const declaration = declarations.get(name);
  if (!declaration) throw new Error(`Plugin Builder manifest is missing tool '${name}'.`);
  return {
    name,
    declaration: {
      displayName: declaration.displayName,
      description: declaration.description,
      parametersSchema: declaration.parametersSchema
    },
    handler: safeTool(name, handler)
  };
}
var platform = defineSpsPlatformContract({
  capabilities: ["agent.tools.register", "plugin.state.read", "plugin.state.write"],
  tools: [
    tool("create-sps-plugin-project", async (authoring, params, runContext) => {
      const session = await authoring.createProject(params, runContext);
      return {
        content: `Opened SPS plugin authoring session ${session.id} for ${session.pluginId}. Create project files only with the Agent's approved workspace tools, then attach relative evidence with the authoring tools. No plugin lifecycle action was taken.`,
        data: { authoringSessionId: session.id, pluginId: session.pluginId, displayName: session.displayName, status: session.status }
      };
    }),
    tool("run-sps-authoring-step", async (authoring, params, runContext) => {
      const session = await authoring.runStep(params, runContext);
      return {
        content: `Recorded the authoring step for ${session.pluginId}. This evidence is advisory until Desktop reruns the mandatory build, validation, and test gates.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) }
      };
    }),
    tool("inspect-sps-plugin-build", async (authoring, params, runContext) => {
      const session = await authoring.inspectBuild(params, runContext);
      return {
        content: `Attached build evidence for ${session.pluginId}. Open Desktop Developer Mode to reproduce the three mandatory gates before Preview.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) }
      };
    }),
    tool("open-sps-plugin-preview", async (authoring, params, runContext) => {
      const session = await authoring.requestPreview(params, runContext);
      return {
        content: `Recorded an isolated Preview request for ${session.pluginId}. The Host must connect the project and pass Desktop's build, validation, and test gates before Preview opens.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) }
      };
    }),
    tool("create-sps-plugin-package", async (authoring, params, runContext) => {
      const session = await authoring.createPackage(params, runContext);
      return {
        content: `Recorded the SPS package candidate for ${session.pluginId}. Host lifecycle state was not changed.`,
        data: { authoringSessionId: session.id, pluginId: session.pluginId, status: session.status, event: session.events.at(-1) }
      };
    })
  ],
  data: [{
    key: "plugin-builder-workspace",
    handler: (params, invocationPlatform) => workspaceView(authoringFor(invocationPlatform), params)
  }]
});
var plugin = defineSpsPlugin({
  platform,
  health() {
    return { status: "ok", message: "SPS Plugin Builder is ready for external project authoring." };
  }
});
var worker_default = plugin;
runSpsWorker(plugin);
export {
  worker_default as default
};
