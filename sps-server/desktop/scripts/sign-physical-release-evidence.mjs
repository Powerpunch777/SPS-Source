import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPhysicalDeviceAttestation } from "./verify-physical-release-evidence.mjs";

const [inputPathValue, outputPathValue, role, keyPathValue] = process.argv.slice(2);
if (!inputPathValue || !outputPathValue || !["host", "member"].includes(role)) {
  throw new Error("Usage: sign-physical-release-evidence.mjs <input.json> <output.json> <host|member> [device-key.json]");
}
const defaultKeyPath = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "SPS",
  "release-evidence",
  "device-ed25519.json",
);
const inputPath = path.resolve(inputPathValue);
const outputPath = path.resolve(outputPathValue);
const keyPath = path.resolve(keyPathValue ?? defaultKeyPath);
const evidence = JSON.parse(await readFile(inputPath, "utf8"));
const identity = JSON.parse(await readFile(keyPath, "utf8"));
if (identity?.schemaVersion !== 1 || identity?.algorithm !== "ed25519" || !identity.publicKeyPem || !identity.privateKeyPem) {
  throw new Error("The physical release device identity is invalid.");
}
if (evidence?.devices?.[role]) throw new Error(`The ${role} attestation already exists and will not be overwritten.`);
evidence.devices = {
  ...(evidence.devices ?? {}),
  [role]: createPhysicalDeviceAttestation(evidence, {
    role,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
  }),
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(`Created signed SPS ${role} physical release evidence: ${outputPath}`);
