import { execFile } from "node:child_process";
import { lstat, mkdtemp, realpath, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assertPlainDirectory } from "../installer-ci-safety.mjs";
import { buildInstallerCimProbe, summarizeInstallerCimProbe, validateInstallerCimProbeInput } from "../installer-cim-diagnostic.mjs";
import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

const args = process.argv.slice(2);
const variant = args[0];
const architecture = process.env.SPS_INSTALLER_CIM_PROBE_ARCH ?? "x64";
validateInstallerCimProbeInput({ platform: process.platform, variant, architecture, args });
const parent = await realpath(os.tmpdir());
await assertPlainDirectory(parent);
const root = await mkdtemp(path.join(parent, "sps-installer-cim-probe-"));
const identity = await lstat(root, { bigint: true });
const started = Date.now();
let passed = false;
try {
  const invocation = buildInstallerCimProbe({ variant, architecture, fixtureRoot: root, windowsRoot: process.env.WINDIR });
  console.log(JSON.stringify({ installerCimDiagnostic: true, variant, architecture, stage: "powershell-start", installerExecuted: false }));
  let result;
  try {
    const output = await promisify(execFile)(invocation.executable, invocation.args, invocation.options);
    result = { exitCode: 0, signal: null, ...output };
  } catch (error) {
    result = { exitCode: Number.isInteger(error.code) ? error.code : null, signal: error.signal ?? null,
      stdout: error.stdout ?? Buffer.alloc(0), stderr: error.stderr ?? Buffer.alloc(0) };
  }
  const summary = summarizeInstallerCimProbe({ variant, architecture, ...result, elapsedMs: Date.now() - started });
  console.log(JSON.stringify(summary));
  passed = summary.matchedExpectedExit;
} finally {
  await assertPlainDirectory(root);
  const current = await lstat(root, { bigint: true });
  if (path.dirname(root).toLowerCase() !== parent.toLowerCase()
    || !/^sps-installer-cim-probe-[a-z0-9]+$/i.test(path.basename(root))
    || current.dev !== identity.dev || current.ino !== identity.ino || current.birthtimeNs !== identity.birthtimeNs) {
    throw new Error("Read-only CIM probe fixture identity changed; cleanup refused.");
  }
  await rmdir(root);
}
process.exitCode = passed ? OWNED_JOB_CLEANUP_PENDING_EXIT_CODE : 1;
