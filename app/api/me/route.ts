import { NextResponse } from "next/server";
import { currentUser, isAdmin } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight identity for the client: whether the current user may run the
// one-time-per-app OAuth setup (admin), and whether they are signed in. No secrets.
export async function GET(req: Request) {
  const user = await currentUser(req);
  return NextResponse.json({ signedIn: Boolean(user), admin: await isAdmin(req) });
}
