import { NextResponse } from "next/server";
import { currentUser } from "@/lib/engine/auth";
import { cancelInvite, deleteWorkspace, invite, listInvites, listMembers, memberRole, removeMember } from "@/lib/engine/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(req: Request, id: string): Promise<{ userId: string; role: "owner" | "member" } | Response> {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const role = await memberRole(id, user.id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return { userId: user.id, role };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(req, id);
  if (g instanceof Response) return g;
  return NextResponse.json({ role: g.role, members: await listMembers(id), invites: await listInvites(id) });
}

// Invite (POST {email}), remove member (POST {removeUserId}), cancel invite
// (POST {cancelEmail}). Owner-only for removals; any member may invite.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(req, id);
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { email?: string; removeUserId?: string; cancelEmail?: string };

  if (body.email) {
    const r = await invite(id, body.email);
    if (r.status === "invalid") return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    return NextResponse.json({ ok: true, status: r.status });
  }
  if (body.removeUserId) {
    if (g.role !== "owner") return NextResponse.json({ error: "Only the owner removes members." }, { status: 403 });
    await removeMember(id, body.removeUserId);
    return NextResponse.json({ ok: true });
  }
  if (body.cancelEmail) {
    if (g.role !== "owner") return NextResponse.json({ error: "Only the owner cancels invites." }, { status: 403 });
    await cancelInvite(id, body.cancelEmail);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(req, id);
  if (g instanceof Response) return g;
  if (g.role !== "owner") return NextResponse.json({ error: "Only the owner deletes a workspace." }, { status: 403 });
  await deleteWorkspace(id);
  return NextResponse.json({ ok: true });
}
