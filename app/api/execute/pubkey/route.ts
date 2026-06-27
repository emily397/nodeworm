import { NextResponse } from "next/server";
import { PUBLIC_KEY_ID } from "@/lib/engine/execute/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Ed25519 public key (base64 SPKI DER) the NodeWorm Agent uses to verify plan
// signatures. Public by design; the Agent also embeds it and pins this id. Lets the
// Agent confirm the key on install / rotation.
const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEA0gSYkfXv72byhI08OkQIelEEB/5xEYj0VPzb5OtRDHQ=";

export function GET() {
  return NextResponse.json({ algo: "ed25519", publicKeyId: PUBLIC_KEY_ID, publicKey: PUBLIC_KEY_B64 });
}
