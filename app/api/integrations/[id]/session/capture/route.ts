import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { captureTraffic } from "@/lib/engine/cobrowse";
import { normalizeCapture } from "@/lib/engine/capture";

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
  if (!it.managedSession?.connectUrl) {
    return NextResponse.json({ error: "Open the managed session and sign in first, then browse the screens you want connected." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { windowMs?: number };
  const windowMs = Math.min(Math.max(Number(body.windowMs) || 20000, 3000), 45000);

  const captured = await captureTraffic(it.managedSession.connectUrl, { windowMs });
  const { apiBase, ops } = normalizeCapture(captured);

  it.capturedRequests = captured;
  await saveIntegration(it);

  return NextResponse.json({
    ok: true,
    captured: captured.length,
    endpoints: ops.length,
    apiBase,
    sample: ops.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
  });
}
