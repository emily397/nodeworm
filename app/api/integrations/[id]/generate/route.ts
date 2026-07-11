import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { unpackBundle } from "@/lib/engine/bundle-store";
import { generateForIntegration, GenerateError } from "@/lib/engine/generate-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: generate the connector bundle from the discovered surface and persist it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { har?: string; capturedRequests?: unknown };
  try {
    const result = await generateForIntegration(it, body);
    await saveIntegration(it);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GenerateError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

// GET: return the previously generated bundle (download surface).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.generated) return NextResponse.json({ error: "Nothing generated yet." }, { status: 404 });
  const files = it.generated.packed ? unpackBundle(it.generated.packed) : it.generated.files;
  return NextResponse.json({ ok: true, ...it.generated, packed: undefined, files });
}
