import { NextResponse } from "next/server";
import { createIntegration, newBridge, saveBridge, saveIntegration } from "@/lib/store";
import { advance } from "@/lib/engine/orchestrate";
import { buildBridge } from "@/lib/engine/bridge";
import { parseWorkflow, type WorkflowApp } from "@/lib/engine/custom/intent";
import { currentUserId } from "@/lib/engine/auth";
import type { BridgeWorkflow, Integration } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Natural-language front door. A plain-language request (including "when X happens
// in A, do Y in B") is parsed into a concrete, typed WorkflowPlan and routed onto
// the real engine: a two-app plan becomes an A<->B bridge whose trigger/action are
// the user's own (not a generic invention), a one-app plan becomes a single run.
// The chosen connect method per app comes from the real discovery pipeline. When a
// request is ambiguous the route asks one question instead of guessing; when it is
// not an integration at all it says so honestly. Nothing is faked.
export async function POST(req: Request) {
  const plan = await parseWorkflow(((await req.json().catch(() => ({}))) as { prompt?: string }).prompt ?? "");
  if (!plan) {
    return NextResponse.json({ error: "Describe what you want to connect or do." }, { status: 400 });
  }
  const userId = await currentUserId(req);

  if (plan.kind === "clarify") {
    return NextResponse.json(
      { needsClarification: true, question: plan.clarify?.question, because: plan.clarify?.because, summary: plan.summary },
      { status: 200 },
    );
  }
  if (plan.kind === "unmappable") {
    return NextResponse.json({ error: plan.unmappable ?? "This request is not an app integration." }, { status: 422 });
  }

  const source = plan.apps.find((a) => a.role === "source") ?? plan.apps[0];
  const target = plan.apps.find((a) => a.role === "target") ?? plan.apps.find((a) => a.name !== source?.name);

  // App-to-app / multi-step: run both endpoints through the real pipeline, then a
  // bridge whose flow carries the user's actual trigger and action.
  if (target && source && target.name !== source.name) {
    const [a, b] = await Promise.all([
      runToCompletion(await createIntegration(...appArgs(source, userId))),
      runToCompletion(await createIntegration(...appArgs(target, userId))),
    ]);
    const wf: BridgeWorkflow = { summary: plan.summary, trigger: plan.trigger, actions: plan.actions, mappings: plan.mappings };
    const { flow, report, status } = buildBridge(a, b, wf);
    const bridge = newBridge(a, b);
    bridge.flow = flow;
    bridge.report = report;
    bridge.status = status;
    bridge.workflow = wf;
    await saveBridge(bridge);
    return NextResponse.json(
      { kind: plan.kind, summary: plan.summary, methods: perAppMethods([a, b]), redirect: `/bridge/${bridge.id}` },
      { status: 201 },
    );
  }

  // Single-app connect: create it; the run page drives the real discovery swarm.
  const it = await createIntegration(...appArgs(source, userId));
  return NextResponse.json(
    { kind: plan.kind, summary: plan.summary, redirect: `/run/${it.id}` },
    { status: 201 },
  );
}

async function runToCompletion(it: Integration): Promise<Integration> {
  let cur = it;
  while (cur.currentPhase < cur.phases.length) cur = await advance(cur);
  await saveIntegration(cur);
  return cur;
}

// The connect method each side landed on, from the real architect decision.
function perAppMethods(its: Integration[]): Array<{ app: string; method?: string; kind?: string }> {
  return its.map((it) => ({ app: it.appName, method: it.plan?.connectMethod, kind: it.plan?.methodKind }));
}

function appArgs(app: WorkflowApp | undefined, userId?: string): [string, string | undefined, string | undefined] {
  const raw = (app?.name ?? "").trim();
  const urlHint = app?.url;
  const isUrl = /^https?:\/\//i.test(raw) || /^[\w-]+\.[a-z]{2,}/i.test(raw);
  if (urlHint) return [raw, /^https?:\/\//i.test(urlHint) ? urlHint : `https://${urlHint}`, userId];
  if (!isUrl) return [raw, undefined, userId];
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  const base = host.split(".")[0];
  return [base.charAt(0).toUpperCase() + base.slice(1), url, userId];
}
