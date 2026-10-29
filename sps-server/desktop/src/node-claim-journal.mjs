import { createHash, randomUUID } from "node:crypto";

const MAX_AGE_MS = 86_400_000;
const MAX_RECORDS = 64;
const MAX_BYTES = 256 * 1024;
const ID = /^v1:([1-9][0-9]{12}):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEYS = ["accountSubject", "hubUrl", "nodeId", "publicKeyFingerprint", "kind", "requestId", "phase", "workId"];

export class SpsNodeClaimJournalError extends Error {
  constructor(code = "unavailable") {
    super("SPS Node task recovery storage is unavailable.");
    this.name = "SpsNodeClaimJournalError";
    this.code = code;
  }
}

const fail = code => { throw new SpsNodeClaimJournalError(code); };
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max;
const isKind = value => value === "agent-command" || value === "plugin-run";
const connectionKey = record => JSON.stringify([record.accountSubject, record.hubUrl, record.nodeId, record.publicKeyFingerprint]);

function binding(input) {
  const { accountSubject, hubUrl, nodeId, identity } = input ?? {};
  if (!text(accountSubject, 512) || !text(hubUrl, 2048) || !text(nodeId, 512) || !text(identity?.publicKeyPem, 32 * 1024)) fail("invalid");
  let url;
  try { url = new URL(hubUrl); } catch { fail("invalid"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) fail("invalid");
  return { accountSubject, hubUrl, nodeId,
    publicKeyFingerprint: createHash("sha256").update(identity.publicKeyPem, "utf8").digest("hex") };
}

function validate(value) {
  if (!value || value.version !== 1 || Object.keys(value).sort().join(",") !== "records,version"
    || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) fail("invalid");
  const connections = new Set();
  for (const record of value.records) {
    if (!record || Object.keys(record).sort().join(",") !== [...KEYS].sort().join(",")
      || !text(record.accountSubject, 512) || !text(record.hubUrl, 2048) || !text(record.nodeId, 512)
      || !/^[a-f0-9]{64}$/.test(record.publicKeyFingerprint) || !isKind(record.kind)
      || !ID.test(record.requestId) || !["intent", "received", "entered", "aborted"].includes(record.phase)
      || (record.phase === "intent" ? record.workId !== null : !text(record.workId, 512))) fail("invalid");
    const key = connectionKey(record);
    if (connections.has(key)) fail("invalid");
    connections.add(key);
  }
  return value.records;
}

/** One pending request per exact connection; records contain no task payloads or credentials. */
export function createSpsNodeClaimJournal({ readEncrypted, writeEncrypted, encrypt, decrypt, now = Date.now }) {
  if (![readEncrypted, writeEncrypted, encrypt, decrypt, now].every(value => typeof value === "function")) {
    throw new TypeError("Invalid SPS Node claim journal configuration.");
  }
  let tail = Promise.resolve();
  // Preflight can overlap connection-generation changes while still inside
  // this process. Keep it owned until that exact executor settles; after a
  // process restart only the durable entry marker determines replay safety.
  const executing = new Map();
  const serialize = action => {
    const result = tail.then(action, action);
    tail = result.catch(() => {});
    return result;
  };
  async function read() {
    let ciphertext, plaintext, parsed;
    try {
      ciphertext = await readEncrypted();
      if (ciphertext === null || ciphertext === undefined) return [];
      if (!text(ciphertext, MAX_BYTES * 2)) fail("invalid");
      plaintext = await decrypt(ciphertext);
      if (typeof plaintext !== "string" || Buffer.byteLength(plaintext, "utf8") > MAX_BYTES) fail("invalid");
      parsed = JSON.parse(plaintext);
    } catch (error) {
      if (error instanceof SpsNodeClaimJournalError) throw error;
      fail("unavailable");
    }
    return validate(parsed);
  }
  async function write(records) {
    const value = JSON.stringify({ version: 1, records });
    if (Buffer.byteLength(value, "utf8") > MAX_BYTES) fail("limit");
    try {
      const encrypted = await encrypt(value);
      if (!text(encrypted, MAX_BYTES * 2)) fail("unavailable");
      await writeEncrypted(encrypted);
    } catch (error) {
      if (error instanceof SpsNodeClaimJournalError) throw error;
      fail("unavailable");
    }
  }
  function assertRecoverable(record) {
    if (record.phase === "entered") fail("execution-uncertain");
    if (record.phase === "aborted") return;
    const createdAt = Number(ID.exec(record.requestId)[1]);
    if (now() >= createdAt + MAX_AGE_MS) fail("expired");
  }
  async function pending(input) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      if (executing.has(key)) fail("execution-in-progress");
      const record = (await read()).find(item => connectionKey(item) === key);
      if (!record) return null;
      assertRecoverable(record);
      return { ...record };
    });
  }
  async function begin(input) {
    const scope = binding(input), key = connectionKey(scope);
    if (!isKind(input.kind)) fail("invalid");
    return serialize(async () => {
      if (executing.has(key)) fail("execution-in-progress");
      const records = await read();
      const existing = records.find(item => connectionKey(item) === key);
      if (existing) {
        assertRecoverable(existing);
        if (existing.phase === "aborted") fail("completion-pending");
        if (existing.kind !== input.kind) fail("conflict");
        // A prior save may have changed the in-memory slot before rejecting.
        // Re-persist and await it before any network claim.
        await write(records);
        return { ...existing };
      }
      if (records.length >= MAX_RECORDS) fail("limit");
      const time = now();
      if (!Number.isSafeInteger(time) || time < 1e12 || time >= 1e13) fail("invalid");
      const record = { ...scope, kind: input.kind, requestId: `v1:${time}:${randomUUID()}`, phase: "intent", workId: null };
      await write([...records, record]);
      return { ...record };
    });
  }
  async function change(input, phase) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      const records = await read(), record = records.find(item => connectionKey(item) === key);
      if (!record || record.requestId !== input.requestId || record.kind !== input.kind) fail("conflict");
      assertRecoverable(record);
      if (record.phase === "aborted") fail("completion-pending");
      if (!text(input.workId, 512) || (record.workId && record.workId !== input.workId)) fail("conflict");
      if (phase === "entered" && record.phase !== "received") fail("conflict");
      record.workId = input.workId;
      record.phase = phase;
      await write(records);
    });
  }
  async function empty(input) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      const records = await read(), record = records.find(item => connectionKey(item) === key);
      if (!record || record.requestId !== input.requestId || record.kind !== input.kind || record.phase !== "intent") fail("conflict");
      await write(records.filter(item => item !== record));
    });
  }
  // Only a durable final completion report may clear a received/entered claim.
  // Call this before attempting to acknowledge/remove the completion outbox.
  async function finish(input) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      const records = await read(), record = records.find(item => connectionKey(item) === key);
      if (!record) return;
      if (record.kind !== input.kind || record.workId !== input.workId) return;
      await write(records.filter(item => item !== record));
    });
  }
  async function acquire(input) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      if (executing.has(key)) fail("execution-in-progress");
      const record = (await read()).find(item => connectionKey(item) === key);
      if (!record || record.kind !== input.kind || record.requestId !== input.requestId
        || record.workId !== input.workId || record.phase !== "received") fail("conflict");
      assertRecoverable(record);
      const owner = Symbol("Node claim executor");
      executing.set(key, owner);
      return () => { if (executing.get(key) === owner) executing.delete(key); };
    });
  }
  async function abort(input) {
    const key = connectionKey(binding(input));
    return serialize(async () => {
      if (executing.has(key)) return false;
      const records = await read(), record = records.find(item => connectionKey(item) === key);
      if (!record || record.kind !== input.kind || record.requestId !== input.requestId
        || record.workId !== input.workId || !["received", "aborted"].includes(record.phase)) return false;
      // A concurrent reconnect cannot enter once this durable not-started
      // marker commits. A crash here can resume its final report, never work.
      record.phase = "aborted";
      await write(records);
      return true;
    });
  }
  return Object.freeze({ pending, begin, receive: input => change(input, "received"),
    enter: input => change(input, "entered"), empty, finish, acquire, abort });
}
