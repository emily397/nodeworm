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
  // Result of auto-registering the hook URL inside the source app (server-held,
  // never client-set). Absent until a registration is attempted.
  registration?: {
    state: "registered" | "failed";
    via: "curated" | "discovered";
    id?: string;
    deleteUrl?: string;
    detail: string;
    at: number;
  };
}

export type FlowStepType = "http" | "connector" | "ai" | "filter" | "webhook-out" | "mcp" | "branch" | "wait" | "email";

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
  // branch: every branch whose condition passes runs, in order. One level deep.
  branches?: FlowBranch[];
  // Resilience: retry a failed effect (0-2 extra attempts, backoff), and whether
  // a final failure halts the run (default) or lets it continue as "partial".
  retries?: number;
  onError?: "halt" | "continue";
  waitMs?: number; // wait: park the run and resume after this delay
  // How the body is sent. Defaults to JSON; "form" is what Stripe-style APIs take.
  encoding?: "json" | "form";
  // email: all templated.
  to?: string;
  subject?: string;
}

export interface FlowBranch {
  id: string;
  name: string;
  condition?: FlowCondition; // absent = always runs
  steps: FlowStep[]; // no nested branch steps
}

export interface Flow {
  id: string;
  userId?: string;
  // Shared into a team workspace: members can see, edit and run it. Set only
  // by the owner through the validated share endpoint, never by generic patch.
  workspaceId?: string;
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
  // Uptime Kuma push URL. NodeWorm pings it after each successful scheduled or
  // poll run; a missed ping is what the monitor alerts on.
  heartbeatUrl?: string;
}

// "partial": the run completed but a continue-on-error step failed along the way.
// "waiting": parked at a wait step (or mid-flight when the process died); the
// resume sweep picks it back up from its cursor.
export type RunStatus = "running" | "ok" | "failed" | "filtered" | "partial" | "waiting";
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
  branch?: string; // set for steps that ran inside a branch, for display grouping
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: RunStatus;
  // payload is persisted so a resumed run can rebuild its template context.
  trigger: { type: FlowTriggerType; summary: string; payload?: unknown };
  startedAt: number;
  finishedAt?: number;
  steps: StepRun[];
  // Durability: index of the next TOP-LEVEL step to execute, when to wake a
  // parked run, and how many times it has been picked up.
  cursor?: number;
  resumeAt?: number;
  attempt?: number;
}
