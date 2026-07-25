import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);

test("removes the SPS Tailscale route when private team activation fails", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /let servedOwnerHostUrl = null;/);
  assert.match(main, /servedOwnerHostUrl = ownerHostStatus\.url;[\s\S]*?enableSpsTailscaleServe\(\{ ownerHostUrl: servedOwnerHostUrl \}\)/);
  assert.match(main, /catch \(error\) \{[\s\S]*?if \(servedOwnerHostUrl\) \{[\s\S]*?disableSpsTailscaleServe\(\{[\s\S]*?hostname: tailnet\.hostname,[\s\S]*?ownerHostUrl: servedOwnerHostUrl,/);
});
