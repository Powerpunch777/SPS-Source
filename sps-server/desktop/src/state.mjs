import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeSpsAccountConnection } from "./account-connections.mjs";

const STATE_VERSION = 6;

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
    desktopGoogleClientId: null,
    encryptedDesktopGoogleClientSecret: null,
    accountConnections: {},
    ownerHostOwnerSubject: null,
    profile: null,
    identity: null,
    encryptedBoardApiToken: null,
    companies: [],
    projects: [],
    nodeId: null,
    nodeStatus: null,
    teamAccess: null,
    encryptedTeamCredentials: null,
  };
}

export async function loadState(userDataPath) {
  try {
    const raw = await fs.readFile(statePath(userDataPath), "utf8");
    const parsed = JSON.parse(raw);
    if (![1, 2, 3, 4, 5, STATE_VERSION].includes(parsed?.version)) return emptyState();
    // Earlier state versions contain a valid profile and Node identity. v5 adds
    // account-scoped connection records while keeping the physical Owner Host
    // and its vault on this computer.
    const state = { ...emptyState(), ...parsed, version: STATE_VERSION };
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
    state.ownerHostOwnerSubject = typeof state.ownerHostOwnerSubject === "string" && state.ownerHostOwnerSubject.length > 0
      ? state.ownerHostOwnerSubject.slice(0, 512)
      : null;
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
