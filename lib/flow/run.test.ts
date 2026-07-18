import { describe, expect, it } from "vitest";
import type { Flow, FlowStep } from "./types";
import { boundOutput, evalCondition, executeFlow, type StepEffects } from "./run";

function flow(steps: FlowStep[]): Flow {
  const now = Date.now();
  return {
    id: "f1",
    name: "test flow",
    enabled: true,
    trigger: { type: "manual" },
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

function okEffects(calls: Array<{ type: string; input: unknown }> = []): StepEffects {
  const record = (type: string) => async (_step: FlowStep, input: unknown) => {
    calls.push({ type, input });
    return { ok: true, summary: `${type} ok`, output: { echoed: input } };
  };
  return { http: record("http"), connector: record("connector"), ai: record("ai"), webhookOut: record("webhook-out"), mcp: record("mcp") };
}

describe("executeFlow", () => {
  it("runs steps in order and threads outputs into later templates", async () => {
    const calls: Array<{ type: string; input: { body?: unknown } }> = [];
    const f = flow([
      { id: "a", type: "http", name: "fetch", url: "https://api.x.com/v1", body: '{"email":"{{trigger.email}}"}' },
      { id: "b", type: "webhook-out", name: "notify", url: "https://hooks.y.com/z", body: '{"was":"{{steps.a.output.echoed.body.email}}"}' },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "manual run", payload: { email: "amy@x.com" } }, okEffects(calls));

    expect(run.status).toBe("ok");
    expect(run.steps.map((s) => s.status)).toEqual(["ok", "ok"]);
    expect((calls[0].input as { body: { email: string } }).body.email).toBe("amy@x.com");
    expect((calls[1].input as { body: { was: string } }).body.was).toBe("amy@x.com");
  });

  it("routes an mcp step to the mcp effect with rendered arguments", async () => {
    const calls: Array<{ type: string; input: { body?: unknown } }> = [];
    const f = flow([{ id: "a", type: "mcp", name: "tool", tool: "list_rows", body: '{"q":"{{trigger.q}}"}' }]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { q: "vip" } }, okEffects(calls));
    expect(run.status).toBe("ok");
    expect(calls[0].type).toBe("mcp");
    expect((calls[0].input as { body: { q: string } }).body.q).toBe("vip");
  });

  it("stops at a false filter: run filtered, later steps skipped", async () => {
    const f = flow([
      { id: "a", type: "filter", name: "only big", condition: { left: "{{trigger.amount}}", op: "gt", right: "100" } },
      { id: "b", type: "http", name: "act", url: "https://api.x.com" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { amount: 7 } }, okEffects());

    expect(run.status).toBe("filtered");
    expect(run.steps[0].status).toBe("filtered");
    expect(run.steps[1].status).toBe("skipped");
  });

  it("passes a true filter and continues", async () => {
    const f = flow([
      { id: "a", type: "filter", name: "only big", condition: { left: "{{trigger.amount}}", op: "gt", right: "100" } },
      { id: "b", type: "http", name: "act", url: "https://api.x.com" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { amount: 700 } }, okEffects());

    expect(run.status).toBe("ok");
    expect(run.steps.map((s) => s.status)).toEqual(["ok", "ok"]);
  });

  it("marks the run failed on an effect failure and skips the rest, keeping the honest summary", async () => {
    const effects = okEffects();
    effects.http = async () => ({ ok: false, summary: "HTTP 401 from api.x.com" });
    const f = flow([
      { id: "a", type: "http", name: "call", url: "https://api.x.com" },
      { id: "b", type: "ai", name: "summarize", prompt: "hi" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, effects);

    expect(run.status).toBe("failed");
    expect(run.steps[0].status).toBe("failed");
    expect(run.steps[0].summary).toBe("HTTP 401 from api.x.com");
    expect(run.steps[1].status).toBe("skipped");
  });

  it("fails a step honestly when its body template is invalid JSON", async () => {
    const f = flow([{ id: "a", type: "http", name: "call", url: "https://api.x.com", body: "{nope" }]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, okEffects());

    expect(run.status).toBe("failed");
    expect(run.steps[0].summary).toMatch(/body template/i);
  });

  it("notifies onTransition after every step and once more with the terminal status", async () => {
    const seen: Array<{ steps: number; status: string }> = [];
    const f = flow([
      { id: "a", type: "http", name: "one", url: "https://api.x.com" },
      { id: "b", type: "http", name: "two", url: "https://api.x.com" },
    ]);
    await executeFlow(f, { type: "manual", summary: "m", payload: {} }, okEffects(), async (r) => {
      seen.push({ steps: r.steps.length, status: r.status });
    });
    expect(seen.map((s) => s.steps)).toEqual([1, 2, 2]);
    expect(seen[seen.length - 1].status).toBe("ok");
  });
});

describe("executeFlow branching + resilience", () => {
  it("runs every matching branch in order, skips non-matching, and exposes branch step outputs afterwards", async () => {
    const calls: Array<{ type: string; input: { body?: unknown } }> = [];
    const f = flow([
      {
        id: "route",
        type: "branch",
        name: "route by severity",
        branches: [
          { id: "b1", name: "critical", condition: { left: "{{trigger.sev}}", op: "eq", right: "critical" }, steps: [{ id: "page", type: "webhook-out", name: "page", url: "https://p.com" }] },
          { id: "b2", name: "always", steps: [{ id: "log", type: "webhook-out", name: "log", url: "https://l.com", body: '{"sev":"{{trigger.sev}}"}' }] },
          { id: "b3", name: "low only", condition: { left: "{{trigger.sev}}", op: "eq", right: "low" }, steps: [{ id: "ignore", type: "webhook-out", name: "ignore", url: "https://i.com" }] },
        ],
      },
      { id: "after", type: "webhook-out", name: "after", url: "https://a.com", body: '{"was":"{{steps.log.output.echoed.body.sev}}"}' },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { sev: "critical" } }, okEffects(calls));

    expect(run.status).toBe("ok");
    const names = run.steps.map((s) => `${s.name}:${s.status}`);
    expect(names).toEqual(["route by severity:ok", "page:ok", "log:ok", "after:ok"]);
    expect(run.steps[0].summary).toContain("critical");
    expect(run.steps[1].branch).toBe("critical");
    expect(run.steps[2].branch).toBe("always");
    expect((calls[2].input as { body: { was: string } }).body.was).toBe("critical");
  });

  it("reports honestly when no branch matches and continues past the branch", async () => {
    const f = flow([
      { id: "route", type: "branch", name: "route", branches: [{ id: "b1", name: "never", condition: { left: "{{trigger.x}}", op: "eq", right: "y" }, steps: [{ id: "s", type: "webhook-out", name: "s", url: "https://x.com" }] }] },
      { id: "after", type: "webhook-out", name: "after", url: "https://a.com" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, okEffects());
    expect(run.status).toBe("ok");
    expect(run.steps[0].summary).toMatch(/no branch matched/i);
    expect(run.steps.map((s) => s.name)).toEqual(["route", "after"]);
  });

  it("a filter inside a branch halts only that branch", async () => {
    const f = flow([
      {
        id: "route",
        type: "branch",
        name: "route",
        branches: [
          { id: "b1", name: "gated", steps: [{ id: "g", type: "filter", name: "gate", condition: { left: "{{trigger.go}}", op: "exists" } }, { id: "x", type: "webhook-out", name: "x", url: "https://x.com" }] },
          { id: "b2", name: "open", steps: [{ id: "y", type: "webhook-out", name: "y", url: "https://y.com" }] },
        ],
      },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, okEffects());
    expect(run.status).toBe("ok");
    const byName = Object.fromEntries(run.steps.map((s) => [s.name, s.status]));
    expect(byName.gate).toBe("filtered");
    expect(byName.x).toBe("skipped");
    expect(byName.y).toBe("ok");
  });

  it("retries a failing effect up to the configured attempts, then succeeds", async () => {
    let tries = 0;
    const effects = okEffects();
    effects.http = async () => {
      tries++;
      return tries < 3 ? { ok: false, summary: `boom ${tries}` } : { ok: true, summary: "finally", output: {} };
    };
    const f = flow([{ id: "a", type: "http", name: "flaky", url: "https://f.com", retries: 2 }]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, effects, undefined, { backoffMs: () => 0 });
    expect(tries).toBe(3);
    expect(run.status).toBe("ok");
    expect(run.steps[0].summary).toContain("attempt 3");
  });

  it("continue-on-error keeps going and lands the run on partial", async () => {
    const effects = okEffects();
    effects.http = async () => ({ ok: false, summary: "HTTP 500" });
    const f = flow([
      { id: "a", type: "http", name: "best effort", url: "https://f.com", onError: "continue" },
      { id: "b", type: "webhook-out", name: "still runs", url: "https://y.com" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, effects);
    expect(run.steps[0].status).toBe("failed");
    expect(run.steps[1].status).toBe("ok");
    expect(run.status).toBe("partial");
  });
});

describe("evalCondition", () => {
  const ctx = { trigger: { status: "paid", note: "big spender", amount: 42 } };
  it("supports eq / neq / contains / exists / gt / lt", () => {
    expect(evalCondition({ left: "{{trigger.status}}", op: "eq", right: "paid" }, ctx)).toBe(true);
    expect(evalCondition({ left: "{{trigger.status}}", op: "neq", right: "refunded" }, ctx)).toBe(true);
    expect(evalCondition({ left: "{{trigger.note}}", op: "contains", right: "spender" }, ctx)).toBe(true);
    expect(evalCondition({ left: "{{trigger.missing}}", op: "exists" }, ctx)).toBe(false);
    expect(evalCondition({ left: "{{trigger.amount}}", op: "gt", right: "41" }, ctx)).toBe(true);
    expect(evalCondition({ left: "{{trigger.amount}}", op: "lt", right: "41" }, ctx)).toBe(false);
  });
});

describe("boundOutput", () => {
  it("passes small values through and truncates huge ones", () => {
    expect(boundOutput({ a: 1 })).toEqual({ a: 1 });
    const huge = { blob: "x".repeat(20000) };
    const out = boundOutput(huge) as { truncated: boolean; preview: string };
    expect(out.truncated).toBe(true);
    expect(out.preview.length).toBeLessThanOrEqual(4000);
  });
});
