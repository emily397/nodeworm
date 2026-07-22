// Durability rules. NodeWorm persists per-step state after every step, so a run
// that dies mid-flight (function timeout, redeploy, crash) already has everything
// needed to continue. These pure predicates decide which runs the resume sweep
// picks back up. The sweep itself lives in the flows cron.

import type { FlowRun, StepRun } from "./types";

// A run still marked "running" this long after it started did not finish on its
// own: the process that owned it is gone. Comfortably longer than the 300s
// function ceiling so a live run is never stolen mid-flight.
export const STALE_RUN_MS = 10 * 60 * 1000;

// Give up after this many pickups so a genuinely poisonous run cannot loop.
export const MAX_ATTEMPTS = 5;

export function isResumable(run: FlowRun, now: number, staleMs = STALE_RUN_MS): boolean {
  if ((run.attempt ?? 0) >= MAX_ATTEMPTS) return false;
  if (run.status === "waiting") return (run.resumeAt ?? 0) <= now;
  if (run.status === "running") return run.startedAt <= now - staleMs;
  return false;
}

// Rebuild the executor's template context from a persisted run: earlier step
// outputs and the original trigger payload, both already on the record.
export function contextFromRun(run: FlowRun): Record<string, unknown> {
  const steps: Record<string, unknown> = {};
  for (const s of run.steps as StepRun[]) {
    if (s.status === "ok" && s.output !== undefined) steps[s.stepId] = { output: s.output };
  }
  return { trigger: run.trigger.payload, steps };
}
