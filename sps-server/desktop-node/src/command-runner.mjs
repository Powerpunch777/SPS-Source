import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendSpsNodeCommandEvent,
  checkSpsNodeCommandLease,
  claimSpsWorkspaceSourceRoute,
  completeSpsNodeCommand,
} from "./hub-client.mjs";
import { openSpsWorkspaceSourceRoute } from "./host-project-share.mjs";
import { createSpsNodeUsageCollector } from "./usage-collector.mjs";
import { createOwnedProcessTerminator } from "./owned-process-termination.mjs";
import { assertWindowsJobSupervisorAvailable, spawnWindowsJobSupervisor } from "./windows-job-supervisor.mjs";

const OUTPUT_CHUNK_LIMIT = 48 * 1024;
const COMMAND_LEASE_CHECK_INTERVAL_MS = 2_000;
const COMMAND_LEASE_MAX_UNAVAILABLE_MS = 60_000;
const WINDOWS_COMMAND_LOOKUP_TIMEOUT_MS = 8_000;
const COMMAND_PREFLIGHT_TIMEOUT_MS = 30_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
const MIN_PLUGIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_PLUGIN_COMMAND_TIMEOUT_MS = 4 * 60 * 60 * 1_000;
const FORBIDDEN_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "CODEX_HOME",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
]);
const SAFE_RUNTIME_ENV_KEYS = new Set([
  "ANTIGRAVITY_MODEL",
  "OPENCODE_DISABLE_PROJECT_CONFIG",
]);
const HOST_RUNTIME_ENV_KEYS = new Set([
  "APPDATA",
  "COLORTERM",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
]);
const SPS_NODE_RUNTIME_COMMANDS = {
  claude_cli: "claude",
  codex_cli: "codex",
  agy_cli: "agy",
  gemini_cli: "gemini",
  opencode_cli: "opencode",
  pi_cli: "pi",
  ollama: "ollama",
  lm_studio: "lms",
};
const CODEX_ACCOUNT_DIRECTORY = /^\.codex(?:-[A-Za-z0-9][A-Za-z0-9._-]*)?$/;
const activeCommands = new Map();
let commandCancellationGeneration = 0;
let lastCommandCancellationReason = "SPS Desktop stopped this local command.";

function allowedEnvironment(value) {
  const output = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry !== "string" || FORBIDDEN_ENV_KEYS.has(key)) continue;
    if (key.startsWith("PAPERCLIP_") || SAFE_RUNTIME_ENV_KEYS.has(key) || key === "FORCE_COLOR" || key === "TERM") output[key] = entry;
  }
  return output;
}

function hostRuntimeEnvironment(value = process.env) {
  const output = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry !== "string" || !HOST_RUNTIME_ENV_KEYS.has(key.toUpperCase())) continue;
    output[key] = entry;
  }
  return output;
}

export function buildSpsNodeRuntimeEnvironment(commandEnvironment, hostEnvironment = process.env) {
  return {
    ...hostRuntimeEnvironment(hostEnvironment),
    ...allowedEnvironment(commandEnvironment),
  };
}

async function listSignedInCodexProfiles(homeRoot) {
  const entries = await fs.readdir(homeRoot, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isDirectory() && CODEX_ACCOUNT_DIRECTORY.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const profiles = [];
  for (const directoryName of candidates) {
    const auth = await fs.stat(path.join(homeRoot, directoryName, "auth.json")).catch(() => null);
    if (auth?.isFile()) profiles.push(directoryName);
  }
  return profiles;
}

export async function resolveSpsNodeCodexHome(command, hostEnvironment = process.env) {
  const configuredProfile = command?.env?.PAPERCLIP_CODEX_ACCOUNT;
  const profileWasExplicitlySelected = typeof configuredProfile === "string" && configuredProfile.trim();
  const profileDirectory = profileWasExplicitlySelected ? configuredProfile.trim() : ".codex";
  if (!CODEX_ACCOUNT_DIRECTORY.test(profileDirectory)) {
    throw new Error("SPS Desktop rejected an invalid Codex profile name from the Hub.");
  }

  const homeRoot = hostEnvironment.USERPROFILE?.trim() || hostEnvironment.HOME?.trim();
  if (!homeRoot) {
    throw new Error("SPS Desktop could not locate this computer's user home for the selected Codex profile.");
  }
  const resolvedHomeRoot = path.resolve(homeRoot);
  const codexHome = path.resolve(resolvedHomeRoot, profileDirectory);
  if (path.dirname(codexHome) !== resolvedHomeRoot) {
    throw new Error("SPS Desktop rejected an unsafe Codex profile location.");
  }
  const auth = await fs.stat(path.join(codexHome, "auth.json")).catch(() => null);
  if (!auth?.isFile()) {
    if (!profileWasExplicitlySelected || profileDirectory === ".codex") {
      const signedInProfiles = await listSignedInCodexProfiles(resolvedHomeRoot);
      if (signedInProfiles.length === 1) {
        return path.join(resolvedHomeRoot, signedInProfiles[0]);
      }
      if (signedInProfiles.length > 1) {
        throw new Error(`SPS Desktop found multiple signed-in Codex profiles. Configure this Agent with one of: ${signedInProfiles.join(", ")}.`);
      }
    }
    throw new Error(`Selected Codex profile is not signed in on this SPS Desktop Node: ${profileDirectory}.`);
  }
  return codexHome;
}

export function assertSpsNodeCommandRuntime(command) {
  const expected = SPS_NODE_RUNTIME_COMMANDS[command?.runtimeKind];
  if (!expected) {
    throw new Error("SPS Hub did not provide an approved runtime for this local command.");
  }
  const rawCommand = typeof command?.command === "string" ? command.command.trim() : "";
  if (!rawCommand || rawCommand.includes("/") || rawCommand.includes("\\")) {
    throw new Error("SPS Desktop rejected a remote command path. Only approved local CLI names can run.");
  }
  const normalized = rawCommand.replace(/\.(cmd|bat|ps1|exe|com)$/i, "").toLowerCase();
  if (normalized !== expected) {
    throw new Error(`SPS Desktop rejected ${rawCommand}; this Agent is approved only for ${expected}.`);
  }
}

export function resolveSpsNodeCommandTimeoutMs(command) {
  const timeoutMs = command?.timeoutMs;
  if (typeof command?.pluginKey === "string") {
    if (timeoutMs === undefined || timeoutMs === null) return DEFAULT_COMMAND_TIMEOUT_MS;
    if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("SPS Desktop rejected invalid timeoutMs for a neutral plugin command; expected a positive safe integer.");
    }
    return Math.min(MAX_PLUGIN_COMMAND_TIMEOUT_MS, Math.max(MIN_PLUGIN_COMMAND_TIMEOUT_MS, timeoutMs));
  }
  return typeof timeoutMs === "number" && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_COMMAND_TIMEOUT_MS;
}

export function isSpsHostSharedWorkspacePath(value, platform = process.platform) {
  if (platform !== "win32" || typeof value !== "string") return false;
  // Only a UNC share can represent a Host-owned workspace on a Member Node.
  // Drive letters are local to the Member and must never be supplied by it.
  return /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(?:\\|$)/.test(value.trim());
}

export async function resolveSpsNodeWorkspace(command, profile, options = {}) {
  const projectId = typeof command?.projectId === "string" && command.projectId.trim()
    ? command.projectId
    : null;
  const workspaceSourceId = typeof command?.workspaceSourceId === "string" && command.workspaceSourceId.trim()
    ? command.workspaceSourceId.trim()
    : null;
  const connectionKind = typeof profile?.connectionKind === "string" ? profile.connectionKind : "remote";
  const hostIssuedCwd = typeof command?.cwdHint === "string" ? command.cwdHint.trim() : "";
  const configuredSource = workspaceSourceId
    ? (profile?.workspaceSources ?? []).find((source) => source?.id === workspaceSourceId) ?? null
    : null;
  // Project source folders are selected once by the Owner Host. A Member may
  // run only in the Host-provided UNC share, never in an arbitrary mapping in
  // its own Desktop state. The Owner Host retains its direct source mapping.
  const configured = workspaceSourceId
    ? connectionKind === "owner-host"
      ? configuredSource?.sourcePath || hostIssuedCwd
      : isSpsHostSharedWorkspacePath(hostIssuedCwd, options.platform)
        ? hostIssuedCwd
        : ""
    : projectId
    ? connectionKind === "owner-host"
      ? profile.projectWorkspaces?.[projectId] || hostIssuedCwd
      : isSpsHostSharedWorkspacePath(hostIssuedCwd, options.platform)
        ? hostIssuedCwd
        : ""
    : profile.defaultWorkspacePath;
  if ((projectId || workspaceSourceId) && (!configured || !configured.trim())) {
    if (workspaceSourceId) {
      throw new Error(`Workspace Source ${workspaceSourceId} is not available to this Member Node. The Host must configure an SPS shared source folder before this runtime runs.`);
    }
    throw new Error(`SPS project ${projectId} is not available to this Member Node. The Owner Host must configure an SPS shared project folder before this Agent runs.`);
  }
  if (!configured || !configured.trim()) {
    throw new Error("No local workspace is configured for this SPS project. Set a default workspace folder in SPS Desktop.");
  }
  const resolvePath = options.resolvePath ?? path.resolve;
  const stat = options.stat ?? fs.stat;
  const workspace = resolvePath(configured.trim());
  const info = await stat(workspace).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Configured workspace is not a directory: ${workspace}`);
  return workspace;
}

function outputChunks(value) {
  const text = String(value ?? "");
  const chunks = [];
  for (let start = 0; start < text.length; start += OUTPUT_CHUNK_LIMIT) {
    chunks.push(text.slice(start, start + OUTPUT_CHUNK_LIMIT));
  }
  return chunks;
}

async function findWindowsCommandCandidates(command) {
  return await new Promise((resolve) => {
    const lookup = spawn("where.exe", [command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    let settled = false;
    const finish = (candidates) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(candidates);
    };
    const timeout = setTimeout(() => {
      // A broken PATH or an interrupted Windows shell lookup must not leave an
      // SPS Node command claimed forever before its process has even started.
      lookup.kill();
      finish([]);
    }, WINDOWS_COMMAND_LOOKUP_TIMEOUT_MS);
    lookup.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    lookup.once("error", () => finish([]));
    lookup.once("close", () => {
      finish(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    });
  });
}

async function withCommandPreflightTimeout(action, onTimeout = () => {}) {
  let timeout = null;
  try {
    return await Promise.race([
      action(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new Error("SPS Desktop timed out while preparing this local command. Check the configured workspace and local CLI installation."));
        }, COMMAND_PREFLIGHT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function throwIfCommandCancelled(activeRun, cancellationGeneration) {
  activeRun.assertCurrent();
  if (cancellationGeneration !== commandCancellationGeneration || activeRun.cancellationError) {
    throw new Error(activeRun.cancellationError ?? lastCommandCancellationReason);
  }
}

export async function resolveSpsNodeExecutable(command, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") return command;
  const extension = path.extname(command).toLowerCase();
  if (path.win32.isAbsolute(command) && /\.(exe|com)$/i.test(command)) return command;
  const findCandidates = options.findWindowsCommand ?? findWindowsCommandCandidates;
  const candidates = await findCandidates(command);
  const executable = candidates.find((candidate) => path.win32.isAbsolute(candidate) && /\.(exe|com)$/i.test(candidate));
  if (executable) return executable;
  if (extension === ".cmd" || extension === ".bat" || extension === ".ps1") {
    throw new Error(`SPS Desktop requires an executable for remote Node runs, not a shell wrapper: ${command}`);
  }
  throw new Error(`SPS Desktop could not resolve an executable for remote Node runs: ${command}`);
}

async function fileExists(filePath) {
  return Boolean(await fs.stat(filePath).catch(() => null));
}

async function readTextFile(filePath) {
  return await fs.readFile(filePath, "utf8");
}

async function resolveWindowsNpmNodeInvocation(command, rawArgs, options) {
  const findCandidates = options.findWindowsCommand ?? findWindowsCommandCandidates;
  const candidates = await findCandidates(command);
  const commandName = path.win32.basename(command).replace(/\.(cmd|bat|ps1|exe|com)$/i, "").toLowerCase();
  const npmWrapper = candidates.find(
    (candidate) => path.win32.basename(candidate).toLowerCase() === `${commandName}.cmd`,
  );
  if (!npmWrapper) return null;

  const readFile = options.readFile ?? readTextFile;
  const wrapperSource = String(await readFile(npmWrapper));
  // npm's Windows shim executes node against a script below its own
  // node_modules directory. Extract only that fixed shape, never a shell line.
  const match = wrapperSource.match(/"%dp0%\\(node_modules\\[^\"]+\.(?:c|m)?js)"/i);
  if (!match) {
    throw new Error(`SPS Desktop could not safely resolve the npm wrapper for remote Node runs: ${npmWrapper}`);
  }
  const scriptSuffix = match[1].replace(/\//g, "\\");
  if (!/^node_modules\\/i.test(scriptSuffix) || scriptSuffix.split("\\").includes("..")) {
    throw new Error(`SPS Desktop rejected an unsafe npm wrapper script path: ${npmWrapper}`);
  }
  const nodeScript = path.win32.resolve(path.win32.dirname(npmWrapper), scriptSuffix);
  const exists = options.fileExists ?? fileExists;
  if (!await exists(nodeScript)) {
    throw new Error(`SPS Desktop could not find the npm CLI script referenced by ${npmWrapper}`);
  }
  const nodeCandidates = await findCandidates("node.exe");
  const nodeExecutable = nodeCandidates.find((candidate) => /\.(exe|com)$/i.test(candidate));
  if (!nodeExecutable) {
    throw new Error(`SPS Desktop requires node.exe to run the npm CLI wrapper: ${npmWrapper}`);
  }
  return { executable: nodeExecutable, args: [nodeScript, ...rawArgs] };
}

export async function resolveSpsNodeInvocation(command, args, options = {}) {
  const rawArgs = Array.isArray(args) ? args : [];
  if ((options.platform ?? process.platform) === "win32") {
    const npmInvocation = await resolveWindowsNpmNodeInvocation(command, rawArgs, options);
    if (npmInvocation) return npmInvocation;
  }
  return {
    executable: await resolveSpsNodeExecutable(command, options),
    args: rawArgs,
  };
}

const defaultProcessTermination = createOwnedProcessTerminator();

function spawnOwnedCommand(invocation, options) {
  return process.platform === "win32"
    ? spawnWindowsJobSupervisor({ ...invocation, cwd: options.cwd, env: options.env })
    : spawn(invocation.executable, invocation.args, options);
}

async function closeOwnedSource(run) {
  if (run.sourceOpening) throw new Error("SPS Host Source preparation has not finished; cleanup is still pending.");
  if (run.processTermination.isAlive(run.child) || run.processTermination.hasUnconfirmedTermination(run.child)) {
    throw new Error("Local command termination has not been confirmed.");
  }
  if (run.sourceClosing) return run.sourceClosing;
  const session = run.sourceSession;
  if (!session) return;
  const closing = Promise.resolve().then(() => session.close()).then(() => {
    if (run.sourceSession === session) run.sourceSession = null;
  });
  run.sourceClosing = closing;
  try { await closing; }
  finally { if (run.sourceClosing === closing) run.sourceClosing = null; }
}

function releaseCompletedCommand(id, run) {
  if (run.settled && !run.sourceOpening && !run.sourceSession && !run.processTermination.isAlive(run.child)
    && !run.processTermination.hasUnconfirmedTermination(run.child)
    && activeCommands.get(id) === run) activeCommands.delete(id);
}

export async function cancelSpsNodeCommands(reason = "SPS Desktop stopped this local command.") {
  commandCancellationGeneration += 1;
  lastCommandCancellationReason = reason;
  const active = [...activeCommands.values()];
  await Promise.all(active.map(async (run) => {
    run.cancellationError ??= reason;
    await run.processTermination.terminate(run.child);
    await closeOwnedSource(run);
    for (const [id, current] of activeCommands) if (current === run) releaseCompletedCommand(id, run);
  }));
  return active.length;
}

/** Cancel only the invocation owned by this lifecycle controller. */
export async function cancelSpsNodeCommand(commandId, reason = "SPS Desktop stopped this local command.", { ownership } = {}) {
  const run = activeCommands.get(commandId);
  if (!run || ownership !== undefined && run.ownership !== ownership) return false;
  run.cancellationError ??= reason;
  await run.processTermination.terminate(run.child);
  await closeOwnedSource(run);
  releaseCompletedCommand(commandId, run);
  return true;
}

export async function executeSpsNodeCommand({
  command,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  profile,
  resolveInvocation = resolveSpsNodeInvocation,
  resolveWorkspace = resolveSpsNodeWorkspace,
  openWorkspaceSourceRoute = openSpsWorkspaceSourceRoute,
  claimWorkspaceSourceRoute = claimSpsWorkspaceSourceRoute,
  checkCommandLease = checkSpsNodeCommandLease,
  appendCommandEvent = appendSpsNodeCommandEvent,
  completeCommand = completeSpsNodeCommand,
  hostEnvironment = process.env,
  assertCurrent = () => {},
  ownership,
  processTermination = defaultProcessTermination,
  spawnCommand = spawnOwnedCommand,
}) {
  const processScopeAlive = child => processTermination.isAlive(child);
  const terminateProcessTree = child => processTermination.terminate(child);
  const processTerminationUnconfirmed = child => processTermination.hasUnconfirmedTermination(child);
  assertSpsNodeCommandRuntime(command);
  const timeoutMs = resolveSpsNodeCommandTimeoutMs(command);
  if (typeof command.id !== "string" || command.id.trim().length === 0) {
    throw new Error("SPS Desktop rejected a command without a nonempty command ID.");
  }
  if (activeCommands.has(command.id)) {
    throw new Error("SPS Desktop rejected a duplicate active command ID.");
  }
  const cancellationGeneration = commandCancellationGeneration;
  const usageCollector = createSpsNodeUsageCollector(command.runtimeKind);
  let usageReport = null;
  let sequence = Number(command.lastEventSeq ?? 0);
  let outputQueue = Promise.resolve();
  const enqueueOutput = (stream, raw) => {
    for (const body of outputChunks(raw)) {
      if (!body) continue;
      const eventSequence = ++sequence;
      outputQueue = outputQueue.then(() => appendCommandEvent({
        hubUrl,
        nodeId,
        identity,
        accessToken,
        sessionCookie,
        commandId: command.id,
        sequence: eventSequence,
        stream,
        body,
      }));
      // Observe each tail immediately so a failed upload while the child is
      // still alive cannot become an unhandled rejection. Keep the original
      // chain rejected so delivery failure is still reported after exit.
      void outputQueue.catch(() => undefined);
    }
  };

  const startedAt = Date.now();
  let timeout = null;
  let child = null;
  let leaseTimer = null;
  let leaseCheckInFlight = false;
  let leaseCancellationError = null;
  let lastLeaseConfirmedAt = Date.now();
  let hostProjectShareSession = null;
  let sourceCleanup = null;
  let normalCompletionPayload = null;
  const activeRun = { child: null, cancellationError: null, assertCurrent, ownership, processTermination, sourceOpening: false, sourceSession: null };
  activeCommands.set(command.id, activeRun);
  try {
    if (command.env?.SPS_MARKETPLACE_MCP_REQUIRED === "1") {
      throw new Error("This legacy Marketplace Assistant command is retired.");
    }
    const prepared = await withCommandPreflightTimeout(async () => {
      if (process.platform === "win32") await assertWindowsJobSupervisorAvailable();
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      const ownerHasLocalSource = typeof command.workspaceSourceId === "string"
        && command.workspaceSourceId.trim()
        && profile?.connectionKind === "owner-host"
        && Array.isArray(profile?.workspaceSources)
        && profile.workspaceSources.some((source) => source?.id === command.workspaceSourceId && typeof source?.sourcePath === "string" && source.sourcePath.trim());
      const workspaceAccess = typeof command.workspaceSourceId === "string" && command.workspaceSourceId.trim() && !ownerHasLocalSource
        ? await claimWorkspaceSourceRoute({
          hubUrl,
          nodeId,
          sourceId: command.workspaceSourceId,
          identity,
          accessToken,
          sessionCookie,
        })
        : command.workspaceAccess ?? null;
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      activeRun.sourceOpening = true;
      try {
        hostProjectShareSession = await openWorkspaceSourceRoute(
          workspaceAccess,
          identity?.transportPrivateKeyPem ?? null,
          { expectedSharePath: command.cwdHint ?? null },
        );
        activeRun.sourceSession = hostProjectShareSession;
      } finally {
        activeRun.sourceOpening = false;
        // A bounded preflight can finish before a slow mapping operation. Keep
        // its ownership record until that operation settles and is cleaned.
        if (activeRun.settled) {
          await closeOwnedSource(activeRun);
          releaseCompletedCommand(command.id, activeRun);
        }
      }
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      const workspace = hostProjectShareSession?.workspacePath
        ? path.resolve(hostProjectShareSession.workspacePath)
        : await resolveWorkspace(command, profile);
      const workspaceInfo = await fs.stat(workspace).catch(() => null);
      if (!workspaceInfo?.isDirectory()) {
        throw new Error(`Configured workspace is not a directory: ${workspace}`);
      }
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      // The Hub process may be bound to localhost on its own computer. A member
      // Node must use the Hub URL it connected to, never that host-local address.
      const environment = {
        ...buildSpsNodeRuntimeEnvironment(command.env, hostEnvironment),
        PAPERCLIP_API_URL: hubUrl.replace(/\/$/, ""),
        SPS_WORKSPACE_PATH: workspace,
      };
      if (command.runtimeKind === "codex_cli") {
        environment.CODEX_HOME = await resolveSpsNodeCodexHome(command, hostEnvironment);
        delete environment.PAPERCLIP_CODEX_ACCOUNT;
      }
      const invocation = await resolveInvocation(command.command, command.args);
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      const lease = await checkCommandLease({ hubUrl, nodeId, identity, accessToken, sessionCookie, commandId: command.id });
      if (!lease?.active) throw new Error(lease?.error || "SPS Hub cancelled this local command before start.");
      lastLeaseConfirmedAt = Date.now();
      throwIfCommandCancelled(activeRun, cancellationGeneration);
      return { environment, invocation, workspace };
    }, () => { activeRun.cancellationError ??= "SPS Desktop Source/command preparation timed out."; });
    const { environment, invocation, workspace } = prepared;
    // Promise.race/preflight resolution yields before this continuation. Fence
    // once more at the synchronous spawn boundary so cancellation cannot close
    // a Source and then let a prepared command start on the next microtask.
    throwIfCommandCancelled(activeRun, cancellationGeneration);
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child = spawnCommand(invocation, {
        cwd: workspace, env: environment, shell: false, detached: process.platform !== "win32",
        windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
      activeRun.child = child;
      void child.supervisorReady?.catch(error => settle(reject, error));
      if (cancellationGeneration !== commandCancellationGeneration) {
        activeRun.cancellationError = lastCommandCancellationReason;
        void terminateProcessTree(child).catch(error => settle(reject, error));
      }
      child.stdout.on("data", (chunk) => {
        usageCollector.push(chunk);
        enqueueOutput("stdout", chunk.toString("utf8"));
      });
      child.stderr.on("data", (chunk) => enqueueOutput("stderr", chunk.toString("utf8")));
      child.once("error", (error) => settle(reject, error));
      child.once("close", (exitCode, signal) => {
        if (leaseTimer) clearInterval(leaseTimer);
        if (timeout) clearTimeout(timeout);
        void (async () => {
          // Helper exit alone is not descendant-exit evidence. The retained
          // job must report zero active processes and close with that result.
          await child.waitForOwnedJobTermination?.();
          usageReport = usageCollector.finish();
          settle(resolve, { exitCode, signal, timedOut });
        })().catch(error => settle(reject, error));
      });
      const checkLease = async () => {
        if (leaseCheckInFlight) return;
        leaseCheckInFlight = true;
        try {
          if (leaseCancellationError || activeRun.cancellationError) {
            await terminateProcessTree(child);
            return;
          }
          try {
            throwIfCommandCancelled(activeRun, cancellationGeneration);
          } catch {
            leaseCancellationError = "SPS Desktop connection is no longer active.";
            await terminateProcessTree(child);
            return;
          }
          let lease;
          try {
            lease = await checkCommandLease({
              hubUrl,
              nodeId,
              identity,
              accessToken,
              sessionCookie,
              commandId: command.id,
            });
          } catch {
            try { throwIfCommandCancelled(activeRun, cancellationGeneration); }
            catch {
              leaseCancellationError = "SPS Desktop connection is no longer active.";
              await terminateProcessTree(child);
              return;
            }
            if (Date.now() - lastLeaseConfirmedAt < COMMAND_LEASE_MAX_UNAVAILABLE_MS) return;
            leaseCancellationError = "SPS Desktop lost contact with the Hub for 60 seconds and stopped this local command.";
            await terminateProcessTree(child);
            return;
          }
          try {
            throwIfCommandCancelled(activeRun, cancellationGeneration);
          } catch {
            leaseCancellationError = "SPS Desktop connection is no longer active.";
            await terminateProcessTree(child);
            return;
          }
          if (!lease?.active) {
            leaseCancellationError = lease?.error || "SPS Hub cancelled this local command.";
            await terminateProcessTree(child);
          } else if (activeRun.cancellationError) {
            await terminateProcessTree(child);
          } else {
            lastLeaseConfirmedAt = Date.now();
          }
        } finally {
          leaseCheckInFlight = false;
        }
      };
      const dispatchLeaseCheck = () => {
        void checkLease().catch(error => settle(reject, error));
      };
      leaseTimer = setInterval(dispatchLeaseCheck, COMMAND_LEASE_CHECK_INTERVAL_MS);
      if (activeRun.cancellationError) {
        leaseCancellationError = activeRun.cancellationError;
        void terminateProcessTree(child).catch(error => settle(reject, error));
      }
      dispatchLeaseCheck();
      if (typeof command.stdin === "string" && command.stdin.length > 0) child.stdin.end(command.stdin);
      else child.stdin.end();
      const armExecutionTimeout = () => {
        if (settled || timeoutMs <= 0) return;
        timeout = setTimeout(() => {
          timedOut = true;
          // Wait for the process tree to close before reporting completion.
          // Codex and other CLIs can spawn children that continue writing.
          void terminateProcessTree(child).catch(error => settle(reject, error));
        }, timeoutMs);
      };
      // Helper startup has its own bounded deadline. Start the command budget
      // when its suspended process has joined the owned job and been resumed.
      if (child.supervisorReady) void child.supervisorReady.then(armExecutionTimeout, error => settle(reject, error));
      else armExecutionTimeout();
    });
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    if (process.platform !== "win32" && processScopeAlive(child)) await terminateProcessTree(child);
    if (leaseCancellationError || activeRun.cancellationError || result.timedOut) await terminateProcessTree(child);
    await processTermination.pending(child);
    if (processTerminationUnconfirmed(child)) throw new Error("Local command termination has not been confirmed.");
    leaseCancellationError ??= activeRun.cancellationError;
    // Local resource cleanup must not wait for output/completion delivery to an
    // unreachable or revoked Host after the owned process has exited.
    sourceCleanup = closeOwnedSource(activeRun);
    void sourceCleanup.catch(() => {});
    const completion = {
      status: result.exitCode === 0 && !result.timedOut && !leaseCancellationError ? "succeeded" : "failed",
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      error: leaseCancellationError ?? (result.timedOut ? `Local command exceeded ${timeoutMs}ms.` : null),
    };
    if (typeof command.pluginKey === "string" && usageReport) completion.usageReport = usageReport;
    normalCompletionPayload = {
      hubUrl,
      nodeId,
      identity,
      accessToken,
      sessionCookie,
      commandId: command.id,
      completion,
    };
    // Cache the process-derived result before waiting for output delivery. If
    // the output POST fails, the catch path must report this same completion
    // rather than inventing a process failure.
    await outputQueue;
    await completeCommand(normalCompletionPayload);
    return { ...result, workspace, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    // A failed kill is not a completion acknowledgement. Keep Core pending
    // rather than reporting that a still-live process has finished.
    if (child?.pid) {
      const termination = processTermination.pending(child);
      if (termination) await termination;
      else if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
    }
    if (processScopeAlive(child) || processTerminationUnconfirmed(child)) throw new Error("Local command termination has not been confirmed.");
    if (!sourceCleanup && !activeRun.sourceOpening) {
      sourceCleanup = closeOwnedSource(activeRun);
      void sourceCleanup.catch(() => {});
    }
    await outputQueue.catch(() => undefined);
    const fallbackCompletionPayload = normalCompletionPayload ?? {
      hubUrl,
      nodeId,
      identity,
      accessToken,
      sessionCookie,
      commandId: command.id,
      completion: {
        status: "failed",
        exitCode: null,
        signal: null,
        timedOut: false,
        error: error instanceof Error ? error.message.slice(0, 16_000) : "SPS Desktop command execution failed.",
      },
    };
    await completeCommand(fallbackCompletionPayload).catch(() => undefined);
    throw error;
  } finally {
    activeRun.settled = true;
    try {
      if (!processScopeAlive(activeRun.child) && !processTerminationUnconfirmed(activeRun.child)) {
        await (sourceCleanup ?? closeOwnedSource(activeRun));
      }
    }
    finally { releaseCompletedCommand(command.id, activeRun); }
  }
}
