import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpsTailscaleServeDisableInvocation,
  buildSpsTailscaleServeInvocation,
  disableSpsTailscaleServe,
  enableSpsTailscaleServe,
  hasSpsTailscaleServeHandler,
  hasSpsTailscaleLoopbackRootHandler,
  isEmptySpsTailscaleServeStatus,
  normalizeSpsTailnetHostname,
  parseSpsTailscaleServeStatus,
  reconcileSpsTailscaleServe,
  parseSpsTailscaleStatus,
  spsTailnetPublicUrl,
} from "../src/team-access.mjs";

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
