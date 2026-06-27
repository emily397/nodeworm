// Encryption for the credential vault. Each stored field is sealed with
// AES-256-GCM under a key derived from VAULT_KEK (server env), bound to the
// row's identity via AAD (app slug + connection id + field name). The AAD bind
// means a stolen ciphertext cannot be transplanted to another row, and a raw DB
// dump is useless without VAULT_KEK.
//
// Honest threat model: this defeats "database dump alone" (the KEK lives in the
// server env, never in the DB). It does NOT defeat a compromise of the server
// env or code execution on the server, which can read the KEK. Documented, not
// implied. Server-only (node:crypto); only imported by server routes/modules.

import crypto from "crypto";

const ALG = "aes-256-gcm";

function kek(): Buffer | null {
  const raw = process.env.VAULT_KEK;
  if (!raw) return null;
  // Accept any passphrase; derive a stable 256-bit key from it.
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function vaultKeyed(): boolean {
  return Boolean(process.env.VAULT_KEK);
}

// Seal a single field. aad is the row identity (e.g. "ticktick:abc123:client_secret").
export function seal(plaintext: string, aad: string): string {
  const key = kek();
  if (!key) throw new Error("VAULT_KEK is not set");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALG, key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function open(blob: string, aad: string): string {
  const key = kek();
  if (!key) throw new Error("VAULT_KEK is not set");
  const b = Buffer.from(blob, "base64");
  const iv = b.subarray(0, 12);
  const tag = b.subarray(12, 28);
  const ct = b.subarray(28);
  const d = crypto.createDecipheriv(ALG, key, iv);
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
