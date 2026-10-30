import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "./preview-e2e-cleanup-contract.mjs";

export function assertHostedInstallerCi({ platform = process.platform, env = process.env, args = process.argv.slice(2) } = {}) {
  if (platform !== "win32" || env.GITHUB_ACTIONS !== "true" || env.RUNNER_OS !== "Windows"
    || env.RUNNER_ENVIRONMENT !== "github-hosted" || args.length !== 1 || args[0] !== OWNED_JOB_CLEANUP_ARGUMENT) {
    throw new Error("Installer data preservation requires the owned GitHub-hosted Windows CI launcher.");
  }
}

export function nsisInvocation(executable, directory, { uninstall = false } = {}) {
  for (const value of [executable, directory]) {
    if (typeof value !== "string" || !/^[a-z]:[\\/]/i.test(value) || !path.win32.isAbsolute(value) || /[\0\r\n"]/.test(value)
      || value.startsWith("\\\\")) throw new Error("Invalid owned NSIS path.");
  }
  // NSIS /D= and _?= consume the unquoted command-line tail, including spaces.
  // _?= also prevents an uninstaller from detaching a temporary copy. These are
  // fixed arguments to an explicit executable, never a command shell.
  return { executable, args: ["/S", "/currentuser", `${uninstall ? "_?=" : "/D="}${directory}`],
    options: { argv0: `"${executable}"`, windowsVerbatimArguments: true, windowsHide: true, shell: false } };
}

export async function assertPlainDirectory(directory) {
  const full = path.resolve(directory);
  const parsed = path.parse(full);
  let current = parsed.root;
  for (const part of full.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const details = await lstat(current);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Installer fixture directory contains a linked or non-directory component.");
  }
  return realpath(full);
}

export function assertContained(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Installer fixture path escapes its owned root.");
  }
}
