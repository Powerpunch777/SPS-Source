import test from "node:test";
import assert from "node:assert/strict";
import {
  getSpsAccountConnection,
  normalizeSpsAccountConnection,
  setSpsAccountConnection,
} from "../src/account-connections.mjs";

const ownerProfile = {
  hubUrl: "http://127.0.0.1:31310",
  connectionKind: "owner-host",
  companyId: "",
  displayName: "SPS Owner",
  defaultWorkspacePath: "C:\\Work",
  projectWorkspaces: { "project-1": "C:\\Work\\project-1" },
  workspaceSources: [{ id: "source_001", name: "Client", sourcePath: "C:\\Work\\client" }],
};

test("keeps SPS connection metadata isolated by SPS account subject", () => {
  const ownerConnections = setSpsAccountConnection({}, "google-owner", ownerProfile);
  const memberConnections = setSpsAccountConnection(ownerConnections, "google-member", {
    ...ownerProfile,
    hubUrl: "https://owner.tailnet.ts.net",
    connectionKind: "remote",
    companyId: "company-1",
  });

  assert.equal(getSpsAccountConnection(memberConnections, "google-owner").connectionKind, "owner-host");
  assert.equal(getSpsAccountConnection(memberConnections, "google-member").connectionKind, "remote");
  assert.equal(getSpsAccountConnection(memberConnections, "google-unknown"), null);
});

test("does not persist tokens or unknown fields in an SPS account connection", () => {
  const normalized = normalizeSpsAccountConnection({
    ...ownerProfile,
    encryptedBoardApiToken: "do-not-store",
    identity: { privateKey: "do-not-store" },
    unexpected: "ignored",
  });

  assert.deepEqual(Object.keys(normalized).sort(), [
    "authMode",
    "companyId",
    "connectionKind",
    "defaultWorkspacePath",
    "displayName",
    "hubUrl",
    "projectWorkspaces",
    "workspaceSources",
  ]);
  assert.equal(normalized.encryptedBoardApiToken, undefined);
});

test("keeps source folder mappings on the Owner Host and removes them from Member connections", () => {
  const member = setSpsAccountConnection({}, "member-subject", {
    ...ownerProfile,
    connectionKind: "remote",
    defaultWorkspacePath: "C:\\Member\\must-not-run-projects-here",
    projectWorkspaces: { "project-1": "C:\\Member\\must-not-run-projects-here" },
  });

  assert.deepEqual(member["member-subject"].projectWorkspaces, {});
  assert.deepEqual(member["member-subject"].workspaceSources, []);
  assert.equal(member["member-subject"].defaultWorkspacePath, "");
});
