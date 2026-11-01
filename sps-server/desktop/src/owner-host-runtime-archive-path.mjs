export const RUNTIME_EXTRACTION_PARTITIONS = 4;

export function normalizeArchiveEntry(value) {
  const input = String(value || "").replaceAll("\\", "/");
  if (!input || input.includes("\0") || input.startsWith("/") || input.startsWith("//") || /^[A-Za-z]:/.test(input)) {
    throw new Error("SPS Owner Host runtime archive contains an unsafe path.");
  }
  const segments = input.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error("SPS Owner Host runtime archive contains a path traversal.");
  }
  return segments.join("/") || ".";
}

// Keep a package's paths on one writer; all four readers still validate every
// entry. Case/Unicode aliases also select the same writer on Windows.
export function runtimeArchivePartition(relative) {
  const parts = normalizeArchiveEntry(relative).normalize("NFKD").toLowerCase().split("/");
  const width = parts[0] === "node_modules" ? (parts[1]?.startsWith("@") ? 3 : 2) : 1;
  let hash = 2166136261;
  for (const character of parts.slice(0, width).join("/")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) % RUNTIME_EXTRACTION_PARTITIONS;
}
