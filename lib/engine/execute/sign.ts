// Ed25519 signing of execution plans. The private key lives ONLY in the server env
// (EXECUTE_SIGNING_KEY = base64 of the pkcs8 DER, single line). The matching public
// key is embedded in the NodeWorm Agent, which refuses any plan whose signature does
// not verify. This is what stops a forged or tampered plan from running on a machine:
// the Agent runs nothing the offline-held key did not sign.
//
// Server-only (node crypto). Inert-until-keyed: with no EXECUTE_SIGNING_KEY, agentic
// execution is not offered and the plan route returns honestly unconfigured.

import { createPrivateKey, sign as edSign } from "crypto";

// Bump the id (and rotate the key) to invalidate older Agents on key rotation.
export const PUBLIC_KEY_ID = "nw-exec-ed25519-1";

export function signingAvailable(): boolean {
  return Boolean(process.env.EXECUTE_SIGNING_KEY?.trim());
}

// Sign the EXACT utf-8 bytes of planJson (the string the Agent will verify + parse).
export function signPlanJson(
  planJson: string,
): { signature: string; algo: "ed25519"; publicKeyId: string } | null {
  const b64 = process.env.EXECUTE_SIGNING_KEY?.trim();
  if (!b64) return null;
  const key = createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
  const sig = edSign(null, Buffer.from(planJson, "utf8"), key); // ed25519: algorithm must be null
  return { signature: sig.toString("base64"), algo: "ed25519", publicKeyId: PUBLIC_KEY_ID };
}
