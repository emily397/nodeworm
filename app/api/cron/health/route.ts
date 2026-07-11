import { NextResponse } from "next/server";
import { listIntegrations, saveIntegration } from "@/lib/store";
import { runHealthCheck } from "@/lib/engine/health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Scheduled sweep: re-verify every live connector and update its rolling health,
// auto-regenerating a generated connector that has drifted. Vercel Cron calls this on
// the schedule in vercel.json. When CRON_SECRET is set (Vercel sends it as a Bearer
// token on cron invocations) the endpoint requires it, so it can't be triggered by
// anyone; with no secret configured it stays open for local/dev runs.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function sweep(): Promise<Response> {
  const all = await listIntegrations();
  const live = all.filter((it) => it.connector?.verified);

  let checked = 0;
  let repaired = 0;
  const drifted: string[] = [];
  for (const it of live) {
    const r = await runHealthCheck(it, Date.now());
    if (!r.checked) continue;
    checked++;
    if (r.repaired) repaired++;
    if (r.state && r.state !== "healthy") drifted.push(`${it.appName}:${r.state}`);
    await saveIntegration(it);
  }
  return NextResponse.json({ ok: true, scanned: live.length, checked, repaired, drifted });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}

// Allow a manual POST trigger too (same auth), handy for testing the sweep on demand.
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return sweep();
}
