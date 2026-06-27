import { NextResponse } from "next/server";
import { createIntegration, newBridge, saveBridge, saveIntegration } from "@/lib/store";
import { advance } from "@/lib/engine/orchestrate";
import { buildBridge } from "@/lib/engine/bridge";
import { parseIntent } from "@/lib/engine/custom/intent";
import { currentUserId } from "@/lib/engine/auth";
import type { Integration } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Natural-language front door for the custom mode. Classifies the request and
// routes it onto the real engine: a two-app intent becomes an A<->B bridge, a
// one-app intent becomes a single endpoint run. Both reuse the genuine
// discovery + probe + OAuth pipeline; nothing is faked.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string };
  const intent = await parseIntent(body.prompt ?? "");
  if (!intent) {
    return NextResponse.json({ error: "Describe what you want to connect or do." }, { status: 400 });
  }
  const userId = await currentUserId(req);

  if (intent.target) {
    const aArg = toAppArg(intent.source);
    const bArg = toAppArg(intent.target);
    const a0 = await createIntegration(aArg.name, aArg.url, userId);
    const b0 = await createIntegration(bArg.name, bArg.url, userId);
    const [a, b] = await Promise.all([runToCompletion(a0), runToCompletion(b0)]);
    const { flow, report, status } = buildBridge(a, b);
    const bridge = newBridge(a, b);
    bridge.flow = flow;
    bridge.report = report;
    bridge.status = status;
    await saveBridge(bridge);
    return NextResponse.json({ kind: intent.kind, summary: intent.summary, redirect: `/bridge/${bridge.id}` }, { status: 201 });
  }

  const arg = toAppArg(intent.source);
  const it = await createIntegration(arg.name, arg.url, userId);
  return NextResponse.json({ kind: intent.kind, summary: intent.summary, redirect: `/run/${it.id}` }, { status: 201 });
}

async function runToCompletion(it: Integration): Promise<Integration> {
  let cur = it;
  while (cur.currentPhase < cur.phases.length) cur = await advance(cur);
  await saveIntegration(cur);
  return cur;
}

function toAppArg(raw: string): { name: string; url?: string } {
  const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+\.[a-z]{2,}/i.test(raw);
  if (!isUrl) return { name: raw };
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  const base = host.split(".")[0];
  return { name: base.charAt(0).toUpperCase() + base.slice(1), url };
}
