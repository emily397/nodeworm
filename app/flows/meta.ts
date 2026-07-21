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

// Plain-language labels shown to everyone. The technical shape (http vs mcp vs
// connector) is an implementation detail; a person just picks "Do something in
// an app" and the builder keeps the right underlying type.
export const STEP_LABELS: Record<FlowStepType, string> = {
  http: "Do something in an app",
  connector: "Use your own connector",
  ai: "Ask AI",
  filter: "Only continue if…",
  "webhook-out": "Send to a web address",
  mcp: "Run an app tool",
  branch: "Split into paths",
};

export const STEP_BLURBS: Record<FlowStepType, string> = {
  http: "Create, update or fetch something in one of your connected apps",
  connector: "Call a connector you host yourself (advanced)",
  ai: "Let AI write, summarise, classify or decide",
  filter: "Stop here unless a condition is true",
  "webhook-out": "Send the result to any web address (advanced)",
  mcp: "Call a ready-made tool on a connected app (advanced)",
  branch: "Take different paths depending on the data",
};

// Steps a non-technical person sees first; the rest live behind "More step types".
export const PRIMARY_STEP_TYPES: FlowStepType[] = ["http", "ai", "filter", "branch"];
export const ADVANCED_STEP_TYPES: FlowStepType[] = ["mcp", "connector", "webhook-out"];

export const TRIGGER_LABEL: Record<FlowTriggerType, string> = {
  webhook: "When an app sends an event",
  schedule: "On a schedule",
  manual: "Only when I run it",
  poll: "When something new appears",
};

// Short chip label for the list view.
export const TRIGGER_CHIP: Record<FlowTriggerType, string> = {
  webhook: "on an app event",
  schedule: "on a schedule",
  manual: "run by hand",
  poll: "watches an app",
};

export const RUN_COLORS: Record<RunStatus | StepRunStatus, string> = {
  ok: "var(--color-live)",
  running: "var(--color-signal)",
  failed: "var(--color-blocked)",
  filtered: "var(--color-amber)",
  skipped: "var(--color-line-2)",
  partial: "var(--color-berry)",
};
