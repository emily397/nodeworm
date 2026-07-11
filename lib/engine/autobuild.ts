// The autonomy loop: one call chains the server-autonomous steps of building a
// connector from a live managed session (capture the app's real traffic, then
// generate a typed connector from it) while persisting per-step status after every
// transition. That makes it resumable (the record always reflects the true point
// reached), honest (a failed step stops the loop and records why, never a fake
// "done"), and live (the client re-reads the record and shows real progress).
//
// Build / tunnel / verify are deliberately NOT here: they run on the user's local
// NodeWorm Agent against a folder only the user's machine knows, so they stay
// Agent-driven. This orchestrator owns exactly what the cloud can do unattended.

export type AutobuildStepKey = "capture" | "generate";
export type AutobuildStepStatus = "running" | "ok" | "skipped" | "failed";

export interface AutobuildStep {
  key: AutobuildStepKey;
  status: AutobuildStepStatus;
  detail?: string;
  at: number;
}

export interface AutobuildState {
  startedAt: number;
  updatedAt: number;
  steps: AutobuildStep[];
  done: boolean;
  ok: boolean;
}

// Each work function mutates the integration and returns a human-readable detail.
// `skipped` lets capture bow out cleanly (no managed session) without failing the
// loop; generation then falls back to the discovered spec. A thrown error is a real
// failure: the loop records it and stops.
export interface AutobuildDeps {
  now(): number;
  capture(): Promise<{ skipped?: boolean; detail: string }>;
  generate(): Promise<{ detail: string }>;
  // Called after every status transition so the persisted record is always current.
  persist(state: AutobuildState): Promise<void>;
}

const ORDER: AutobuildStepKey[] = ["capture", "generate"];

export async function runAutobuild(deps: AutobuildDeps): Promise<AutobuildState> {
  const state: AutobuildState = { startedAt: deps.now(), updatedAt: deps.now(), steps: [], done: false, ok: true };

  const commit = async () => {
    state.updatedAt = deps.now();
    await deps.persist(state);
  };

  for (const key of ORDER) {
    const step: AutobuildStep = { key, status: "running", at: deps.now() };
    state.steps.push(step);
    await commit();
    try {
      const res = key === "capture" ? await deps.capture() : await deps.generate();
      step.status = "skipped" in res && res.skipped ? "skipped" : "ok";
      step.detail = res.detail;
      step.at = deps.now();
      await commit();
    } catch (e) {
      step.status = "failed";
      step.detail = e instanceof Error ? e.message : String(e);
      step.at = deps.now();
      state.ok = false;
      break;
    }
  }

  state.done = true;
  await commit();
  return state;
}
