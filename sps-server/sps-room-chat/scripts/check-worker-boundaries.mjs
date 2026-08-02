import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worker = await readFile(path.join(root, "src", "worker.js"), "utf8");
const lineCount = worker.split(/\r?\n/).length;
const errors = [];

if (lineCount > 8400) {
  errors.push(`src/worker.js has ${lineCount} lines; split another domain before exceeding the 8,400-line budget.`);
}

for (const modulePath of ["./room-state.js", "./workspace-profile.js", "./room-job-policy.js"]) {
  if (!worker.includes(`from "${modulePath}"`)) errors.push(`src/worker.js must use ${modulePath}.`);
}

for (const functionName of [
  "parseState",
  "serializeState",
  "newRoomState",
  "normalizeWorkspaceProfile",
  "chooseTaskWorkspace",
  "roomJobData",
  "terminalRoomJobPatchFromState",
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
