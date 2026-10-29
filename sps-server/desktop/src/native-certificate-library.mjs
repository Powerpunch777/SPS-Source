import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let certificateLibrary;
let asn1Library;

// Keep optional connectivity's PKI dependency graph off the Desktop startup
// path. Synchronous validators retain their contract and use the same CommonJS
// package entry/cache as the previous ESM imports. Failure never skips checks.
export function loadNativeCertificateLibrary() {
  if (!certificateLibrary) {
    require("reflect-metadata");
    certificateLibrary = require("@peculiar/x509");
  }
  return certificateLibrary;
}

export function loadNativeAsn1Library() {
  return asn1Library ??= require("asn1js");
}
