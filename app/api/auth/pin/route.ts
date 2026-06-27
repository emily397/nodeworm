import { NextResponse } from "next/server";
import { pinStatus, setPin, VAULT_COOKIE, VAULT_MAX_AGE } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: whether the signed-in user has a PIN and whether the vault is unlocked.
export async function GET(req: Request) {
  return NextResponse.json(await pinStatus(req));
}

// POST: set or change the PIN. A change needs the current PIN; a reset needs the
// account password. On success the vault is unlocked (grant cookie set).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { newPin?: string; currentPin?: string; password?: string };
  const r = await setPin(req, body.newPin ?? "", { currentPin: body.currentPin, password: body.password });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
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
