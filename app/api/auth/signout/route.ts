import { NextResponse } from "next/server";
import { destroySession, sessionToken, SESSION_COOKIE, VAULT_COOKIE } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await destroySession(sessionToken(req));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(VAULT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
