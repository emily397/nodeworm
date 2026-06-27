import { NextResponse } from "next/server";
import { authStatus, currentUser } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser(req);
  return NextResponse.json({ user, accounts: authStatus().available });
}
