import { NextResponse } from "next/server";
import { agentDriverStatus } from "@/lib/engine/browseruse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whether the AI browser agent (Browser Use / Skyvern) that auto-registers OAuth
// apps is configured. The RecoveryCard uses this to choose the agent flow over the
// older DOM-scrape cobrowse path.
export async function GET() {
  return NextResponse.json(agentDriverStatus());
}
