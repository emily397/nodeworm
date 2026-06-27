import { NextResponse } from "next/server";
import { isLlmEnabled } from "@/lib/engine/llm";
import { listIntegrations } from "@/lib/store";
import { KNOWLEDGE } from "@/lib/engine/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = await listIntegrations();
  return NextResponse.json({
    mode: isLlmEnabled() ? "ai" : "heuristic",
    llm: isLlmEnabled(),
    knownApps: KNOWLEDGE.length,
    counts: {
      total: all.length,
      connected: all.filter((i) => i.status === "connected").length,
      planning: all.filter((i) => i.status === "running" || i.status === "needs-credentials").length,
      blocked: all.filter((i) => i.status === "blocked").length,
    },
  });
}
