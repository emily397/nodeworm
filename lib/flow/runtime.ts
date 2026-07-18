// Wires the pure executor to the real effects and persistence. The single
// entry point every trigger surface (manual, webhook, cron) calls.

import { getIntegration } from "../store";
import { realEffects } from "./effects";
import { diffNewItems } from "./poll";
import { executeFlow, type TriggerFire } from "./run";
import { saveFlow, saveRun } from "./store";
import type { Flow, FlowRun, FlowStep } from "./types";

export async function fireFlow(flow: Flow, fire: TriggerFire): Promise<FlowRun> {
  const run = await executeFlow(flow, fire, realEffects(getIntegration), (r) => saveRun(r));
  flow.lastRunAt = Date.now();
  await saveFlow(flow);
  return run;
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
