import { createHash } from "node:crypto";
import { parseSpsTailscaleVersion } from "../src/team-access.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_REVISION = /^[0-9a-f]{40}$/;
const SIGNATURE_STATUSES = new Set(["Valid", "NotSigned"]);
const MAX_EVIDENCE_BYTES = 8 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const TAILSCALE_SERVE_EVIDENCE_ARTIFACT_NAME = "tailscale-serve-evidence.json";

function canonicalBase64(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} is not canonical Base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) throw new Error(`${label} is not canonical Base64.`);
  return decoded;
}

function exactKeys(value, expected, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${label} contains missing or unsupported fields.`);
    return false;
  }
  return true;
}

function safeServePath(value) {
  return typeof value === "string" && /^\/__sps-[a-z0-9-]{1,80}$/.test(value);
}

function observationCommands(servePath, backendPort) {
  return [
    `member: GET https://<tailnet-host>${servePath}`,
    `host: GET http://127.0.0.1:${backendPort}${servePath} with Host=<tailnet-host> and no Serve headers`,
  ];
}

function responseObservation(response, expected) {
  const content = canonicalBase64(response?.responseBodyBase64, `${expected.label} response body`);
  let parsed;
  try {
    parsed = JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${expected.label} response body is not JSON.`);
  }
  const observation = {
    httpStatus: response?.httpStatus,
    responseSha256: createHash("sha256").update(content).digest("hex"),
    accepted: parsed?.accepted,
    source: parsed?.parsedIdentity?.source,
    peer: parsed?.parsedIdentity?.peer,
    identityPresent: Boolean(parsed?.parsedIdentity?.identity),
  };
  if (observation.httpStatus !== expected.httpStatus
      || observation.accepted !== expected.accepted
      || observation.source !== expected.source
      || observation.peer !== "loopback"
      || observation.identityPresent !== expected.identityPresent) {
    throw new Error(`${expected.label} response does not match the SPS Serve transport contract.`);
  }
  return observation;
}

function normalizedVersion(raw, label) {
  try {
    const parsed = parseSpsTailscaleVersion(raw);
    if (!parsed.supported) throw new Error();
    return parsed.version;
  } catch {
    throw new Error(`${label} Tailscale version is unsupported or invalid.`);
  }
}

export function createTailscaleServeReleaseEvidence({
  capture,
  releaseManifest,
  releaseChallenge,
  installerSignatureStatus,
} = {}) {
  const errors = [];
  exactKeys(capture, [
    "schemaVersion",
    "releaseNonce",
    "completedAt",
    "servePath",
    "backendPort",
    "hostTailscaleVersion",
    "memberTailscaleVersion",
    "runtimeArchiveSha256",
    "requestHostnameModuleSha256",
    "memberResponse",
    "directSpoofResponse",
  ], "Private Serve capture", errors);
  if (capture?.schemaVersion !== 1 || errors.length > 0) throw new Error(errors.join("\n") || "Private Serve capture schema is invalid.");
  if (!SIGNATURE_STATUSES.has(installerSignatureStatus)) throw new Error("Installer signature status is unsupported.");
  const baseline = releaseManifest?.baseline;
  const installer = releaseManifest?.artifacts?.installer;
  const runtime = releaseManifest?.ownerHostRuntime;
  if (!baseline || !installer || !runtime) throw new Error("Release manifest lacks the candidate, installer, or Owner Host runtime identity.");
  if (releaseChallenge?.desktopVersion !== baseline.desktopVersion
      || releaseChallenge?.sourceRevision !== baseline.sourceRevision
      || releaseChallenge?.installerSha256 !== installer.sha256
      || !SHA256.test(releaseChallenge?.releaseNonce ?? "")) {
    throw new Error("Serve evidence requires the exact immutable release challenge.");
  }
  if (capture.releaseNonce !== releaseChallenge.releaseNonce) {
    throw new Error("Private Serve capture is not bound to this release challenge nonce.");
  }
  const hostVersion = normalizedVersion(capture.hostTailscaleVersion, "Host");
  const memberVersion = normalizedVersion(capture.memberTailscaleVersion, "Member");
  if (capture.runtimeArchiveSha256 !== runtime.archive?.sha256
      || capture.requestHostnameModuleSha256 !== runtime.requestHostnameModule?.sha256) {
    throw new Error("Private Serve capture was not produced by the packaged Owner Host runtime in this release manifest.");
  }
  const evidence = {
    schemaVersion: 1,
    evidenceType: "sps-tailscale-serve",
    status: installerSignatureStatus === "Valid" ? "stable" : "development-smoke",
    releaseNonce: releaseChallenge.releaseNonce,
    completedAt: capture.completedAt,
    candidate: {
      desktopVersion: baseline.desktopVersion,
      sourceRevision: baseline.sourceRevision,
      coreRevision: baseline.core?.revision,
      pluginSdkRevision: baseline.pluginSdk?.revision,
    },
    installer: {
      version: baseline.desktopVersion,
      sizeBytes: installer.sizeBytes,
      sha256: installer.sha256,
      signatureStatus: installerSignatureStatus,
    },
    runtime: {
      archiveSizeBytes: runtime.archive?.sizeBytes,
      archiveSha256: runtime.archive?.sha256,
      runtimeManifestSha256: runtime.runtimeManifestSha256,
      requestHostnameModuleSha256: runtime.requestHostnameModule?.sha256,
    },
    transport: {
      minimumVersion: baseline.platform?.minimumRemoteTransportVersion,
      hostVersion,
      memberVersion,
      servePath: capture.servePath,
      backendPort: capture.backendPort,
    },
    observations: {
      member: responseObservation(capture.memberResponse, {
        label: "Member Serve",
        httpStatus: 200,
        accepted: true,
        source: "tailscale-serve",
        identityPresent: true,
      }),
      directSpoof: responseObservation(capture.directSpoofResponse, {
        label: "Direct spoof",
        httpStatus: 403,
        accepted: false,
        source: "direct",
        identityPresent: false,
      }),
    },
    commands: observationCommands(capture.servePath, capture.backendPort),
  };
  const validation = validateTailscaleServeReleaseEvidence(evidence, {
    candidate: baseline,
    sourceRevision: baseline.sourceRevision,
    installer,
    ownerHostRuntime: runtime,
    releaseChallenge,
    now: Date.parse(capture.completedAt),
  });
  if (validation.length > 0) throw new Error(validation.join("\n"));
  return evidence;
}

export function validateTailscaleServeReleaseEvidence(evidence, {
  candidate,
  sourceRevision,
  installer,
  ownerHostRuntime,
  releaseChallenge,
  requireStable = false,
  now = Date.now(),
  maxAgeMs = MAX_AGE_MS,
} = {}) {
  const errors = [];
  exactKeys(evidence, ["schemaVersion", "evidenceType", "status", "releaseNonce", "completedAt", "candidate", "installer", "runtime", "transport", "observations", "commands"], "Serve evidence", errors);
  exactKeys(evidence?.candidate, ["desktopVersion", "sourceRevision", "coreRevision", "pluginSdkRevision"], "Serve candidate", errors);
  exactKeys(evidence?.installer, ["version", "sizeBytes", "sha256", "signatureStatus"], "Serve installer", errors);
  exactKeys(evidence?.runtime, ["archiveSizeBytes", "archiveSha256", "runtimeManifestSha256", "requestHostnameModuleSha256"], "Serve runtime", errors);
  exactKeys(evidence?.transport, ["minimumVersion", "hostVersion", "memberVersion", "servePath", "backendPort"], "Serve transport", errors);
  exactKeys(evidence?.observations, ["member", "directSpoof"], "Serve observations", errors);
  for (const name of ["member", "directSpoof"]) {
    exactKeys(evidence?.observations?.[name], ["httpStatus", "responseSha256", "accepted", "source", "peer", "identityPresent"], `Serve ${name} observation`, errors);
  }
  if (evidence?.schemaVersion !== 1 || evidence?.evidenceType !== "sps-tailscale-serve") errors.push("Serve evidence schema identity is invalid.");
  if (!new Set(["development-smoke", "stable"]).has(evidence?.status)) errors.push("Serve evidence status is invalid.");
  if (requireStable && evidence?.status !== "stable") errors.push("Stable release requires stable Serve evidence.");
  if (!SHA256.test(evidence?.releaseNonce ?? "") || evidence.releaseNonce !== releaseChallenge?.releaseNonce) errors.push("Serve evidence is not bound to the release challenge nonce.");
  if (releaseChallenge?.desktopVersion !== candidate?.desktopVersion
      || releaseChallenge?.sourceRevision !== sourceRevision
      || releaseChallenge?.installerSha256 !== installer?.sha256) {
    errors.push("Serve evidence release challenge does not match the candidate.");
  }
  if (!GIT_REVISION.test(sourceRevision ?? "")
      || evidence?.candidate?.desktopVersion !== candidate?.desktopVersion
      || evidence?.candidate?.sourceRevision !== sourceRevision
      || evidence?.candidate?.coreRevision !== candidate?.core?.revision
      || evidence?.candidate?.pluginSdkRevision !== candidate?.pluginSdk?.revision) {
    errors.push("Serve evidence candidate tuple is invalid.");
  }
  if (evidence?.installer?.version !== candidate?.desktopVersion
      || evidence?.installer?.sizeBytes !== installer?.sizeBytes
      || evidence?.installer?.sha256 !== installer?.sha256
      || !SHA256.test(evidence?.installer?.sha256 ?? "")
      || !SIGNATURE_STATUSES.has(evidence?.installer?.signatureStatus)) {
    errors.push("Serve evidence installer identity is invalid.");
  }
  if ((evidence?.status === "stable") !== (evidence?.installer?.signatureStatus === "Valid")) {
    errors.push("Serve evidence status does not match the installer signature.");
  }
  if (evidence?.runtime?.archiveSizeBytes !== ownerHostRuntime?.archive?.sizeBytes
      || evidence?.runtime?.archiveSha256 !== ownerHostRuntime?.archive?.sha256
      || evidence?.runtime?.runtimeManifestSha256 !== ownerHostRuntime?.runtimeManifestSha256
      || evidence?.runtime?.requestHostnameModuleSha256 !== ownerHostRuntime?.requestHostnameModule?.sha256
      || !Number.isSafeInteger(evidence?.runtime?.archiveSizeBytes)
      || evidence.runtime.archiveSizeBytes <= 0
      || !SHA256.test(evidence?.runtime?.archiveSha256 ?? "")
      || !SHA256.test(evidence?.runtime?.runtimeManifestSha256 ?? "")
      || !SHA256.test(evidence?.runtime?.requestHostnameModuleSha256 ?? "")) {
    errors.push("Serve evidence Owner Host runtime identity is invalid.");
  }
  const completedAt = Date.parse(evidence?.completedAt ?? "");
  if (!Number.isFinite(completedAt) || completedAt > now + 5 * 60_000 || now - completedAt > maxAgeMs) errors.push("Serve evidence timestamp is invalid or stale.");
  if (evidence?.transport?.minimumVersion !== candidate?.platform?.minimumRemoteTransportVersion) errors.push("Serve evidence minimum Tailscale version is invalid.");
  for (const role of ["host", "member"]) {
    try {
      const parsed = parseSpsTailscaleVersion({ short: evidence?.transport?.[`${role}Version`] });
      if (!parsed.supported || parsed.version !== evidence.transport[`${role}Version`]) throw new Error();
    } catch {
      errors.push(`Serve evidence ${role} Tailscale version is unsupported or invalid.`);
    }
  }
  if (!safeServePath(evidence?.transport?.servePath)
      || !Number.isSafeInteger(evidence?.transport?.backendPort)
      || evidence.transport.backendPort < 1024
      || evidence.transport.backendPort > 65535) {
    errors.push("Serve evidence route contract is invalid.");
  }
  const member = evidence?.observations?.member;
  if (member?.httpStatus !== 200 || member?.accepted !== true || member?.source !== "tailscale-serve" || member?.peer !== "loopback" || member?.identityPresent !== true || !SHA256.test(member?.responseSha256 ?? "")) {
    errors.push("Serve evidence Member observation is invalid.");
  }
  const direct = evidence?.observations?.directSpoof;
  if (direct?.httpStatus !== 403 || direct?.accepted !== false || direct?.source !== "direct" || direct?.peer !== "loopback" || direct?.identityPresent !== false || !SHA256.test(direct?.responseSha256 ?? "")) {
    errors.push("Serve evidence direct-spoof observation is invalid.");
  }
  if (member?.responseSha256 && member.responseSha256 === direct?.responseSha256) errors.push("Serve evidence responses must be distinct.");
  const expectedCommands = observationCommands(evidence?.transport?.servePath, evidence?.transport?.backendPort);
  if (!Array.isArray(evidence?.commands) || JSON.stringify(evidence.commands) !== JSON.stringify(expectedCommands)) errors.push("Serve evidence commands are missing or not anonymized.");
  if (Buffer.byteLength(JSON.stringify(evidence), "utf8") > MAX_EVIDENCE_BYTES) errors.push("Serve evidence exceeds the public evidence size limit.");
  return errors;
}
