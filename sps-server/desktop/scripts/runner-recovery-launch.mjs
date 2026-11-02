import assert from "node:assert/strict";
import path from "node:path";

export const RUNNER_RECOVERY_PHASES = Object.freeze([
  "claim-loss", "completion-loss", "recover", "success", "failure", "cancel",
]);

export function runnerRecoveryArguments({ entry, root, phase, executable, endpoint }) {
  // Electron's Windows protocol-argument guard rejects arguments after a URL.
  // Keep the URL last, and isolate Chromium before the ESM entry is evaluated.
  return [`--user-data-dir=${path.join(root, "electron-data")}`, entry,
    "--runner-recovery", root, phase, executable, endpoint];
}

export function parseRunnerRecoveryArguments(argv, entry) {
  assert.equal(argv.length, 8);
  assert.equal(argv[2], entry);
  assert.equal(argv[3], "--runner-recovery");
  const [, , , , root, phase, executable, endpoint] = argv;
  assert.equal(argv[1], `--user-data-dir=${path.join(root, "electron-data")}`);
  assert.ok(RUNNER_RECOVERY_PHASES.includes(phase));
  return { root, phase, executable, endpoint };
}
