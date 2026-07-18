import { NextResponse } from "next/server";
import { fireFlow, pollFlowTick } from "@/lib/flow/runtime";
import { listFlows } from "@/lib/flow/store";
import type { Flow } from "@/lib/flow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Scheduler tick (Vercel Cron): run enabled schedule-triggered flows whose
// interval elapsed, and poll enabled watch-an-app flows (prime-then-dedupe).
function isDue(f: Flow, now: number): boolean {
  const interval = (f.trigger.scheduleMins ?? 60) * 60_000;
  const last = f.trigger.type === "poll" ? f.pollState?.lastPolledAt ?? 0 : f.lastRunAt ?? 0;
  return now - last >= interval;
}

async function sweep(): Promise<Response> {
  const now = Date.now();
  const flows = await listFlows();
  const ran: Array<{ id: string; kind: string; status?: string; fired?: number; detail?: string }> = [];

  for (const flow of flows.filter((f) => f.enabled && f.trigger.type === "schedule" && isDue(f, now))) {
    const run = await fireFlow(flow, { type: "schedule", summary: "scheduled run", payload: { scheduledAt: now } });
    ran.push({ id: flow.id, kind: "schedule", status: run.status });
  }
  for (const flow of flows.filter((f) => f.enabled && f.trigger.type === "poll" && isDue(f, now))) {
    const r = await pollFlowTick(flow);
    ran.push({ id: flow.id, kind: "poll", fired: r.fired, detail: r.detail });
  }
  return NextResponse.json({ ok: true, ran });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}
