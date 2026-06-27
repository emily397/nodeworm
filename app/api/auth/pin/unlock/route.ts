import { NextResponse } from "next/server";
import { verifyPin, VAULT_COOKIE, VAULT_MAX_AGE } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify the PIN and, on success, set the short-lived vault-unlock grant cookie.
// 423 (Locked) when the account is in lockout, 401 on a wrong PIN.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const r = await verifyPin(req, body.pin ?? "");
  if (!r.ok) {
    return NextResponse.json({ error: r.error, lockedFor: r.lockedFor }, { status: r.lockedFor ? 423 : 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VAULT_COOKIE, r.grant, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: VAULT_MAX_AGE,
  });
  return res;
}
