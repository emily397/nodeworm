// Pure error derivation, safe to import from client components. Kept separate
// from telemetry.ts, which pulls the Node-only error-reporting SDK.

import type { FlowRun } from "./types";

// The most recent failure on this flow, for the "last error" line in the UI.
export function lastError(runs: FlowRun[]): { at: number; step?: string; reason: string } | null {
  const bad = runs.find((r) => r.status === "failed" || r.status === "partial");
  if (!bad) return null;
  const step = bad.steps.find((s) => s.status === "failed");
  return { at: bad.finishedAt ?? bad.startedAt, step: step?.name, reason: step?.summary ?? "the run did not finish" };
}
