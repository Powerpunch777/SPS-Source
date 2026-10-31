import { queryInstallerProcesses } from "../installer-process-query.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32") throw new Error("Installer process probe requires Windows.");
if (process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("Installer process probe must run under the restricted E2E helper.");
}

const result = await queryInstallerProcesses();
console.log(JSON.stringify(result));
process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
