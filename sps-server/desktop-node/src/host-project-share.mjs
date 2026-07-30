import { constants, createDecipheriv, privateDecrypt } from "node:crypto";
import { spawn } from "node:child_process";

const UNC_SHARE_PATH = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(?:\\|$)/;
const LOCAL_SHARE_ACCOUNT = /^(?:[^\\/:*?"<>|]+\\)?[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SUPPORTED_CREDENTIAL_ALGORITHMS = new Set(["rsa-oaep-sha256", "rsa-oaep-sha256+a256gcm"]);
const BASE64_VALUE = /^[A-Za-z0-9+/]+={0,2}$/;

function readEnvelopeValue(value, expectedSharePath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SPS Desktop received an invalid Host Workspace Source access descriptor.");
  }
  if (
    (value.kind !== "sps_host_share" && value.kind !== "sps_workspace_source")
    || !SUPPORTED_CREDENTIAL_ALGORITHMS.has(value.credentialAlgorithm)
  ) {
    throw new Error("SPS Desktop received an unsupported Host Workspace Source access descriptor.");
  }
  if (typeof value.sharePath !== "string" || !UNC_SHARE_PATH.test(value.sharePath.trim())) {
    throw new Error("SPS Desktop received an invalid Host project share path.");
  }
  if (expectedSharePath && value.sharePath.trim().toLowerCase() !== expectedSharePath.trim().toLowerCase()) {
    throw new Error("SPS Desktop rejected a Host project share path that did not match the command workspace.");
  }
  if (typeof value.credentialEnvelope !== "string" || !BASE64_VALUE.test(value.credentialEnvelope)) {
    throw new Error("SPS Desktop received an invalid encrypted Host project share credential.");
  }
  return value;
}

export function decryptSpsWorkspaceSourceCredential(workspaceAccess, transportPrivateKeyPem, expectedSharePath = null) {
  const descriptor = readEnvelopeValue(workspaceAccess, expectedSharePath);
  if (typeof transportPrivateKeyPem !== "string" || !transportPrivateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("This SPS Desktop Node has no transport key for Host project source access. Reconnect this computer as an SPS Node.");
  }
  let plaintext;
  try {
    const decryptKey = (encryptedKey) => privateDecrypt(
      {
        key: transportPrivateKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encryptedKey, "base64"),
    );
    if (descriptor.credentialAlgorithm === "rsa-oaep-sha256") {
      plaintext = decryptKey(descriptor.credentialEnvelope).toString("utf8");
    } else {
      const envelope = JSON.parse(Buffer.from(descriptor.credentialEnvelope, "base64").toString("utf8"));
      if (
        envelope?.version !== 2
        || ![envelope.encryptedKey, envelope.initializationVector, envelope.ciphertext, envelope.authenticationTag].every((value) => typeof value === "string" && BASE64_VALUE.test(value))
      ) {
        throw new Error("Invalid hybrid envelope");
      }
      const contentEncryptionKey = decryptKey(envelope.encryptedKey);
      if (contentEncryptionKey.length !== 32) throw new Error("Invalid content-encryption key");
      const decipher = createDecipheriv("aes-256-gcm", contentEncryptionKey, Buffer.from(envelope.initializationVector, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    }
  } catch {
    throw new Error("SPS Desktop could not decrypt this Host project source credential. Ask the Owner Host to grant this computer again.");
  }
  let credential;
  try {
    credential = JSON.parse(plaintext);
  } catch {
    throw new Error("SPS Desktop received an invalid Host project source credential.");
  }
  if (
    credential?.version !== 1
    || typeof credential?.sharePath !== "string"
    || credential.sharePath.trim().toLowerCase() !== descriptor.sharePath.trim().toLowerCase()
    || typeof credential?.username !== "string"
    || !LOCAL_SHARE_ACCOUNT.test(credential.username)
    || typeof credential?.password !== "string"
    || credential.password.length < 16
    || credential.password.length > 512
  ) {
    throw new Error("SPS Desktop rejected an invalid Host project source credential.");
  }
  return {
    sharePath: descriptor.sharePath.trim(),
    username: credential.username,
    password: credential.password,
  };
}

function runWindowsNetUse(args, password = null) {
  return new Promise((resolve, reject) => {
    const child = spawn("net.exe", args, {
      windowsHide: true,
      stdio: [password == null ? "ignore" : "pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-2_000);
    });
    child.once("error", (error) => reject(error));
    child.once("close", (code) => {
      if (code === 0) return resolve();
      const detail = stderr.replace(/\s+/g, " ").trim();
      reject(new Error(detail ? `Windows could not connect the SPS Host project share (${detail}).` : "Windows could not connect the SPS Host project share."));
    });
    if (password != null) child.stdin?.end(`${password}\r\n`);
  });
}

export async function openSpsWorkspaceSourceRoute(workspaceAccess, transportPrivateKeyPem, options = {}) {
  if (!workspaceAccess) return null;
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    throw new Error("SPS Host project source sharing currently requires Windows on the Member Node.");
  }
  const credential = decryptSpsWorkspaceSourceCredential(
    workspaceAccess,
    transportPrivateKeyPem,
    options.expectedSharePath ?? null,
  );
  const runNetUse = options.runNetUse ?? runWindowsNetUse;
  // `*` keeps the password out of the process argument list. It is sent only
  // over net.exe's stdin and is never copied into the Agent CLI environment.
  await runNetUse(["use", credential.sharePath, `/user:${credential.username}`, "*"], credential.password);
  let closed = false;
  return {
    sharePath: credential.sharePath,
    async close() {
      if (closed) return;
      closed = true;
      await runNetUse(["use", credential.sharePath, "/delete", "/y"]).catch(() => undefined);
    },
  };
}

// Keep the Project-share names available for the existing compatibility path.
export const decryptSpsHostProjectShareCredential = decryptSpsWorkspaceSourceCredential;
export const openSpsHostProjectShare = openSpsWorkspaceSourceRoute;
