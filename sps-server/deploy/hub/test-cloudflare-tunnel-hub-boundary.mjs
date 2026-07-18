import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directComposePath = fileURLToPath(new URL("./docker-compose.yml", import.meta.url));
const tunnelComposePath = fileURLToPath(new URL("./docker-compose.tunnel.yml", import.meta.url));
const directCompose = await readFile(directComposePath, "utf8");
const tunnelCompose = await readFile(tunnelComposePath, "utf8");

assert.match(directCompose, /profiles:\s*\n\s*- direct-exposure/);
assert.match(tunnelCompose, /cloudflared:/);
assert.match(tunnelCompose, /cloudflare\/cloudflared/);
assert.match(tunnelCompose, /TUNNEL_TOKEN:/);
assert.match(tunnelCompose, /SPS_CLOUDFLARE_TUNNEL_TOKEN/);
assert.match(tunnelCompose, /--no-autoupdate/);
assert.match(tunnelCompose, /depends_on:\s*\n\s*sps-hub:\s*\n\s*condition: service_healthy/);
assert.equal(/\n\s*ports:/.test(tunnelCompose), false, "Tunnel mode must not expose a host port.");
