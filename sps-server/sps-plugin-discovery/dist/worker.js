// ../../external/sps-plugin-sdk/platform/index.mjs
var SPS_PLATFORM_CONTRACT_VERSION = "1.0";
var SPS_PLATFORM_CAPABILITIES = Object.freeze([
  "agent.tools.register",
  "events.subscribe",
  "events.emit",
  "jobs.schedule",
  "plugin.state.read",
  "plugin.state.write",
  "agents.read",
  "agent.sessions.create",
  "agent.sessions.list",
  "agent.sessions.send",
  "agent.sessions.read",
  "agent.sessions.cancel",
  "sps.executions.read",
  "sps.models.read",
  "sps.models.submit",
  "sps.models.cancel"
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
    }, (provider) => provider.key, "data providers"),
    actions: defineUnique(value.actions, (entry) => {
      const action = assertRecord(entry, "action registration");
      return defineDataProvider(action.key, action.handler);
    }, (action) => action.key, "actions")
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
  "executions.observe",
  "runs.observe",
  "runs.cancel",
  "artifacts.write",
  "secrets.use"
]);
var CORE_PRIMITIVE_SET = new Set(SPS_CORE_PRIMITIVES);

// ../../external/sps-plugin-sdk/runtime/host-support.mjs
var HOST_OPERATIONS = [
  "agents.describeExecution",
  "agents.list",
  "agents.sessions.cancel",
  "agents.sessions.create",
  "agents.sessions.getRun",
  "agents.sessions.list",
  "agents.sessions.sendMessage",
  "sps.artifacts.list",
  "sps.artifacts.publish",
  "sps.executionGrants.list",
  "sps.executionGrants.revoke",
  "sps.executionGrants.upsert",
  "sps.executions.get",
  "sps.executions.list",
  "sps.executions.summarize",
  "sps.models.cancel",
  "sps.models.get",
  "sps.models.list",
  "sps.models.submit",
  "sps.runs.cancel",
  "sps.runs.dispatch",
  "sps.runs.get",
  "sps.runs.list",
  "sps.runs.listEvents",
  "sps.runtimes.list",
  "sps.workspaceSources.list"
];
var SPS_HOST_OPERATIONS = Object.freeze(HOST_OPERATIONS);
var HOST_OPERATION_SET = new Set(SPS_HOST_OPERATIONS);

// ../../external/sps-plugin-sdk/runtime/index.mjs
var SPS_RUNTIME_OPERATIONS = Object.freeze([
  "sps.executions.list",
  "sps.executions.get",
  "sps.executions.summarize",
  "sps.models.list",
  "sps.models.submit",
  "sps.models.get",
  "sps.models.cancel",
  "sps.workspaceSources.list",
  "sps.runtimes.list",
  "sps.executionGrants.list",
  "sps.executionGrants.upsert",
  "sps.executionGrants.revoke",
  "sps.runs.dispatch",
  "sps.runs.get",
  "sps.runs.list",
  "sps.runs.listEvents",
  "sps.runs.cancel",
  "sps.artifacts.publish",
  "sps.artifacts.list"
]);
var OPERATION_SET = new Set(SPS_RUNTIME_OPERATIONS);
var PRIMITIVE_SET = new Set(SPS_CORE_PRIMITIVES);

// ../../external/sps-plugin-sdk/worker/index.mjs
var RUNTIME_OPERATION_SET = new Set(SPS_RUNTIME_OPERATIONS);
var LIFECYCLE_METHODS = /* @__PURE__ */ new Set(["initialize", "health", "shutdown"]);
var PLATFORM_METHODS = /* @__PURE__ */ new Set(["executeTool", "onEvent", "runJob", "getData", "performAction"]);
var PLATFORM_AGENT_OPERATIONS = Object.freeze({
  "agents.list": "agents.read",
  "agents.describeExecution": "agents.read",
  "agents.sessions.create": "agent.sessions.create",
  "agents.sessions.list": "agent.sessions.list",
  "agents.sessions.sendMessage": "agent.sessions.send",
  "agents.sessions.getRun": "agent.sessions.read",
  "agents.sessions.cancel": "agent.sessions.cancel"
});
var MODEL_OPERATION_CAPABILITIES = Object.freeze({
  "sps.models.list": "sps.models.read",
  "sps.models.submit": "sps.models.submit",
  "sps.models.get": "sps.models.read",
  "sps.models.cancel": "sps.models.cancel"
});
var PLATFORM_HOST_OPERATIONS = /* @__PURE__ */ new Set([
  "state.get",
  "state.set",
  "state.delete",
  "events.emit",
  "events.subscribe",
  "inbox.publish",
  "inbox.update",
  "inbox.withdraw",
  ...Object.keys(PLATFORM_AGENT_OPERATIONS)
]);
var EXECUTION_READ_OPERATIONS = /* @__PURE__ */ new Set(["sps.executions.list", "sps.executions.get", "sps.executions.summarize"]);
var JSON_RPC_VERSION = "2.0";
var SURFACE_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
var MODEL_UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var MODEL_REQUEST_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var MODEL_INPUT_MAX_BYTES = 65536;
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exactPlainDataRecord(value, label, allowedKeys) {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(allowedKeys);
  if (keys.length !== allowed.size || keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    throw new TypeError(`${label} must contain only ${allowedKeys.join(", ")}.`);
  }
  const result = /* @__PURE__ */ Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable own data property.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}
function normalizeModelUuid(value, label) {
  if (typeof value !== "string" || value.length !== 36 || !MODEL_UUID_RE.test(value)) throw new TypeError(`${label} must be a UUID.`);
  return value.toLowerCase();
}
function normalizeModelRequest(operation, value) {
  if (operation === "sps.models.list") {
    const input2 = exactPlainDataRecord(value, "model list input", ["companyId"]);
    return { companyId: normalizeModelUuid(input2.companyId, "companyId") };
  }
  if (operation === "sps.models.submit") {
    const input2 = exactPlainDataRecord(value, "model request input", ["companyId", "connectionId", "requestKey", "input"]);
    const requestText = input2.input;
    if (typeof requestText !== "string" || requestText.trim().length === 0 || requestText.length > MODEL_INPUT_MAX_BYTES || new TextEncoder().encode(requestText).byteLength > MODEL_INPUT_MAX_BYTES) {
      throw new TypeError("input must be a non-empty string of at most 65536 UTF-8 bytes.");
    }
    if (typeof input2.requestKey !== "string" || input2.requestKey.length > 128 || /[\r\n\u2028\u2029]/.test(input2.requestKey) || !MODEL_REQUEST_KEY_RE.test(input2.requestKey)) {
      throw new TypeError("requestKey must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.");
    }
    return {
      companyId: normalizeModelUuid(input2.companyId, "companyId"),
      connectionId: normalizeModelUuid(input2.connectionId, "connectionId"),
      requestKey: input2.requestKey,
      input: requestText
    };
  }
  const input = exactPlainDataRecord(value, "model run input", ["companyId", "runId"]);
  return {
    companyId: normalizeModelUuid(input.companyId, "companyId"),
    runId: normalizeModelUuid(input.runId, "runId")
  };
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
  const sessionCallbacks = /* @__PURE__ */ new Map();
  const invocationStorage = new AsyncLocalStorage();
  const agentTenantStorage = new AsyncLocalStorage();
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
    sessionCallbacks.clear();
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
    const id2 = `sps-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      pending.set(id2, { resolve, reject });
      try {
        const invocation = invocationStorage.getStore();
        write({ jsonrpc: JSON_RPC_VERSION, id: id2, method: operation, params: inputValue, ...invocation ? { paperclipInvocationId: invocation.id } : {} });
      } catch (cause) {
        pending.delete(id2);
        reject(toError(cause));
      }
    });
  }
  const spsTransport = Object.freeze({
    request(operation, inputValue) {
      if (!RUNTIME_OPERATION_SET.has(operation)) {
        return Promise.reject(new TypeError(`Unsupported SPS Runtime operation: ${String(operation)}.`));
      }
      const modelCapability = MODEL_OPERATION_CAPABILITIES[operation];
      if (modelCapability) {
        if (!definition.handlers.platform?.capabilities.includes(modelCapability)) {
          return Promise.reject(new Error(`Undeclared SPS Platform capability: ${modelCapability}.`));
        }
        if (lifecycleState !== "ready") {
          return Promise.reject(new Error("SPS model access requires an authenticated invocation company."));
        }
        const invocation = invocationStorage.getStore();
        if (!invocation || typeof invocation.scope?.companyId !== "string") {
          return Promise.reject(new Error("SPS model access must match the authenticated invocation company."));
        }
        let normalizedInput;
        let invocationCompanyId;
        try {
          normalizedInput = normalizeModelRequest(operation, inputValue);
          invocationCompanyId = normalizeModelUuid(invocation.scope.companyId, "authenticated invocation company");
        } catch (cause) {
          return Promise.reject(cause);
        }
        const tenant = agentTenantStorage.getStore();
        let tenantCompanyId = invocationCompanyId;
        try {
          if (typeof tenant?.companyId === "string") tenantCompanyId = normalizeModelUuid(tenant.companyId, "invocation tenant company");
          if (typeof tenant?.invocationCompanyId === "string" && normalizeModelUuid(tenant.invocationCompanyId, "authenticated invocation company") !== invocationCompanyId) {
            return Promise.reject(new Error("SPS model access must match the authenticated invocation company."));
          }
        } catch (cause) {
          return Promise.reject(cause);
        }
        if (normalizedInput.companyId !== invocationCompanyId || tenantCompanyId !== invocationCompanyId) {
          return Promise.reject(new Error("SPS model access must match the authenticated invocation company."));
        }
        return callHost(operation, normalizedInput);
      }
      if (EXECUTION_READ_OPERATIONS.has(operation)) {
        const requestedCompanyId = isRecord(inputValue) ? inputValue.companyId : void 0;
        const invocationCompanyId = invocationStorage.getStore()?.scope?.companyId;
        if (typeof requestedCompanyId !== "string" || requestedCompanyId.length === 0 || typeof invocationCompanyId !== "string" || invocationCompanyId.length === 0 || requestedCompanyId !== invocationCompanyId) {
          return Promise.reject(new Error("SPS execution access must match the authenticated invocation company."));
        }
      }
      return callHost(operation, inputValue);
    }
  });
  function agentRequest(operation, params, requireTenant = false) {
    const capability = Object.hasOwn(PLATFORM_AGENT_OPERATIONS, operation) ? PLATFORM_AGENT_OPERATIONS[operation] : void 0;
    if (!capability) {
      return Promise.reject(new TypeError(`Unsupported SPS Agent operation: ${String(operation)}.`));
    }
    if (!definition.handlers.platform?.capabilities.includes(capability)) {
      return Promise.reject(new Error(`Undeclared SPS Platform capability: ${capability}.`));
    }
    if (requireTenant) {
      const tenant = agentTenantStorage.getStore();
      const companyId = typeof tenant?.companyId === "string" ? tenant.companyId : tenant?.invocationCompanyId;
      if (typeof companyId !== "string" || companyId.length === 0 || params.companyId !== companyId || typeof tenant?.companyId === "string" && typeof tenant?.invocationCompanyId === "string" && tenant.companyId !== tenant.invocationCompanyId) {
        return Promise.reject(new Error("SPS Agent access must match the authenticated invocation company."));
      }
    }
    return callHost(operation, params);
  }
  function boundedAgentString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 160) {
      throw new TypeError(`${label} must be a non-empty string of at most 160 characters.`);
    }
    return value;
  }
  function withAgentTenant(companyId, handler) {
    const invocationCompanyId = invocationStorage.getStore()?.scope?.companyId;
    return agentTenantStorage.run({ companyId, invocationCompanyId }, handler);
  }
  const platform2 = Object.freeze({
    agents: Object.freeze({
      list(input2) {
        return agentRequest("agents.list", input2);
      },
      describeExecution(agentId, companyId) {
        try {
          return agentRequest("agents.describeExecution", {
            agentId: boundedAgentString(agentId, "agentId"),
            companyId: boundedAgentString(companyId, "companyId")
          }, true);
        } catch (cause) {
          return Promise.reject(cause);
        }
      },
      sessions: Object.freeze({
        create(agentId, companyId, options2 = {}) {
          return agentRequest("agents.sessions.create", { ...options2, agentId, companyId });
        },
        list(agentId, companyId) {
          return agentRequest("agents.sessions.list", { agentId, companyId });
        },
        async sendMessage(sessionId, companyId, options2) {
          if (options2.onEvent) sessionCallbacks.set(sessionId, options2.onEvent);
          try {
            return await agentRequest("agents.sessions.sendMessage", { sessionId, companyId, prompt: options2.prompt, ...options2.reason ? { reason: options2.reason } : {} });
          } catch (error2) {
            sessionCallbacks.delete(sessionId);
            throw error2;
          }
        },
        getRun(sessionId, companyId, runId) {
          return agentRequest("agents.sessions.getRun", { sessionId, companyId, runId }, true);
        },
        cancel(sessionId, companyId, runId) {
          return agentRequest("agents.sessions.cancel", { sessionId, companyId, runId }, true);
        }
      })
    }),
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
    const id2 = inboxString(value, "SPS Inbox action id", 100);
    if (!SURFACE_ID_RE.test(id2)) throw new TypeError("SPS Inbox action ids must use lowercase letters, numbers, dots, underscores, or hyphens.");
    return id2;
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
  function sendResponse(id2, result) {
    write({ jsonrpc: JSON_RPC_VERSION, id: id2, result: result === void 0 ? null : result });
  }
  function sendError(id2, value) {
    write({ jsonrpc: JSON_RPC_VERSION, id: id2 ?? null, error: value });
  }
  async function dispatchPlatformMethod(method, params) {
    if (method === "performAction") {
      if (!isRecord(params) || typeof params.key !== "string" || !isRecord(params.params ?? {}) || !isJsonValue2(params.params ?? {}) || !isRecord(params.actorContext) || typeof params.actorContext.companyId !== "string" || !["user", "agent", "system"].includes(params.actorContext.type) || params.companyId !== void 0 && params.actorContext.companyId !== params.companyId) throw new TypeError("Invalid authenticated performAction context.");
      const registration2 = definition.handlers.platform?.actions?.find((action) => action.key === params.key);
      if (!registration2) throw Object.assign(new Error(`Unknown SPS Platform action: ${params.key}.`), { code: -32601 });
      return withAgentTenant(params.actorContext.companyId, () => registration2.handler(params.params ?? {}, { ...platform2, companyId: params.actorContext.companyId, actor: Object.freeze({ ...params.actorContext }) }));
    }
    if (method === "getData") {
      if (!isRecord(params) || typeof params.key !== "string" || !isRecord(params.params ?? {}) || !isJsonValue2(params.params ?? {}) || params.companyId !== void 0 && typeof params.companyId !== "string" || params.renderEnvironment !== void 0 && !isJsonValue2(params.renderEnvironment)) {
        throw new TypeError("Invalid getData params.");
      }
      const registration2 = definition.handlers.platform?.data.find((provider) => provider.key === params.key);
      if (!registration2) throw Object.assign(new Error(`Unknown SPS Platform data provider: ${params.key}`), { code: -32601 });
      return withAgentTenant(params.companyId, () => registration2.handler({
        ...params.params ?? {},
        ...params.companyId === void 0 ? {} : { companyId: params.companyId },
        ...params.renderEnvironment === void 0 ? {} : { renderEnvironment: params.renderEnvironment }
      }, platform2));
    }
    if (method === "executeTool") {
      if (!isRecord(params) || typeof params.toolName !== "string" || !isJsonValue2(params.parameters) || !isJsonValue2(params.runContext)) throw new TypeError("Invalid executeTool params.");
      const registration2 = definition.handlers.platform?.tools.find((tool2) => tool2.name === params.toolName);
      if (!registration2) throw Object.assign(new Error(`Unknown SPS Platform tool: ${params.toolName}.`), { code: -32601 });
      return withAgentTenant(params.runContext.companyId, () => registration2.handler(params.parameters, params.runContext, platform2));
    }
    if (method === "onEvent") {
      if (!isRecord(params) || !isRecord(params.event) || typeof params.event.eventType !== "string" || !isJsonValue2(params.event)) throw new TypeError("Invalid onEvent params.");
      const registrations = definition.handlers.platform?.events.filter((event) => event.name === params.event.eventType) ?? [];
      if (registrations.length === 0) throw Object.assign(new Error(`Unknown SPS Platform event: ${params.event.eventType}.`), { code: -32601 });
      for (const registration2 of registrations) {
        await withAgentTenant(params.event.companyId, () => registration2.handler(params.event, platform2));
      }
      return null;
    }
    if (!isRecord(params) || !isRecord(params.job) || typeof params.job.jobKey !== "string" || !isJsonValue2(params.job)) throw new TypeError("Invalid runJob params.");
    const registration = definition.handlers.platform?.jobs.find((job) => job.jobKey === params.job.jobKey);
    if (!registration) throw Object.assign(new Error(`Unknown SPS Platform job: ${params.job.jobKey}.`), { code: -32601 });
    return withAgentTenant(params.job.companyId, () => registration.handler(params.job, platform2));
  }
  async function handleHostRequest(message) {
    const { id: id2, method } = message;
    if (!LIFECYCLE_METHODS.has(method) && !PLATFORM_METHODS.has(method)) {
      sendError(id2, error(-32601, `Unsupported SPS Worker method: ${String(method)}.`));
      return;
    }
    if (method === "initialize") {
      if (lifecycleState !== "new") {
        sendError(id2, error(-32001, "SPS Worker has already been initialized."));
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
          if (definition.handlers.platform.actions?.length > 0) supportedMethods.push("performAction");
        }
        sendResponse(id2, { ok: true, supportedMethods });
      } catch (cause) {
        lifecycleState = "new";
        const value = toError(cause, "SPS Worker initialize failed.");
        sendError(id2, error(-32e3, value.message, value.data));
      }
      return;
    }
    if (PLATFORM_METHODS.has(method)) {
      if (lifecycleState !== "ready") {
        sendError(id2, error(-32002, "SPS Worker is not initialized."));
        return;
      }
      const params = message.params;
      try {
        const result = await dispatchPlatformMethod(method, params);
        sendResponse(id2, result);
      } catch (cause) {
        const value = toError(cause, `SPS Worker ${method} failed.`);
        sendError(id2, error(value.code === -32601 ? -32601 : -32602, value.message, value.data));
      }
      return;
    }
    if (method === "health" && lifecycleState !== "ready") {
      sendError(id2, error(-32002, "SPS Worker is not initialized."));
      return;
    }
    if (method === "health" && typeof definition.handlers.health !== "function") {
      sendError(id2, error(-32601, "SPS Worker does not implement health."));
      return;
    }
    if (method === "shutdown") lifecycleState = "shutting_down";
    const handler = definition.handlers[method];
    try {
      const result = handler ? await handler({ params: message.params, spsTransport, platform: platform2, inbox, signal: controller.signal }) : null;
      sendResponse(id2, result);
      if (method === "shutdown") close(new Error("SPS Host requested shutdown."));
    } catch (cause) {
      const value = toError(cause, `SPS Worker ${method} failed.`);
      sendError(id2, error(-32e3, value.message, value.data));
      if (method === "shutdown") close(value);
    }
  }
  async function handleHostNotification(message) {
    if (message.method === "agents.sessions.event") {
      const event = message.params;
      if (lifecycleState !== "ready" || !isRecord(event) || typeof event.sessionId !== "string" || !isJsonValue2(event)) return;
      const callback = sessionCallbacks.get(event.sessionId);
      if (["done", "error"].includes(event.eventType)) sessionCallbacks.delete(event.sessionId);
      try {
        await callback?.(event);
      } catch (cause) {
        logger(`SPS session callback failed: ${toError(cause).message}`);
      }
      return;
    }
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

// src/builder-chat.js
import { randomUUID } from "node:crypto";

// src/ui-authoring-contract.js
var BUILDER_UI_AUTHORING_CONTRACT = [
  "Builder browser UI compatibility:",
  "- Import React APIs from `react`; the host resolves external React, JSX runtime, and SDK bridge dependencies.",
  "- Do not assume `globalThis.React` or `window.React` exists.",
  "- Export the named component declared by the plugin manifest.",
  "- Do not use Node-only APIs in browser UI code."
].join("\n");

// src/builder-chat.js
var namespace = "builder-chat";
var stateKey = (companyId) => ({ scopeKind: "company", scopeId: companyId, namespace, stateKey: "conversations" });
var id = () => randomUUID();
var text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
var unavailable = /* @__PURE__ */ new Set(["terminated", "paused", "pending_approval"]);
var inFlight = (status) => status === "running" || status === "cancelling";
var terminalEvent = (event) => event?.eventType === "done" || event?.eventType === "error";
function recoveredStatus(run, { lead = false } = {}) {
  if (run.status === "succeeded") return "completed";
  if (run.status === "failed" || run.status === "timed_out") return "failed";
  if (run.status === "interrupted") return "interrupted";
  if (run.status === "cancelled") return lead && run.cancellationRequested && run.termination === "confirmed" ? "cancelled" : "interrupted";
  return null;
}
function terminalEventStatus(event, currentStatus) {
  const status = event.payload?.status;
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "timed_out") return "failed";
  if (status === "interrupted") return "interrupted";
  if (status === "cancelled") return currentStatus === "cancelling" ? "cancelled" : "interrupted";
  return event.eventType === "error" ? "failed" : "completed";
}
function safeSessionEvent(event) {
  if (!event || !["chunk", "status", "done", "error"].includes(event.eventType)) return null;
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
  const result = payload.resultJson;
  const output = typeof result === "string" ? result : result && typeof result === "object" ? result.summary || result.message || result.output : "";
  return {
    runId: typeof event.runId === "string" ? event.runId : "",
    eventType: event.eventType,
    message: text(event.message, 4e3),
    payload: terminalEvent(event) ? {
      ...typeof payload.status === "string" ? { status: payload.status.slice(0, 40) } : {},
      resultJson: text(output, 1e5),
      error: text(payload.error, 4e3)
    } : null
  };
}
function createRunEventReceiver(onEvent, logger) {
  let expectedRunId = null;
  const earlyProgress = [];
  let earlyTerminal = null;
  function deliver(event) {
    void Promise.resolve(onEvent(event)).catch((error2) => logger.error?.(error2.message));
  }
  return {
    receive(event) {
      const safe = safeSessionEvent(event);
      if (!safe) return;
      if (expectedRunId === null) {
        if (terminalEvent(safe)) earlyTerminal = safe;
        else if (safe.message) {
          earlyProgress.push(safe);
          if (earlyProgress.length > 80) earlyProgress.shift();
        }
        return;
      }
      if (safe.runId === expectedRunId) deliver(safe);
    },
    bind(runId) {
      expectedRunId = runId;
      for (const event of earlyProgress) if (event.runId === runId) deliver(event);
      earlyProgress.length = 0;
      if (earlyTerminal?.runId === runId) deliver(earlyTerminal);
      earlyTerminal = null;
    }
  };
}
function hasRunIdentity(item) {
  return typeof item.sessionId === "string" && Boolean(item.sessionId) && typeof item.runId === "string" && Boolean(item.runId);
}
function createBuilderChat({ state, agents, logger = console }) {
  const queues = /* @__PURE__ */ new Map();
  const active = /* @__PURE__ */ new Map();
  const reconciled = /* @__PURE__ */ new Set();
  async function load(companyId) {
    if (!companyId || typeof companyId !== "string") throw new Error("Workspace is required.");
    const value = await state.get(stateKey(companyId));
    return Array.isArray(value) ? value : [];
  }
  function mutate(companyId, fn) {
    const operation = (queues.get(companyId) ?? Promise.resolve()).catch(() => {
    }).then(async () => {
      const conversations = await load(companyId);
      const result = await fn(conversations);
      await state.set(stateKey(companyId), conversations);
      return result;
    });
    queues.set(companyId, operation);
    return operation.finally(() => {
      if (queues.get(companyId) === operation) queues.delete(companyId);
    });
  }
  function find(conversations, conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("Conversation not found in this Workspace.");
    return conversation;
  }
  async function available(companyId) {
    return (await agents.list({ companyId, limit: 200 })).filter((agent) => !unavailable.has(agent.status));
  }
  async function validateTeam(companyId, leadId, workerIds) {
    const allowed = new Set((await available(companyId)).map((agent) => agent.id));
    if (!allowed.has(leadId)) throw new Error("Select an available Lead in this Workspace.");
    if (!Array.isArray(workerIds) || workerIds.length > 12 || new Set(workerIds).size !== workerIds.length || workerIds.some((workerId) => workerId === leadId || !allowed.has(workerId))) {
      throw new Error("Workers must be distinct available Agents, excluding the Lead.");
    }
  }
  async function view(companyId) {
    await ensureRecovery(companyId);
    const [conversations, roster] = await Promise.all([load(companyId), available(companyId)]);
    return {
      conversations,
      agents: roster.map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        adapterType: agent.adapterType,
        model: text(agent.adapterConfig?.model, 120),
        effort: text(agent.adapterConfig?.reasoningEffort, 40)
      }))
    };
  }
  async function create(companyId, input) {
    await validateTeam(companyId, input.leadId, input.workerIds ?? []);
    return mutate(companyId, (conversations) => {
      if (conversations.length >= 100) throw new Error("This Workspace has reached the 100 conversation limit.");
      const conversation = {
        id: id(),
        title: "New conversation",
        leadId: input.leadId,
        workerIds: input.workerIds ?? [],
        sessionId: null,
        messages: [],
        reports: [],
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      conversations.push(conversation);
      return conversation;
    });
  }
  async function team(companyId, input) {
    await ensureRecovery(companyId);
    await validateTeam(companyId, input.leadId, input.workerIds ?? []);
    return mutate(companyId, (conversations) => {
      const conversation = find(conversations, input.conversationId);
      if (active.has(conversation.id) || conversation.messages.some((message) => inFlight(message.status) || message.recoveryPending)) {
        throw new Error("Wait for the current or unresolved Lead run before changing the team.");
      }
      if (conversation.messages.length && conversation.leadId !== input.leadId) {
        throw new Error("Start a new conversation to change its Lead.");
      }
      conversation.leadId = input.leadId;
      conversation.workerIds = input.workerIds ?? [];
      return conversation;
    });
  }
  function attachments(value) {
    if (value === void 0) return [];
    if (!Array.isArray(value) || value.length > 4) throw new Error("Attach up to four text files.");
    return value.map((file) => {
      if (typeof file?.content !== "string" || Buffer.byteLength(file.content, "utf8") > 65536) {
        throw new Error("Each text attachment must be at most 64 KiB.");
      }
      const name = text(file.name, 120);
      if (!name || /[\\/\x00-\x1f]/.test(name)) throw new Error("Attachment name must not contain a path.");
      return { name, content: file.content };
    });
  }
  async function send(companyId, input) {
    await ensureRecovery(companyId);
    const content = text(input.message, 2e4);
    const files = attachments(input.attachments);
    if (!content && !files.length) throw new Error("Write a message or attach a text file.");
    const conversation = find(await load(companyId), input.conversationId);
    await validateTeam(companyId, conversation.leadId, conversation.workerIds);
    if (active.has(conversation.id)) throw new Error("The Lead is already replying.");
    active.set(conversation.id, true);
    let assistantId;
    let sendAttempted = false;
    try {
      await mutate(companyId, (conversations) => {
        const current = find(conversations, conversation.id);
        if (current.messages.length >= 400) throw new Error("Start a new conversation; this one has reached its message limit.");
        if (current.messages.some((message) => inFlight(message.status) || message.recoveryPending)) {
          throw new Error("The previous Lead run is still active or unresolved. Check its state before retrying.");
        }
        current.title = current.messages.length ? current.title : (content || files[0].name).slice(0, 60);
        current.messages.push({ id: id(), role: "user", content, attachments: files, at: (/* @__PURE__ */ new Date()).toISOString() });
        assistantId = id();
        current.messages.push({ id: assistantId, role: "assistant", content: "", status: "running", steps: [], at: (/* @__PURE__ */ new Date()).toISOString() });
        current.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      });
      let sessionId = conversation.sessionId;
      if (sessionId && !(await agents.sessions.list(conversation.leadId, companyId)).some((session) => session.sessionId === sessionId)) sessionId = null;
      if (!sessionId) {
        const session = await agents.sessions.create(conversation.leadId, companyId, { taskKey: `plugin:sps.plugin-discovery:session:builder:${conversation.id}`, reason: "Plugin Builder conversation" });
        sessionId = session.sessionId;
        await mutate(companyId, (conversations) => {
          find(conversations, conversation.id).sessionId = sessionId;
        });
      }
      const prompt = [
        `Plugin Builder conversation ID: ${conversation.id}. You are its Lead.`,
        `Selected Worker Agent IDs: ${conversation.workerIds.join(", ") || "none"}.`,
        BUILDER_UI_AUTHORING_CONTRACT,
        content,
        ...files.map((file) => `Attached text file: ${file.name}
${file.content}`)
      ].join("\n\n");
      await mutate(companyId, (conversations) => {
        find(conversations, conversation.id).messages.find((item) => item.id === assistantId).sessionId = sessionId;
      });
      const receiver = createRunEventReceiver((event) => recordEvent(companyId, conversation.id, assistantId, event), logger);
      sendAttempted = true;
      const result = await agents.sessions.sendMessage(sessionId, companyId, {
        prompt,
        reason: "Plugin Builder user message",
        onEvent: receiver.receive
      });
      if (typeof result?.runId !== "string" || !result.runId) throw new Error("Lead run identity was not returned.");
      await mutate(companyId, (conversations) => {
        const message = find(conversations, conversation.id).messages.find((item) => item.id === assistantId);
        message.runId = result.runId;
      });
      receiver.bind(result.runId);
      return { conversationId: conversation.id, runId: result.runId };
    } catch (error2) {
      active.delete(conversation.id);
      if (assistantId) await mutate(companyId, (conversations) => {
        const message = find(conversations, conversation.id).messages.find((item) => item.id === assistantId);
        if (inFlight(message.status)) {
          if (sendAttempted) {
            message.status = hasRunIdentity(message) ? "running" : "interrupted";
            message.recoveryPending = true;
            message.content = "The Lead request could not be confirmed. Check its execution state before retrying.";
          } else {
            message.status = "failed";
            message.recoveryPending = false;
            message.content = error2.message;
          }
        }
      });
      throw error2;
    }
  }
  async function recordEvent(companyId, conversationId, messageId, event) {
    await mutate(companyId, (conversations) => {
      const conversation = find(conversations, conversationId);
      const message = conversation.messages.find((item) => item.id === messageId);
      if (!message || !inFlight(message.status) || !message.runId || message.runId !== event.runId) return;
      const terminal = terminalEvent(event);
      if (terminal) {
        if (message.status === "cancelling" || event.payload?.status === "cancelled") {
          message.status = "cancelling";
          return;
        }
        const result = event.payload?.resultJson;
        const output = typeof result === "string" ? result : result?.summary || result?.message || result?.output;
        message.content = text(output, 1e5) || text(event.payload?.error, 4e3) || (event.eventType === "error" ? text(event.message, 4e3) : "The run finished without a text response.");
        message.status = terminalEventStatus(event, message.status);
        message.recoveryPending = false;
        active.delete(conversationId);
      } else if (event.message) {
        message.steps.push({ type: event.eventType, text: text(event.message, 2e3) });
        message.steps = message.steps.slice(-80);
      }
      conversation.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    });
  }
  async function applyRunState(companyId, conversationId, messageId, run, { recovering = false } = {}) {
    return mutate(companyId, (conversations) => {
      const message = find(conversations, conversationId).messages.find((item) => item.id === messageId);
      if (!message || message.runId !== run.runId || (recovering ? !message.recoveryPending : !inFlight(message.status))) return;
      const terminalStatus = recoveredStatus(run, { lead: true });
      const cancellationUnconfirmed = run.cancellationRequested && run.termination !== "confirmed";
      if (terminalStatus && !cancellationUnconfirmed) {
        const wasRecovering = message.recoveryPending === true;
        message.status = terminalStatus;
        message.recoveryPending = false;
        if (!message.content) message.content = run.status === "succeeded" && wasRecovering ? "The Lead run completed while Builder was restarting; its response text could not be restored." : text(run.error, 4e3);
      } else {
        message.status = run.cancellationRequested ? "cancelling" : "running";
        message.recoveryPending = recovering || cancellationUnconfirmed;
      }
      active.delete(conversationId);
    });
  }
  async function applyWorkerRunState(companyId, conversationId, reportId, run) {
    return mutate(companyId, (conversations) => {
      const report2 = find(conversations, conversationId).reports?.find((item) => item.id === reportId);
      if (!report2?.recoveryPending || report2.runId !== run.runId) return;
      const status = recoveredStatus(run);
      if (status && !(run.cancellationRequested && run.termination !== "confirmed")) {
        report2.status = status;
        report2.recoveryPending = false;
        if (!report2.content) report2.content = run.status === "succeeded" ? "The Worker run completed while Builder was restarting; its response text could not be restored." : text(run.error, 4e3);
      } else {
        report2.status = "running";
        report2.recoveryPending = true;
      }
      active.delete(report2.id);
    });
  }
  async function refreshRecovery(companyId) {
    const conversations = await load(companyId);
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (!(message.recoveryPending || message.status === "cancelling") || !hasRunIdentity(message)) continue;
        try {
          const run = await agents.sessions.getRun(message.sessionId, companyId, message.runId);
          await applyRunState(companyId, conversation.id, message.id, run, { recovering: message.recoveryPending === true });
        } catch (error2) {
          logger.warn?.(`Builder could not confirm Lead run ${message.runId}: ${error2.message}`);
        }
      }
      for (const report2 of conversation.reports ?? []) {
        if (!report2.recoveryPending || !hasRunIdentity(report2)) continue;
        try {
          const run = await agents.sessions.getRun(report2.sessionId, companyId, report2.runId);
          await applyWorkerRunState(companyId, conversation.id, report2.id, run);
        } catch (error2) {
          logger.warn?.(`Builder could not confirm Worker run ${report2.runId}: ${error2.message}`);
        }
      }
    }
  }
  async function ensureRecovery(companyId) {
    await queues.get(companyId)?.catch(() => {
    });
    if (!reconciled.has(companyId)) {
      await reconcile(companyId);
      reconciled.add(companyId);
    }
    await refreshRecovery(companyId);
  }
  async function stop(companyId, input) {
    await ensureRecovery(companyId);
    const conversation = find(await load(companyId), input.conversationId);
    const message = conversation.messages.find((item) => item.id === input.messageId);
    if (!message || message.role !== "assistant" || message.runId !== input.runId || !message.runId || !message.sessionId) {
      throw new Error("Select the exact Lead run to stop.");
    }
    if (!inFlight(message.status)) return { runId: message.runId, status: message.status };
    await mutate(companyId, (conversations) => {
      const current = find(conversations, conversation.id).messages.find((item) => item.id === message.id);
      if (inFlight(current.status)) current.status = "cancelling";
    });
    const run = await agents.sessions.cancel(message.sessionId, companyId, message.runId);
    await applyRunState(companyId, conversation.id, message.id, run);
    return run;
  }
  async function reconcile(companyId) {
    await mutate(companyId, (conversations) => {
      for (const conversation of conversations) for (const message of conversation.messages) {
        if (message.role === "assistant" && (inFlight(message.status) || message.status === "interrupted")) {
          message.recoveryPending = true;
          if (!hasRunIdentity(message)) {
            message.status = "interrupted";
            message.content = "Builder restarted without a saved run identity. This turn is unresolved and cannot be retried safely.";
          }
        }
      }
      for (const conversation of conversations) for (const report2 of conversation.reports ?? []) {
        if (report2.status === "running" || report2.status === "interrupted") {
          report2.recoveryPending = true;
          if (!hasRunIdentity(report2)) {
            report2.status = "interrupted";
            report2.content = "Builder restarted without a saved Worker run identity. This assignment is unresolved and blocks another assignment to this Worker.";
          }
        }
      }
    });
  }
  async function delegate(companyId, input, runContext) {
    await ensureRecovery(companyId);
    const conversation = find(await load(companyId), input.conversationId);
    if (runContext.agentId !== conversation.leadId || !conversation.workerIds.includes(input.workerId)) {
      throw new Error("Only this conversation's Lead can delegate to its selected Workers.");
    }
    await validateTeam(companyId, conversation.leadId, conversation.workerIds);
    const objective = text(input.objective, 2e4);
    if (!objective) throw new Error("Worker objective is required.");
    const report2 = { id: id(), workerId: input.workerId, objective, status: "running", content: "", at: (/* @__PURE__ */ new Date()).toISOString() };
    await mutate(companyId, (conversations) => {
      const current = find(conversations, conversation.id);
      if (current.reports.some((item) => item.workerId === input.workerId && (item.status === "running" || item.recoveryPending))) {
        throw new Error("This Worker already has an active or unresolved assignment.");
      }
      if (current.reports.length >= 100) throw new Error("Worker assignment limit reached.");
      current.reports.push(report2);
    });
    active.set(report2.id, true);
    let sendAttempted = false;
    try {
      const session = await agents.sessions.create(input.workerId, companyId, { taskKey: `plugin:sps.plugin-discovery:session:worker:${report2.id}`, reason: "Builder Lead delegation" });
      await mutate(companyId, (conversations) => {
        find(conversations, conversation.id).reports.find((item) => item.id === report2.id).sessionId = session.sessionId;
      });
      const receiver = createRunEventReceiver((event) => recordWorkerEvent(companyId, conversation.id, report2.id, event), logger);
      sendAttempted = true;
      const result = await agents.sessions.sendMessage(session.sessionId, companyId, {
        prompt: [BUILDER_UI_AUTHORING_CONTRACT, objective].join("\n\n"),
        reason: "Builder Worker assignment",
        onEvent: receiver.receive
      });
      if (typeof result?.runId !== "string" || !result.runId) throw new Error("Worker run identity was not returned.");
      await mutate(companyId, (conversations) => {
        find(conversations, conversation.id).reports.find((item) => item.id === report2.id).runId = result.runId;
      });
      receiver.bind(result.runId);
    } catch (error2) {
      active.delete(report2.id);
      await mutate(companyId, (conversations) => {
        const target = find(conversations, conversation.id).reports.find((item) => item.id === report2.id);
        if (inFlight(target.status)) {
          if (sendAttempted) {
            target.status = hasRunIdentity(target) ? "running" : "interrupted";
            target.recoveryPending = true;
            target.content = "The Worker request could not be confirmed. Check its execution state before retrying this assignment.";
          } else {
            target.status = "failed";
            target.recoveryPending = false;
            target.content = error2.message;
          }
        }
      });
      throw error2;
    }
    const saved = (await load(companyId)).flatMap((item) => item.reports ?? []).find((item) => item.id === report2.id);
    return { reportId: report2.id, status: saved?.status ?? "running" };
  }
  async function recordWorkerEvent(companyId, conversationId, reportId, event) {
    await mutate(companyId, (conversations) => {
      const target = find(conversations, conversationId).reports?.find((item) => item.id === reportId);
      if (!target || target.status !== "running" || target.recoveryPending || target.runId !== event.runId || !terminalEvent(event)) return;
      if (event.payload?.status === "cancelled") {
        target.recoveryPending = true;
        return;
      }
      const result = event.payload?.resultJson;
      target.status = terminalEventStatus(event, target.status);
      target.content = text(result, 1e5) || text(event.payload?.error, 4e3) || text(event.message, 4e3);
      target.recoveryPending = false;
      active.delete(reportId);
    });
  }
  async function report(companyId, input, runContext) {
    await ensureRecovery(companyId);
    const conversation = find(await load(companyId), input.conversationId);
    if (runContext.agentId !== conversation.leadId) throw new Error("Only this conversation's Lead can read Worker reports.");
    const result = conversation.reports.find((item) => item.id === input.reportId);
    if (!result) throw new Error("Worker report was not found in this conversation.");
    return result;
  }
  return { view, create, team, send, stop, reconcile, recordEvent, delegate, report };
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
    "ui.page.register",
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.read",
    "agent.sessions.cancel"
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
    packageTool,
    {
      name: "builder-delegate-worker",
      displayName: "Delegate Builder Worker",
      description: "The conversation Lead assigns a specific objective to one selected Worker. Returns a report ID; use builder-worker-result to read its status and output. Other Agents cannot delegate.",
      parametersSchema: { type: "object", properties: { conversationId: { type: "string" }, workerId: { type: "string" }, objective: { type: "string" } }, required: ["conversationId", "workerId", "objective"] }
    },
    {
      name: "builder-worker-result",
      displayName: "Read Builder Worker Result",
      description: "The conversation Lead reads the status and output of its own Worker assignment.",
      parametersSchema: { type: "object", properties: { conversationId: { type: "string" }, reportId: { type: "string" } }, required: ["conversationId", "reportId"] }
    }
  ]
};

// src/authoring.js
import { randomUUID as randomUUID2 } from "node:crypto";
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
function stateKey2(companyId) {
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
  const id2 = asString(record.id);
  if (!EVIDENCE_ID_PATTERN.test(id2)) throw new Error("Authoring evidence id is invalid.");
  const type = asString(record.type);
  const status = asString(record.status);
  if (!EVENT_TYPES.has(type) || !EVENT_STATUSES.has(status)) throw new Error("Authoring event type or status is invalid.");
  const at = asString(record.at);
  if (!Number.isFinite(Date.parse(at))) throw new Error("Authoring event timestamp is invalid.");
  return {
    id: id2,
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
  const id2 = asString(record.id);
  if (!ID_PATTERN.test(id2)) throw new Error("Authoring session id is invalid.");
  const pluginId = asString(record.pluginId);
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Plugin id is invalid.");
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Authoring session timestamp is invalid.");
  }
  return {
    id: id2,
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
    id: `spsae_${randomUUID2().replaceAll("-", "")}`,
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
    return normalizeSessions(await ctx.state.get(stateKey2(companyId)));
  }
  async function save(companyId, sessions) {
    const normalized = normalizeSessions(sessions);
    await ctx.state.set(stateKey2(companyId), normalized);
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
      id: `spsas_${randomUUID2().replaceAll("-", "")}`,
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
      let latestBuildIndex = -1;
      for (let index = session.events.length - 1; index >= 0; index -= 1) {
        if (session.events[index].type === "build") {
          latestBuildIndex = index;
          break;
        }
      }
      const latestBuild = latestBuildIndex >= 0 ? session.events[latestBuildIndex] : null;
      if (!latestBuild || latestBuild.status !== "passed") {
        throw new Error("A passed latest build inspection is required; rerun build inspection before creating a package candidate.");
      }
      if (session.events.slice(latestBuildIndex + 1).some((event) => event.type === "authoring")) {
        throw new Error("A new authoring step was recorded after the latest passed build inspection; rerun build inspection before creating a package candidate.");
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
var chatServices = /* @__PURE__ */ new WeakMap();
function chatFor(platform2) {
  let chat = chatServices.get(platform2.state);
  if (!chat) {
    chat = createBuilderChat(platform2);
    chatServices.set(platform2.state, chat);
  }
  return chat;
}
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
  capabilities: ["agent.tools.register", "plugin.state.read", "plugin.state.write", "agents.read", "agent.sessions.create", "agent.sessions.list", "agent.sessions.send", "agent.sessions.read", "agent.sessions.cancel"],
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
    }),
    ...[["builder-delegate-worker", "delegate"], ["builder-worker-result", "report"]].map(([name, method]) => ({
      name,
      declaration: declarations.get(name),
      handler: async (params, runContext, platform2) => {
        const data = await chatFor(platform2)[method](runContext.companyId, params, runContext);
        return { content: JSON.stringify(data), data };
      }
    }))
  ],
  data: [{
    key: "plugin-builder-workspace",
    handler: async (params, invocationPlatform) => ({ ...await workspaceView(authoringFor(invocationPlatform), params), ...await chatFor(invocationPlatform).view(params.companyId) })
  }],
  actions: [["builder-create", "create"], ["builder-team", "team"], ["builder-send", "send"], ["builder-stop", "stop"]].map(([key, method]) => ({
    key,
    handler: async (params, platform2) => {
      if (platform2.actor.type !== "user" || params.companyId && params.companyId !== platform2.companyId) throw new Error("An authenticated Workspace user is required.");
      return chatFor(platform2)[method](platform2.companyId, params);
    }
  }))
});
var plugin = defineSpsPlugin({ platform, health() {
  return { status: "ok", message: "Plugin Builder chat is ready." };
} });
var worker_default = plugin;
runSpsWorker(plugin);
export {
  worker_default as default
};
