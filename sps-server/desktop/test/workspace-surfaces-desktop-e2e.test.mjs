import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

test("ships a packaged Desktop Workspace Surfaces E2E harness", async () => {
  const [packageJson, script] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(scripts["test:e2e:workspace-surfaces"], /smoke-workspace-surfaces-desktop/);
  for (const required of [
    "SPS_DESKTOP_E2E_BINARY",
    "SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE",
    "SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY",
    "parseE2eHostReadyTimeout",
    "generateKeyPairSync",
    "/.well-known/jwks.json",
    "/v1/desktop/authorize",
    "/v1/desktop/token",
    "/v1/desktop/refresh",
    "/v1/desktop/revoke",
    "#start-sps-account",
    "#create-owner-server",
    "workspace-shell",
    "workspace-dashboard",
    "workspace-inbox",
    "data-sps-workspace-entry",
    "No default plugin selected.",
    "The selected plugin is unavailable.",
    "Manage plugins",
    "agentsBeforeEntry.length, 0",
    "agentsAfterEntry.length, 0",
    "[[620, 760], [1000, 760]]",
    "neutral-entry-${width}x${height}.png",
    "legacyRequests",
    "legacyWorkspaceDataRequests",
    "#main-content, aside, nav[aria-label=\"breadcrumb\"]",
    "input instanceof Request",
    "input instanceof URL",
    "endsWith(\"/agents\")",
    "endsWith(\"/workspace-dashboard\")",
    "selectedRootPath",
    "unavailableEntry",
    "Plugin lifecycle and installation",
    "Neutral Workspace",
    "Plugin Builder",
    "무엇을 만들까요?",
    "Team Workplane",
    "taskkill",
    "removeTemporaryDirectory",
  ]) {
    assert.ok(script.includes(required), `Workspace Surfaces E2E is missing ${required}`);
  }
});

test("keeps D2 request monitor snippets valid JavaScript", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");

  for (const name of ["d2RequestMonitorStartExpression", "d2RequestMonitorStopExpression"]) {
    const declaration = `const ${name} = String.raw\``;
    const declarationStart = script.indexOf(declaration);
    assert.notEqual(declarationStart, -1, `Missing raw CDP snippet ${name}`);
    const snippetStart = declarationStart + declaration.length;
    const snippetEnd = script.indexOf("`;", snippetStart);
    assert.ok(snippetEnd > snippetStart, `Could not find the end of raw CDP snippet ${name}`);
    const snippet = script.slice(snippetStart, snippetEnd);
    assert.doesNotThrow(() => new Script(snippet), `${name} must parse before CDP evaluates it`);
  }
});
