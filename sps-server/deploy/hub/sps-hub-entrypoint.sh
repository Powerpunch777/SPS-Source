#!/bin/sh
set -eu

# The public Hub is configured through Docker environment variables. The SPS
# CLI still expects the small instance config used to identify authenticated
# deployments, so create that non-secret runtime file inside the named volume.
config_path="${PAPERCLIP_CONFIG:-${PAPERCLIP_HOME:-/sps}/instances/default/config.json}"

if [ ! -f "$config_path" ] || grep -q '"baseUrlMode": "auto"' "$config_path"; then
  config_dir="$(dirname "$config_path")"
  mkdir -p "$config_dir"
  SPS_RUNTIME_CONFIG_PATH="$config_path" node <<'EOF'
const fs = require("node:fs");

const configPath = process.env.SPS_RUNTIME_CONFIG_PATH;
const publicBaseUrl = process.env.PAPERCLIP_PUBLIC_URL?.replace(/\/+$/, "");
if (!publicBaseUrl?.startsWith("https://")) {
  throw new Error("PAPERCLIP_PUBLIC_URL must be an HTTPS URL for the public SPS Hub.");
}

const config = {
  $meta: {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "configure",
  },
  database: { mode: "postgres" },
  logging: { mode: "file" },
  server: {
    deploymentMode: "authenticated",
    exposure: "public",
    bind: "custom",
    customBindHost: "0.0.0.0",
    host: "0.0.0.0",
    port: 3100,
    allowedHostnames: [],
    serveUi: true,
  },
  auth: {
    baseUrlMode: "explicit",
    publicBaseUrl,
    disableSignUp: false,
  },
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
EOF
fi

if [ "$(id -u)" -eq 0 ]; then
  chown node:node "$config_path"
  chmod 600 "$config_path"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
