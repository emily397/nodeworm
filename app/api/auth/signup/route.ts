import { NextResponse } from "next/server";
import { signUp, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const r = await signUp(body.email ?? "", body.password ?? "");
  if (r.error || !r.token) return NextResponse.json({ error: r.error ?? "Sign up failed." }, { status: 400 });
  const res = NextResponse.json({ user: r.user });
  res.cookies.set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
