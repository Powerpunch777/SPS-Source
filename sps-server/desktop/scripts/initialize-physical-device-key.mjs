import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const defaultPath = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "SPS",
  "release-evidence",
  "device-ed25519.json",
);
const outputPath = path.resolve(process.argv[2] ?? defaultPath);
if (existsSync(outputPath)) throw new Error(`Physical release device key already exists: ${outputPath}`);

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const identity = {
  schemaVersion: 1,
  algorithm: "ed25519",
  publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  createdAt: new Date().toISOString(),
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
if (process.platform === "win32") {
  const principal = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  execFileSync("icacls.exe", [outputPath, "/inheritance:r", "/grant:r", `${principal}:(F)`, "SYSTEM:(F)"], {
    stdio: "ignore",
    windowsHide: true,
  });
}
console.log(`Created the device-local SPS physical evidence key: ${outputPath}`);
console.log("Keep this private key on this Windows device and never include it in release evidence.");
