import { NextResponse } from "next/server";
import { applyPatch, redactFlow } from "@/lib/flow/model";
import { getOwnedFlow, removeFlow, saveFlow } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner read. The hook URL (carrying the secret token) is returned ONLY here,
// never on generic list reads.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const origin = new URL(req.url).origin;
  const hookUrl = `${origin}/api/flows/${flow.id}/hook?k=${flow.trigger.token}`;
  return NextResponse.json({ flow: redactFlow(flow), hookUrl });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updated = applyPatch(flow, patch);
  await saveFlow(updated);
  return NextResponse.json({ flow: redactFlow(updated) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await removeFlow(id);
  return NextResponse.json({ ok: true });
}
