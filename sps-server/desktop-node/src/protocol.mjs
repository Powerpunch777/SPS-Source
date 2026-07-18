export const SPS_NODE_HEARTBEAT_PROTOCOL = "SPS-NODE-HEARTBEAT-V1";

export function buildHeartbeatMessage({ nodeId, timestamp, nonce }) {
  return `${SPS_NODE_HEARTBEAT_PROTOCOL}\n${nodeId}\n${timestamp}\n${nonce}`;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildSignedRequestMessage({ nodeId, method, path, timestamp, nonce, bodySha256 }) {
  return [
    "SPS-NODE-REQUEST-V1",
    nodeId,
    method.toUpperCase(),
    path,
    timestamp,
    nonce,
    bodySha256,
  ].join("\n");
}

export function normalizeHubUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SPS Hub URL must use HTTP or HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}
