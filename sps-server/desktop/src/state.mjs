import { promises as fs } from "node:fs";
import path from "node:path";

const STATE_VERSION = 1;

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
    nodeId: null,
  };
}

export async function loadState(userDataPath) {
  try {
    const raw = await fs.readFile(statePath(userDataPath), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STATE_VERSION) return emptyState();
    return { ...emptyState(), ...parsed };
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
