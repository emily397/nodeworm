// Flow executor: a pure fold over the flow's steps with dependency-injected
// effects (same doctrine as autobuild.ts). Persists honestly: every step result
// is real, failures stop the run, outputs are bounded before they hit storage.

import { contextFromRun } from "./durable";
import { renderJson, renderValue } from "./template";
import type { Flow, FlowCondition, FlowRun, FlowStep, FlowTriggerType, StepRun } from "./types";

export interface EffectInput {
  url?: string;
  method?: string;
  path?: string;
  body?: unknown;
  prompt?: string;
  to?: string;
  subject?: string;
  text?: string;
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
  mcp(step: FlowStep, input: EffectInput): Promise<EffectResult>;
  email(step: FlowStep, input: EffectInput): Promise<EffectResult>;
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
  if (step.to) input.to = asText(renderValue(step.to, ctx));
  if (step.subject) input.subject = asText(renderValue(step.subject, ctx));
  // An email's message lives in `body` as free text, not as a JSON template.
  if (step.type === "email") {
    if (step.body) input.text = asText(renderValue(step.body, ctx));
    return input;
  }
  if (step.body) input.body = renderJson(step.body, ctx);
  return input;
}

function shortId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export interface ExecOpts {
  backoffMs?: (attempt: number) => number;
  // Continue a persisted run from its cursor instead of starting a new one.
  resume?: FlowRun;
}

const MAX_EXTRA_RETRIES = 2;

export async function executeFlow(
  flow: Flow,
  fire: TriggerFire,
  effects: StepEffects,
  onTransition?: (run: FlowRun) => Promise<void>,
  opts?: ExecOpts,
): Promise<FlowRun> {
  const resuming = opts?.resume;
  const run: FlowRun = resuming
    ? { ...resuming, status: "running", resumeAt: undefined, attempt: (resuming.attempt ?? 0) + 1 }
    : {
        id: shortId(),
        flowId: flow.id,
        status: "running",
        trigger: { type: fire.type, summary: fire.summary, payload: boundOutput(fire.payload) },
        startedAt: Date.now(),
        cursor: 0,
        steps: [],
      };
  // On resume the context is rebuilt from what was persisted, so templates over
  // earlier steps and the original trigger still resolve.
  const ctx: Record<string, unknown> = resuming ? contextFromRun(resuming) : { trigger: fire.payload, steps: {} };
  const backoff = opts?.backoffMs ?? ((attempt: number) => attempt * 1000);
  let halted: "failed" | "filtered" | null = null;
  let parked = false;
  let anyFailed = false;

  async function transition(): Promise<void> {
    if (!parked) run.status = halted ?? "running";
    if (onTransition) await onTransition(run);
  }

  // Execute one step (recursing into branches) and return the control signal
  // for the CONTAINING list: "filtered" halts that list, "failed" halts the run.
  async function runStep(step: FlowStep, branch?: string): Promise<"failed" | "filtered" | null> {
    const startedAt = Date.now();
    const rec: StepRun = { stepId: step.id, name: step.name, type: step.type, status: "ok", startedAt, finishedAt: startedAt, summary: "", branch };

    if (step.type === "filter") {
      const pass = step.condition ? evalCondition(step.condition, ctx) : true;
      rec.summary = pass ? "condition passed" : branch ? "condition not met; branch stopped" : "condition not met; run stopped";
      if (!pass) rec.status = "filtered";
      rec.finishedAt = Date.now();
      run.steps.push(rec);
      await transition();
      return pass ? null : "filtered";
    }

    if (step.type === "branch") {
      const matched = (step.branches ?? []).filter((b) => !b.condition || evalCondition(b.condition, ctx));
      rec.summary = matched.length ? `matched: ${matched.map((b) => b.name).join(", ")}` : "no branch matched; continuing";
      rec.finishedAt = Date.now();
      run.steps.push(rec);
      await transition();
      for (const b of matched) {
        for (const inner of b.steps) {
          const signal = await runStep(inner, b.name);
          if (signal === "filtered") {
            markSkipped(b.steps.slice(b.steps.indexOf(inner) + 1), b.name, "skipped: filtered out");
            await transition();
            break; // a filter halts only its branch
          }
          if (signal === "failed") return "failed";
        }
      }
      return null;
    }

    // Effect step, with bounded retry.
    let input: EffectInput | null = null;
    try {
      input = renderInput(step, ctx);
    } catch {
      rec.summary = "body template is not valid JSON";
    }
    let res: EffectResult = { ok: false, summary: rec.summary || "not run" };
    if (input) {
      const attempts = 1 + Math.max(0, Math.min(MAX_EXTRA_RETRIES, step.retries ?? 0));
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          res = await pick(effects, step)(step, input);
        } catch (e) {
          res = { ok: false, summary: e instanceof Error ? e.message : "step crashed" };
        }
        if (res.ok || attempt === attempts) {
          rec.summary = attempts > 1 ? `attempt ${attempt}/${attempts}: ${res.summary}` : res.summary;
          break;
        }
        await new Promise((r) => setTimeout(r, backoff(attempt)));
      }
      rec.output = boundOutput(res.output);
    }

    let signal: "failed" | null = null;
    if (res.ok) {
      (ctx.steps as Record<string, unknown>)[step.id] = { output: res.output };
    } else {
      rec.status = "failed";
      if (step.onError === "continue" && input) {
        anyFailed = true; // run keeps going; final status says "partial", never a clean "ok"
      } else {
        signal = "failed";
      }
    }
    rec.finishedAt = Date.now();
    run.steps.push(rec);
    await transition();
    return signal;
  }

  function markSkipped(steps: FlowStep[], branch: string | undefined, summary: string): void {
    const now = Date.now();
    for (const s of steps) {
      run.steps.push({ stepId: s.id, name: s.name, type: s.type, status: "skipped", startedAt: now, finishedAt: now, summary, branch });
    }
  }

  for (let i = run.cursor ?? 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    if (halted) {
      markSkipped([step], undefined, halted === "failed" ? "skipped: an earlier step failed" : "skipped: filtered out");
      run.cursor = i + 1;
      await transition();
      continue;
    }

    // A wait parks the run: record it, point the cursor past it, and hand back to
    // the resume sweep. Nothing after it runs in this invocation.
    if (step.type === "wait") {
      const at = Date.now();
      const waitMs = Math.max(0, step.waitMs ?? 0);
      run.steps.push({ stepId: step.id, name: step.name, type: step.type, status: "ok", startedAt: at, finishedAt: at, summary: `waiting ${Math.round(waitMs / 1000)}s` });
      run.cursor = i + 1;
      run.resumeAt = at + waitMs;
      run.status = "waiting";
      parked = true;
      if (onTransition) await onTransition(run);
      return run;
    }

    const signal = await runStep(step);
    if (signal) halted = signal;
    run.cursor = i + 1;
  }

  run.status = halted === "failed" ? "failed" : halted === "filtered" ? "filtered" : anyFailed ? "partial" : "ok";
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
    case "mcp":
      return effects.mcp;
    case "email":
      return effects.email;
    default:
      return effects.http;
  }
}
