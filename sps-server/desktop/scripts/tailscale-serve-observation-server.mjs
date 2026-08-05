import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function headerValue(request, name) {
  const value = request.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function responseCapture(httpStatus, body) {
  return {
    httpStatus,
    responseBodyBase64: Buffer.from(body, "utf8").toString("base64"),
  };
}

export function createServeCaptureRecorder({
  outputPath,
  releaseNonce,
  servePath,
  backendPort,
  hostTailscaleVersion,
  memberTailscaleVersion,
  runtimeArchiveSha256,
  requestHostnameModuleSha256,
  completedAt = () => new Date().toISOString(),
  onComplete,
} = {}) {
  if (!outputPath || !/^[0-9a-f]{64}$/.test(String(releaseNonce ?? ""))) {
    throw new Error("Observation capture requires an output path and release nonce.");
  }
  const responses = {};
  let writePromise = null;
  return async function record(httpStatus, observation, body) {
    if (observation.accepted && observation.parsedIdentity.source === "tailscale-serve") {
      responses.memberResponse = responseCapture(httpStatus, body);
    } else if (!observation.accepted && observation.parsedIdentity.source === "direct") {
      responses.directSpoofResponse = responseCapture(httpStatus, body);
    }
    if (!responses.memberResponse || !responses.directSpoofResponse || writePromise) return writePromise;
    const capture = {
      schemaVersion: 1,
      releaseNonce,
      completedAt: completedAt(),
      servePath,
      backendPort,
      hostTailscaleVersion,
      memberTailscaleVersion,
      runtimeArchiveSha256,
      requestHostnameModuleSha256,
      memberResponse: responses.memberResponse,
      directSpoofResponse: responses.directSpoofResponse,
    };
    writePromise = writeFile(path.resolve(outputPath), `${JSON.stringify(capture, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    }).then(() => {
      onComplete?.(capture);
      return capture;
    });
    return writePromise;
  };
}

export function sanitizedServeObservation(identity) {
  return {
    accepted: identity?.source === "tailscale-serve",
    parsedIdentity: {
      source: identity?.source ?? "unknown",
      peer: identity?.peer ?? "unknown",
      identity: identity?.identity ? { present: true } : null,
    },
  };
}

export async function startTailscaleServeObservationServer({
  modulePath,
  expectedModuleSha256,
  port,
  servePath,
  captureRecorder,
} = {}) {
  const resolvedModulePath = path.resolve(String(modulePath ?? ""));
  const moduleBytes = await readFile(resolvedModulePath);
  const moduleSha256 = createHash("sha256").update(moduleBytes).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(String(expectedModuleSha256 ?? ""))
      || moduleSha256 !== expectedModuleSha256) {
    throw new Error("The loaded request-hostname module does not match the release manifest.");
  }
  if (!Number.isSafeInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw new Error("Observation server port is invalid.");
  if (!/^\/__sps-[a-z0-9-]{1,80}$/.test(String(servePath ?? ""))) throw new Error("Observation Serve path is invalid.");
  const { requestHostIdentity } = await import(pathToFileURL(resolvedModulePath).href);
  if (typeof requestHostIdentity !== "function") throw new Error("The packaged request-hostname module has no requestHostIdentity export.");

  const server = createServer((request, response) => {
    if (request.url !== servePath) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: false, error: "not-found" }));
      return;
    }
    const identity = requestHostIdentity({
      header: (name) => headerValue(request, name),
      socket: request.socket,
    });
    const observation = sanitizedServeObservation(identity);
    const httpStatus = observation.accepted ? 200 : 403;
    const body = JSON.stringify(observation);
    response.writeHead(httpStatus, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(body);
    void captureRecorder?.(httpStatus, observation, body).catch((error) => {
      process.stderr.write(`SPS Serve capture failed: ${error.message}\n`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  return { server, moduleSha256, port: typeof address === "object" && address ? address.port : port, servePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const configPath = process.argv[2];
  if (!configPath) throw new Error("Usage: tailscale-serve-observation-server.mjs <private-config.json>");
  const config = JSON.parse((await readFile(path.resolve(configPath), "utf8")).replace(/^\uFEFF/, ""));
  const runtimeArchiveSha256 = await sha256File(path.resolve(config.runtimeArchivePath));
  if (runtimeArchiveSha256 !== config.expectedRuntimeArchiveSha256) {
    throw new Error("The observed Owner Host runtime archive does not match the release manifest.");
  }
  const captureRecorder = createServeCaptureRecorder({
    outputPath: config.captureOutputPath,
    releaseNonce: config.releaseNonce,
    servePath: config.servePath,
    backendPort: Number(config.port),
    hostTailscaleVersion: JSON.parse(await readFile(path.resolve(config.hostTailscaleVersionPath), "utf8")),
    memberTailscaleVersion: JSON.parse(await readFile(path.resolve(config.memberTailscaleVersionPath), "utf8")),
    runtimeArchiveSha256,
    requestHostnameModuleSha256: config.expectedModuleSha256,
    onComplete: () => process.stdout.write(`${JSON.stringify({ captureComplete: true })}\n`),
  });
  const result = await startTailscaleServeObservationServer({
    modulePath: config.modulePath,
    expectedModuleSha256: config.expectedModuleSha256,
    port: Number(config.port),
    servePath: config.servePath,
    captureRecorder,
  });
  process.stdout.write(`${JSON.stringify({
    ready: true,
    moduleSha256: result.moduleSha256,
    port: result.port,
    servePath: result.servePath,
  })}\n`);
}
