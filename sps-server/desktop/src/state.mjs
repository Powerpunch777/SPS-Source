import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeSpsAccountConnection } from "./account-connections.mjs";

const STATE_VERSION = 11;

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

export async function loadState(userDataPath) {
  try {
    const raw = await fs.readFile(statePath(userDataPath), "utf8");
    // Windows tools can write a UTF-8 BOM even when the content is otherwise
    // valid JSON. Treat it as transport encoding, not as part of the state.
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, STATE_VERSION].includes(parsed?.version)) return emptyState();
    // Earlier state versions contain a valid profile and Node identity. v5 adds
    // account-scoped connection records while keeping the physical Owner Host
    // and its vault on this computer.
    const state = { ...emptyState(), ...parsed, version: STATE_VERSION };
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
      } catch {
        // A stale state file without its vault is not an Owner Host to adopt.
      }
    }
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    throw error;
  }
}

export async function saveState(userDataPath, value) {
  await fs.mkdir(userDataPath, { recursive: true });
  const destination = statePath(userDataPath);
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
}
