// Curated flow templates: real trigger + step skeletons a user finishes in the
// builder (URLs come from the action picker; bodies are honest starting
// templates). Instantiation matches named apps against existing connections;
// unmatched apps surface in needsConnections, never a fabricated link. Pure.

import { matchConnection, type ConnectionRef } from "./draft";
import type { FlowStep, FlowTrigger } from "./types";

export interface FlowTemplate {
  id: string;
  name: string;
  blurb: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
}

export const TEMPLATES: FlowTemplate[] = [
  {
    id: "payment-ledger-ping",
    name: "New payment, logged and announced",
    blurb: "When a payment comes in, add it to your records and tell the team.",
    trigger: { type: "webhook", appName: "Stripe", event: "payment succeeded" },
    steps: [
      { id: "row", type: "http", name: "Add ledger row", appName: "Notion", method: "POST", body: '{"Amount":"{{trigger.data.object.amount}}","Customer":"{{trigger.data.object.customer}}"}' },
      { id: "ping", type: "http", name: "Ping the channel", appName: "Slack", method: "POST", body: '{"text":"Payment in: {{trigger.data.object.amount}}"}' },
    ],
  },
  {
    id: "daily-ai-digest",
    name: "Daily AI summary",
    blurb: "Every morning, AI sums up what changed and sends it to you.",
    trigger: { type: "schedule", scheduleMins: 1440 },
    steps: [
      { id: "pull", type: "http", name: "Pull yesterday's records", method: "GET" },
      { id: "sum", type: "ai", name: "Summarise", prompt: "Write a crisp 3-line digest of these records: {{steps.pull.output}}" },
      { id: "post", type: "webhook-out", name: "Deliver the digest", method: "POST", body: '{"text":"{{steps.sum.output}}"}' },
    ],
  },
  {
    id: "form-to-crm",
    name: "Form reply becomes a lead",
    blurb: "Every form submission turns into a new lead, no copy-paste.",
    trigger: { type: "webhook", appName: "Typeform", event: "new response" },
    steps: [{ id: "lead", type: "http", name: "Create the lead", appName: "HubSpot", method: "POST", body: '{"email":"{{trigger.form_response.answers.0.email}}"}' }],
  },
  {
    id: "watch-and-classify",
    name: "Sort new items with AI",
    blurb: "Watch a list; AI labels each new item and passes it on.",
    trigger: { type: "poll", scheduleMins: 15, idPath: "id" },
    steps: [
      { id: "class", type: "ai", name: "Classify the item", prompt: 'Classify this item as {"result":{"label":"urgent"|"routine"}}: {{trigger}}' },
      { id: "fwd", type: "webhook-out", name: "Forward with label", method: "POST", body: '{"label":"{{steps.class.output.label}}","item":"{{trigger.id}}"}' },
    ],
  },
  {
    id: "severity-router",
    name: "Handle urgent things differently",
    blurb: "Urgent alerts notify someone; the rest are just logged quietly.",
    trigger: { type: "webhook", event: "alert received" },
    steps: [
      {
        id: "route",
        type: "branch",
        name: "Route by severity",
        branches: [
          {
            id: "crit",
            name: "critical",
            condition: { left: "{{trigger.severity}}", op: "eq", right: "critical" },
            steps: [{ id: "page", type: "webhook-out", name: "Page on-call", method: "POST", body: '{"alert":"{{trigger.title}}"}' }],
          },
          {
            id: "rest",
            name: "everything else",
            steps: [{ id: "log", type: "webhook-out", name: "Log it", method: "POST", body: '{"logged":"{{trigger.title}}","severity":"{{trigger.severity}}"}' }],
          },
        ],
      },
    ],
  },
  {
    id: "big-deal-filter",
    name: "Only the big ones",
    blurb: "Ignore the small stuff; only act when something crosses your threshold.",
    trigger: { type: "webhook", event: "record created" },
    steps: [
      { id: "gate", type: "filter", name: "Only above threshold", condition: { left: "{{trigger.amount}}", op: "gt", right: "1000" } },
      { id: "send", type: "webhook-out", name: "Deliver (retries twice)", method: "POST", retries: 2, body: '{"big_one":"{{trigger.amount}}"}' },
    ],
  },
  {
    id: "cross-post",
    name: "Post to two places at once",
    blurb: "One thing happens, it goes to two places. If one fails, the other still sends.",
    trigger: { type: "webhook", event: "content published" },
    steps: [
      { id: "one", type: "webhook-out", name: "Post to destination A", method: "POST", onError: "continue", body: '{"title":"{{trigger.title}}"}' },
      { id: "two", type: "webhook-out", name: "Post to destination B", method: "POST", onError: "continue", body: '{"title":"{{trigger.title}}"}' },
    ],
  },
];

export interface TemplateDraft {
  name: string;
  description: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
  needsConnections: string[];
}

let seq = 0;
function freshId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}${Math.random().toString(36).slice(2, 6)}`;
}

export function instantiateTemplate(id: string, conns: ConnectionRef[]): TemplateDraft | null {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;

  const missing: string[] = [];
  const resolve = (app?: string): string | undefined => {
    if (!app) return undefined;
    const hit = matchConnection(app, conns);
    if (!hit && !missing.some((m) => m.toLowerCase() === app.toLowerCase())) missing.push(app);
    return hit?.id;
  };

  const remapStep = (s: FlowStep): FlowStep => ({
    ...s,
    id: freshId("t"),
    integrationId: resolve(s.appName),
    branches: s.branches?.map((b) => ({ ...b, id: freshId("b"), steps: b.steps.map(remapStep) })),
  });

  return {
    name: t.name,
    description: t.blurb,
    trigger: { ...t.trigger, integrationId: resolve(t.trigger.appName) },
    steps: t.steps.map(remapStep),
    needsConnections: missing,
  };
}
