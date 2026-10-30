import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";

const EXPECTED_CONFIG_KEYS = [];
const EXPECTED_INIT_KEYS = ["config", "fixtureId"];
const HOST_STATE_MARKER = "SPS_APP_CONTAINER_HOST_STATE_MARKER";
const text = value => typeof value === "string" ? value : "";
const denied = error => error?.code === "EACCES" || error?.code === "EPERM";
const fail = phase => Object.assign(new Error("Canary probe failed."), { data: { canaryFailure: phase } });
function probe(phase, operation) {
  try { return operation(); } catch { throw fail(phase); }
}

const platform = Object.freeze({
  contractVersion: "1.0",
  capabilities: Object.freeze([]),
  tools: Object.freeze([]),
  events: Object.freeze([]),
  jobs: Object.freeze([]),
  data: Object.freeze([Object.freeze({
    key: "appcontainer.canary",
    handler: async (_params, platform) => {
      const packageMarker = process.env.SPS_APP_CONTAINER_CANARY_PACKAGE_MARKER;
      const workspaceMarker = process.env.SPS_APP_CONTAINER_CANARY_WORKSPACE_MARKER;
      const vaultMarker = process.env.SPS_APP_CONTAINER_CANARY_VAULT_MARKER;
      const descendantMarker = process.env.SPS_APP_CONTAINER_CANARY_DESCENDANT_MARKER;
      if ([packageMarker, workspaceMarker, vaultMarker, descendantMarker].some(value => !text(value))) {
        throw fail("fixture-paths");
      }

      const hostState = await platform.state.get({
        scopeKind: "workspace",
        scopeId: process.env.SPS_APP_CONTAINER_CANARY_FIXTURE_ID,
        namespace: "appcontainer.canary",
        stateKey: "marker",
      });
      if (hostState !== HOST_STATE_MARKER) throw fail("host-state-result");

      const packageRead = probe("package-read", () => fs.readFileSync(packageMarker, "utf8"));
      probe("workspace-write", () => fs.writeFileSync(workspaceMarker, "SPS_APP_CONTAINER_WORKSPACE_WRITE_OK", { flag: "wx" }));
      let vaultReadDenied = false;
      let vaultWriteDenied = false;
      try { fs.readFileSync(vaultMarker, "utf8"); } catch (error) { vaultReadDenied = denied(error); }
      try { fs.appendFileSync(vaultMarker, "SPS_APP_CONTAINER_UNAUTHORIZED_WRITE"); }
      catch (error) { vaultWriteDenied = denied(error); }

      const descendantSource = [
        "const fs=require('node:fs');",
        "const denied=e=>e&&['EACCES','EPERM'].includes(e.code);",
        "let readDenied=false,writeDenied=false;",
        "try{fs.readFileSync(process.argv[1],'utf8')}catch(e){readDenied=denied(e)}",
        "try{fs.appendFileSync(process.argv[1],'SPS_APP_CONTAINER_DESCENDANT_UNAUTHORIZED_WRITE')}catch(e){writeDenied=denied(e)}",
        "fs.writeFileSync(process.argv[2],'SPS_APP_CONTAINER_DESCENDANT_WORKSPACE_WRITE_OK',{flag:'wx'});",
        "process.stdout.write(JSON.stringify({readDenied,writeDenied}));",
      ].join("");
      const descendant = spawnSync(process.execPath, ["-e", descendantSource, vaultMarker, descendantMarker], {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
        maxBuffer: 4096,
      });
      if (descendant.error || descendant.signal || descendant.status !== 0) {
        throw fail(denied(descendant.error) ? "descendant-spawn-denied" : "descendant-start");
      }
      let descendantResult;
      try { descendantResult = JSON.parse(descendant.stdout.toString("utf8")); }
      catch { throw fail("descendant-result"); }
      return Object.freeze({
        hostCallObserved: true,
        hostState,
        packageRead,
        workspaceWrite: probe("workspace-read", () => fs.readFileSync(workspaceMarker, "utf8")),
        vaultReadDenied,
        vaultWriteDenied,
        descendant: Object.freeze(descendantResult),
      });
    },
  })]),
});

const plugin = defineSpsPlugin({
  async initialize({ params }) {
    if (!params || typeof params !== "object" || Array.isArray(params)
      || JSON.stringify(Object.keys(params).sort()) !== JSON.stringify(EXPECTED_INIT_KEYS)
      || params.fixtureId !== process.env.SPS_APP_CONTAINER_CANARY_FIXTURE_ID
      || !params.config || typeof params.config !== "object" || Array.isArray(params.config)
      || JSON.stringify(Object.keys(params.config).sort()) !== JSON.stringify(EXPECTED_CONFIG_KEYS)) {
      throw fail("initialize-params");
    }
  },
  platform,
});

runSpsWorker(plugin, { logger: message => process.stderr.write(`${String(message).slice(0, 512)}\n`) });
