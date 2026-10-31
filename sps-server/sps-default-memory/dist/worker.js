// external/sps-plugin-sdk/platform/index.mjs
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
  "sps.connectivity.read",
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
  const tool = {
    name: assertNonEmptyString(name, "tool name"),
    declaration: freezeDeclaration({
      displayName: assertNonEmptyString(value.displayName, "tool displayName"),
      description: assertNonEmptyString(value.description, "tool description"),
      parametersSchema: assertJsonObject(value.parametersSchema, "tool parametersSchema")
    }),
    handler
  };
  if (typeof tool.handler !== "function") throw new TypeError("tool handler must be a function.");
  return freezeDeclaration(tool);
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
      const tool = assertRecord(entry, "tool registration");
      return defineTool(tool.name, tool.declaration, tool.handler);
    }, (tool) => tool.name, "tools"),
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

// external/sps-plugin-sdk/worker/index.mjs
import { createInterface } from "node:readline";
import { AsyncLocalStorage } from "node:async_hooks";

// external/sps-plugin-sdk/profile/extension-profile-v2.mjs
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

// external/sps-plugin-sdk/runtime/host-support.mjs
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
  "sps.connectivity.current",
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

// external/sps-plugin-sdk/runtime/index.mjs
var SPS_RUNTIME_OPERATIONS = Object.freeze([
  "sps.executions.list",
  "sps.executions.get",
  "sps.executions.summarize",
  "sps.connectivity.current",
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

// external/sps-plugin-sdk/worker/index.mjs
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
var CONNECTIVITY_OPERATION_CAPABILITIES = Object.freeze({
  "sps.connectivity.current": "sps.connectivity.read"
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
function validateHandlers(handlers2) {
  if (!isRecord(handlers2)) throw new TypeError("SPS Worker definition must be an object.");
  const result = {};
  for (const method of LIFECYCLE_METHODS) {
    if (handlers2[method] !== void 0 && typeof handlers2[method] !== "function") {
      throw new TypeError(`SPS Worker ${method} handler must be a function.`);
    }
    if (typeof handlers2[method] === "function") result[method] = handlers2[method];
  }
  const platform2 = handlers2.platform;
  if (platform2 !== void 0 && (!isRecord(platform2) || platform2.contractVersion !== "1.0" || !Array.isArray(platform2.tools) || !Array.isArray(platform2.events) || !Array.isArray(platform2.jobs) || !Array.isArray(platform2.data))) {
    throw new TypeError("SPS Worker platform must be a defineSpsPlatformContract result.");
  }
  return Object.freeze({ ...result, ...platform2 === void 0 ? {} : { platform: platform2 } });
}
function defineSpsPlugin(handlers2) {
  return Object.freeze({ handlers: validateHandlers(handlers2) });
}
function normalizePlugin(plugin2) {
  if (isRecord(plugin2) && isRecord(plugin2.handlers)) return plugin2;
  return defineSpsPlugin(plugin2);
}
function runSpsWorker(plugin2, options = {}) {
  const definition = normalizePlugin(plugin2);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const logger2 = options.logger ?? ((message) => process.stderr.write(`${message}
`));
  if (!input || typeof input.on !== "function") throw new TypeError("SPS Worker input must be a readable stream.");
  if (!output || typeof output.write !== "function") throw new TypeError("SPS Worker output must be a writable stream.");
  if (typeof logger2 !== "function") throw new TypeError("SPS Worker logger must be a function.");
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
      const connectivityCapability = CONNECTIVITY_OPERATION_CAPABILITIES[operation];
      if (connectivityCapability) {
        if (!definition.handlers.platform?.capabilities.includes(connectivityCapability)) {
          return Promise.reject(new Error(`Undeclared SPS Platform capability: ${connectivityCapability}.`));
        }
        if (lifecycleState !== "ready") {
          return Promise.reject(new Error("SPS connectivity access requires an authenticated invocation company."));
        }
        const invocation = invocationStorage.getStore();
        if (!invocation || typeof invocation.scope?.companyId !== "string") {
          return Promise.reject(new Error("SPS connectivity access requires an authenticated invocation company."));
        }
        try {
          exactPlainDataRecord(inputValue, "connectivity current input", []);
          normalizeModelUuid(invocation.scope.companyId, "authenticated invocation company");
        } catch (cause) {
          return Promise.reject(cause);
        }
        return callHost(operation, {});
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
      const registration2 = definition.handlers.platform?.tools.find((tool) => tool.name === params.toolName);
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
          if (definition.handlers.platform.actions?.length > 0) supportedMethods.push("performAction");
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
    if (message.method === "agents.sessions.event") {
      const event = message.params;
      if (lifecycleState !== "ready" || !isRecord(event) || typeof event.sessionId !== "string" || !isJsonValue2(event)) return;
      const callback = sessionCallbacks.get(event.sessionId);
      if (["done", "error"].includes(event.eventType)) sessionCallbacks.delete(event.sessionId);
      try {
        await callback?.(event);
      } catch (cause) {
        logger2(`SPS session callback failed: ${toError(cause).message}`);
      }
      return;
    }
    if (message.method !== "onEvent") {
      logger2(`SPS Worker ignored unsupported Host notification: ${String(message.method)}.`);
      return;
    }
    if (lifecycleState !== "ready") {
      logger2("SPS Worker ignored an event notification before initialization.");
      return;
    }
    try {
      await dispatchPlatformMethod(message.method, message.params);
    } catch (cause) {
      logger2(`SPS Worker event notification failed: ${toError(cause).message}`);
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
        if (isNotification) logger2("SPS Worker ignored an invalid JSON-RPC notification.");
        else sendError(null, error(-32600, "Invalid JSON-RPC request."));
        return;
      }
      const invocation = message.paperclipInvocation;
      const invoke = () => isNotification ? handleHostNotification(message) : handleHostRequest(message);
      if (invocation !== void 0 && (!isRecord(invocation) || typeof invocation.id !== "string" || invocation.id.length === 0 || !isJsonValue2(invocation.scope))) {
        if (isNotification) logger2("SPS Worker ignored a notification with invalid Host invocation metadata.");
        else sendError(message.id, error(-32600, "Invalid SPS Host invocation."));
        return;
      }
      void (invocation ? invocationStorage.run(invocation, invoke) : invoke()).catch((cause) => logger2(`SPS Worker request handling failed: ${toError(cause).message}`));
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
    logger2("SPS Worker ignored invalid JSON-RPC response.");
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

// sps-server/sps-default-memory/dist/manifest.js
var memoryRecallTool = {
  name: "memory-recall",
  displayName: "Memory Recall",
  description: "Recall approved SPS memory that is visible to the current company, project, room, task, or agent context.",
  parametersSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Short, specific recall query." },
      scopes: {
        type: "array",
        items: { type: "string" },
        description: "Optional memory scopes. Defaults to the current context."
      },
      limit: { type: "number", description: "Maximum results from 1 to 10. Defaults to 5." }
    },
    required: ["query"]
  }
};
var memoryProposeTool = {
  name: "memory-propose",
  displayName: "Memory Propose",
  description: "Record a concise, reviewable long-term-memory candidate from the current work. It does not silently rewrite source documents.",
  parametersSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The concise fact, decision, constraint, or preference to preserve." },
      scope: {
        type: "string",
        description: "Memory boundary. Use project by default; use room or task for local context and company for shared policy."
      },
      type: { type: "string", description: "Candidate type such as decision, learning, constraint, or preference." },
      tags: { type: "array", items: { type: "string" }, description: "Optional retrieval tags." },
      sourceNote: { type: "string", description: "Short explanation of why this should be remembered." }
    },
    required: ["content"]
  }
};
var manifest_default = {
  id: "sps.default-memory",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "SPS Default Memory",
  description: "First-party, local-first memory for SPS Desktop Owner Host.",
  author: "SPS",
  categories: ["automation"],
  capabilities: ["agent.tools.register", "events.subscribe", "memory.providers.register"],
  companyActivation: { defaultEnabled: false },
  agentPlatform: {
    contractVersion: "1.0",
    kind: "store_provider"
  },
  entrypoints: { worker: "./dist/worker.js" },
  tools: [memoryRecallTool, memoryProposeTool],
  memoryProvider: {
    providerKey: "sps-default",
    displayName: "SPS Default Memory",
    scopes: ["company", "project", "agent", "room", "task", "artifact", "user"],
    lifecycleEvents: ["project.created", "room.checkpoint", "room.compacted", "task.completed", "task.blocked", "task.reopened", "artifact.published"],
    recallToolName: "memory-recall",
    proposeToolName: "memory-propose",
    defaultForNewCompanies: false
  }
};

// sps-server/sps-default-memory/src/worker.js
var DEFAULT_SIDECAR_URL = "http://127.0.0.1:3188";
var MEMORY_SCOPES = /* @__PURE__ */ new Set(["company", "project", "agent", "room", "task", "artifact", "user"]);
var MEMORY_LIFECYCLE_EVENTS = /* @__PURE__ */ new Set([
  "project.created",
  "room.checkpoint",
  "room.compacted",
  "task.completed",
  "task.blocked",
  "task.reopened",
  "artifact.published"
]);
var MAX_LIMIT = 10;
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asString(value, fallback = "") {
  if (value === null || value === void 0) return fallback;
  return String(value).trim() || fallback;
}
function asStringList(value) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}
function boundedLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}
function sidecarUrl() {
  const raw = asString(process.env.SPS_MEMORY_SIDECAR_URL || process.env.MEMORY_SIDECAR_URL, DEFAULT_SIDECAR_URL);
  const url = new URL(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]";
  if (!loopback || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("SPS Default Memory must use a loopback HTTP(S) sidecar.");
  }
  return url;
}
async function sidecarRequest(pathname, { method = "GET", searchParams, body } = {}) {
  const url = new URL(pathname, sidecarUrl());
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== null && value !== void 0 && asString(value)) url.searchParams.set(key, String(value));
  }
  const token = asString(process.env.SPS_MEMORY_SIDECAR_TOKEN || process.env.MEMORY_SIDECAR_TOKEN);
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...body ? { "content-type": "application/json" } : {},
      ...token ? { "x-sidecar-token": token } : {}
    },
    body: body ? JSON.stringify(body) : void 0
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`SPS Default Memory returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data?.message || data?.error || `SPS Default Memory request failed (${response.status}).`);
  return data;
}
function contextReferences(runContext) {
  const context2 = asRecord(runContext);
  return {
    companyId: asString(context2.companyId) || null,
    projectId: asString(context2.projectId) || null,
    agentId: asString(context2.agentId) || null,
    roomId: asString(context2.roomId) || null,
    taskId: asString(context2.issueId || context2.taskId) || null,
    artifactId: asString(context2.artifactId) || null,
    userId: asString(context2.userId) || null,
    runId: asString(context2.runId) || null
  };
}
function lifecycleReferences(event) {
  const payload = asRecord(event?.payload);
  const entityId = asString(event?.entityId) || null;
  const entityType = asString(event?.entityType);
  const taskId = asString(payload.taskId || payload.issueId) || (entityType === "task" || entityType === "issue" ? entityId : null);
  const roomId = asString(payload.roomId) || (entityType === "room" ? entityId : null);
  const projectId = asString(payload.projectId) || (entityType === "project" ? entityId : null);
  const artifactId = asString(payload.artifactId) || (entityType === "artifact" ? entityId : null);
  const agentId = asString(payload.agentId) || (entityType === "agent" ? entityId : null);
  const userId = asString(payload.userId) || (entityType === "user" ? entityId : null);
  return {
    companyId: asString(event?.companyId) || null,
    projectId,
    agentId,
    roomId,
    taskId,
    issueId: taskId,
    artifactId,
    userId,
    runId: asString(payload.runId) || null
  };
}
function lifecycleScope(refs) {
  if (refs.artifactId) return "artifact";
  if (refs.taskId) return "task";
  if (refs.roomId) return "room";
  if (refs.projectId) return "project";
  if (refs.agentId) return "agent";
  if (refs.userId) return "user";
  return "company";
}
async function recordLifecycleCandidate(ctx, event) {
  if (!MEMORY_LIFECYCLE_EVENTS.has(event.eventType)) return;
  const refs = lifecycleReferences(event);
  if (!refs.companyId) return;
  const scope = lifecycleScope(refs);
  await sidecarRequest("/memory/candidates", {
    method: "POST",
    body: {
      content: `Lifecycle checkpoint: ${event.eventType} completed. Review the referenced ${scope} before promoting any long-term memory.`,
      scope,
      type: "lifecycle",
      tags: ["lifecycle", event.eventType],
      idempotencyKey: `lifecycle:${event.eventId}`,
      source: {
        kind: "sps_memory_lifecycle",
        note: event.eventType,
        eventId: event.eventId,
        runId: refs.runId
      },
      ...refs
    }
  });
  ctx.logger.info("SPS memory lifecycle candidate recorded", {
    eventId: event.eventId,
    eventType: event.eventType,
    scope
  });
}
function formatRecall(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) {
    return "No approved long-term memory matched. Continue from the active room, task, documents, and source files.";
  }
  const lines = ["# SPS Memory Recall", ""];
  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${item.scope ?? "memory"} - ${item.section ?? "Uncategorized"}`);
    if (item.date) lines.push(`Date: ${item.date}`);
    if (item.provenance?.path) lines.push(`Source: ${item.provenance.path}${item.provenance.lineStart ? `:${item.provenance.lineStart}` : ""}`);
    lines.push("");
    lines.push(asString(item.text));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
async function recall(params, runContext) {
  const input = asRecord(params);
  const query = asString(input.query);
  if (!query) return { error: "query_required", content: "Memory recall requires a non-empty query." };
  const refs = contextReferences(runContext);
  const scopes = asStringList(input.scopes).filter((scope) => MEMORY_SCOPES.has(scope));
  const data = await sidecarRequest("/memory/search", {
    searchParams: {
      q: query,
      scope: scopes.join(","),
      limit: boundedLimit(input.limit),
      ...refs
    }
  });
  return { content: formatRecall(data), data };
}
async function propose(params, runContext) {
  const input = asRecord(params);
  const content = asString(input.content);
  if (!content) return { error: "content_required", content: "Memory proposal requires concise content." };
  const scope = asString(input.scope, "project");
  if (!MEMORY_SCOPES.has(scope)) return { error: "invalid_scope", content: `Unsupported memory scope: ${scope}.` };
  const refs = contextReferences(runContext);
  const data = await sidecarRequest("/memory/candidates", {
    method: "POST",
    body: {
      content,
      scope,
      type: asString(input.type, "learning"),
      tags: asStringList(input.tags),
      source: {
        kind: "sps_agent_tool",
        note: asString(input.sourceNote) || null,
        runId: refs.runId
      },
      ...refs
    }
  });
  const candidate = data?.candidate ?? {};
  return {
    content: [
      "# Memory Candidate Recorded",
      "",
      `Candidate ID: ${candidate.id ?? "unknown"}`,
      `Scope: ${candidate.scope ?? scope}`,
      "",
      candidate.content ?? content,
      "",
      "This is reviewable memory evidence. It does not silently alter design or implementation files."
    ].join("\n"),
    data
  };
}
function safeTool(ctx, handler) {
  return async (params, runContext) => {
    try {
      return await handler(params, runContext);
    } catch (error2) {
      ctx.logger.warn("SPS Default Memory tool failed", { message: error2 instanceof Error ? error2.message : String(error2) });
      return {
        error: "memory_unavailable",
        content: "SPS Default Memory is temporarily unavailable. Continue from the active room, task, documents, and source files."
      };
    }
  };
}
var logger = Object.fromEntries(["info", "warn"].map((level) => [
  level,
  (message, details) => process.stderr.write(`${JSON.stringify({ level, message, ...details })}
`)
]));
var context = { logger };
var handlers = { "memory-recall": recall, "memory-propose": propose };
var platform = defineSpsPlatformContract({
  capabilities: ["agent.tools.register", "events.subscribe"],
  tools: manifest_default.tools.map((declaration) => ({
    name: declaration.name,
    declaration,
    handler: safeTool(context, handlers[declaration.name])
  })),
  events: [...MEMORY_LIFECYCLE_EVENTS].map((name) => ({
    name,
    handler: (event) => recordLifecycleCandidate(context, event)
  }))
});
var plugin = defineSpsPlugin({ platform });
var worker_default = plugin;
runSpsWorker(plugin);
export {
  worker_default as default
};
