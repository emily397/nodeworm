// Maps a parsed plain-language WorkflowPlan (lib/engine/custom/intent.ts) onto a
// Flow draft against the user's existing connections. Honest seams: apps with no
// matching connection land in needsConnections (the UI prompts to connect them),
// never a fabricated match. clarify/unmappable plans return null so the route can
// surface the question instead of guessing.

import type { WorkflowPlan } from "../engine/custom/intent";
import type { FlowStep, FlowTrigger } from "./types";

export interface ConnectionRef {
  id: string;
  appName: string;
  status: string;
}

export interface FlowDraft {
  name: string;
  description: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
  needsConnections: string[];
}

const LIVE = new Set(["connected", "connected-via-session", "connected-via-connector", "needs-verification"]);

function match(app: string, conns: ConnectionRef[]): ConnectionRef | undefined {
  const want = app.trim().toLowerCase();
  const named = conns.filter((c) => c.appName.trim().toLowerCase() === want);
  if (!named.length) return undefined;
  return named.find((c) => LIVE.has(c.status)) ?? named[0];
}

export function planToFlow(plan: WorkflowPlan, conns: ConnectionRef[]): FlowDraft | null {
  if (plan.kind === "clarify" || plan.kind === "unmappable") return null;

  const missing: string[] = [];
  const resolve = (app: string): string | undefined => {
    const hit = match(app, conns);
    if (!hit && !missing.some((m) => m.toLowerCase() === app.toLowerCase())) missing.push(app);
    return hit?.id;
  };

  const trigger: FlowTrigger = plan.trigger
    ? { type: "webhook", appName: plan.trigger.app, event: plan.trigger.event, integrationId: resolve(plan.trigger.app) }
    : { type: "manual" };

  const steps: FlowStep[] = plan.actions.map((a, i) => {
    const mapping = plan.mappings.find((m) => m.toApp.toLowerCase() === a.app.toLowerCase());
    const body = mapping?.fields.length
      ? JSON.stringify(Object.fromEntries(mapping.fields.map((f) => [f.target, `{{trigger.${f.source}}}`])))
      : undefined;
    return {
      id: `s${i + 1}`,
      type: "http",
      name: `${a.op} in ${a.app}`,
      appName: a.app,
      integrationId: resolve(a.app),
      method: "POST",
      body,
    };
  });

  return {
    name: plan.summary.slice(0, 80),
    description: plan.raw,
    trigger,
    steps,
    needsConnections: missing,
  };
}
