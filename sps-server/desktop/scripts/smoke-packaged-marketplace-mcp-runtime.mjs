import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializeSpsOwnerHostRuntimePackage } from "../src/owner-host-runtime-package.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const desktopVersion = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8")).version;
const packagedRuntimeRoot = path.join(desktopRoot, "dist", ".verified-owner-host-runtime", desktopVersion);
const packagedRuntimePackageRoot = path.join(
  desktopRoot,
  "dist",
  "win-unpacked",
  "resources",
  "sps-owner-host-runtime-package",
);
const runtimeRoot = path.resolve(
  process.env.SPS_MARKETPLACE_MCP_RUNTIME_ROOT
    || (process.argv.includes("--packaged")
      ? packagedRuntimeRoot
      : path.join(desktopRoot, ".owner-host-runtime")),
);
if (process.argv.includes("--packaged") && !process.env.SPS_MARKETPLACE_MCP_RUNTIME_ROOT) {
  await materializeSpsOwnerHostRuntimePackage({
    packageRoot: packagedRuntimePackageRoot,
    targetRuntimeRoot: runtimeRoot,
  });
}
const nodeCommand = path.join(runtimeRoot, "bin", process.platform === "win32" ? "node.exe" : "node");
const entryPath = path.join(
  runtimeRoot,
  "node_modules",
  "@sps",
  "mcp-server",
  "dist",
  "marketplace-assistant-stdio.js",
);
const sdkRoot = path.join(runtimeRoot, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");

await Promise.all([
  access(nodeCommand),
  access(entryPath),
  access(path.join(sdkRoot, "client", "index.js")),
  access(path.join(sdkRoot, "client", "stdio.js")),
]);

const [{ Client }, { StdioClientTransport }] = await Promise.all([
  import(pathToFileURL(path.join(sdkRoot, "client", "index.js")).href),
  import(pathToFileURL(path.join(sdkRoot, "client", "stdio.js")).href),
]);

const requests = [];
const api = createServer((request, response) => {
  let rawBody = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { rawBody += chunk; });
  request.on("end", () => {
    requests.push({
      url: request.url,
      authorization: request.headers.authorization,
      runId: request.headers["x-paperclip-run-id"],
      body: rawBody ? JSON.parse(rawBody) : null,
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      plugins: [{ id: "sps.smoke-plugin", name: "Smoke Plugin" }],
    }));
  });
});

await new Promise((resolve, reject) => {
  api.once("error", reject);
  api.listen(0, "127.0.0.1", resolve);
});
const address = api.address();
assert.ok(address && typeof address === "object");

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "node.exe" : nodeCommand,
  args: process.platform === "win32"
    ? [
        "--input-type=module",
        "--eval",
        "import { pathToFileURL } from 'node:url'; await import(pathToFileURL(process.env.SPS_MARKETPLACE_MCP_ENTRY).href);",
      ]
    : [entryPath],
  env: {
    SPS_MARKETPLACE_MCP_NODE: nodeCommand,
    SPS_MARKETPLACE_MCP_ENTRY: entryPath,
    PATH: [path.dirname(nodeCommand), process.env.PATH].filter(Boolean).join(path.delimiter),
    SPS_API_BASE_URL: `http://127.0.0.1:${address.port}`,
    SPS_SCOPED_BEARER_TOKEN: "packaged-scoped-token",
    SPS_RUN_ID: "packaged-run",
    SPS_COMPANY_ID: "packaged-company",
    ELECTRON_RUN_AS_NODE: "1",
  },
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
const client = new Client({ name: "sps-packaged-runtime-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["search_marketplace_plugins", "get_marketplace_plugin"],
  );
  const result = await client.callTool({
    name: "search_marketplace_plugins",
    arguments: { q: "smoke", limit: 1 },
  });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]?.type, "text");
  assert.match(result.content[0]?.text ?? "", /sps\.smoke-plugin/);
  assert.deepEqual(requests, [{
    url: "/api/companies/packaged-company/marketplace/assistant/tools/search_marketplace_plugins",
    authorization: "Bearer packaged-scoped-token",
    runId: "packaged-run",
    body: { input: { q: "smoke", limit: 1 } },
  }]);
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
  await new Promise((resolve) => api.close(resolve));
}

console.log(`Packaged Marketplace MCP runtime smoke passed: ${runtimeRoot}`);
