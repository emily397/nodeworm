import { describe, expect, it } from "vitest";
import { isResumable, STALE_RUN_MS } from "./durable";
import { executeFlow, type StepEffects } from "./run";
import type { Flow, FlowRun, FlowStep } from "./types";

function flow(steps: FlowStep[]): Flow {
  const now = Date.now();
  return { id: "f1", name: "t", enabled: true, trigger: { type: "manual" }, steps, createdAt: now, updatedAt: now };
}

function effects(seen: string[] = []): StepEffects {
  const rec = () => async (step: FlowStep, input: unknown) => {
    seen.push(step.id);
    return { ok: true, summary: "ok", output: { echoed: input, from: step.id } };
  };
  return { http: rec(), connector: rec(), ai: rec(), webhookOut: rec(), mcp: rec(), email: rec() };
}

describe("wait step", () => {
  it("parks the run as waiting with a resumeAt and a cursor past the wait", async () => {
    const f = flow([
      { id: "a", type: "http", name: "one", url: "https://x.com" },
      { id: "w", type: "wait", name: "hold", waitMs: 600000 },
      { id: "b", type: "http", name: "two", url: "https://x.com" },
    ]);
    const seen: string[] = [];
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, effects(seen));

    expect(run.status).toBe("waiting");
    expect(run.resumeAt).toBeGreaterThan(Date.now() + 500000);
    expect(run.cursor).toBe(2); // next step after the wait
    expect(seen).toEqual(["a"]); // "b" must not have run yet
    expect(run.finishedAt).toBeUndefined();
  });
});

describe("resume", () => {
  it("continues from the cursor without re-running earlier steps, keeping their outputs available", async () => {
    const f = flow([
      { id: "a", type: "http", name: "one", url: "https://x.com" },
      { id: "b", type: "http", name: "two", url: "https://x.com", body: '{"prev":"{{steps.a.output.from}}"}' },
    ]);
    const parked: FlowRun = {
      id: "r1",
      flowId: "f1",
      status: "waiting",
      trigger: { type: "manual", summary: "m", payload: { seedVal: 7 } },
      startedAt: Date.now() - 1000,
      cursor: 1,
      steps: [{ stepId: "a", name: "one", type: "http", status: "ok", startedAt: 1, finishedAt: 2, summary: "ok", output: { from: "a" } }],
    };
    const seen: string[] = [];
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { seedVal: 7 } }, effects(seen), undefined, { resume: parked });

    expect(seen).toEqual(["b"]); // "a" not re-run
    expect(run.id).toBe("r1"); // same run, not a new one
    expect(run.status).toBe("ok");
    expect(run.steps.map((s) => s.stepId)).toEqual(["a", "b"]); // history preserved
    const bInput = run.steps[1].output as { echoed: { body: { prev: string } } };
    expect(bInput.echoed.body.prev).toBe("a"); // earlier output still resolvable
  });

  it("restores the trigger payload so templates over the trigger still resolve", async () => {
    const f = flow([{ id: "b", type: "http", name: "two", url: "https://x.com", body: '{"v":"{{trigger.seedVal}}"}' }]);
    const parked: FlowRun = {
      id: "r2",
      flowId: "f1",
      status: "waiting",
      trigger: { type: "manual", summary: "m", payload: { seedVal: 7 } },
      startedAt: Date.now(),
      cursor: 0,
      steps: [],
    };
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: { seedVal: 7 } }, effects(), undefined, { resume: parked });
    const out = run.steps[0].output as { echoed: { body: { v: number } } };
    expect(out.echoed.body.v).toBe(7);
  });
});

describe("cursor", () => {
  it("advances past every completed top-level step", async () => {
    const f = flow([
      { id: "a", type: "http", name: "one", url: "https://x.com" },
      { id: "b", type: "http", name: "two", url: "https://x.com" },
    ]);
    const run = await executeFlow(f, { type: "manual", summary: "m", payload: {} }, effects());
    expect(run.cursor).toBe(2);
  });
});

describe("isResumable", () => {
  const now = 1_000_000_000;
  const base = { id: "r", flowId: "f", startedAt: now, steps: [], trigger: { type: "manual" as const, summary: "m" } };

  it("resumes a waiting run once its resumeAt has passed", () => {
    expect(isResumable({ ...base, status: "waiting", resumeAt: now - 1 }, now)).toBe(true);
    expect(isResumable({ ...base, status: "waiting", resumeAt: now + 60000 }, now)).toBe(false);
  });

  it("resumes a running run only once it is stale (crashed mid-flight)", () => {
    expect(isResumable({ ...base, status: "running", startedAt: now - STALE_RUN_MS - 1 }, now)).toBe(true);
    expect(isResumable({ ...base, status: "running", startedAt: now - 1000 }, now)).toBe(false);
  });

  it("never resumes a finished run", () => {
    for (const status of ["ok", "failed", "filtered", "partial"] as const) {
      expect(isResumable({ ...base, status, startedAt: now - STALE_RUN_MS - 1 }, now)).toBe(false);
    }
  });
});
