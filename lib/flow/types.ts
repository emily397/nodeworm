// Flow: the automation layer on top of NodeWorm connections. One trigger,
// ordered steps, template inputs over the run context. Shared by engine,
// store, API and UI.

export type FlowTriggerType = "webhook" | "schedule" | "manual" | "poll";

export interface FlowTrigger {
  type: FlowTriggerType;
  // The connection this trigger conceptually listens to (display + drafting; for
  // poll triggers it also supplies the auth the poll call is made with).
  integrationId?: string;
  appName?: string;
  event?: string;
  scheduleMins?: number;
  // Poll trigger: the endpoint to fetch, where the item list lives in the
  // response, and which field identifies an item for dedupe.
  url?: string;
  method?: string;
  itemsPath?: string;
  idPath?: string;
  // Webhook secret in the hook URL. Server-only: redacted before the client on
  // generic reads; the dedicated owner GET returns the full URL.
  token?: string;
}

export type FlowStepType = "http" | "connector" | "ai" | "filter" | "webhook-out" | "mcp";

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
  body?: string; // JSON template (mcp: the tool arguments)
  prompt?: string; // ai (template)
  condition?: FlowCondition; // filter
  tool?: string; // mcp: tool name on the connector
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
  // Poll-trigger dedupe state, server-held (never client-set): ids already seen.
  // undefined means the first poll hasn't primed yet.
  pollState?: { seen: string[]; lastPolledAt?: number; lastDetail?: string };
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
