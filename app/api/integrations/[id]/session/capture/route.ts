import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { captureForIntegration, CaptureError } from "@/lib/engine/capture-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Auto-capture the app's real API traffic from the live managed session (CDP). The
// user just browses their key screens; NodeWorm records the calls, persists them on
// the integration, and reports how many real endpoints it found. /generate then
// rebuilds a typed connector from them, no HAR export or copy-paste needed.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { windowMs?: number };
  try {
    const result = await captureForIntegration(it, Number(body.windowMs) || 20000);
    await saveIntegration(it);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CaptureError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
