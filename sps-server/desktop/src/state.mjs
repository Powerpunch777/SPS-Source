import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeSpsAccountConnection } from "./account-connections.mjs";
import { normalizeSpsNativeMemberKeyIndex } from "./native-member-key-index.mjs";

const STATE_VERSION = 12;
const legacyConnectionMigrations = new WeakSet();
const legacyOwnerAdoptions = new WeakSet();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertConnectionShape(value) {
  if (!isRecord(value) || typeof value.hubUrl !== "string" || !value.hubUrl.trim()
    || value.hubUrl.length > 4096
    || (value.connectionKind !== undefined && !["owner-host", "remote"].includes(value.connectionKind))
    || (value.authMode !== undefined && !["legacy", "sps-identity"].includes(value.authMode))) {
    throw new Error("SPS Desktop connection metadata is malformed.");
  }
}

function assertCriticalStateShape(value) {
  if (!isRecord(value)) throw new Error("SPS Desktop connection settings are malformed.");
  if (value.nativeMemberKeyIndex !== undefined) normalizeSpsNativeMemberKeyIndex(value.nativeMemberKeyIndex);
  const owner = value.ownerHostOwnerSubject;
  if (owner !== undefined && owner !== null
    && (typeof owner !== "string" || !owner.trim() || owner.length > 512 || owner !== owner.trim())) {
    throw new Error("SPS Desktop Host ownership metadata is malformed.");
  }
  if (value.legacyOwnerHostAdoptionPending !== undefined && typeof value.legacyOwnerHostAdoptionPending !== "boolean") {
    throw new Error("SPS Desktop legacy ownership metadata is malformed.");
  }
  for (const key of ["encryptedDesktopAccount", "encryptedBoardApiToken", "encryptedTeamCredentials", "encryptedHostProjectShareSecrets"]) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== "string") {
      throw new Error("SPS Desktop credential metadata is malformed.");
    }
  }
  if (value.identity !== undefined && value.identity !== null) {
    if (!isRecord(value.identity)) throw new Error("SPS Desktop Node identity is malformed.");
    for (const key of ["publicKeyPem", "encryptedPrivateKey", "transportPublicKeyPem", "encryptedTransportPrivateKey", "algorithm", "transportAlgorithm"]) {
      if (value.identity[key] !== undefined && value.identity[key] !== null && typeof value.identity[key] !== "string") {
        throw new Error("SPS Desktop Node credential metadata is malformed.");
      }
    }
  }
  if (value.version >= 5 && value.legacyOwnerHostAdoptionPending === true) {
    throw new Error("Unverified persisted legacy Host adoption requires recovery.");
  }
  if (value.profile !== undefined && value.profile !== null) assertConnectionShape(value.profile);
  if (value.accountConnections !== undefined) {
    if (!isRecord(value.accountConnections)) throw new Error("SPS Desktop account routing is malformed.");
    for (const [subject, connection] of Object.entries(value.accountConnections)) {
      if (!subject.trim() || subject.length > 512 || subject !== subject.trim()) throw new Error("SPS Desktop account subject is malformed.");
      assertConnectionShape(connection);
      if (connection.connectionKind === "owner-host" && subject !== owner) {
        throw new Error("SPS Desktop account routing conflicts with Host ownership.");
      }
    }
  }
  if (value.version >= 5 && value.profile?.connectionKind === "owner-host" && !owner) {
    throw new Error("SPS Desktop Host profile has no established owner.");
  }
}

// Only a genuinely loaded pre-account-routing state can use this one-time path.
// It is deliberately not a serialized flag that a current-version file can set.
export function consumeLegacyDesktopConnectionMigration(state) {
  return legacyConnectionMigrations.delete(state);
}

export function hasPendingLegacyDesktopOwnerAdoption(state) {
  return legacyOwnerAdoptions.has(state) && state.legacyOwnerHostAdoptionPending === true && !state.ownerHostOwnerSubject;
}

function statePath(userDataPath) {
  return path.join(userDataPath, "sps-desktop-state.json");
}

function normalizeDesktopAccountAttempt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = typeof value.status === "string" ? value.status : "";
  if (!["pending", "succeeded", "failed"].includes(status)) return null;
  const at = typeof value.at === "string" && Number.isFinite(Date.parse(value.at)) ? value.at : null;
  if (!at) return null;
  const error = typeof value.error === "string" && value.error.trim()
    ? value.error.trim().slice(0, 360)
    : null;
  return { status, at, error };
}

export function emptyState() {
  return {
    version: STATE_VERSION,
    encryptedDesktopAccount: null,
    desktopAccountLastAttempt: null,
    desktopJoinLastAttempt: null,
    desktopDeviceId: null,
    // Public identifiers only, separate from Node keys and account routing.
    // Credential bytes and trusted pins remain in guarded encrypted storage.
    nativeMemberKeyIndex: normalizeSpsNativeMemberKeyIndex({ v: 1, entries: [] }),
    accountConnections: {},
    ownerHostOwnerSubject: null,
    // A narrowly-scoped bridge for SPS Desktop states created before SPS
    // Identity was required. It is set only when that legacy state and its
    // physical Owner Vault coexist.
    legacyOwnerHostAdoptionPending: false,
    profile: null,
    identity: null,
    encryptedBoardApiToken: null,
    companies: [],
    projects: [],
    nodeId: null,
    nodeStatus: null,
    // A local transport key is not usable for Host project access until the
    // matching public key has been accepted by Core for this SPS Node.
    transportKeyPublishedAt: null,
    teamAccess: null,
    encryptedTeamCredentials: null,
    // Owner Host-only secrets for per-Node project source access. This is
    // always protected by Windows secure storage and never copied into a
    // Member connection record.
    encryptedHostProjectShareSecrets: null,
  };
}

export async function loadState(userDataPath, { strictVersion = false } = {}) {
  try {
    const raw = await fs.readFile(statePath(userDataPath), "utf8");
    // Windows tools can write a UTF-8 BOM even when the content is otherwise
    // valid JSON. Treat it as transport encoding, not as part of the state.
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, STATE_VERSION].includes(parsed?.version)) {
      if (strictVersion) throw new Error("SPS Desktop connection settings use an unsupported version.");
      return emptyState();
    }
    if (strictVersion) assertCriticalStateShape(parsed);
    // Earlier state versions contain a valid profile and Node identity. v5 adds
    // account-scoped connection records while keeping the physical Owner Host
    // and its vault on this computer.
    const state = { ...emptyState(), ...parsed, version: STATE_VERSION };
    // Missing legacy metadata is empty; present corrupt metadata is never
    // silently replaced, even for a non-strict inspection load.
    state.nativeMemberKeyIndex = normalizeSpsNativeMemberKeyIndex(
      parsed.nativeMemberKeyIndex === undefined ? { v: 1, entries: [] } : parsed.nativeMemberKeyIndex,
    );
    // Version 8 retires the former per-machine Google OAuth configuration.
    // The central SPS Identity service owns the confidential Google client.
    delete state.desktopGoogleClientId;
    delete state.encryptedDesktopGoogleClientSecret;
    if (!state.accountConnections || typeof state.accountConnections !== "object" || Array.isArray(state.accountConnections)) {
      state.accountConnections = {};
    }
    state.accountConnections = Object.fromEntries(
      Object.entries(state.accountConnections)
        .filter(([subject]) => typeof subject === "string" && subject.length > 0 && subject.length <= 512)
        .map(([subject, connection]) => [subject, normalizeSpsAccountConnection(connection)])
        .filter(([, connection]) => Boolean(connection)),
    );
    state.desktopAccountLastAttempt = normalizeDesktopAccountAttempt(state.desktopAccountLastAttempt);
    state.desktopJoinLastAttempt = normalizeDesktopAccountAttempt(state.desktopJoinLastAttempt);
    state.ownerHostOwnerSubject = typeof state.ownerHostOwnerSubject === "string" && state.ownerHostOwnerSubject.length > 0
      ? state.ownerHostOwnerSubject.slice(0, 512)
      : null;
    state.legacyOwnerHostAdoptionPending = Boolean(state.legacyOwnerHostAdoptionPending);

    // v1-v4 predate SPS Identity and therefore cannot carry an Owner subject.
    // Do not infer ownership from a vault alone: require the old authenticated
    // local record as well, then defer the one-time adoption until a user signs
    // in through SPS Identity on this same computer.
    const legacyLocalOwnerState = Number(parsed.version) <= 4
      && Boolean(parsed.encryptedBoardApiToken)
      && Array.isArray(parsed.companies)
      && parsed.companies.length > 0
      && !state.ownerHostOwnerSubject;
    if (legacyLocalOwnerState) {
      try {
        const vaultConfig = path.join(userDataPath, "owner-vault", "config.json");
        await fs.access(vaultConfig);
        state.legacyOwnerHostAdoptionPending = true;
        legacyOwnerAdoptions.add(state);
      } catch {
        // A stale state file without its vault is not an Owner Host to adopt.
      }
    }
    if (Number(parsed.version) <= 4) legacyConnectionMigrations.add(state);
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    throw error;
  }
}

const pendingStateSaves = new Map();

// Account refresh, Node bookkeeping and explicit settings actions may save at
// the same time. Serialize each local destination so they cannot overwrite the
// same temporary file or rename another save's bytes. This is process-local;
// it is not a cross-process lock or power-loss durability guarantee.
export async function saveState(userDataPath, value, { beforeCommit = () => {} } = {}) {
  if (typeof beforeCommit !== "function") throw new TypeError("Invalid Desktop state commit guard.");
  const bytes = JSON.stringify(value, null, 2) + "\n";
  const destination = path.resolve(statePath(userDataPath));
  const queueKey = process.platform === "win32" ? destination.toLowerCase() : destination;
  function guard() {
    const result = beforeCommit();
    if (result !== undefined) {
      if (result instanceof Promise) void result.catch(() => {});
      throw new TypeError("Desktop state commit guards must be synchronous.");
    }
  }
  const pending = (pendingStateSaves.get(queueKey) ?? Promise.resolve()).then(async () => {
    guard();
    await fs.mkdir(userDataPath, { recursive: true });
    guard();
    const temporary = destination + ".tmp";
    await fs.writeFile(temporary, bytes, "utf8");
    guard();
    await fs.rename(temporary, destination);
  });
  const settled = pending.catch(() => {});
  pendingStateSaves.set(queueKey, settled);
  void settled.then(() => { if (pendingStateSaves.get(queueKey) === settled) pendingStateSaves.delete(queueKey); });
  await pending;
}
