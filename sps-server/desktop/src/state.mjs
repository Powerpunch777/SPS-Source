import { promises as fs } from "node:fs";
import path from "node:path";

const STATE_VERSION = 2;

function statePath(userDataPath) {
  return path.join(userDataPath, "sps-desktop-state.json");
}

export function emptyState() {
  return {
    version: STATE_VERSION,
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
    if (parsed?.version !== 1 && parsed?.version !== STATE_VERSION) return emptyState();
    // Version 1 contains only the original remote Node profile. Its values
    // remain valid; v2 merely adds opt-in private Owner Host team access.
    return { ...emptyState(), ...parsed, version: STATE_VERSION };
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
