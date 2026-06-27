import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { repair } from "@/lib/engine/orchestrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Self-repair: the chosen connect method isn't working, so advance to the next
// viable one. Re-architects with the current method excluded, re-wires, and clears
// the old method's half-held state. Returns the new method (or an honest terminal if
// the fallback ladder is exhausted).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.plan?.fallbacks?.length) {
    return NextResponse.json({ ok: false, error: "No other connection method is available for this app." });
  }
  const before = it.plan.connectMethod;
  repair(it);
  await saveIntegration(it);
  const after = it.report?.connectMethod;
  return NextResponse.json({ ok: after !== before, from: before, connectMethod: after });
}
