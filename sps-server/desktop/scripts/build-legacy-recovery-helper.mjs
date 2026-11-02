import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLegacyProgramInventory } from "../src/legacy-recovery/catalog.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(scriptDirectory, "..");
const recoveryDirectory = path.join(desktopDirectory, ".legacy-recovery");
const outputName = "SpsLegacyRecovery.exe";
const sourceDirectory = path.join(desktopDirectory, "src", "legacy-recovery");
const sourceNames = ["VerifiedResidue.cs", "PinnedProgramCatalog.cs", "LegacyRecoverySession.cs", "LegacyRecoveryApp.cs"];
const assetPath = path.join(desktopDirectory, "assets", "legacy-recovery", "program-inventory-0.4.86.json.gz");
const manifestPath = path.join(sourceDirectory, "app.manifest");
const maximumCompilerOutput = 1024 * 1024;

function sameWindowsPath(left, right) {
  return path.win32.normalize(left).replace(/[\\/]+$/, "").toLowerCase()
    === path.win32.normalize(right).replace(/[\\/]+$/, "").toLowerCase();
}

function assertPlain(details, location) {
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Legacy recovery output path contains a linked or non-directory component: ${location}`);
  }
}

async function assertPlainDirectory(directory) {
  const full = path.resolve(directory);
  if (!path.isAbsolute(full)) throw new Error("Legacy recovery output directory must be absolute.");
  const root = path.parse(full).root;
  let current = root;
  for (const part of full.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const details = await lstat(current);
    assertPlain(details, current);
    const canonical = await realpath(current);
    if (!sameWindowsPath(canonical, current)) throw new Error("Legacy recovery output path is not canonical.");
  }
  return { full, canonical: await realpath(full), identity: await lstat(full, { bigint: true }) };
}

async function ensureOutputDirectory(directory) {
  const full = path.resolve(directory);
  const root = path.parse(full).root;
  let current = root;
  for (const part of full.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const details = await lstat(current);
      assertPlain(details, current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(current);
      assertPlain(await lstat(current), current);
    }
    if (!sameWindowsPath(await realpath(current), current)) throw new Error("Legacy recovery output path is not canonical.");
  }
  return assertPlainDirectory(full);
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function verifyOwnedPath(root, target, identity, { directory = false } = {}) {
  const canonicalRoot = await realpath(root);
  const canonicalTarget = await realpath(target);
  if (!isContained(canonicalRoot, canonicalTarget)) throw new Error("Legacy recovery staging path escaped its owned output directory.");
  const details = await lstat(target, { bigint: true });
  if (details.isSymbolicLink() || (directory ? !details.isDirectory() : !details.isFile())
    || details.dev !== identity.dev || details.ino !== identity.ino || details.birthtimeNs !== identity.birthtimeNs) {
    throw new Error("Legacy recovery staging identity changed; refusing cleanup.");
  }
  return details;
}

async function verifyOutputDirectory(original) {
  const current = await assertPlainDirectory(original.full);
  if (!sameWindowsPath(current.canonical, original.canonical)
    || ["dev", "ino", "birthtimeNs"].some(key => current.identity[key] !== original.identity[key])) {
    throw new Error("Legacy recovery output directory identity changed.");
  }
}

async function runCompiler(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let oversized = false;
    const collect = chunk => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output, "utf8") > maximumCompilerOutput) {
        oversized = true;
        child.kill();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 60_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("Legacy recovery C# compilation exceeded 60 seconds."));
      if (oversized) return reject(new Error("Legacy recovery compiler output exceeded its bound."));
      if (code !== 0) return reject(new Error(`Legacy recovery C# compilation failed (${code}).\n${output.slice(-maximumCompilerOutput)}`));
      resolve();
    });
  });
}

async function assertPeExecutable(file) {
  const handle = await readFile(file);
  if (handle.length < 256 || handle.toString("ascii", 0, 2) !== "MZ") throw new Error("Csc did not produce a valid Windows executable.");
  const peOffset = handle.readUInt32LE(0x3c);
  if (peOffset + 26 > handle.length || handle.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
    || handle.readUInt16LE(peOffset + 4) !== 0x8664 || handle.readUInt16LE(peOffset + 24) !== 0x20b
    || handle.readUInt16LE(peOffset + 24 + 68) !== 2) {
    throw new Error("Csc output is not an x64 Windows GUI executable.");
  }
}

export async function buildLegacyRecoveryHelper(ownedOutputDirectory = recoveryDirectory) {
  if (process.platform !== "win32") throw new Error("Legacy recovery helper can only be built on Windows.");
  if (typeof ownedOutputDirectory !== "string" || !path.isAbsolute(ownedOutputDirectory)) {
    throw new Error("Legacy recovery output directory must be an absolute path.");
  }
  const windir = process.env.WINDIR;
  if (!windir || !path.win32.isAbsolute(windir)) throw new Error("WINDIR is unavailable; refusing to locate Csc.");
  const outputDirectory = await ensureOutputDirectory(ownedOutputDirectory);
  const finalPath = path.join(outputDirectory.full, outputName);
  try {
    const current = await lstat(finalPath);
    if (current.isSymbolicLink() || !current.isFile()) throw new Error("Existing legacy recovery output is linked or not a regular file.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const packed = await readFile(assetPath);
  decodeLegacyProgramInventory(packed);
  await verifyOutputDirectory(outputDirectory);

  const stagePath = path.join(outputDirectory.full, `.legacy-recovery-stage-${randomBytes(16).toString("hex")}`);
  await mkdir(stagePath);
  const stageIdentity = await lstat(stagePath, { bigint: true });
  const stageExe = path.join(stagePath, outputName);
  const stageAsset = path.join(stagePath, "program-inventory.json.gz");
  let assetIdentity;
  let exeIdentity;
  try {
    await verifyOutputDirectory(outputDirectory);
    await verifyOwnedPath(outputDirectory.full, stagePath, stageIdentity, { directory: true });
    await writeFile(stageAsset, packed, { flag: "wx" });
    assetIdentity = await lstat(stageAsset, { bigint: true });
    const csc = path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    const sources = sourceNames.map(name => path.join(sourceDirectory, name));
    const args = ["/noconfig", "/target:winexe", "/platform:x64", "/main:Sps.LegacyRecovery.LegacyRecoveryApp",
      `/win32manifest:${manifestPath}`, `/resource:${stageAsset},Sps.LegacyProgramInventory`, `/out:${stageExe}`,
      "/reference:System.dll", "/reference:System.Core.dll", "/reference:System.Xml.dll", "/reference:System.Runtime.Serialization.dll",
      "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", ...sources];
    await runCompiler(csc, args);
    exeIdentity = await lstat(stageExe, { bigint: true });
    if (!exeIdentity.isFile() || exeIdentity.size === 0n) throw new Error("Csc produced no legacy recovery executable.");
    await assertPeExecutable(stageExe);
    await verifyOwnedPath(outputDirectory.full, stagePath, stageIdentity, { directory: true });
    await verifyOwnedPath(outputDirectory.full, stageAsset, assetIdentity);
    await verifyOwnedPath(outputDirectory.full, stageExe, exeIdentity);
    await verifyOutputDirectory(outputDirectory);
    try {
      const existing = await lstat(finalPath);
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("Existing legacy recovery output is linked or not a regular file.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(stageExe, finalPath);
    await verifyOutputDirectory(outputDirectory);
    await verifyOwnedPath(outputDirectory.full, stageAsset, assetIdentity);
    await unlink(stageAsset);
    await verifyOwnedPath(outputDirectory.full, stagePath, stageIdentity, { directory: true });
    await verifyOwnedPath(outputDirectory.full, stageAsset, assetIdentity).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(stagePath);
    return finalPath;
  } catch (error) {
    try {
      await verifyOutputDirectory(outputDirectory);
      await verifyOwnedPath(outputDirectory.full, stagePath, stageIdentity, { directory: true });
      for (const [file, identity] of [[stageExe, exeIdentity], [stageAsset, assetIdentity]]) {
        if (!identity) continue;
        try {
          await verifyOwnedPath(outputDirectory.full, file, identity);
          await unlink(file);
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") throw cleanupError;
        }
      }
      await verifyOwnedPath(outputDirectory.full, stagePath, stageIdentity, { directory: true });
      await rmdir(stagePath);
    } catch { /* Preserve unexpected or replaced staging entries for inspection. */ }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write("This build script accepts no command-line arguments.\n");
    process.exitCode = 1;
  } else {
    try {
      const output = await buildLegacyRecoveryHelper();
      process.stdout.write(`Built ${output}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
