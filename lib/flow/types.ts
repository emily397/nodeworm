// Flow: the automation layer on top of NodeWorm connections. One trigger,
// ordered steps, template inputs over the run context. Shared by engine,
// store, API and UI.

export type FlowTriggerType = "webhook" | "schedule" | "manual";

export interface FlowTrigger {
  type: FlowTriggerType;
  // The connection this trigger conceptually listens to (display + drafting only;
  // the webhook URL is what the app actually calls).
  integrationId?: string;
  appName?: string;
  event?: string;
  scheduleMins?: number;
  // Webhook secret in the hook URL. Server-only: redacted before the client on
  // generic reads; the dedicated owner GET returns the full URL.
  token?: string;
}

export type FlowStepType = "http" | "connector" | "ai" | "filter" | "webhook-out";

export type ConditionOp = "eq" | "neq" | "contains" | "exists" | "gt" | "lt";

export interface FlowCondition {
  left: string; // template
  op: ConditionOp;
  right?: string; // template; unused for "exists"
}

export interface FlowStep {
  id: string;
  type: FlowStepType;
  name: string;
  // http / connector: which connection to act as. Auth is injected server-side
  // from the vault; credentials never live on the flow.
  integrationId?: string;
  appName?: string;
  method?: string;
  url?: string; // http / webhook-out (template)
  path?: string; // connector: path under the vaulted connector base URL (template)
  body?: string; // JSON template
  prompt?: string; // ai (template)
  condition?: FlowCondition; // filter
}

export interface Flow {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: FlowTrigger;
  steps: FlowStep[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  draftedBy?: "ai" | "manual";
  // Apps the AI draft referenced that have no matching connection yet; the UI
  // prompts to connect them. Honest seam, never a fabricated match.
  needsConnections?: string[];
}

export type RunStatus = "running" | "ok" | "failed" | "filtered";
export type StepRunStatus = "ok" | "failed" | "skipped" | "filtered";

export interface StepRun {
  stepId: string;
  name: string;
  type: FlowStepType;
  status: StepRunStatus;
  startedAt: number;
  finishedAt: number;
  summary: string;
  output?: unknown; // bounded before persist
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: RunStatus;
  trigger: { type: FlowTriggerType; summary: string };
  startedAt: number;
  finishedAt?: number;
  steps: StepRun[];
}
