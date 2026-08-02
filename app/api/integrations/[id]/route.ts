import { NextResponse } from "next/server";
import { pieceFor } from "@/lib/pieces/registry";
import { getOwnedIntegration, redactIntegration, removeIntegration, saveIntegration } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ integration: redactIntegration(it) });
}

// Save the non-secret per-connection values a piece declares (a shop domain, an
// account id). Only keys the piece actually declares are accepted, so this can
// never be used to stuff arbitrary data onto a connection.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { connectionConfig?: Record<string, unknown> };
  const declared = pieceFor(it.appName)?.connectionFields ?? [];
  if (!declared.length) return NextResponse.json({ error: "This connection takes no extra settings." }, { status: 400 });

  const next: Record<string, string> = { ...it.connectionConfig };
  for (const f of declared) {
    const v = body.connectionConfig?.[f.key];
    if (typeof v === "string") {
      const trimmed = v.trim().slice(0, 200);
      if (trimmed) next[f.key] = trimmed;
      else delete next[f.key];
    }
  }
  it.connectionConfig = next;
  await saveIntegration(it);
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
