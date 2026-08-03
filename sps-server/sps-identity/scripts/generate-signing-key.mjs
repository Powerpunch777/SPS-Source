import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const environment = String(process.env.SPS_IDENTITY_ENVIRONMENT ?? "").trim().toLowerCase();
if (!["staging", "production"].includes(environment)) {
  throw new Error("SPS_IDENTITY_ENVIRONMENT must be staging or production.");
}
const outputDirectory = join(process.cwd(), ".secrets", environment);
const privateKeyPath = join(outputDirectory, "sps-identity-private.pem");
const publicJwkPath = join(outputDirectory, "sps-identity-public.jwk.json");

if (existsSync(privateKeyPath) || existsSync(publicJwkPath)) {
  throw new Error("SPS Identity signing material already exists. Move it deliberately before generating another key.");
}

mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const publicJwk = createPublicKey(publicKey).export({ format: "jwk" });

writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600, flag: "wx" });
writeFileSync(publicJwkPath, `${JSON.stringify(publicJwk, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

console.log(`Created SPS Identity ${environment} signing material in ${outputDirectory}`);
console.log("Keep the private PEM secret. Upload only the matching public JWK to the same environment.");
