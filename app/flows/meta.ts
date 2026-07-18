// Shared display metadata for the flows UI: one saturated color per step type
// (same category-color doctrine as the gallery), trigger labels, run statuses.

import type { FlowStepType, FlowTriggerType, RunStatus, StepRunStatus } from "@/lib/flow/types";

export const STEP_COLORS: Record<FlowStepType, string> = {
  http: "var(--color-signal)",
  connector: "var(--color-aqua)",
  ai: "var(--color-grape)",
  filter: "var(--color-amber)",
  "webhook-out": "var(--color-berry)",
  mcp: "var(--color-teal)",
  branch: "var(--color-live)",
};

export const STEP_LABELS: Record<FlowStepType, string> = {
  http: "App call",
  connector: "Connector call",
  ai: "AI step",
  filter: "Filter",
  "webhook-out": "Send webhook",
  mcp: "MCP tool",
  branch: "Branch",
};

export const STEP_BLURBS: Record<FlowStepType, string> = {
  http: "Call an app's API as one of your connections (auth injected from the vault)",
  connector: "Call your verified self-hosted or tunneled connector",
  ai: "Let a model transform, summarise or decide",
  filter: "Only continue when a condition holds",
  "webhook-out": "POST the result anywhere",
  mcp: "Call a typed tool on your generated / tunneled MCP connector",
  branch: "Split into paths; every branch whose condition holds runs",
};

export const TRIGGER_LABEL: Record<FlowTriggerType, string> = {
  webhook: "on webhook",
  schedule: "on a schedule",
  manual: "run manually",
  poll: "watch an app",
};

export const RUN_COLORS: Record<RunStatus | StepRunStatus, string> = {
  ok: "var(--color-live)",
  running: "var(--color-signal)",
  failed: "var(--color-blocked)",
  filtered: "var(--color-amber)",
  skipped: "var(--color-line-2)",
  partial: "var(--color-berry)",
};
