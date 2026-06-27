import { notFound } from "next/navigation";
import { getBridge, getIntegration, redactIntegration, saveBridge } from "@/lib/store";
import { buildBridge } from "@/lib/engine/bridge";
import { BridgeView } from "./BridgeView";

export const dynamic = "force-dynamic";

export default async function BridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bridge = await getBridge(id);
  if (!bridge) notFound();

  const source = await getIntegration(bridge.sourceId);
  const target = await getIntegration(bridge.targetId);

  // Refresh against the live endpoints so the page reflects each side's auth.
  if (source && target) {
    const { flow, report, status } = buildBridge(source, target);
    bridge.flow = flow;
    bridge.report = report;
    bridge.status = status;
    await saveBridge(bridge);
  }

  return (
    <BridgeView
      bridge={bridge}
      source={source ? redactIntegration(source) : null}
      target={target ? redactIntegration(target) : null}
    />
  );
}
