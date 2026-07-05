import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { buildSignedBuildPlan } from "@/lib/engine/execute/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue a signed plan for the NodeWorm Agent to build a downloaded generated
// connector bundle (npm install --ignore-scripts, npm run build) in the folder the
// user extracted it to. Every command is allowlisted (npm-run.ts) and re-validated
// by the Agent before it spawns.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.generated) return NextResponse.json({ error: "Generate the connector first." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { cwd?: string };
  const cwd = (body.cwd ?? "").trim();
  if (!cwd) return NextResponse.json({ error: "Pass the folder you extracted the bundle to as { cwd }." }, { status: 400 });

  const origin = new URL(req.url).origin;
  const built = buildSignedBuildPlan(it, origin, cwd);
  if (!built) return NextResponse.json({ error: "Build plans are unavailable (signing not configured or invalid path)." }, { status: 503 });

  it.execution = {
    planId: built.plan.id,
    callbackToken: built.callbackToken,
    createdAt: built.plan.createdAt,
    expiresAt: built.plan.expiresAt,
  };
  await saveIntegration(it);

  return NextResponse.json({ ok: true, envelope: built.envelope, plan: built.plan });
}
