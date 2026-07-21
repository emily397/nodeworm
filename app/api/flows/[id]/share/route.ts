import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/engine/auth";
import { isMember } from "@/lib/engine/workspaces";
import { redactFlow } from "@/lib/flow/model";
import { getOwnedFlow, saveFlow } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Share (or unshare) a flow into a workspace. Owner-only, and the owner must
// actually be a member of the target workspace: workspaceId never comes from a
// generic patch, so a forged id can't move a record into a foreign tenant.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const uid = await currentUserId(req);
  if (!uid || flow.userId !== uid) return NextResponse.json({ error: "Only the owner shares a flow." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string | null };
  if (body.workspaceId) {
    if (!(await isMember(body.workspaceId, uid))) return NextResponse.json({ error: "You are not in that workspace." }, { status: 403 });
    flow.workspaceId = body.workspaceId;
  } else {
    flow.workspaceId = undefined;
  }
  flow.updatedAt = Date.now();
  await saveFlow(flow);
  return NextResponse.json({ flow: redactFlow(flow) });
}
