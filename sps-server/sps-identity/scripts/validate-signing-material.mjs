import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function validateSigningMaterial(privateKeyPath, publicJwkPath) {
  const privatePem = await readFile(path.resolve(privateKeyPath), "utf8");
  const configured = JSON.parse(await readFile(path.resolve(publicJwkPath), "utf8"));
  const derived = createPublicKey(createPrivateKey(privatePem)).export({ format: "jwk" });
  if (configured?.kty !== "RSA" || configured.n !== derived.n || configured.e !== derived.e) {
    throw new Error("SPS Identity private PEM and public JWK are not the same RSA key pair.");
  }
  return { kty: derived.kty, n: derived.n, e: derived.e };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [privateKeyPath, publicJwkPath] = process.argv.slice(2);
  if (!privateKeyPath || !publicJwkPath) {
    throw new Error("Usage: validate-signing-material.mjs <private.pem> <public.jwk.json>");
  }
  await validateSigningMaterial(privateKeyPath, publicJwkPath);
  console.log("Verified SPS Identity signing key pair.");
}
