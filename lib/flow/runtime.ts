// Wires the pure executor to the real effects and persistence. The single
// entry point every trigger surface (manual, webhook, cron) calls.

import { assertConnectorUrl } from "../engine/connector";
import { getIntegration } from "../store";
import { isResumable } from "./durable";
import { realEffects } from "./effects";
import { diffNewItems } from "./poll";
import { executeFlow, type TriggerFire } from "./run";
import { getFlow, listUnfinishedRuns, saveFlow, saveRun } from "./store";
import { captureRunFailure } from "./telemetry";
import type { Flow, FlowRun, FlowStep } from "./types";

export async function fireFlow(flow: Flow, fire: TriggerFire, resume?: FlowRun): Promise<FlowRun> {
  const run = await executeFlow(flow, fire, realEffects(getIntegration), (r) => saveRun(r), resume ? { resume } : undefined);
  flow.lastRunAt = Date.now();
  await saveFlow(flow);
  // Never let reporting change the run's outcome.
  await captureRunFailure(flow, run).catch(() => false);
  return run;
}

// Tell the uptime monitor this flow ran. A missed ping is the alert, so this only
// fires on a genuinely good run. SSRF-guarded like every other outbound URL, and
// never allowed to affect the run's own outcome.
export async function pingHeartbeat(flow: Flow, status: string): Promise<boolean> {
  if (!flow.heartbeatUrl || (status !== "ok" && status !== "partial")) return false;
  const guard = await assertConnectorUrl(flow.heartbeatUrl, "cloud");
  if (!guard.ok) return false;
  try {
    await fetch(flow.heartbeatUrl, { method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return true;
  } catch {
    return false;
  }
}

// Pick up runs that parked at a wait or whose process died mid-flight and continue
// them from their persisted cursor. This is the durable runtime: state was already
// written after every step, so resuming needs no queue and no extra infrastructure.
export async function resumeDueRuns(now = Date.now()): Promise<Array<{ runId: string; status: string }>> {
  const done: Array<{ runId: string; status: string }> = [];
  for (const parked of await listUnfinishedRuns()) {
    if (!isResumable(parked, now)) continue;
    const flow = await getFlow(parked.flowId);
    if (!flow) continue;
    const fire: TriggerFire = { type: parked.trigger.type, summary: parked.trigger.summary, payload: parked.trigger.payload };
    const run = await fireFlow(flow, fire, parked);
    done.push({ runId: run.id, status: run.status });
  }
  return done;
}

// Cap how many new items one tick can fire, so a first bad dedupe config or a
// bulk import can never stampede a flow.
const POLL_FIRE_CAP = 10;

// One poll tick: fetch the watched endpoint (as the trigger's connection when
// set), diff against the seen set, fire once per new item. The first tick primes
// without firing so history never floods.
export async function pollFlowTick(flow: Flow): Promise<{ fired: number; detail: string }> {
  const t = flow.trigger;
  const finish = async (detail: string, fired = 0) => {
    flow.pollState = { seen: flow.pollState?.seen ?? [], ...flow.pollState, lastPolledAt: Date.now(), lastDetail: detail };
    await saveFlow(flow);
    return { fired, detail };
  };
  if (!t.url) return finish("no URL to watch");

  const pollStep: FlowStep = { id: "__poll", type: "http", name: "poll", integrationId: t.integrationId };
  const res = await realEffects(getIntegration).http(pollStep, { url: t.url, method: t.method ?? "GET" });
  if (!res.ok) return finish(`poll failed: ${res.summary}`);

  const primed = flow.pollState === undefined;
  const diff = diffNewItems(res.output, t.itemsPath ?? "", t.idPath ?? "id", flow.pollState?.seen);
  flow.pollState = {
    seen: diff.seen,
    lastPolledAt: Date.now(),
    lastDetail: primed ? `primed with ${diff.seen.length} existing item(s)` : `${diff.newItems.length} new item(s)`,
  };
  await saveFlow(flow);

  let fired = 0;
  for (const item of diff.newItems.slice(0, POLL_FIRE_CAP)) {
    await fireFlow(flow, { type: "poll", summary: "poll: new item", payload: item });
    fired++;
  }
  return { fired, detail: flow.pollState.lastDetail! };
}
