import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worker = await readFile(path.join(root, "src", "worker.js"), "utf8");
const lineCount = worker.split(/\r?\n/).length;
const errors = [];

if (lineCount > 8000) {
  errors.push(`src/worker.js has ${lineCount} lines; split another domain before exceeding the 8,000-line budget.`);
}

for (const modulePath of ["./room-state.js", "./workspace-profile.js", "./room-job-policy.js", "./room-attachments.js", "./collaboration-readiness.js", "./room-memory-runtime.js"]) {
  if (!worker.includes(`from "${modulePath}"`)) errors.push(`src/worker.js must use ${modulePath}.`);
}

const attachmentModule = path.join(root, "src", "room-attachments.js");
try {
  await readFile(attachmentModule, "utf8");
} catch {
  errors.push("src/room-attachments.js must exist as the focused attachment boundary.");
}

const collaborationReadinessModule = path.join(root, "src", "collaboration-readiness.js");
try {
  const source = await readFile(collaborationReadinessModule, "utf8");
  if (!source.includes("export { createCollaborationReadiness }")) {
    errors.push("src/collaboration-readiness.js must expose its explicit dependency-injection factory.");
  }
} catch {
  errors.push("src/collaboration-readiness.js must exist as the focused runtime configuration boundary.");
}

const roomMemoryRuntimeModule = path.join(root, "src", "room-memory-runtime.js");
try {
  const source = await readFile(roomMemoryRuntimeModule, "utf8");
  if (!source.includes("export function createRoomMemoryRuntime")) {
    errors.push("src/room-memory-runtime.js must expose its explicit dependency-injection factory.");
  }
} catch {
  errors.push("src/room-memory-runtime.js must exist as the focused memory boundary.");
}

for (const functionName of [
  "parseState",
  "serializeState",
  "newRoomState",
  "normalizeWorkspaceProfile",
  "chooseTaskWorkspace",
  "roomJobData",
  "terminalRoomJobPatchFromState",
  "getRuntimeConfig",
  "collaborationReadinessFromConfig",
  "readCollaborationReadiness",
  "roomMemoryRuntime",
  "fetchRoomMemory",
  "searchRoomMemory",
  "proposeRoomMemory",
  "reconcileRoomMemoryLifecycle",
  "recordNativeCodexCompaction",
  "appendCheckpoint",
]) {
  if (new RegExp(`(?:^|\\n)function\\s+${functionName}\\s*\\(`).test(worker)) {
    errors.push(`${functionName} must remain in its focused policy module.`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Room worker boundary check passed (${lineCount} lines).`);
