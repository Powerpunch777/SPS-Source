import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpsHostProjectShareCredential,
  sealSpsHostProjectShareCredential,
  spsHostProjectShareName,
  spsHostProjectSharePath,
  updateSpsHostProjectShareWindowsAccess,
} from "../src/host-project-share.mjs";

test("derives an SPS-only Windows project share address from a project and Tailnet host", () => {
  const shareName = spsHostProjectShareName("f7987a5d-ffb6-4308-93d2-bfaf72d18d74");
  assert.equal(shareName, "SPS_f7987a5dffb6430893d2bfaf72d18d74");
  assert.equal(
    spsHostProjectSharePath("MAIN-PC.TAIL1725C2.TS.NET", shareName),
    `\\\\main-pc.tail1725c2.ts.net\\${shareName}`,
  );
});

test("seals a long project-share credential with a hybrid Node envelope", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sharePath = "\\\\main-computer.tail1725c2.ts.net\\SPS_f7987a5dffb6430893d2bfaf72d18d74";
  const credential = createSpsHostProjectShareCredential("node-123", () => Buffer.alloc(30, 7));
  const envelope = sealSpsHostProjectShareCredential({
    sharePath,
    hostAccountName: "MAIN-PC",
    transportPublicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    ...credential,
  });
  assert.equal(envelope.includes(credential.password), false);
  const outer = JSON.parse(Buffer.from(envelope, "base64").toString("utf8"));
  assert.equal(outer.version, 2);
  assert.equal(outer.ciphertext.includes(credential.password), false);
  const contentEncryptionKey = privateDecrypt({
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, Buffer.from(outer.encryptedKey, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", contentEncryptionKey, Buffer.from(outer.initializationVector, "base64"));
  decipher.setAuthTag(Buffer.from(outer.authenticationTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(outer.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  assert.deepEqual(JSON.parse(plaintext), {
    version: 1,
    sharePath,
    username: `MAIN-PC\\${credential.username}`,
    password: credential.password,
  });
});

test("keeps generated Windows project-share accounts within the local-user limit", () => {
  const credential = createSpsHostProjectShareCredential("b6bc1dc2-d7e7-4811-8284-c224309b2528");
  assert.equal(credential.username, "spsws_b6bc1dc2d7e748");
  assert.ok(credential.username.length <= 20);
});

test("isolates Windows share accounts by Source and Node", () => {
  const random = () => Buffer.alloc(30, 9);
  const first = createSpsHostProjectShareCredential("node-123", random, "source-a");
  const same = createSpsHostProjectShareCredential("node-123", random, "source-a");
  const secondSource = createSpsHostProjectShareCredential("node-123", random, "source-b");
  const secondNode = createSpsHostProjectShareCredential("node-456", random, "source-a");
  assert.equal(first.username, same.username);
  assert.notEqual(first.username, secondSource.username);
  assert.notEqual(first.username, secondNode.username);
  assert.ok(first.username.length <= 20);
});

test("runs the Windows Host share worker through UAC without exposing its password in arguments", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-host-share-test-"));
  const sourcePath = path.join(temporaryRoot, "source");
  await fs.mkdir(sourcePath);
  try {
    const calls = [];
    const password = "TailscaleSafePassword123456";
    const result = await updateSpsHostProjectShareWindowsAccess({
      sourcePath,
      shareName: "SPS_project",
      accountName: "spsws_node123",
      password,
      action: "grant",
    }, {
      platform: "win32",
      temporaryRoot,
      random: () => Buffer.alloc(16, 3),
      runPowerShell: async (args) => { calls.push(args); },
    });
    assert.equal(result.shareName, "SPS_project");
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(calls[0]).includes(password), false);
    assert.match(calls[0].join(" "), /SPS elevation was cancelled/);
    assert.match(calls[0].join(" "), /Start-Process[^\n]*-Verb RunAs -WindowStyle Hidden/);
    const tempEntries = await fs.readdir(temporaryRoot);
    assert.deepEqual(tempEntries, ["source"]);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("can remove a stale Host share after its source folder is gone", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-host-share-remove-test-"));
  try {
    const calls = [];
    const result = await updateSpsHostProjectShareWindowsAccess({
      sourcePath: path.join(temporaryRoot, "missing-source"),
      shareName: "SPS_stale_source",
      accountName: "",
      password: "",
      action: "remove",
    }, {
      platform: "win32",
      temporaryRoot,
      random: () => Buffer.alloc(16, 4),
      runPowerShell: async (args) => { calls.push(args); },
    });
    assert.equal(result.action, "remove");
    assert.equal(calls.length, 1);
    assert.deepEqual(await fs.readdir(temporaryRoot), []);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("revoke only reports success after exact share access, ACL command, and local-user cleanup checks", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-host-share-revoke-test-"));
  const sourcePath = path.join(temporaryRoot, "source");
  await fs.mkdir(sourcePath);
  let workerSource = "";
  try {
    await updateSpsHostProjectShareWindowsAccess({
      sourcePath,
      shareName: "SPS_project",
      accountName: "spsws_node123",
      password: "",
      action: "revoke",
    }, {
      platform: "win32",
      temporaryRoot,
      random: () => Buffer.alloc(16, 5),
      runPowerShell: async (args) => {
        const elevatedScript = args.at(-1);
        const paths = elevatedScript.match(/'-File','([^']+)','-ConfigPath','([^']+)'/);
        assert.ok(paths, "the injected runner should receive the generated worker and config paths");
        workerSource = await fs.readFile(paths[1], "utf8");
        const config = JSON.parse(await fs.readFile(paths[2], "utf8"));
        await fs.writeFile(config.resultPath, JSON.stringify({ ok: true, reason: "" }));
      },
    });

    const revokeBranch = workerSource.slice(workerSource.indexOf("if ($action -eq 'revoke')"), workerSource.indexOf("if ($action -eq 'remove')"));
    assert.match(workerSource, /function Get-SpsOptionalShare\(\[string\]\$Name\) \{\s*\$matches = @\(Get-SmbShare -ErrorAction Stop \| Where-Object \{ \$_\.Name -ieq \$Name \}\)/);
    assert.match(workerSource, /function Get-SpsOptionalLocalUser\(\[string\]\$Name\) \{\s*\$matches = @\(Get-LocalUser -ErrorAction Stop \| Where-Object \{ \$_\.Name -ieq \$Name \}\)/);
    assert.doesNotMatch(workerSource.slice(workerSource.indexOf("function Get-SpsOptionalShare"), workerSource.indexOf("trap {")), /SilentlyContinue/);
    assert.match(workerSource, /trap \{\s*\$reason = switch \(\$action\)/);
    assert.doesNotMatch(workerSource, /\[string\]\$_.Exception.Message/);
    assert.match(revokeBranch, /Get-SpsOptionalShare \$shareName/);
    assert.match(revokeBranch, /GetFullPath\(\[string\]\$share\.Path\) -ne \$sourcePath/);
    assert.match(revokeBranch, /Get-SmbShareAccess -Name \$shareName -ErrorAction Stop/);
    assert.match(revokeBranch, /Revoke-SmbShareAccess -Name \$shareName -AccountName \$qualifiedAccount -Force -ErrorAction Stop/);
    assert.match(revokeBranch, /remainingShareAccess\.Count -gt 0/);
    assert.match(revokeBranch, /icacls\.exe \$sourcePath \/remove:g "\*\$\(\$localUser\.SID\.Value\)" \/t \/c \/q/);
    assert.match(revokeBranch, /\$LASTEXITCODE -ne 0/);
    assert.match(revokeBranch, /Remove-LocalUser -Name \$accountName -ErrorAction Stop/);
    assert.match(revokeBranch, /Get-SpsOptionalLocalUser \$accountName\)\) \{ throw/);
    assert.doesNotMatch(revokeBranch, /SilentlyContinue/);
    assert.match(revokeBranch, /Write-SpsHostShareResult \$true/);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("remove confirms share and account closure and checks ACL command failures", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-host-share-remove-contract-test-"));
  const sourcePath = path.join(temporaryRoot, "source");
  await fs.mkdir(sourcePath);
  let workerSource = "";
  try {
    await updateSpsHostProjectShareWindowsAccess({
      sourcePath,
      shareName: "SPS_project",
      accountName: "spsws_node123",
      password: "",
      action: "remove",
    }, {
      platform: "win32",
      temporaryRoot,
      random: () => Buffer.alloc(16, 6),
      runPowerShell: async (args) => {
        const paths = args.at(-1).match(/'-File','([^']+)','-ConfigPath','([^']+)'/);
        assert.ok(paths, "the injected runner should receive the generated worker and config paths");
        workerSource = await fs.readFile(paths[1], "utf8");
        const config = JSON.parse(await fs.readFile(paths[2], "utf8"));
        await fs.writeFile(config.resultPath, JSON.stringify({ ok: true, reason: "" }));
      },
    });

    const removeBranch = workerSource.slice(workerSource.indexOf("if ($action -eq 'remove')"), workerSource.indexOf("throw 'Invalid SPS Host project share action.'"));
    assert.match(removeBranch, /Get-SpsOptionalShare \$shareName/);
    assert.match(removeBranch, /GetFullPath\(\[string\]\$share\.Path\) -ne \$sourcePath/);
    assert.match(removeBranch, /Remove-SmbShare -Name \$shareName -Force -ErrorAction Stop/);
    assert.match(removeBranch, /if \(\$null -ne \(Get-SpsOptionalShare \$shareName\)\) \{ throw/);
    assert.match(removeBranch, /Get-SpsOptionalLocalUser \$accountName/);
    assert.match(removeBranch, /icacls\.exe \$sourcePath \/remove:g "\*\$\(\$localUser\.SID\.Value\)" \/t \/c \/q/);
    assert.match(removeBranch, /\$LASTEXITCODE -ne 0/);
    assert.match(removeBranch, /Remove-LocalUser -Name \$accountName -ErrorAction Stop/);
    assert.match(removeBranch, /Get-SpsOptionalLocalUser \$accountName\)\) \{ throw/);
    assert.doesNotMatch(removeBranch, /SilentlyContinue/);
    assert.match(removeBranch, /Write-SpsHostShareResult \$true/);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
