import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/engine/auth";
import { parseWorkflow } from "@/lib/engine/custom/intent";
import { planToFlow } from "@/lib/flow/draft";
import { newFlowRecord, redactFlow } from "@/lib/flow/model";
import { listFlows, saveFlow } from "@/lib/flow/store";
import { instantiateTemplate } from "@/lib/flow/templates";
import { listIntegrations } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const uid = await currentUserId(req);
  const all = await listFlows();
  const visible = uid ? all.filter((f) => f.userId === uid) : all.filter((f) => !f.userId);
  return NextResponse.json({ flows: visible.map(redactFlow) });
}

// Create a flow. With `prompt`, the AI front door drafts the whole flow from
// plain language against the user's existing connections; without it, a blank
// manual flow. clarify/unmappable come back honestly instead of a guessed draft.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; prompt?: string; template?: string };
  const userId = await currentUserId(req);

  if (body.template) {
    const all = await listIntegrations();
    const visible = userId ? all.filter((i) => i.userId === userId) : all.filter((i) => !i.userId);
    const draft = instantiateTemplate(body.template, visible.map((i) => ({ id: i.id, appName: i.appName, status: i.status })));
    if (!draft) return NextResponse.json({ error: "Unknown template." }, { status: 400 });
    const flow = newFlowRecord(draft.name, userId);
    flow.description = draft.description;
    flow.trigger = { ...draft.trigger, token: flow.trigger.token };
    flow.steps = draft.steps;
    flow.draftedBy = "manual";
    flow.needsConnections = draft.needsConnections;
    await saveFlow(flow);
    return NextResponse.json({ flow: redactFlow(flow), needsConnections: draft.needsConnections }, { status: 201 });
  }

  if (body.prompt?.trim()) {
    const plan = await parseWorkflow(body.prompt);
    if (!plan) return NextResponse.json({ error: "Describe the automation you want." }, { status: 400 });
    if (plan.kind === "clarify") return NextResponse.json({ clarify: plan.clarify });
    if (plan.kind === "unmappable") return NextResponse.json({ unmappable: plan.unmappable });

    const all = await listIntegrations();
    const visible = userId ? all.filter((i) => i.userId === userId) : all.filter((i) => !i.userId);
    const draft = planToFlow(plan, visible.map((i) => ({ id: i.id, appName: i.appName, status: i.status })));
    if (!draft) return NextResponse.json({ error: "Could not draft that automation." }, { status: 400 });

    const flow = newFlowRecord(draft.name, userId);
    flow.description = draft.description;
    flow.trigger = { ...draft.trigger, token: flow.trigger.token };
    flow.steps = draft.steps;
    flow.draftedBy = "ai";
    flow.needsConnections = draft.needsConnections;
    await saveFlow(flow);
    return NextResponse.json({ flow: redactFlow(flow), needsConnections: draft.needsConnections }, { status: 201 });
  }

  const flow = newFlowRecord(body.name ?? "", userId);
  flow.draftedBy = "manual";
  await saveFlow(flow);
  return NextResponse.json({ flow: redactFlow(flow) }, { status: 201 });
}
