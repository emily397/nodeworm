import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { buildSignedPlan, executionAvailableFor } from "@/lib/engine/execute/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue a SIGNED execution plan for the NodeWorm Agent to run. Returns the signed
// envelope (forwarded verbatim to the Agent) plus the plan object (for the UI to
// preview the exact commands). Persists a one-time callback token so only the real
// Agent running this plan can report the result back.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!executionAvailableFor(it.appName, it.research?.best?.kind, it.appUrl)) {
    return NextResponse.json({ error: "Agentic setup is not available for this app." }, { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const built = buildSignedPlan(it, origin);
  if (!built) return NextResponse.json({ error: "Could not build a signed plan." }, { status: 500 });

  it.execution = {
    planId: built.plan.id,
    callbackToken: built.callbackToken,
    createdAt: built.plan.createdAt,
    expiresAt: built.plan.expiresAt,
  };
  await saveIntegration(it);

  return NextResponse.json({ ok: true, envelope: built.envelope, plan: built.plan });
}
