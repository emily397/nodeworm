import { describe, expect, it } from "vitest";
import { applyPatch, newFlowRecord, redactFlow } from "./model";

describe("newFlowRecord", () => {
  it("creates an enabled manual flow with a webhook token ready for later use", () => {
    const f = newFlowRecord("My flow", "u1");
    expect(f.name).toBe("My flow");
    expect(f.userId).toBe("u1");
    expect(f.enabled).toBe(true);
    expect(f.trigger.type).toBe("manual");
    expect(f.trigger.token!.length).toBeGreaterThanOrEqual(24);
    expect(f.steps).toEqual([]);
  });
});

describe("redactFlow", () => {
  it("strips the webhook token before the client", () => {
    const f = newFlowRecord("x");
    const r = redactFlow(f);
    expect(r.trigger.token).toBe("");
    expect(f.trigger.token!.length).toBeGreaterThan(0);
  });
});

describe("applyPatch", () => {
  it("updates name, trigger and steps while preserving the server-held token", () => {
    const f = newFlowRecord("x");
    const token = f.trigger.token;
    const out = applyPatch(f, {
      name: "Renamed",
      enabled: false,
      trigger: { type: "schedule", scheduleMins: 15, token: "attacker-set" },
      steps: [{ id: "a", type: "http", name: "call", url: "https://api.x.com", method: "POST" }],
    });
    expect(out.name).toBe("Renamed");
    expect(out.enabled).toBe(false);
    expect(out.trigger.type).toBe("schedule");
    expect(out.trigger.scheduleMins).toBe(15);
    expect(out.trigger.token).toBe(token);
    expect(out.steps).toHaveLength(1);
  });

  it("drops steps with unknown types, fills missing ids, clamps the schedule and step count", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, {
      trigger: { type: "schedule", scheduleMins: 1 },
      steps: [
        { type: "http", name: "ok", url: "https://a.com" },
        { type: "exec", name: "evil" },
        ...Array.from({ length: 30 }, (_, i) => ({ type: "filter", name: `f${i}` })),
      ],
    });
    expect(out.trigger.scheduleMins).toBe(5);
    expect(out.steps.every((s) => s.id.length > 0)).toBe(true);
    expect(out.steps.some((s) => (s.type as string) === "exec")).toBe(false);
    expect(out.steps.length).toBeLessThanOrEqual(20);
  });

  it("ignores junk patch values without throwing", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, { name: 42, trigger: "nope", steps: "nope" });
    expect(out.name).toBe("x");
    expect(out.trigger.type).toBe("manual");
  });
});
