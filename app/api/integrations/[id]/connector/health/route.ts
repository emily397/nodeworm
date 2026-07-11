import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { runHealthCheck } from "@/lib/engine/health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-verify this integration's live connector on demand and update its rolling
// health. On sustained drift of a generated connector, a fresh bundle is regenerated
// (redeploy stays with the user/Agent). Same logic the scheduled sweep runs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await runHealthCheck(it, Date.now());
  if (!result.checked) {
    return NextResponse.json({ ok: false, error: "No verified connector with stored credentials to re-check." }, { status: 400 });
  }
  await saveIntegration(it);
  return NextResponse.json({ ok: true, health: it.connector?.health, repaired: Boolean(result.repaired) });
}
