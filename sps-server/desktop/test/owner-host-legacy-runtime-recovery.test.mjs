import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  materializeSpsOwnerHostRuntime,
  materializeStableSpsOwnerHostNode,
  spsOwnerHostBundledNodePath,
} from "../src/owner-host.mjs";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";

const execFileAsync = promisify(execFile);

async function createLegacyRuntime(fixture) {
  const source = path.join(fixture.directory, "sps-vendor-runtime");
  const target = path.join(fixture.directory, "owner-runtime");
  await fs.mkdir(path.join(source, "dist"), { recursive: true });
  await fs.mkdir(path.join(source, "sps-vendor", "tsx", "dist"), { recursive: true });
  await fs.writeFile(path.join(source, "dist", "index.js"), "console.log('new-fixture-runtime');\n", "utf8");
  await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
  await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":1}\n", "utf8");
  await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"fixture-runtime\"}\n", "utf8");
  await fs.writeFile(path.join(source, "sps-vendor", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
  await fs.mkdir(target, { recursive: true });
  await fs.mkdir(path.join(target, "dist"), { recursive: true });
  await fs.writeFile(path.join(target, "dist", "index.js"), "console.log('retained-fixture-runtime');\n", "utf8");
  await fs.writeFile(path.join(target, "old-marker.txt"), "previous runtime", "utf8");
  return { source, target };
}

async function withFixture(run) {
  const fixture = await createWorkspaceE2eFixture();
  try {
    await run(fixture);
  } finally {
    await fixture.remove();
  }
}

function codedError(message, code) {
  return Object.assign(new Error(message), { code });
}

test("preserves the old runtime when renaming the target stays denied", async () => {
  await withFixture(async fixture => {
    const { source, target } = await createLegacyRuntime(fixture);
    const renameError = codedError("target rename denied", "EBUSY");
    let targetRenameAttempts = 0;
    let targetRecursiveRemovals = 0;
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (from === target && to.startsWith(`${target}.stale-`)) {
          targetRenameAttempts += 1;
          throw renameError;
        }
        return fs.rename(from, to);
      },
      rm: async (entry, options) => {
        if (path.resolve(entry) === path.resolve(target) && options?.recursive) targetRecursiveRemovals += 1;
        return fs.rm(entry, options);
      },
    };

    await assert.rejects(
      materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target, runInPlace: false, fsApi, delay: async () => {} }),
      error => error === renameError,
    );
    assert.equal(targetRenameAttempts, 5);
    assert.equal(targetRecursiveRemovals, 0);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "console.log('retained-fixture-runtime');\n");
    assert.equal(await fs.readFile(path.join(target, "old-marker.txt"), "utf8"), "previous runtime");
  });
});

test("restores and executes the previous runtime after promotion fails", async () => {
  await withFixture(async fixture => {
    const { source, target } = await createLegacyRuntime(fixture);
    const promotionError = codedError("stage promotion denied", "EBUSY");
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (from.startsWith(`${target}.staging-`) && to === target) throw promotionError;
        return fs.rename(from, to);
      },
    };

    await assert.rejects(
      materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target, runInPlace: false, fsApi, delay: async () => {} }),
      error => error === promotionError,
    );
    const result = await execFileAsync(process.execPath, [path.join(target, "dist", "index.js")], {
      shell: false,
      timeout: 5_000,
    });
    assert.equal(result.stdout, "retained-fixture-runtime\n");
    assert.equal(await fs.readFile(path.join(target, "old-marker.txt"), "utf8"), "previous runtime");
  });
});

test("preserves stale and staged runtimes when rollback also fails", async () => {
  await withFixture(async fixture => {
    const { source, target } = await createLegacyRuntime(fixture);
    const promotionError = codedError("stage promotion denied", "EBUSY");
    const rollbackError = codedError("rollback denied", "EACCES");
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (from.startsWith(`${target}.staging-`) && to === target) throw promotionError;
        if (from.startsWith(`${target}.stale-`) && to === target) throw rollbackError;
        return fs.rename(from, to);
      },
    };

    await assert.rejects(
      materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target, runInPlace: false, fsApi, delay: async () => {} }),
      error => error instanceof AggregateError
        && error.errors.includes(promotionError)
        && error.errors.includes(rollbackError),
    );
    const names = await fs.readdir(fixture.directory);
    const stale = path.join(fixture.directory, names.find(name => name.startsWith("owner-runtime.stale-")));
    const stage = path.join(fixture.directory, names.find(name => name.startsWith("owner-runtime.staging-")));
    assert.equal(await fs.readFile(path.join(stale, "dist", "index.js"), "utf8"), "console.log('retained-fixture-runtime');\n");
    assert.equal(await fs.readFile(path.join(stage, "dist", "index.js"), "utf8"), "console.log('new-fixture-runtime');\n");
  });
});

test("does not overwrite a target that appears while promotion fails", async () => {
  await withFixture(async fixture => {
    const { source, target } = await createLegacyRuntime(fixture);
    const promotionError = codedError("stage promotion denied", "EBUSY");
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (from.startsWith(`${target}.staging-`) && to === target) {
          await fs.mkdir(target, { recursive: true });
          await fs.writeFile(path.join(target, "unexpected-marker.txt"), "unexpected runtime", "utf8");
          throw promotionError;
        }
        return fs.rename(from, to);
      },
    };

    await assert.rejects(
      materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target, runInPlace: false, fsApi, delay: async () => {} }),
      error => error instanceof AggregateError && error.errors[0] === promotionError,
    );
    assert.equal(await fs.readFile(path.join(target, "unexpected-marker.txt"), "utf8"), "unexpected runtime");
    const names = await fs.readdir(fixture.directory);
    const stale = path.join(fixture.directory, names.find(name => name.startsWith("owner-runtime.stale-")));
    const stage = path.join(fixture.directory, names.find(name => name.startsWith("owner-runtime.staging-")));
    assert.equal(await fs.readFile(path.join(stale, "old-marker.txt"), "utf8"), "previous runtime");
    assert.equal(await fs.readFile(path.join(stage, "dist", "index.js"), "utf8"), "console.log('new-fixture-runtime');\n");
  });
});

test("retries a transient target rename sharing error and completes materialization", async () => {
  await withFixture(async fixture => {
    const { source, target } = await createLegacyRuntime(fixture);
    let targetRenameAttempts = 0;
    let retryDelays = 0;
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (from === target && to.startsWith(`${target}.stale-`) && ++targetRenameAttempts === 1) {
          throw codedError("transient sharing violation", "EBUSY");
        }
        return fs.rename(from, to);
      },
    };

    assert.equal(await materializeSpsOwnerHostRuntime({
      sourceRuntimeRoot: source,
      targetRuntimeRoot: target,
      runInPlace: false,
      fsApi,
      delay: async () => { retryDelays += 1; },
    }), target);
    assert.equal(targetRenameAttempts, 2);
    assert.equal(retryDelays, 1);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "console.log('new-fixture-runtime');\n");
  });
});

test("preserves the old stable node and metadata when promotion is denied", async () => {
  await withFixture(async fixture => {
    const runtimeRoot = path.join(fixture.directory, "packaged-runtime");
    const stableRoot = path.join(fixture.directory, "stable-node");
    const source = spsOwnerHostBundledNodePath(runtimeRoot);
    const target = path.join(stableRoot, path.basename(source));
    const metadataPath = path.join(stableRoot, "node-source.json");
    const oldNode = "old fixture node bytes";
    const oldMetadata = "{\"format\":1,\"sha256\":\"previous-hash\"}\n";
    const renameError = codedError("stable node promotion denied", "EACCES");
    let targetRemovals = 0;
    let metadataRemovals = 0;
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.mkdir(stableRoot, { recursive: true });
    await fs.writeFile(source, "new fixture node bytes", "utf8");
    await fs.writeFile(target, oldNode, "utf8");
    await fs.writeFile(metadataPath, oldMetadata, "utf8");
    const fsApi = {
      ...fs,
      rename: async (from, to) => {
        if (to === target) throw renameError;
        return fs.rename(from, to);
      },
      rm: async (entry, options) => {
        if (path.resolve(entry) === path.resolve(target)) targetRemovals += 1;
        if (path.resolve(entry) === path.resolve(metadataPath)) metadataRemovals += 1;
        return fs.rm(entry, options);
      },
    };

    await assert.rejects(
      materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, fsApi }),
      error => error === renameError,
    );
    assert.equal(await fs.readFile(target, "utf8"), oldNode);
    assert.equal(await fs.readFile(metadataPath, "utf8"), oldMetadata);
    assert.equal(targetRemovals, 0);
    assert.equal(metadataRemovals, 0);
    assert.deepEqual((await fs.readdir(stableRoot)).sort(), [path.basename(target), "node-source.json"].sort());
  });
});

test("replaces the stable node atomically and reuses matching metadata without copying again", async () => {
  await withFixture(async fixture => {
    const runtimeRoot = path.join(fixture.directory, "packaged-runtime");
    const stableRoot = path.join(fixture.directory, "stable-node");
    const source = spsOwnerHostBundledNodePath(runtimeRoot);
    const target = path.join(stableRoot, path.basename(source));
    let sourceCopies = 0;
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.mkdir(stableRoot, { recursive: true });
    await fs.writeFile(source, "new fixture node bytes", "utf8");
    await fs.writeFile(target, "old fixture node bytes", "utf8");
    await fs.writeFile(path.join(stableRoot, "node-source.json"), "{\"format\":1,\"sha256\":\"previous-hash\"}\n", "utf8");
    const fsApi = {
      ...fs,
      copyFile: async (from, to) => {
        if (path.resolve(from) === path.resolve(source)) sourceCopies += 1;
        return fs.copyFile(from, to);
      },
    };

    assert.equal(await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, fsApi }), target);
    assert.equal(await fs.readFile(target, "utf8"), "new fixture node bytes");
    assert.equal(sourceCopies, 1);
    assert.equal(await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, fsApi }), target);
    assert.equal(sourceCopies, 1);
    assert.equal(await fs.readFile(target, "utf8"), "new fixture node bytes");
  });
});
