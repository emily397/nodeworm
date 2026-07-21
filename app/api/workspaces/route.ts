import { NextResponse } from "next/server";
import { currentUser } from "@/lib/engine/auth";
import { createWorkspace, myWorkspaces, workspacesAvailable } from "@/lib/engine/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!workspacesAvailable()) return NextResponse.json({ available: false, workspaces: [] });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ available: true, signedIn: false, workspaces: [] });
  return NextResponse.json({ available: true, signedIn: true, userId: user.id, workspaces: await myWorkspaces(user.id) });
}

export async function POST(req: Request) {
  if (!workspacesAvailable()) return NextResponse.json({ error: "Workspaces need accounts (set DATABASE_URL + AUTH_SECRET)." }, { status: 400 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const ws = await createWorkspace(body.name ?? "", user.id);
  return NextResponse.json({ workspace: ws }, { status: 201 });
}
