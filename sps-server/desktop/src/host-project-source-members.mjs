function isUsableTransportKey(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedDisplayName(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function isOwnerHostNode(node, { ownerNodeId, ownerDisplayName }) {
  if (!node?.id) return false;
  if (ownerNodeId && node.id === ownerNodeId) return true;
  const expectedName = normalizedDisplayName(ownerDisplayName);
  return Boolean(expectedName && normalizedDisplayName(node.displayName) === expectedName);
}

function isReadyMemberNode(node, owner) {
  return Boolean(
    node?.id
      && !isOwnerHostNode(node, owner)
      && node.status === "active"
      && node.keyVerifiedAt
      && isUsableTransportKey(node.transportPublicKey),
  );
}

function isLegacyMemberNode(node, owner) {
  return Boolean(
    node?.id
      && !isOwnerHostNode(node, owner)
      && node.status === "active"
      && node.keyVerifiedAt
      && !isUsableTransportKey(node.transportPublicKey),
  );
}

function memberNames(nodes) {
  return nodes
    .map((node) => String(node?.displayName ?? "Member Node").trim() || "Member Node")
    .slice(0, 3)
    .join(", ");
}

export function classifyHostProjectSourceMembers(nodes, {
  ownerNodeId = null,
  ownerDisplayName = null,
} = {}) {
  const members = Array.isArray(nodes) ? nodes : [];
  const owner = { ownerNodeId, ownerDisplayName };
  return {
    ready: members.filter((node) => isReadyMemberNode(node, owner)),
    legacy: members.filter((node) => isLegacyMemberNode(node, owner)),
  };
}

export function unavailableHostProjectSourceMemberDialog(memberState) {
  if (memberState?.legacy?.length) {
    return {
      message: "No Member Node has a current project-source key yet.",
      detail: `${memberNames(memberState.legacy)} must open the latest SPS Desktop and reconnect once. The Host cannot create or infer that computer's private key.`,
    };
  }
  return {
    message: "No active Member SPS Node can receive this project's source folder yet.",
    detail: "A teammate must join the server, register a Node, and receive Owner approval first.",
  };
}
