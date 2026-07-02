import { NextResponse } from "next/server";
import { getOwnedIntegration, redactIntegration, removeIntegration } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ integration: redactIntegration(it) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Owner check before deleting: a bare id must not remove another user's record.
  if (!(await getOwnedIntegration(req, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await removeIntegration(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
