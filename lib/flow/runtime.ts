// Wires the pure executor to the real effects and persistence. The single
// entry point every trigger surface (manual, webhook, cron) calls.

import { getIntegration } from "../store";
import { realEffects } from "./effects";
import { executeFlow, type TriggerFire } from "./run";
import { saveFlow, saveRun } from "./store";
import type { Flow, FlowRun } from "./types";

export async function fireFlow(flow: Flow, fire: TriggerFire): Promise<FlowRun> {
  const run = await executeFlow(flow, fire, realEffects(getIntegration), (r) => saveRun(r));
  flow.lastRunAt = Date.now();
  await saveFlow(flow);
  return run;
}
