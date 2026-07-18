const MARKDOWN_LINK_RE = /(!?\[[^\]\r\n]*\]\()([^)]+)(\))/g;

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeWindowsPath(value) {
  let normalized = decodePath(String(value || "").trim());
  normalized = normalized.replace(/^file:\/{2,3}(?:localhost\/)?/i, "");
  if (/^\/[a-z]:[\\/]/i.test(normalized)) normalized = normalized.slice(1);
  normalized = normalized.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!/^[a-z]:\//i.test(normalized)) return null;

  const drive = normalized.slice(0, 2);
  const segments = [];
  for (const segment of normalized.slice(3).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `${drive}/${segments.join("/")}`;
}

function markdownDestination(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  if (source.startsWith("<")) {
    const closing = source.indexOf(">");
    if (closing < 0) return null;
    return { target: source.slice(1, closing), suffix: source.slice(closing + 1) };
  }

  const titled = source.match(/^(\S+)(\s+(?:"[^"]*"|'[^']*'))$/);
  return titled
    ? { target: titled[1], suffix: titled[2] }
    : { target: source, suffix: "" };
}

function normalizedTargets(targets) {
  return (Array.isArray(targets) ? targets : [])
    .map((target) => ({
      ...target,
      normalizedRoot: normalizeWindowsPath(target?.rootPath)
    }))
    .filter((target) => target.projectId && target.workspaceId && target.normalizedRoot)
    .sort((left, right) => right.normalizedRoot.length - left.normalizedRoot.length);
}

function workspaceRelativeTarget(absolutePath, targets) {
  const normalizedPath = normalizeWindowsPath(absolutePath);
  if (!normalizedPath) return null;
  const lowerPath = normalizedPath.toLocaleLowerCase("en-US");
  for (const target of targets) {
    const root = target.normalizedRoot.replace(/\/$/, "");
    const lowerRoot = root.toLocaleLowerCase("en-US");
    if (!lowerPath.startsWith(`${lowerRoot}/`)) continue;
    const relativePath = normalizedPath.slice(root.length + 1);
    if (!relativePath) continue;
    return { target, relativePath };
  }
  return null;
}

function roomFileHref(linkBaseHref, workspaceTarget, relativePath) {
  const [baseHref, query = ""] = linkBaseHref.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("file", relativePath);
  params.set("projectId", workspaceTarget.projectId);
  params.set("workspaceId", workspaceTarget.workspaceId);
  params.set("roomFile", "1");
  return `${baseHref}?${params.toString()}`;
}

function roomFileContentHref(roomIssueId, workspaceTarget, relativePath) {
  if (!roomIssueId) return "";
  const params = new URLSearchParams({
    path: relativePath,
    projectId: workspaceTarget.projectId,
    workspaceId: workspaceTarget.workspaceId,
    download: "1"
  });
  return `/api/issues/${encodeURIComponent(roomIssueId)}/file-resources/content?${params.toString()}`;
}

function isPreviewableImagePath(relativePath) {
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(String(relativePath || ""));
}

export function rewriteWorkspaceMarkdownLinks(markdown, options = {}) {
  const source = String(markdown || "");
  const linkBaseHref = String(options.linkBaseHref || "").trim();
  const roomIssueId = String(options.roomIssueId || "").trim();
  const targets = normalizedTargets(options.targets);
  if (!source || !linkBaseHref || !targets.length) return source;

  return source.replace(MARKDOWN_LINK_RE, (whole, opener, rawDestination, closer) => {
    const destination = markdownDestination(rawDestination);
    if (!destination) return whole;
    const resolved = workspaceRelativeTarget(destination.target, targets);
    if (!resolved) return whole;
    const href = roomFileHref(linkBaseHref, resolved.target, resolved.relativePath);
    if (opener.startsWith("![") && roomIssueId && isPreviewableImagePath(resolved.relativePath)) {
      const contentHref = roomFileContentHref(roomIssueId, resolved.target, resolved.relativePath);
      return `[${opener}${contentHref}${destination.suffix}${closer}](${href})`;
    }
    const linkOpener = opener.startsWith("![") ? opener.slice(1) : opener;
    return `${linkOpener}${href}${destination.suffix}${closer}`;
  });
}
