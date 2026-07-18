// Flow executor: a pure fold over the flow's steps with dependency-injected
// effects (same doctrine as autobuild.ts). Persists honestly: every step result
// is real, failures stop the run, outputs are bounded before they hit storage.

import { renderJson, renderValue } from "./template";
import type { Flow, FlowCondition, FlowRun, FlowStep, FlowTriggerType, StepRun } from "./types";

export interface EffectInput {
  url?: string;
  method?: string;
  path?: string;
  body?: unknown;
  prompt?: string;
}

export interface EffectResult {
  ok: boolean;
  summary: string;
  output?: unknown;
}

export interface StepEffects {
  http(step: FlowStep, input: EffectInput): Promise<EffectResult>;
  connector(step: FlowStep, input: EffectInput): Promise<EffectResult>;
  ai(step: FlowStep, input: EffectInput): Promise<EffectResult>;
  webhookOut(step: FlowStep, input: EffectInput): Promise<EffectResult>;
}

export interface TriggerFire {
  type: FlowTriggerType;
  summary: string;
  payload: unknown;
}

const OUTPUT_CAP = 4000;

export function boundOutput(v: unknown): unknown {
  if (v === undefined) return undefined;
  let s: string;
  try {
    s = JSON.stringify(v) ?? "";
  } catch {
    return { truncated: true, preview: String(v).slice(0, OUTPUT_CAP) };
  }
  if (s.length <= OUTPUT_CAP) return v;
  return { truncated: true, preview: s.slice(0, OUTPUT_CAP) };
}

export function evalCondition(cond: FlowCondition, ctx: Record<string, unknown>): boolean {
  const left = renderValue(cond.left, ctx);
  const right = cond.right !== undefined ? renderValue(cond.right, ctx) : undefined;
  switch (cond.op) {
    case "exists":
      return left !== undefined && left !== null && left !== "";
    case "eq":
      return String(left) === String(right);
    case "neq":
      return String(left) !== String(right);
    case "contains":
      return String(left ?? "").includes(String(right ?? ""));
    case "gt":
      return Number(left) > Number(right);
    case "lt":
      return Number(left) < Number(right);
  }
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function renderInput(step: FlowStep, ctx: Record<string, unknown>): EffectInput {
  const input: EffectInput = {};
  if (step.url) input.url = asText(renderValue(step.url, ctx));
  if (step.path) input.path = asText(renderValue(step.path, ctx));
  if (step.method) input.method = step.method;
  if (step.prompt) input.prompt = asText(renderValue(step.prompt, ctx));
  if (step.body) input.body = renderJson(step.body, ctx);
  return input;
}

function shortId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function executeFlow(
  flow: Flow,
  fire: TriggerFire,
  effects: StepEffects,
  onTransition?: (run: FlowRun) => Promise<void>,
): Promise<FlowRun> {
  const run: FlowRun = {
    id: shortId(),
    flowId: flow.id,
    status: "running",
    trigger: { type: fire.type, summary: fire.summary },
    startedAt: Date.now(),
    steps: [],
  };
  const ctx: Record<string, unknown> = { trigger: fire.payload, steps: {} };
  let halted: "failed" | "filtered" | null = null;

  for (const step of flow.steps) {
    const startedAt = Date.now();
    const rec: StepRun = { stepId: step.id, name: step.name, type: step.type, status: "ok", startedAt, finishedAt: startedAt, summary: "" };

    if (halted) {
      rec.status = "skipped";
      rec.summary = halted === "failed" ? "skipped: an earlier step failed" : "skipped: filtered out";
    } else if (step.type === "filter") {
      const pass = step.condition ? evalCondition(step.condition, ctx) : true;
      if (pass) {
        rec.summary = "condition passed";
      } else {
        rec.status = "filtered";
        rec.summary = "condition not met; run stopped";
        halted = "filtered";
      }
    } else {
      let input: EffectInput | null = null;
      try {
        input = renderInput(step, ctx);
      } catch {
        rec.status = "failed";
        rec.summary = "body template is not valid JSON";
        halted = "failed";
      }
      if (input) {
        let res: EffectResult;
        try {
          res = await pick(effects, step)(step, input);
        } catch (e) {
          res = { ok: false, summary: e instanceof Error ? e.message : "step crashed" };
        }
        rec.summary = res.summary;
        rec.output = boundOutput(res.output);
        if (res.ok) {
          (ctx.steps as Record<string, unknown>)[step.id] = { output: res.output };
        } else {
          rec.status = "failed";
          halted = "failed";
        }
      }
    }

    rec.finishedAt = Date.now();
    run.steps.push(rec);
    run.status = halted ?? "running";
    if (onTransition) await onTransition(run);
  }

  run.status = halted ?? "ok";
  run.finishedAt = Date.now();
  if (onTransition) await onTransition(run);
  return run;
}

function pick(effects: StepEffects, step: FlowStep) {
  switch (step.type) {
    case "http":
      return effects.http;
    case "connector":
      return effects.connector;
    case "ai":
      return effects.ai;
    case "webhook-out":
      return effects.webhookOut;
    default:
      return effects.http;
  }
}
