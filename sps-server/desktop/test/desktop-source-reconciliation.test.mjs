import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureSpsDesktopSourceArtifactReferences as capture } from "../src/desktop-source-artifact-references.mjs";

const HOST_ORIGIN = "http://127.0.0.1:31310";
const revision = "2026-11-02T03:04:05.006Z";
const ids = {
  workspace: "11111111-1111-4111-8111-111111111111",
  sourceWorkspace: "22222222-2222-4222-8222-222222222222",
  project: "33333333-3333-4333-8333-333333333333",
  projectResource: "44444444-4444-4444-8444-444444444444",
  grantActive: "55555555-5555-4555-8555-555555555555",
  grantRevoked: "66666666-6666-4666-8666-666666666666",
  nodeActive: "77777777-7777-4777-8777-777777777777",
  nodeRevoked: "88888888-8888-4888-8888-888888888888",
};
const dir = name => path.resolve(os.tmpdir(), "sps-desktop-source-reconciliation", name);
const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const workspaceSource = (id = ids.sourceWorkspace, workspaceId = ids.workspace, sourcePath = dir("workspace")) => ({
  kind: "workspace", id, workspaceId, resourceId: id, status: "available", routeFingerprint: null, revision,
});
const projectSource = (routeFingerprint, id = ids.project, resourceId = ids.projectResource, workspaceId = ids.workspace) => ({
  kind: "project", id, workspaceId, resourceId, status: "available", routeFingerprint, revision,
});
const grant = (id, sourceId, nodeId, revokedAt = null, kind = "project", workspaceId = ids.workspace) => ({
  kind, id, workspaceId, sourceId, nodeId, revokedAt, revision,
});
const dto = (sources = [], grants = []) => {
  const compare = (left, right) => `${left.kind}:${left.id}` < `${right.kind}:${right.id}` ? -1
    : `${left.kind}:${left.id}` > `${right.kind}:${right.id}` ? 1 : 0;
  const sortedSources = [...sources].sort(compare);
  const sortedGrants = [...grants].sort(compare);
  return { sources, grants, fingerprint: hash(JSON.stringify([sortedSources, sortedGrants])) };
};
const ownerProfile = ({
  companyId = ids.workspace,
  hubUrl = HOST_ORIGIN,
  connectionKind = "owner-host",
  workspaceSources = [],
  projectWorkspaces = {},
  defaultWorkspacePath,
} = {}) => ({
  connectionKind,
  hubUrl,
  companyId,
  workspaceSources,
  projectWorkspaces,
  ...(defaultWorkspacePath === undefined ? {} : { defaultWorkspacePath }),
});
const emptyState = () => ({ profile: {}, accountConnections: {}, encryptedShareState: null });
const shareProject = ({ sourcePath, sharePath = "\\\\fileserver\\plugin-share", grants = {} }) => ({
  sourcePath, sharePath, grants,
});
function observe({ state = emptyState(), readShareState = () => assert.fail("Unexpected protected share read"), hostOrigin = HOST_ORIGIN } = {}) {
  const result = capture({ readState: () => state, readShareState, hostOrigin });
  return { state, result };
}

test("reconciles an empty inventory and returns only a frozen summary", () => {
  const { result } = observe();
  const summary = result.reconcileSourceInventory(dto());
  assert.deepEqual(summary, { sourceCount: 0, grantCount: 0, fingerprint: dto().fingerprint });
  assert.ok(Object.isFrozen(summary));
});

test("matches an unshared workspace source to its owner-host local mapping", () => {
  const localPath = dir("workspace-unshared");
  const source = workspaceSource(ids.sourceWorkspace, ids.workspace, localPath);
  const { result } = observe({ state: { ...emptyState(), profile: ownerProfile({
    workspaceSources: [{ id: source.id, name: "Private workspace label", sourcePath: localPath }],
  }) } });
  assert.deepEqual(result.reconcileSourceInventory(dto([source])), {
    sourceCount: 1, grantCount: 0, fingerprint: dto([source]).fingerprint,
  });
});

test("matches a routed project, ignoring revoked Core grants but retaining their count", () => {
  const localPath = dir("project-local");
  const sharePath = "\\\\FileServer\\Plugin-Share";
  const active = grant(ids.grantActive, ids.project, ids.nodeActive);
  const revoked = grant(ids.grantRevoked, ids.project, ids.nodeRevoked, revision);
  const source = projectSource(hash(sharePath.toLowerCase()));
  const protectedState = { projects: { [ids.projectResource]: shareProject({
    sourcePath: localPath,
    sharePath,
    grants: { [ids.nodeActive]: { password: "protected-dummy-active" } },
  }) } };
  const { result } = observe({
    state: { ...emptyState(), profile: ownerProfile({ projectWorkspaces: { [ids.projectResource]: localPath } }),
      encryptedShareState: "opaque-private-ciphertext" },
    readShareState: () => protectedState,
  });
  assert.deepEqual(result.reconcileSourceInventory(dto([source], [revoked, active])), {
    sourceCount: 1, grantCount: 2, fingerprint: dto([source], [active, revoked]).fingerprint,
  });
});

test("uses a matching saved owner-host profile and permits identical paths across profiles", () => {
  const localPath = dir("saved-owner-source");
  const mapping = { id: ids.sourceWorkspace, name: "Saved private label", sourcePath: localPath };
  const state = {
    profile: ownerProfile({ connectionKind: "member", workspaceSources: [mapping] }),
    accountConnections: {
      "owner@example.invalid": ownerProfile({ workspaceSources: [mapping] }),
      "second-owner@example.invalid": ownerProfile({ workspaceSources: [mapping] }),
    },
    encryptedShareState: null,
  };
  const { result } = observe({ state });
  assert.equal(result.reconcileSourceInventory(dto([workspaceSource(ids.sourceWorkspace, ids.workspace, localPath)])).sourceCount, 1);
});

test("rejects unmapped or default-only same-name folders and project ID fallback", () => {
  const workspacePath = dir("same-name-default");
  const workspaceDto = dto([workspaceSource(ids.sourceWorkspace, ids.workspace, workspacePath)]);
  const workspaceResult = observe({ state: { ...emptyState(), profile: ownerProfile({ defaultWorkspacePath: workspacePath }) } }).result;
  assert.throws(() => workspaceResult.reconcileSourceInventory(workspaceDto));

  const projectPath = dir("project-id-not-resource-key");
  const project = projectSource("a".repeat(64));
  const projectResult = observe({ state: { ...emptyState(), profile: ownerProfile({
    projectWorkspaces: { [project.id]: projectPath },
  }) } }).result;
  assert.throws(() => projectResult.reconcileSourceInventory(dto([project])));
});

test("rejects remote, foreign-origin, and foreign-workspace profile mappings", () => {
  const localPath = dir("untrusted-profile");
  for (const profile of [
    ownerProfile({ connectionKind: "remote", workspaceSources: [{ id: ids.sourceWorkspace, name: "x", sourcePath: localPath }] }),
    ownerProfile({ hubUrl: "http://127.0.0.1:31311", workspaceSources: [{ id: ids.sourceWorkspace, name: "x", sourcePath: localPath }] }),
    ownerProfile({ companyId: "99999999-9999-4999-8999-999999999999", workspaceSources: [{ id: ids.sourceWorkspace, name: "x", sourcePath: localPath }] }),
  ]) {
    const result = observe({ state: { ...emptyState(), profile } }).result;
    assert.throws(() => result.reconcileSourceInventory(dto([workspaceSource(ids.sourceWorkspace, ids.workspace, localPath)])));
  }
});

test("rejects conflicting local paths for one Core source", () => {
  const firstPath = dir("duplicate-source-first");
  const secondPath = dir("duplicate-source-second");
  const state = {
    profile: ownerProfile({ workspaceSources: [{ id: ids.sourceWorkspace, name: "one", sourcePath: firstPath }] }),
    accountConnections: {
      "owner@example.invalid": ownerProfile({ workspaceSources: [{ id: ids.sourceWorkspace, name: "two", sourcePath: secondPath }] }),
    },
    encryptedShareState: null,
  };
  const result = observe({ state }).result;
  assert.throws(() => result.reconcileSourceInventory(dto([workspaceSource(ids.sourceWorkspace, ids.workspace, firstPath)])));
});

test("rejects protected source path, route hash, missing grants, and extra grants", () => {
  const localPath = dir("routed-project");
  const sharePath = "\\\\fileserver\\plugin-share";
  const source = projectSource(hash(sharePath.toLowerCase()));
  const active = grant(ids.grantActive, ids.project, ids.nodeActive);
  const build = (overrides = {}) => observe({
    state: { ...emptyState(), profile: ownerProfile({ projectWorkspaces: { [ids.projectResource]: localPath } }),
      encryptedShareState: "opaque-private-ciphertext" },
    readShareState: () => ({ projects: { [ids.projectResource]: shareProject({
      sourcePath: localPath, sharePath, grants: overrides.grants ?? { [ids.nodeActive]: {} }, ...overrides.project,
    }) } }),
  }).result;

  assert.throws(() => build({ project: { sourcePath: dir("different-protected-path") } })
    .reconcileSourceInventory(dto([source], [active])));
  assert.throws(() => build({ project: { sharePath: "\\\\fileserver\\other-share" } })
    .reconcileSourceInventory(dto([source], [active])));
  assert.throws(() => build({ grants: {} }).reconcileSourceInventory(dto([source], [active])));
  assert.throws(() => build({ grants: { [ids.nodeRevoked]: {} } }).reconcileSourceInventory(dto([source], [active])));
});

test("an unshared Core source rejects protected share state for its resource", () => {
  const localPath = dir("unshared-with-protected-share");
  const source = workspaceSource(ids.sourceWorkspace, ids.workspace, localPath);
  const { result } = observe({
    state: { ...emptyState(), profile: ownerProfile({
      workspaceSources: [{ id: source.id, name: "workspace", sourcePath: localPath }],
    }), encryptedShareState: "opaque-private-ciphertext" },
    readShareState: () => ({ projects: { [source.id]: shareProject({ sourcePath: localPath }) } }),
  });
  assert.throws(() => result.reconcileSourceInventory(dto([source])));
});

test("retains active, saved, default, and orphan protected paths without remapping them", () => {
  const paths = ["active-default", "workspace-map", "project-map", "foreign-profile", "orphan-share"].map(dir);
  const state = {
    profile: ownerProfile({ defaultWorkspacePath: paths[0],
      workspaceSources: [{ id: ids.sourceWorkspace, name: "private label", sourcePath: paths[1] }],
      projectWorkspaces: { [ids.projectResource]: paths[2] } }),
    accountConnections: {
      "remote@example.invalid": ownerProfile({ connectionKind: "remote", defaultWorkspacePath: paths[3] }),
    },
    encryptedShareState: "opaque-private-ciphertext",
  };
  const { result } = observe({ state, readShareState: () => ({ projects: {
    unrelatedOrphan: shareProject({ sourcePath: paths[4] }),
  } }) });
  assert.deepEqual(new Set(result.references.map(reference => reference.path)), new Set(paths));
  const summary = result.reconcileSourceInventory(dto([workspaceSource(ids.sourceWorkspace, ids.workspace, paths[1])]));
  assert.deepEqual(summary, { sourceCount: 1, grantCount: 0, fingerprint: dto([workspaceSource()]).fingerprint });
});

test("profile origin, company, mapping, and ciphertext changes invalidate capture and reconciliation", () => {
  const changes = [
    state => { state.profile.hubUrl = "http://127.0.0.1:31311"; },
    state => { state.profile.companyId = "99999999-9999-4999-8999-999999999999"; },
    state => { state.profile.workspaceSources[0].sourcePath = dir("changed-mapping"); },
    state => { state.encryptedShareState = "replacement-private-ciphertext"; },
  ];
  for (const change of changes) {
    const localPath = dir("invalidated-mapping");
    const source = workspaceSource(ids.sourceWorkspace, ids.workspace, localPath);
    const { state, result } = observe({ state: { ...emptyState(), profile: ownerProfile({
      workspaceSources: [{ id: source.id, name: "private", sourcePath: localPath }],
    }), encryptedShareState: "opaque-private-ciphertext" }, readShareState: () => ({ projects: {} }) });
    change(state);
    assert.throws(() => result.assertCurrent());
    assert.throws(() => result.reconcileSourceInventory(dto([source])));
  }
});

test("rejects non-loopback, HTTPS, path, and credential host origins", () => {
  for (const hostOrigin of ["http://example.invalid:31310", "https://127.0.0.1:31310", `${HOST_ORIGIN}/admin`,
    "http://user:secret@127.0.0.1:31310"]) {
    assert.throws(() => observe({ hostOrigin }));
  }
});

test("accepts the actual canonical loopback origin and requires the profile to match it", () => {
  const localPath = dir("alternate-loopback-origin");
  const source = workspaceSource(ids.sourceWorkspace, ids.workspace, localPath);
  for (const hostOrigin of ["http://localhost:31310", "http://127.0.0.1:31311"]) {
    const matching = observe({ hostOrigin, state: { ...emptyState(), profile: ownerProfile({
      hubUrl: hostOrigin,
      workspaceSources: [{ id: source.id, name: "workspace", sourcePath: localPath }],
    }) } }).result;
    assert.equal(matching.reconcileSourceInventory(dto([source])).sourceCount, 1);

    const foreignProfile = observe({ hostOrigin, state: { ...emptyState(), profile: ownerProfile({
      hubUrl: HOST_ORIGIN,
      workspaceSources: [{ id: source.id, name: "workspace", sourcePath: localPath }],
    }) } }).result;
    assert.throws(() => foreignProfile.reconcileSourceInventory(dto([source])));
  }
});

test("reconciliation output excludes emails, local paths, plaintext credentials, and UNC routes", () => {
  const localPath = dir("privacy-local-marker");
  const sharePath = "\\\\private-server\\private-share";
  const source = projectSource(hash(sharePath.toLowerCase()));
  const active = grant(ids.grantActive, ids.project, ids.nodeActive);
  const { result } = observe({
    state: { ...emptyState(), profile: ownerProfile({ projectWorkspaces: { [ids.projectResource]: localPath } }),
      encryptedShareState: "opaque-private-ciphertext" },
    readShareState: () => ({ projects: { [ids.projectResource]: shareProject({ sourcePath: localPath, sharePath,
      grants: { [ids.nodeActive]: { password: "plaintext-password-marker", token: "plaintext-token-marker" } } }) } }),
  });
  const summary = result.reconcileSourceInventory(dto([source], [active]));
  const json = JSON.stringify(summary);
  for (const privateValue of ["owner@example.invalid", localPath, "plaintext-password-marker", "plaintext-token-marker", sharePath]) {
    assert.equal(json.includes(privateValue), false);
  }
});

test("requires the exact owned loopback origin before reconciling", () => {
  const localPath = dir("requires-owned-origin");
  const source = workspaceSource(ids.sourceWorkspace, ids.workspace, localPath);
  const state = { ...emptyState(), profile: ownerProfile({
    workspaceSources: [{ id: source.id, name: "workspace", sourcePath: localPath }],
  }) };
  const { result } = observe({ state, hostOrigin: null });
  assert.throws(() => result.reconcileSourceInventory(dto([source])));
});
