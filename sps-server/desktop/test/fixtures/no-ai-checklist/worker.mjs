import { randomUUID } from "node:crypto";
import { defineSpsPlugin } from "@sonparkserver/plugin-sdk/worker";
import { defineSpsPlatformContract, defineSpsStateKey } from "@sonparkserver/plugin-sdk/platform";

const STATE_NAMESPACE = "no-ai-checklist";
const ITEMS_KEY = "items";
const EVENT_COUNT_KEY = "event-count";
const JOB_COUNT_KEY = "job-count";
const EVENT_NAME = "plugin.local.no-ai-checklist.changed";
const JOB_KEY = "checklist-audit";
const MAX_ITEMS = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_ID_LENGTH = 100;

export const CHECKLIST_CAPABILITIES = Object.freeze([
  "plugin.state.read",
  "plugin.state.write",
  "events.emit",
  "events.subscribe",
  "jobs.schedule",
]);

function requireCompanyId(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} requires a non-empty companyId.`);
  }
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function stateKey(companyId, key) {
  return defineSpsStateKey({
    scopeKind: "company",
    scopeId: companyId,
    namespace: STATE_NAMESPACE,
    stateKey: key,
  });
}

function validateItems(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new TypeError("Stored checklist items are corrupt.");
  }
  const ids = new Set();
  return value.map((item) => {
    requireRecord(item, "Stored checklist item");
    const keys = Object.keys(item).sort();
    if (keys.join(",") !== "completed,id,text"
      || typeof item.id !== "string" || item.id.length === 0 || item.id.length > MAX_ID_LENGTH
      || ids.has(item.id)
      || typeof item.text !== "string" || item.text.trim().length === 0 || item.text.length > MAX_TEXT_LENGTH
      || typeof item.completed !== "boolean") {
      throw new TypeError("Stored checklist items are corrupt.");
    }
    ids.add(item.id);
    return { id: item.id, text: item.text, completed: item.completed };
  });
}

function validateCounter(value, key) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Stored checklist ${key} is corrupt.`);
  }
  return value;
}

function createSerializer() {
  const pending = new Map();
  return function serialize(companyId, key, operation) {
    const queueKey = JSON.stringify([companyId, key]);
    const previous = pending.get(queueKey) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    pending.set(queueKey, current);
    return current.finally(() => {
      if (pending.get(queueKey) === current) pending.delete(queueKey);
    });
  };
}

async function readItems(api, companyId) {
  const value = await api.state.get(stateKey(companyId, ITEMS_KEY));
  return value === null || value === undefined ? [] : validateItems(value);
}

async function readCounter(api, companyId, key) {
  const value = await api.state.get(stateKey(companyId, key));
  return value === null || value === undefined ? 0 : validateCounter(value, key);
}

async function readChecklist(api, companyId) {
  const [items, eventCount, jobCount] = await Promise.all([
    readItems(api, companyId),
    readCounter(api, companyId, EVENT_COUNT_KEY),
    readCounter(api, companyId, JOB_COUNT_KEY),
  ]);
  return { items, eventCount, jobCount };
}

export function createChecklistPlugin({ capabilities = CHECKLIST_CAPABILITIES } = {}) {
  const serialize = createSerializer();
  const platform = defineSpsPlatformContract({
    capabilities,
    data: [{
      key: "checklist",
      async handler(params, api) {
        const companyId = requireCompanyId(params.companyId, "Checklist data");
        return readChecklist(api, companyId);
      },
    }],
    actions: [
      {
        key: "checklist.add",
        async handler(params, context) {
          const api = context;
          const companyId = requireCompanyId(context.companyId, "Checklist action");
          requireRecord(params, "Checklist add payload");
          if (typeof params.text !== "string" || params.text.length === 0 || params.text.length > MAX_TEXT_LENGTH) {
            throw new TypeError(`Checklist text must be between 1 and ${MAX_TEXT_LENGTH} characters.`);
          }
          const text = params.text.trim();
          if (text.length === 0) throw new TypeError("Checklist text must not be empty.");

          return serialize(companyId, ITEMS_KEY, async () => {
            const items = await readItems(api, companyId);
            if (items.length >= MAX_ITEMS) throw new RangeError(`Checklist is limited to ${MAX_ITEMS} items.`);
            const item = { id: randomUUID(), text, completed: false };
            await api.state.set(stateKey(companyId, ITEMS_KEY), [...items, item]);
            await api.events.emit("changed", companyId, { action: "checklist.add", itemId: item.id });
            return readChecklist(api, companyId);
          });
        },
      },
      {
        key: "checklist.toggle",
        async handler(params, context) {
          const api = context;
          const companyId = requireCompanyId(context.companyId, "Checklist action");
          requireRecord(params, "Checklist toggle payload");
          if (typeof params.id !== "string" || params.id.trim().length === 0 || params.id.length > MAX_ID_LENGTH
            || typeof params.completed !== "boolean") {
            throw new TypeError("Checklist toggle requires an id and a boolean completed value.");
          }

          return serialize(companyId, ITEMS_KEY, async () => {
            const items = await readItems(api, companyId);
            const index = items.findIndex((item) => item.id === params.id);
            if (index < 0) throw new RangeError("Checklist item was not found.");
            const updated = items.map((item, itemIndex) => itemIndex === index
              ? { ...item, completed: params.completed }
              : item);
            await api.state.set(stateKey(companyId, ITEMS_KEY), updated);
            await api.events.emit("changed", companyId, {
              action: "checklist.toggle",
              itemId: params.id,
              completed: params.completed,
            });
            return readChecklist(api, companyId);
          });
        },
      },
    ],
    events: [{
      name: EVENT_NAME,
      async handler(event, api) {
        const companyId = requireCompanyId(event.companyId, "Checklist event");
        await serialize(companyId, EVENT_COUNT_KEY, async () => {
          const count = await readCounter(api, companyId, EVENT_COUNT_KEY);
          await api.state.set(stateKey(companyId, EVENT_COUNT_KEY), count + 1);
        });
      },
    }],
    jobs: [{
      jobKey: JOB_KEY,
      async handler(job, api) {
        const companyId = requireCompanyId(job.companyId, "Checklist job");
        await serialize(companyId, JOB_COUNT_KEY, async () => {
          const count = await readCounter(api, companyId, JOB_COUNT_KEY);
          await api.state.set(stateKey(companyId, JOB_COUNT_KEY), count + 1);
        });
        return readChecklist(api, companyId);
      },
    }],
  });

  return defineSpsPlugin({
    initialize() {},
    health() {
      return { status: "ok", ready: true, mode: "no-ai" };
    },
    shutdown() {},
    platform,
  });
}
