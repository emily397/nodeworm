import { NextResponse } from "next/server";
import { createIntegration, listBridges, newBridge, redactIntegration, saveBridge, saveIntegration } from "@/lib/store";
import { advance } from "@/lib/engine/orchestrate";
import { buildBridge } from "@/lib/engine/bridge";
import { currentUserId } from "@/lib/engine/auth";
import type { Integration } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = await listBridges();
  return NextResponse.json({ bridges: all });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { source?: string; target?: string; prompt?: string };
  const pair = resolvePair(body);
  if (!pair) {
    return NextResponse.json({ error: "Provide two apps to bridge (source and target, or 'App A to App B')." }, { status: 400 });
  }

  const aArg = toAppArg(pair.source);
  const bArg = toAppArg(pair.target);
  const userId = await currentUserId(req);
  const a0 = await createIntegration(aArg.name, aArg.url, userId);
  const b0 = await createIntegration(bArg.name, bArg.url, userId);

  // Run both endpoints through the full per-app pipeline (discovery + live probe
  // + genuine-OAuth plan + wire) in parallel, then synthesise the cross-app flow.
  const [a, b] = await Promise.all([runToCompletion(a0), runToCompletion(b0)]);

  const { flow, report, status } = buildBridge(a, b);
  const bridge = newBridge(a, b);
  bridge.flow = flow;
  bridge.report = report;
  bridge.status = status;
  await saveBridge(bridge);

  return NextResponse.json(
    { bridge, source: redactIntegration(a), target: redactIntegration(b) },
    { status: 201 },
  );
}

async function runToCompletion(it: Integration): Promise<Integration> {
  let cur = it;
  while (cur.currentPhase < cur.phases.length) cur = await advance(cur);
  await saveIntegration(cur);
  return cur;
}

function resolvePair(body: { source?: string; target?: string; prompt?: string }): { source: string; target: string } | null {
  const s = body.source?.trim();
  const t = body.target?.trim();
  if (s && t) return { source: s, target: t };
  const phrase = (body.prompt ?? body.source ?? body.target ?? "").trim();
  const m = phrase.match(/^(.+?)\s*(?:<->|->|→|\bto\b|\band\b|\bwith\b|\+|,)\s*(.+)$/i);
  if (m && m[1].trim() && m[2].trim()) return { source: m[1].trim(), target: m[2].trim() };
  return null;
}

function toAppArg(raw: string): { name: string; url?: string } {
  const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+\.[a-z]{2,}/i.test(raw);
  if (!isUrl) return { name: raw };
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  const base = host.split(".")[0];
  return { name: base.charAt(0).toUpperCase() + base.slice(1), url };
}
