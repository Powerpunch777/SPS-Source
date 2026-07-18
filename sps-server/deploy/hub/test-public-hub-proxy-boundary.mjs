import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const caddyfilePath = fileURLToPath(new URL("./Caddyfile", import.meta.url));
const caddyfile = await readFile(caddyfilePath, "utf8");

for (const header of [
  'Strict-Transport-Security "max-age=31536000"',
  'X-Content-Type-Options "nosniff"',
  'X-Frame-Options "DENY"',
  'Referrer-Policy "strict-origin-when-cross-origin"',
  'Permissions-Policy "camera=(), geolocation=(), microphone=()"',
]) {
  assert.ok(caddyfile.includes(header), `Public SPS Hub proxy must set ${header}.`);
}

assert.match(caddyfile, /reverse_proxy sps-hub:3100/);
