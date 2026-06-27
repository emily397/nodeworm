import { NextResponse } from "next/server";
import { getBridge, getIntegration, redactIntegration, removeBridge, removeIntegration, saveBridge } from "@/lib/store";
import { buildBridge } from "@/lib/engine/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bridge = await getBridge(id);
  if (!bridge) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const source = await getIntegration(bridge.sourceId);
  const target = await getIntegration(bridge.targetId);

  // Recompute from the live endpoints so the bridge reflects each side's current
  // auth state (a side just authorized flips the bridge toward connected).
  if (source && target) {
    const { flow, report, status } = buildBridge(source, target);
    bridge.flow = flow;
    bridge.report = report;
    bridge.status = status;
    await saveBridge(bridge);
  }

  return NextResponse.json({
    bridge,
    source: source ? redactIntegration(source) : null,
    target: target ? redactIntegration(target) : null,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bridge = await getBridge(id);
  if (!bridge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Remove the bridge and the two endpoint integrations it created.
  await Promise.all([removeBridge(id), removeIntegration(bridge.sourceId), removeIntegration(bridge.targetId)]);
  return NextResponse.json({ ok: true });
}
