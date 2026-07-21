import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/engine/auth";
import { isMember } from "@/lib/engine/workspaces";
import { getOwnedIntegration, redactIntegration, saveIntegration } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Share (or unshare) a connection into a workspace. Owner-only + member-of-target.
// Members then USE the connection server-side under the owner's vault scope;
// credentials are never exposed or copied.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const uid = await currentUserId(req);
  if (!uid || it.userId !== uid) return NextResponse.json({ error: "Only the owner shares a connection." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string | null };
  if (body.workspaceId) {
    if (!(await isMember(body.workspaceId, uid))) return NextResponse.json({ error: "You are not in that workspace." }, { status: 403 });
    it.workspaceId = body.workspaceId;
  } else {
    it.workspaceId = undefined;
  }
  it.updatedAt = Date.now();
  await saveIntegration(it);
  return NextResponse.json({ integration: redactIntegration(it) });
}
