import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), ".secrets");
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

console.log(`Created SPS Identity signing material in ${outputDirectory}`);
console.log("Keep the private PEM secret. Upload only the public JWK as SPS_IDENTITY_PUBLIC_JWK.");
