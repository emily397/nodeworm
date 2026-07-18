import { describe, expect, it } from "vitest";
import type { WorkflowPlan } from "../engine/custom/intent";
import { planToFlow } from "./draft";

const plan: WorkflowPlan = {
  kind: "app-to-app",
  summary: "When a Stripe payment succeeds, add a row in Notion",
  apps: [
    { name: "Stripe", role: "source" },
    { name: "Notion", role: "target" },
  ],
  trigger: { app: "Stripe", event: "a payment succeeds" },
  actions: [{ app: "Notion", op: "add a row", order: 1 }],
  mappings: [
    { fromApp: "Stripe", fromEntity: "Payment", toApp: "Notion", toEntity: "Row", fields: [{ source: "amount", target: "Amount" }, { source: "email", target: "Customer" }] },
  ],
  raw: "when a stripe payment succeeds add a row in notion",
};

const conns = [
  { id: "i-stripe", appName: "stripe", status: "connected" },
  { id: "i-notion-old", appName: "Notion", status: "draft" },
  { id: "i-notion", appName: "Notion", status: "connected" },
];

describe("planToFlow", () => {
  it("maps an app-to-app plan to a webhook trigger plus http steps, matching connections case-insensitively", () => {
    const d = planToFlow(plan, conns)!;
    expect(d.trigger.type).toBe("webhook");
    expect(d.trigger.appName).toBe("Stripe");
    expect(d.trigger.integrationId).toBe("i-stripe");
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0].type).toBe("http");
    expect(d.steps[0].appName).toBe("Notion");
    expect(d.needsConnections).toEqual([]);
  });

  it("prefers a connected integration over a draft with the same name", () => {
    const d = planToFlow(plan, conns)!;
    expect(d.steps[0].integrationId).toBe("i-notion");
  });

  it("turns mapping fields into a body template over the trigger payload", () => {
    const d = planToFlow(plan, conns)!;
    expect(JSON.parse(d.steps[0].body!)).toEqual({ Amount: "{{trigger.amount}}", Customer: "{{trigger.email}}" });
  });

  it("reports unmatched apps in needsConnections and still drafts the step", () => {
    const d = planToFlow(plan, [{ id: "i-stripe", appName: "Stripe", status: "connected" }])!;
    expect(d.needsConnections).toEqual(["Notion"]);
    expect(d.steps[0].integrationId).toBeUndefined();
  });

  it("returns null for clarify and unmappable plans", () => {
    expect(planToFlow({ ...plan, kind: "clarify", clarify: { question: "q", because: "b" } }, conns)).toBeNull();
    expect(planToFlow({ ...plan, kind: "unmappable", unmappable: "not an integration" }, conns)).toBeNull();
  });
});
