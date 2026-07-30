import { createSignedHeartbeat, createSignedNodeRequest } from "./identity.mjs";
import { normalizeHubUrl } from "./protocol.mjs";

export class SpsHubRequestError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = "SpsHubRequestError";
    this.status = status;
    this.code = typeof code === "string" && code.trim() ? code.trim() : null;
  }
}

function apiUrl(hubUrl, path) {
  const hub = new URL(normalizeHubUrl(hubUrl));
  return `${hub.origin}/api${path}`;
}

export async function probeSpsHub({
  fetchImpl = fetch,
  hubUrl,
}) {
  const response = await fetchImpl(apiUrl(hubUrl, "/health"), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A healthy Hub may be behind a proxy that returns an empty health body.
  }
  if (!response.ok) {
    throw new SpsHubRequestError(
      response.status,
      data?.error ?? `SPS Hub health check failed with ${response.status}`,
      data?.code,
    );
  }
  return data;
}

async function requestJson(fetchImpl, url, method, body, accessToken, sessionCookie) {
  // Desktop Node requests run in Electron's main process, not a browser. Add
  // the Hub's own Origin explicitly so authenticated mutation guards can
  // distinguish this signed-in Desktop request from an untrusted cross-site
  // request.
  const headers = {
    "content-type": "application/json",
    origin: new URL(url).origin,
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (sessionCookie) headers.cookie = `sps_identity_session=${encodeURIComponent(sessionCookie)}`;
  const response = await fetchImpl(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new SpsHubRequestError(
      response.status,
      data?.error ?? `SPS Hub request failed with ${response.status}`,
      data?.code,
    );
  }
  return data;
}

async function signedNodeRequestJson({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  method,
  path,
  payload,
}) {
  const body = createSignedNodeRequest({ identity, nodeId, method, path, payload });
  return requestJson(fetchImpl, apiUrl(hubUrl, path), method, body, accessToken, sessionCookie);
}

export async function startSpsDesktopAuth({
  fetchImpl = fetch,
  hubUrl,
  companyId,
  clientName = "SPS Desktop",
}) {
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, "/cli-auth/challenges"),
    "POST",
    {
      command: "SPS Desktop Node connection",
      clientName,
      requestedAccess: "board",
      ...(companyId ? { requestedCompanyId: companyId } : {}),
    },
  );
}

export async function listSpsCompanies({
  fetchImpl = fetch,
  hubUrl,
  accessToken,
  sessionCookie,
}) {
  return requestJson(fetchImpl, apiUrl(hubUrl, "/companies"), "GET", undefined, accessToken, sessionCookie);
}

export async function getSpsDesktopAccount({
  fetchImpl = fetch,
  hubUrl,
  accessToken,
  sessionCookie,
}) {
  const result = await requestJson(fetchImpl, apiUrl(hubUrl, "/cli-auth/me"), "GET", undefined, accessToken, sessionCookie);
  return result?.user ?? null;
}

export async function listSpsProjects({
  fetchImpl = fetch,
  hubUrl,
  companyId,
  accessToken,
  sessionCookie,
}) {
  if (!companyId) throw new Error("Choose an SPS company before loading projects");
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/companies/${encodeURIComponent(companyId)}/projects`),
    "GET",
    undefined,
    accessToken,
    sessionCookie,
  );
}

export async function pollSpsDesktopAuth({
  fetchImpl = fetch,
  hubUrl,
  challengeId,
  challengeToken,
}) {
  const query = new URLSearchParams({ token: challengeToken });
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/cli-auth/challenges/${encodeURIComponent(challengeId)}?${query.toString()}`),
    "GET",
  );
}

export async function cancelSpsDesktopAuth({
  fetchImpl = fetch,
  hubUrl,
  challengeId,
  challengeToken,
}) {
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/cli-auth/challenges/${encodeURIComponent(challengeId)}/cancel`),
    "POST",
    { token: challengeToken },
  );
}

export async function registerSpsNode({
  fetchImpl = fetch,
  hubUrl,
  companyId,
  identity,
  displayName,
  platform,
  appVersion,
  capabilities,
  runners,
  transportPublicKey,
  accessToken,
  sessionCookie,
}) {
  if (!identity?.publicKeyPem) throw new Error("SPS Node identity does not contain a public key");
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/companies/${encodeURIComponent(companyId)}/sps-nodes`),
    "POST",
    {
      displayName,
      publicKey: identity.publicKeyPem,
      platform,
      appVersion,
      capabilities,
      ...(runners ? { runners } : {}),
      ...(transportPublicKey ? { transportPublicKey } : {}),
    },
    accessToken,
    sessionCookie,
  );
}

export async function sendSpsNodeHeartbeat({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  timestamp,
  nonce,
}) {
  const heartbeat = createSignedHeartbeat({ identity, nodeId, timestamp, nonce });
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/sps-nodes/${encodeURIComponent(nodeId)}/heartbeat`),
    "POST",
    heartbeat,
    accessToken,
    sessionCookie,
  );
}

export async function disconnectSpsNode({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  accessToken,
  sessionCookie,
}) {
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/sps-nodes/${encodeURIComponent(nodeId)}/disconnect`),
    "POST",
    {},
    accessToken,
    sessionCookie,
  );
}

export async function claimSpsNodeCommand({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/claim-next`;
  return signedNodeRequestJson({ fetchImpl, hubUrl, nodeId, identity, accessToken, sessionCookie, method: "POST", path, payload: {} });
}

export async function claimSpsPluginNodeRun({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/plugin-runs/claim-next`;
  return signedNodeRequestJson({ fetchImpl, hubUrl, nodeId, identity, accessToken, sessionCookie, method: "POST", path, payload: {} });
}

export async function claimSpsWorkspaceSourceRoute({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  sourceId,
  identity,
  accessToken,
  sessionCookie,
}) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new Error("SPS Workspace Source route claims require a Source id");
  }
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/workspace-sources/${encodeURIComponent(sourceId)}/claim-route`;
  return signedNodeRequestJson({ fetchImpl, hubUrl, nodeId, identity, accessToken, sessionCookie, method: "POST", path, payload: {} });
}

export async function appendSpsNodeCommandEvent({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
  sequence,
  stream,
  body,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandId)}/events`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: { sequence, stream, body },
  });
}

export async function appendSpsPluginNodeRunEvent({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
  sequence,
  stream,
  body,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/plugin-runs/${encodeURIComponent(commandId)}/events`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: { sequence, stream, body },
  });
}

export async function checkSpsNodeCommandLease({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandId)}/lease`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: {},
  });
}

export async function checkSpsPluginNodeRunLease({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/plugin-runs/${encodeURIComponent(commandId)}/lease`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: {},
  });
}

export async function completeSpsNodeCommand({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
  completion,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandId)}/complete`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: completion,
  });
}

export async function completeSpsPluginNodeRun({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
  sessionCookie,
  commandId,
  completion,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/plugin-runs/${encodeURIComponent(commandId)}/complete`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    method: "POST",
    path,
    payload: completion,
  });
}
