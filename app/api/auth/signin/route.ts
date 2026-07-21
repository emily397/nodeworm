import { NextResponse } from "next/server";
import { signIn, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/engine/auth";
import { acceptInvites } from "@/lib/engine/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const r = await signIn(body.email ?? "", body.password ?? "");
  if (r.error || !r.token) return NextResponse.json({ error: r.error ?? "Sign in failed." }, { status: 401 });
  if (r.user) await acceptInvites(r.user.id, r.user.email).catch(() => {});
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
