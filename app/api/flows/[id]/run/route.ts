import { NextResponse } from "next/server";
import { fireFlow } from "@/lib/flow/runtime";
import { getOwnedFlow } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Manual run, owner-only. Optional payload stands in for the trigger event so a
// flow can be tested with realistic data before its webhook is registered.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { payload?: unknown };
  const run = await fireFlow(flow, { type: "manual", summary: "manual run", payload: body.payload ?? {} });
  return NextResponse.json({ run });
}
