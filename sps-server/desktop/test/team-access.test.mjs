import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SPS_MINIMUM_TAILSCALE_VERSION,
  buildSpsTailscaleServeDisableInvocation,
  buildSpsTailscaleServeInvocation,
  disableSpsTailscaleServe,
  enableSpsTailscaleServe,
  hasSpsTailscaleServeHandler,
  hasSpsTailscaleLoopbackRootHandler,
  isEmptySpsTailscaleServeStatus,
  normalizeSpsTailnetHostname,
  parseSpsTailscaleServeStatus,
  parseSpsTailscaleVersion,
  requireSupportedSpsTailscaleVersion,
  reconcileSpsTailscaleServe,
  parseSpsTailscaleStatus,
  spsTailnetPublicUrl,
} from "../src/team-access.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("normalizes only Tailscale MagicDNS hostnames", () => {
  assert.equal(normalizeSpsTailnetHostname("Main-Computer.Tail1725c2.ts.net."), "main-computer.tail1725c2.ts.net");
  assert.equal(spsTailnetPublicUrl("main-computer.tail1725c2.ts.net"), "https://main-computer.tail1725c2.ts.net");
  assert.throws(() => normalizeSpsTailnetHostname("https://main-computer.tail1725c2.ts.net"));
  assert.throws(() => normalizeSpsTailnetHostname("100.116.73.36"));
});

test("reads only safe device information from Tailscale status", () => {
  const status = parseSpsTailscaleStatus({
    BackendState: "Running",
    Self: {
      DNSName: "main-computer.tail1725c2.ts.net.",
      HostName: "Main Computer",
      TailscaleIPs: ["100.116.73.36", "fd7a::1"],
    },
    CertDomains: ["main-computer.tail1725c2.ts.net"],
  });
  assert.deepEqual(status, {
    hostname: "main-computer.tail1725c2.ts.net",
    url: "https://main-computer.tail1725c2.ts.net",
    addresses: ["100.116.73.36", "fd7a::1"],
    deviceName: "Main Computer",
    httpsAvailable: true,
  });
  assert.throws(() => parseSpsTailscaleStatus({ BackendState: "Stopped" }));
});

test("requires the post-1.52 Tailscale Serve contract", () => {
  assert.deepEqual(parseSpsTailscaleVersion({ majorMinorPatch: "1.98.8" }), {
    version: "1.98.8",
    supported: true,
  });
  assert.deepEqual(parseSpsTailscaleVersion({ short: "1.52.0" }), {
    version: "1.52.0",
    supported: true,
  });
  assert.deepEqual(parseSpsTailscaleVersion({ short: "v1.52.0+windows.1" }), {
    version: "1.52.0",
    supported: true,
  });
  assert.throws(() => parseSpsTailscaleVersion({ short: "1.52.0-beta.1" }), /invalid version data/);
  assert.throws(() => parseSpsTailscaleVersion({ short: "v1.52.0-rc1" }), /invalid version data/);
  assert.throws(() => requireSupportedSpsTailscaleVersion({ supported: true, version: "999.0.0" }), /invalid version data/);
  assert.throws(
    () => requireSupportedSpsTailscaleVersion({ short: "1.51.1" }),
    /requires Tailscale 1\.52\.0 or later.*installed: 1\.51\.1/,
  );
  assert.throws(() => parseSpsTailscaleVersion({ short: "unknown" }), /invalid version data/);
  assert.throws(
    () => parseSpsTailscaleVersion({ majorMinorPatch: "1.98.8", short: "1.98.7" }),
    /conflicting version data/,
  );
});

test("keeps the runtime minimum aligned with the release support matrix", async () => {
  const matrix = JSON.parse(await readFile(
    path.resolve(desktopRoot, "..", "release", "support-matrix.json"),
    "utf8",
  ));
  assert.equal(matrix.candidate.platform.minimumRemoteTransportVersion, SPS_MINIMUM_TAILSCALE_VERSION);
});

test("proxies only the local Owner Host through Tailscale", () => {
  assert.deepEqual(buildSpsTailscaleServeInvocation({ ownerHostUrl: "http://127.0.0.1:31310" }), {
    command: "tailscale",
    args: ["serve", "--https=443", "--bg", "http://127.0.0.1:31310"],
  });
  assert.deepEqual(buildSpsTailscaleServeDisableInvocation(), {
    command: "tailscale",
    args: ["serve", "--https=443", "off"],
  });
  assert.throws(() => buildSpsTailscaleServeInvocation({ ownerHostUrl: "https://example.com" }));
});

test("recognizes only the exact SPS-owned HTTPS root handler", () => {
  const owned = parseSpsTailscaleServeStatus({
    TCP: { "443": { HTTPS: true } },
    Web: {
      "main-computer.tail1725c2.ts.net:443": {
        Handlers: { "/": { Proxy: "http://127.0.0.1:31310" } },
      },
    },
  });
  assert.equal(isEmptySpsTailscaleServeStatus({}), true);
  assert.equal(isEmptySpsTailscaleServeStatus(owned), false);
  assert.equal(hasSpsTailscaleServeHandler({
    status: owned,
    hostname: "main-computer.tail1725c2.ts.net",
    ownerHostUrl: "http://127.0.0.1:31310",
  }), true);
  assert.equal(hasSpsTailscaleServeHandler({
    status: owned,
    hostname: "main-computer.tail1725c2.ts.net",
    ownerHostUrl: "http://127.0.0.1:31311",
  }), false);
  assert.equal(hasSpsTailscaleLoopbackRootHandler({
    status: owned,
    hostname: "main-computer.tail1725c2.ts.net",
  }), true);
  assert.throws(() => parseSpsTailscaleServeStatus("not-json"));
});

test("repairs only a stale SPS loopback root handler", async () => {
  const hostname = "main-computer.tail1725c2.ts.net";
  const ownerHostUrl = "http://127.0.0.1:31310";
  let serve = {
    TCP: { "443": { HTTPS: true } },
    Web: { [`${hostname}:443`]: { Handlers: { "/": { Proxy: "http://127.0.0.1:31311" } } } },
  };
  const commands = [];
  const execFileImpl = (_command, args, _options, callback) => {
    commands.push(args);
    if (args.join(" ") === "version --json") {
      callback(null, JSON.stringify({ majorMinorPatch: "1.98.8" }), "");
      return;
    }
    if (args.join(" ") === "serve status --json") {
      callback(null, JSON.stringify(serve), "");
      return;
    }
    if (args.join(" ") === "serve --https=443 --bg http://127.0.0.1:31310") {
      serve = {
        TCP: { "443": { HTTPS: true } },
        Web: { [`${hostname}:443`]: { Handlers: { "/": { Proxy: ownerHostUrl } } } },
      };
      callback(null, "", "");
      return;
    }
    callback(new Error(`Unexpected command: ${args.join(" ")}`), "", "");
  };

  const repaired = await reconcileSpsTailscaleServe({ hostname, ownerHostUrl, execFileImpl });
  assert.equal(repaired.changed, true);
  assert.equal(hasSpsTailscaleServeHandler({ status: repaired.serve, hostname, ownerHostUrl }), true);
  assert.deepEqual(commands, [
    ["version", "--json"],
    ["serve", "status", "--json"],
    ["serve", "--https=443", "--bg", "http://127.0.0.1:31310"],
    ["serve", "status", "--json"],
  ]);
});

test("creates and removes only a confirmed SPS Serve route", async () => {
  const hostname = "main-computer.tail1725c2.ts.net";
  const ownerHostUrl = "http://127.0.0.1:31310";
  const ownedRoute = {
    TCP: { "443": { HTTPS: true } },
    Web: { [`${hostname}:443`]: { Handlers: { "/": { Proxy: ownerHostUrl } } } },
  };
  let serve = {};
  const commands = [];
  const execFileImpl = (_command, args, _options, callback) => {
    commands.push(args);
    if (args.join(" ") === "version --json") {
      callback(null, JSON.stringify({ majorMinorPatch: "1.98.8" }), "");
      return;
    }
    if (args.join(" ") === "status --json") {
      callback(null, JSON.stringify({
        BackendState: "Running",
        Self: { DNSName: `${hostname}.`, HostName: "Main Computer", TailscaleIPs: [] },
        CertDomains: [hostname],
      }), "");
      return;
    }
    if (args.join(" ") === "serve status --json") {
      callback(null, JSON.stringify(serve), "");
      return;
    }
    if (args.join(" ") === "serve --https=443 --bg http://127.0.0.1:31310") {
      serve = ownedRoute;
      callback(null, "", "");
      return;
    }
    if (args.join(" ") === "serve --https=443 off") {
      serve = {};
      callback(null, "", "");
      return;
    }
    callback(new Error(`Unexpected command: ${args.join(" ")}`), "", "");
  };

  const enabled = await enableSpsTailscaleServe({ ownerHostUrl, execFileImpl });
  assert.equal(hasSpsTailscaleServeHandler({ status: enabled.serve, hostname, ownerHostUrl }), true);
  const disabled = await disableSpsTailscaleServe({ hostname, ownerHostUrl, execFileImpl });
  assert.equal(disabled.removed, true);
  assert.deepEqual(serve, {});
  assert.deepEqual(commands.filter((args) => args[0] === "serve"), [
    ["serve", "status", "--json"],
    ["serve", "--https=443", "--bg", "http://127.0.0.1:31310"],
    ["serve", "status", "--json"],
    ["serve", "status", "--json"],
    ["serve", "--https=443", "off"],
    ["serve", "status", "--json"],
  ]);
});

test("fails closed before changing Serve when Tailscale is too old", async () => {
  const commands = [];
  const execFileImpl = (_command, args, _options, callback) => {
    commands.push(args);
    callback(null, JSON.stringify({ majorMinorPatch: "1.51.1" }), "");
  };
  await assert.rejects(
    enableSpsTailscaleServe({ ownerHostUrl: "http://127.0.0.1:31310", execFileImpl }),
    /requires Tailscale 1\.52\.0 or later/,
  );
  assert.deepEqual(commands, [["version", "--json"]]);
});

test("fails closed before changing Serve for a prerelease Tailscale build", async () => {
  const commands = [];
  const execFileImpl = (_command, args, _options, callback) => {
    commands.push(args);
    callback(null, JSON.stringify({ majorMinorPatch: "1.52.0-beta.1" }), "");
  };
  await assert.rejects(
    enableSpsTailscaleServe({ ownerHostUrl: "http://127.0.0.1:31310", execFileImpl }),
    /invalid version data/,
  );
  assert.deepEqual(commands, [["version", "--json"]]);
});
