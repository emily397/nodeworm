import { NextResponse } from "next/server";
import { fireFlow } from "@/lib/flow/runtime";
import { listFlows } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Scheduler tick (Vercel Cron): run every enabled schedule-triggered flow whose
// interval has elapsed since its last run.
async function sweep(): Promise<Response> {
  const now = Date.now();
  const due = (await listFlows()).filter(
    (f) => f.enabled && f.trigger.type === "schedule" && now - (f.lastRunAt ?? 0) >= (f.trigger.scheduleMins ?? 60) * 60_000,
  );
  const ran: Array<{ id: string; status: string }> = [];
  for (const flow of due) {
    const run = await fireFlow(flow, { type: "schedule", summary: "scheduled run", payload: { scheduledAt: now } });
    ran.push({ id: flow.id, status: run.status });
  }
  return NextResponse.json({ ok: true, due: due.length, ran });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}
