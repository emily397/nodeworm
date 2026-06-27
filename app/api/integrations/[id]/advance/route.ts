import { NextResponse } from "next/server";
import { getIntegration, redactIntegration, saveIntegration } from "@/lib/store";
import { advance } from "@/lib/engine/orchestrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (it.currentPhase >= it.phases.length) {
    return NextResponse.json({ integration: redactIntegration(it), done: true });
  }

  const updated = await advance(it);
  await saveIntegration(updated);
  return NextResponse.json({
    integration: redactIntegration(updated),
    done: updated.currentPhase >= updated.phases.length,
  });
}
