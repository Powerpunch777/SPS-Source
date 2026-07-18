import { createSignedHeartbeat, createSignedNodeRequest } from "./identity.mjs";
import { normalizeHubUrl } from "./protocol.mjs";

export class SpsHubRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "SpsHubRequestError";
    this.status = status;
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
    );
  }
  return data;
}

async function requestJson(fetchImpl, url, method, body, accessToken) {
  const headers = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
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
  method,
  path,
  payload,
}) {
  const body = createSignedNodeRequest({ identity, nodeId, method, path, payload });
  return requestJson(fetchImpl, apiUrl(hubUrl, path), method, body, accessToken);
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
}) {
  return requestJson(fetchImpl, apiUrl(hubUrl, "/companies"), "GET", undefined, accessToken);
}

export async function listSpsProjects({
  fetchImpl = fetch,
  hubUrl,
  companyId,
  accessToken,
}) {
  if (!companyId) throw new Error("Choose an SPS company before loading projects");
  return requestJson(
    fetchImpl,
    apiUrl(hubUrl, `/companies/${encodeURIComponent(companyId)}/projects`),
    "GET",
    undefined,
    accessToken,
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
  accessToken,
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
    },
    accessToken,
  );
}

export async function sendSpsNodeHeartbeat({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
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
  );
}

export async function claimSpsNodeCommand({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/claim-next`;
  return signedNodeRequestJson({ fetchImpl, hubUrl, nodeId, identity, accessToken, method: "POST", path, payload: {} });
}

export async function appendSpsNodeCommandEvent({
  fetchImpl = fetch,
  hubUrl,
  nodeId,
  identity,
  accessToken,
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
  commandId,
}) {
  const path = `/sps-nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandId)}/lease`;
  return signedNodeRequestJson({
    fetchImpl,
    hubUrl,
    nodeId,
    identity,
    accessToken,
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
    method: "POST",
    path,
    payload: completion,
  });
}
