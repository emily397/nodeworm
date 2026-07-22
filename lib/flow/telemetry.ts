// Error tracking for flow runs (GlitchTip, which speaks the Sentry protocol).
// Fully inert without GLITCHTIP_DSN: no SDK is loaded, nothing is sent, and no
// cold-start cost is paid. The SDK is imported lazily for the same reason.
//
// What is sent: the flow id, run id, trigger type, and the failing step's name
// and summary. Never step outputs, never credentials, never a model or provider
// name (those must not leak to any surface a user or vendor can read).

import type { Flow, FlowRun } from "./types";

let inited: boolean | null = null;

type SentryLike = {
  init: (o: Record<string, unknown>) => void;
  captureMessage: (msg: string, ctx?: Record<string, unknown>) => void;
};
let sentry: SentryLike | null = null;

async function client(): Promise<SentryLike | null> {
  if (inited !== null) return sentry;
  const dsn = process.env.GLITCHTIP_DSN;
  if (!dsn) {
    inited = false;
    return null;
  }
  try {
    const mod = (await import("@sentry/node")) as unknown as SentryLike;
    mod.init({ dsn, tracesSampleRate: 0, environment: process.env.VERCEL_ENV ?? "development" });
    sentry = mod;
    inited = true;
  } catch {
    inited = false;
  }
  return sentry;
}

// Report a terminal flow failure. Called after the run settles, never in a way
// that can change the run's own outcome.
export async function captureRunFailure(flow: Flow, run: FlowRun): Promise<boolean> {
  if (run.status !== "failed" && run.status !== "partial") return false;
  const s = await client();
  if (!s) return false;
  const bad = run.steps.find((x) => x.status === "failed");
  try {
    s.captureMessage(`Flow failed: ${flow.name}`, {
      level: run.status === "failed" ? "error" : "warning",
      tags: { flowId: flow.id, runId: run.id, trigger: run.trigger.type, status: run.status },
      extra: { step: bad?.name, stepType: bad?.type, reason: bad?.summary },
    });
    return true;
  } catch {
    return false;
  }
}

export { lastError } from "./errors";
