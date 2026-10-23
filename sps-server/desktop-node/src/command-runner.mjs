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

const OUTPUT_CHUNK_LIMIT = 48 * 1024;
const COMMAND_LEASE_CHECK_INTERVAL_MS = 2_000;
const COMMAND_LEASE_MAX_UNAVAILABLE_MS = 60_000;
const WINDOWS_COMMAND_LOOKUP_TIMEOUT_MS = 8_000;
const COMMAND_PREFLIGHT_TIMEOUT_MS = 30_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
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

export function spsMarketplaceMcpRuntimeEnvironment(runtime, environment = {}) {
  const output = { ...environment };
  if (!runtime) return output;
  const nodeCommand = typeof runtime.nodeCommand === "string" ? runtime.nodeCommand.trim() : "";
  const entryPath = typeof runtime.entryPath === "string" ? runtime.entryPath.trim() : "";
  if (!path.isAbsolute(nodeCommand) || !path.isAbsolute(entryPath)) {
    throw new Error("SPS Desktop Marketplace MCP runtime paths must be absolute local paths.");
  }
  const pathKey = Object.keys(output).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  output[pathKey] = [path.dirname(nodeCommand), output[pathKey]].filter(Boolean).join(path.delimiter);
  // These values always come from the local Desktop installation. Hub input
  // is filtered before this merge and therefore cannot replace either path.
  output.SPS_MARKETPLACE_MCP_NODE = nodeCommand;
  output.SPS_MARKETPLACE_MCP_ENTRY = entryPath;
  return output;
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

async function withCommandPreflightTimeout(action) {
  let timeout = null;
  try {
    return await Promise.race([
      action(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("SPS Desktop timed out while preparing this local command. Check the configured workspace and local CLI installation."));
        }, COMMAND_PREFLIGHT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function throwIfCommandCancelled(activeRun, cancellationGeneration) {
  if (cancellationGeneration !== commandCancellationGeneration || activeRun.cancellationError) {
    throw new Error(activeRun.cancellationError ?? lastCommandCancellationReason);
  }
}

export async function resolveSpsNodeExecutable(command, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") return command;
  const extension = path.extname(command).toLowerCase();
  if (extension && extension !== ".cmd" && extension !== ".bat" && extension !== ".ps1") return command;
  const findCandidates = options.findWindowsCommand ?? findWindowsCommandCandidates;
  const candidates = await findCandidates(command);
  const executable = candidates.find((candidate) => /\.(exe|com)$/i.test(candidate));
  if (executable) return executable;
  if (extension === ".cmd" || extension === ".bat" || extension === ".ps1") {
    throw new Error(`SPS Desktop requires an executable for remote Node runs, not a shell wrapper: ${command}`);
  }
  return command;
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

const processTerminations = new WeakMap();
function processScopeAlive(child) {
  if (!child?.pid) return false;
  try { process.kill(process.platform === "win32" ? child.pid : -child.pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}
async function terminateProcessTreeInternal(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      const fallback = () => {
        if (child.exitCode == null) child.kill();
        reject(new Error("Windows process-tree termination has not been confirmed."));
      };
      killer.once("error", fallback);
      killer.once("close", (code) => {
        if (code !== 0) {
          fallback();
          return;
        }
        resolve();
      });
    });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const deadline = Date.now() + 1500;
  while (processScopeAlive(child) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  if (processScopeAlive(child)) {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}
function terminateProcessTree(child) {
  if (!child?.pid) return Promise.resolve();
  const pending = processTerminations.get(child);
  if (pending) return pending;
  const operation = terminateProcessTreeInternal(child).then(async () => {
    const deadline = Date.now() + 2000;
    while (processScopeAlive(child) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
    if (processScopeAlive(child)) throw new Error("Local command termination has not been confirmed.");
  });
  processTerminations.set(child, operation);
  void operation.catch(() => { if (processTerminations.get(child) === operation) processTerminations.delete(child); });
  return operation;
}

export async function cancelSpsNodeCommands(reason = "SPS Desktop stopped this local command.") {
  commandCancellationGeneration += 1;
  lastCommandCancellationReason = reason;
  const active = [...activeCommands.values()];
  await Promise.all(active.map(async (run) => {
    run.cancellationError ??= reason;
    await terminateProcessTree(run.child);
  }));
  return active.length;
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
  marketplaceMcpRuntime = null,
}) {
  assertSpsNodeCommandRuntime(command);
  const cancellationGeneration = commandCancellationGeneration;
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
    }
  };

  const timeoutMs = typeof command.timeoutMs === "number" && command.timeoutMs > 0
    ? command.timeoutMs
    : DEFAULT_COMMAND_TIMEOUT_MS;
  const startedAt = Date.now();
  let timeout = null;
  let child = null;
  let leaseTimer = null;
  let leaseCheckInFlight = false;
  let leaseCancellationError = null;
  let lastLeaseConfirmedAt = Date.now();
  let hostProjectShareSession = null;
  const activeRun = { child: null, cancellationError: null };
  activeCommands.set(command.id, activeRun);
  try {
    const prepared = await withCommandPreflightTimeout(async () => {
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
      hostProjectShareSession = await openWorkspaceSourceRoute(
        workspaceAccess,
        identity?.transportPrivateKeyPem ?? null,
        { expectedSharePath: command.cwdHint ?? null },
      );
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
        ...spsMarketplaceMcpRuntimeEnvironment(
          marketplaceMcpRuntime,
          buildSpsNodeRuntimeEnvironment(command.env, hostEnvironment),
        ),
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
    });
    const { environment, invocation, workspace } = prepared;
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child = spawn(invocation.executable, invocation.args, {
        cwd: workspace,
        env: environment,
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      activeRun.child = child;
      if (cancellationGeneration !== commandCancellationGeneration) {
        activeRun.cancellationError = lastCommandCancellationReason;
        void terminateProcessTree(child).catch(() => child?.kill());
      }
      child.stdout.on("data", (chunk) => enqueueOutput("stdout", chunk.toString("utf8")));
      child.stderr.on("data", (chunk) => enqueueOutput("stderr", chunk.toString("utf8")));
      child.once("error", (error) => settle(reject, error));
      child.once("close", (exitCode, signal) => {
        if (leaseTimer) clearInterval(leaseTimer);
        settle(resolve, { exitCode, signal, timedOut });
      });
      const checkLease = async () => {
        if (leaseCheckInFlight) return;
        leaseCheckInFlight = true;
        try {
          if (leaseCancellationError || activeRun.cancellationError) {
            await terminateProcessTree(child);
            return;
          }
          const lease = await checkCommandLease({
            hubUrl,
            nodeId,
            identity,
            accessToken,
            sessionCookie,
            commandId: command.id,
          });
          if (!lease?.active) {
            leaseCancellationError = lease?.error || "SPS Hub cancelled this local command.";
            await terminateProcessTree(child);
          } else {
            lastLeaseConfirmedAt = Date.now();
          }
        } catch {
          if (Date.now() - lastLeaseConfirmedAt >= COMMAND_LEASE_MAX_UNAVAILABLE_MS) {
            leaseCancellationError = "SPS Desktop lost contact with the Hub for 60 seconds and stopped this local command.";
            await terminateProcessTree(child);
          }
        } finally {
          leaseCheckInFlight = false;
        }
      };
      leaseTimer = setInterval(() => { void checkLease(); }, COMMAND_LEASE_CHECK_INTERVAL_MS);
      if (activeRun.cancellationError) {
        leaseCancellationError = activeRun.cancellationError;
        void terminateProcessTree(child).catch(() => child?.kill());
      }
      void checkLease();
      if (typeof command.stdin === "string" && command.stdin.length > 0) child.stdin.end(command.stdin);
      else child.stdin.end();
      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          // Wait for the process tree to close before reporting completion.
          // Codex and other CLIs can spawn children that continue writing.
          void terminateProcessTree(child).catch(() => child?.kill());
        }, timeoutMs);
      }
    });
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    if (process.platform !== "win32" && processScopeAlive(child)) await terminateProcessTree(child);
    if (leaseCancellationError || activeRun.cancellationError || result.timedOut) await terminateProcessTree(child);
    await processTerminations.get(child);
    leaseCancellationError ??= activeRun.cancellationError;
    await outputQueue;
    await completeCommand({
      hubUrl,
      nodeId,
      identity,
      accessToken,
      sessionCookie,
      commandId: command.id,
      completion: {
        status: result.exitCode === 0 && !result.timedOut && !leaseCancellationError ? "succeeded" : "failed",
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        error: leaseCancellationError ?? (result.timedOut ? `Local command exceeded ${timeoutMs}ms.` : null),
      },
    });
    return { ...result, workspace, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    // A failed kill is not a completion acknowledgement. Keep Core pending
    // rather than reporting that a still-live process has finished.
    if (child?.pid) {
      const termination = processTerminations.get(child);
      if (termination) await termination;
      else if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
    }
    await outputQueue.catch(() => undefined);
    await completeCommand({
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
    }).catch(() => undefined);
    throw error;
  } finally {
    await hostProjectShareSession?.close().catch(() => undefined);
    activeCommands.delete(command.id);
  }
}
