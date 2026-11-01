import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { t as listTar } from "tar";
import { spawnWindowsJobSupervisor } from "@sps/desktop-node";
import { normalizeArchiveEntry } from "./owner-host-runtime-archive-path.mjs";
import { extractSpsOwnerRuntimeArchive } from "./owner-host-runtime-extract.mjs";

const message = "SPS Windows runtime archive extraction failed.";
const fail = () => new Error(message);
const fields = ["dev", "ino", "birthtimeNs", "size", "mtimeNs", "ctimeNs", "nlink"];
const same = (left, right) => fields.every(key => left[key] === right[key]);

export async function extractSpsPackagedOwnerRuntimeArchive(options) {
  const native = await createSpsWindowsRuntimeArchiveExtractor();
  return native ? native(options) : extractSpsOwnerRuntimeArchive(options);
}

async function plainDirectory(directory, allowCaseAlias = false) {
  if (!path.isAbsolute(directory) || path.resolve(directory) !== directory || directory.includes("\0")) throw fail();
  let current = directory;
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail();
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const canonical = await realpath(directory);
  if (canonical !== directory && (!allowCaseAlias || canonical.toLowerCase() !== directory.toLowerCase())) throw fail();
  return canonical;
}

async function plainFile(file, systemComponent = false) {
  await plainDirectory(path.dirname(file));
  const stat = await lstat(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink < 1n
    || (!systemComponent && stat.nlink !== 1n) || stat.size <= 0n) throw fail();
  if (await realpath(file) !== file) throw fail();
  return stat;
}

async function preflight(file) {
  let entries = 0, bytes = 0;
  const seen = new Map();
  let invalid = false;
  await listTar({ file, strict: true, onentry: entry => {
    if (invalid) return;
    try {
      const relative = normalizeArchiveEntry(entry.path);
      if (relative !== "." && relative.split("/").some(segment => /[<>:"|?*\u0000-\u001f]/.test(segment)
        || /[. ]$/.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) throw fail();
      if (++entries > 90_000) throw fail();
      const directory = entry.type === "Directory";
      if (!directory && !["File", "OldFile", "ContiguousFile"].includes(entry.type)) throw fail();
      const key = relative.normalize("NFKD").toLowerCase();
      if (seen.has(key)) throw fail();
      seen.set(key, directory);
      if (!directory) {
        if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw fail();
        bytes += entry.size;
        if (bytes > 3 * 1024 * 1024 * 1024) throw fail();
      }
    } catch { invalid = true; }
  } });
  if (invalid) throw fail();
  for (const [relative] of seen) {
    let parent = path.posix.dirname(relative);
    while (parent !== ".") {
      if (seen.get(parent) === false) throw fail();
      parent = path.posix.dirname(parent);
    }
  }
  if (!entries) throw fail();
}

/** Only the Windows system tar, never PATH/npm/user-selected commands. */
export async function createSpsWindowsRuntimeArchiveExtractor(internal = {}) {
  if ((internal.platform ?? process.platform) !== "win32") return null;
  const inputRoot = internal.windowsRoot ?? process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (typeof inputRoot !== "string" || !/^[A-Za-z]:\\/.test(inputRoot)
    || path.win32.resolve(inputRoot) !== inputRoot) throw fail();
  const windows = await plainDirectory(inputRoot, true);
  const executable = path.join(windows, "System32", "tar.exe");
  let executableStat;
  // Windows servicing may hardlink System32 components into WinSxS. They are
  // still exact system paths; caller archives continue to require one link.
  try { executableStat = await plainFile(executable, true); }
  catch (error) {
    // Older supported Windows installations may lack tar. Only absence before
    // launch selects the existing Node extractor; runtime failures never do.
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const launch = internal.spawn ?? spawnWindowsJobSupervisor;
  return async options => {
    if (!options || ![options.cwd, options.file].every(value => typeof value === "string" && path.isAbsolute(value)
      && path.resolve(value) === value && !value.includes("\0"))
      || options.strict !== true || options.preservePaths !== false) throw fail();
    await plainDirectory(options.cwd);
    const targetStat = await lstat(options.cwd, { bigint: true });
    if ((await readdir(options.cwd)).length !== 0) throw fail();
    const archiveStat = await plainFile(options.file);
    if (archiveStat.size > 512n * 1024n * 1024n) throw fail();
    await preflight(options.file);
    if (!same(await plainFile(executable, true), executableStat) || !same(await plainFile(options.file), archiveStat)) throw fail();
    let child;
    try {
      // -m also avoids restoring archived Windows creation timestamps onto
      // the already identity-captured staging root.
      child = launch({ executable, args: ["-xm", "-f", options.file, "-C", options.cwd, "--no-same-owner", "--no-same-permissions"],
        cwd: options.cwd, env: { SYSTEMROOT: windows, WINDIR: windows, PATH: path.join(windows, "System32") } });
    } catch {
      const error = fail();
      error.runtimeStagingCleanupUnconfirmed = true;
      throw error;
    }
    let outputBytes = 0, outputFailed = false, timedOut = false;
    const record = chunk => { outputBytes += chunk.length; if (outputBytes > 32_768) outputFailed = true; };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    let rejectTimeout;
    const expired = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => { timedOut = true; rejectTimeout(fail()); }, internal.timeoutMs ?? 180_000);
    try {
      await Promise.race([child.supervisorReady, expired]);
      const terminal = await Promise.race([child.waitForOwnedJobTermination(), expired]);
      if (timedOut || outputFailed || terminal?.type !== "exit" || terminal.activeProcesses !== 0 || terminal.code !== 0) throw fail();
      await plainDirectory(options.cwd);
      const after = await lstat(options.cwd, { bigint: true });
      if (!["dev", "ino", "birthtimeNs"].every(key => after[key] === targetStat[key])
        || !same(await plainFile(options.file), archiveStat)) throw fail();
    } catch {
      const error = fail();
      try {
        const stopped = await child.terminateOwnedJob();
        if (!stopped || stopped.activeProcesses !== 0) error.runtimeStagingCleanupUnconfirmed = true;
      } catch { error.runtimeStagingCleanupUnconfirmed = true; }
      throw error;
    } finally { clearTimeout(timer); }
  };
}
