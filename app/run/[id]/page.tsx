import { notFound } from "next/navigation";
import { getIntegration, redactIntegration } from "@/lib/store";
import { SwarmConsole } from "./SwarmConsole";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) notFound();
  return <SwarmConsole initial={redactIntegration(it)} />;
}
