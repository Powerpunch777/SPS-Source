import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveIsolatedE2eManagedCodexHomeRelative } from "../scripts/e2e-managed-codex-home.mjs";

test("proves the canonical managed home is a real descendant of isolated userData", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "sps-managed-home-test-"));
  try {
    const userData = path.join(temporary, "user-data");
    const managedHome = path.join(userData, "companies", "host", "agents", "agent", "codex-home");
    await mkdir(managedHome, { recursive: true });

    const relative = await resolveIsolatedE2eManagedCodexHomeRelative(userData, managedHome);
    assert.equal(relative, path.join("companies", "host", "agents", "agent", "codex-home"));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("rejects managed homes outside userData, including directory junction targets", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "sps-managed-home-test-"));
  try {
    const userData = path.join(temporary, "user-data");
    const outside = path.join(temporary, "outside");
    await Promise.all([mkdir(userData), mkdir(outside)]);
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(userData, outside), /isolated test userData/);

    const junction = path.join(userData, "managed-home");
    await symlink(outside, junction, "junction");
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(userData, junction), /isolated test userData/);
    const broken = path.join(userData, "broken-link");
    await symlink(path.join(outside, "not-created"), broken, "junction");
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(userData, path.join(broken, "codex-home")), /resolve/);
    const file = path.join(userData, "file");
    await writeFile(file, "fixture");
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(userData, file), /resolve/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("requires existing userData but allows Core to create an in-root managed home on use", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "sps-managed-home-test-"));
  try {
    const userData = path.join(temporary, "user-data");
    await mkdir(userData);
    assert.equal(await resolveIsolatedE2eManagedCodexHomeRelative(userData, path.join(userData, "companies", "agent", "codex-home")),
      path.join("companies", "agent", "codex-home"));
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(path.join(temporary, "missing-root"), path.join(userData, "home")), /resolve/);
    await assert.rejects(resolveIsolatedE2eManagedCodexHomeRelative(userData, "relative-home"), /isolated test userData/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
