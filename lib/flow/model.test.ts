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

  it("accepts an mcp step with its tool name", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, { steps: [{ type: "mcp", name: "call tool", integrationId: "i1", tool: "list_rows", body: '{"limit":5}' }] });
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].type).toBe("mcp");
    expect(out.steps[0].tool).toBe("list_rows");
  });

  it("accepts a poll trigger with url, items path and id path, clamping the interval", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, {
      trigger: { type: "poll", url: "https://api.x.com/things", itemsPath: "data", idPath: "id", scheduleMins: 2 },
    });
    expect(out.trigger.type).toBe("poll");
    expect(out.trigger.url).toBe("https://api.x.com/things");
    expect(out.trigger.itemsPath).toBe("data");
    expect(out.trigger.idPath).toBe("id");
    expect(out.trigger.scheduleMins).toBe(5);
    expect(out.trigger.token).toBe(f.trigger.token);
  });

  it("accepts a branch step, stripping nested branches and capping counts", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, {
      steps: [
        {
          type: "branch",
          name: "route",
          branches: [
            { name: "critical", condition: { left: "{{trigger.sev}}", op: "eq", right: "critical" }, steps: [{ type: "webhook-out", name: "page", url: "https://p.com" }, { type: "branch", name: "nested evil" }] },
            ...Array.from({ length: 8 }, (_, i) => ({ name: `b${i}`, steps: Array.from({ length: 15 }, (_, j) => ({ type: "filter", name: `f${j}` })) })),
          ],
        },
      ],
    });
    const b = out.steps[0];
    expect(b.type).toBe("branch");
    expect(b.branches!.length).toBeLessThanOrEqual(4);
    expect(b.branches![0].name).toBe("critical");
    expect(b.branches![0].condition?.op).toBe("eq");
    expect(b.branches![0].steps.some((s) => s.type === "branch")).toBe(false);
    expect(b.branches![1].steps.length).toBeLessThanOrEqual(10);
    expect(b.branches!.every((br) => br.id.length > 0)).toBe(true);
  });

  it("clamps retries to 0-2 and onError to halt/continue", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, {
      steps: [
        { type: "http", name: "a", retries: 9, onError: "continue" },
        { type: "http", name: "b", retries: -3, onError: "explode" },
      ],
    });
    expect(out.steps[0].retries).toBe(2);
    expect(out.steps[0].onError).toBe("continue");
    expect(out.steps[1].retries).toBeUndefined();
    expect(out.steps[1].onError).toBeUndefined();
  });

  it("ignores junk patch values without throwing", () => {
    const f = newFlowRecord("x");
    const out = applyPatch(f, { name: 42, trigger: "nope", steps: "nope" });
    expect(out.name).toBe("x");
    expect(out.trigger.type).toBe("manual");
  });
});
