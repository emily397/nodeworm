import { notFound } from "next/navigation";
import { redactFlow } from "@/lib/flow/model";
import { getFlow, listRuns } from "@/lib/flow/store";
import { FlowBuilder } from "./FlowBuilder";

export const dynamic = "force-dynamic";

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getFlow(id);
  if (!flow) notFound();
  const runs = await listRuns(id, 20);
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <FlowBuilder initial={redactFlow(flow)} initialRuns={runs} />
    </div>
  );
}
