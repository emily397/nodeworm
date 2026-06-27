import { NextResponse } from "next/server";
import { hostedConnectorsStatus } from "@/lib/engine/hosted-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Honest inert-until-keyed status: which hosted bridges are configured right now.
// With no SIGNAL_BRIDGE_URL set, signal-cli-rest-api reports available:false and the
// UI never offers the hosted path (the app degrades to self-host with no overclaim).
export async function GET() {
  return NextResponse.json({ bridges: hostedConnectorsStatus() });
}
